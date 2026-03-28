import { Hono } from 'hono';
import { verifySignature, LineClient } from '@line-crm/line-sdk';
import type { WebhookRequestBody, WebhookEvent, TextEventMessage } from '@line-crm/line-sdk';
import {
  upsertFriend,
  updateFriendFollowStatus,
  getFriendByLineUserId,
  getScenarios,
  enrollFriendInScenario,
  getScenarioSteps,
  advanceFriendScenario,
  completeFriendScenario,
  getLineAccounts,
  jstNow,
  getCalendarBookingById,
  approveBooking,
  denyBooking,
  getJobById,
  getFriendById,
  getNurseryContacts,
  getProfileByFriendId,
  getJobBookingCount,
  updateJobStatus,
  getNurseryById,
} from '@line-crm/db';
import { fireEvent } from '../services/event-bus.js';
import { buildMessage, expandVariables } from '../services/step-delivery.js';
import type { Env } from '../index.js';

const webhook = new Hono<Env>();

webhook.post('/webhook', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('X-Line-Signature') ?? '';
  const db = c.env.DB;

  let body: WebhookRequestBody;
  try {
    body = JSON.parse(rawBody) as WebhookRequestBody;
  } catch {
    console.error('Failed to parse webhook body');
    return c.json({ status: 'ok' }, 200);
  }

  // Multi-account: resolve credentials from DB by destination (channel user ID)
  // or fall back to environment variables (default account)
  let channelSecret = c.env.LINE_CHANNEL_SECRET;
  let channelAccessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
  let matchedAccountId: string | null = null;

  if ((body as { destination?: string }).destination) {
    const accounts = await getLineAccounts(db);
    for (const account of accounts) {
      if (!account.is_active) continue;
      const isValid = await verifySignature(account.channel_secret, rawBody, signature);
      if (isValid) {
        channelSecret = account.channel_secret;
        channelAccessToken = account.channel_access_token;
        matchedAccountId = account.id;
        break;
      }
    }
  }

  // Verify with resolved secret
  const valid = await verifySignature(channelSecret, rawBody, signature);
  if (!valid) {
    console.error('Invalid LINE signature');
    return c.json({ status: 'ok' }, 200);
  }

  const lineClient = new LineClient(channelAccessToken);

  // 非同期処理 — LINE は ~1s 以内のレスポンスを要求
  const processingPromise = (async () => {
    for (const event of body.events) {
      try {
        await handleEvent(db, lineClient, event, channelAccessToken, matchedAccountId, c.env.WORKER_URL || new URL(c.req.url).origin);
      } catch (err) {
        console.error('Error handling webhook event:', err);
      }
    }
  })();

  c.executionCtx.waitUntil(processingPromise);

  return c.json({ status: 'ok' }, 200);
});

async function handleEvent(
  db: D1Database,
  lineClient: LineClient,
  event: WebhookEvent,
  lineAccessToken: string,
  lineAccountId: string | null = null,
  workerUrl?: string,
): Promise<void> {
  if (event.type === 'follow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    // プロフィール取得 & 友だち登録/更新
    let profile: { displayName?: string; pictureUrl?: string; statusMessage?: string } | undefined;
    try {
      profile = await lineClient.getProfile(userId);
    } catch (err) {
      console.error('Failed to get profile for', userId, err);
      // プロフィール取得失敗時はデフォルト値で友だち登録を続行
    }

    let friend;
    try {
      friend = await upsertFriend(db, {
        lineUserId: userId,
        displayName: profile?.displayName ?? null,
        pictureUrl: profile?.pictureUrl ?? null,
        statusMessage: profile?.statusMessage ?? null,
      });
    } catch (err) {
      console.error('Failed to upsert friend for', userId, err);
      return; // 友だち登録に失敗した場合はこれ以上進めない
    }

    // Set line_account_id for multi-account tracking
    if (lineAccountId) {
      await db.prepare('UPDATE friends SET line_account_id = ? WHERE id = ? AND line_account_id IS NULL')
        .bind(lineAccountId, friend.id).run();
    }

    // friend_add シナリオに登録（このアカウントのシナリオのみ）
    const scenarios = await getScenarios(db);
    for (const scenario of scenarios) {
      // Only trigger scenarios belonging to this account (or unassigned for backward compat)
      const scenarioAccountMatch = !scenario.line_account_id || !lineAccountId || scenario.line_account_id === lineAccountId;
      if (scenario.trigger_type === 'friend_add' && scenario.is_active && scenarioAccountMatch) {
        try {
          const existing = await db
            .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
            .bind(friend.id, scenario.id)
            .first<{ id: string }>();
          if (!existing) {
            const friendScenario = await enrollFriendInScenario(db, friend.id, scenario.id);

            // Immediate delivery: if the first step has delay=0, send it now via replyMessage (free)
            const steps = await getScenarioSteps(db, scenario.id);
            const firstStep = steps[0];
            if (firstStep && firstStep.delay_minutes === 0 && friendScenario.status === 'active') {
              try {
                const expandedContent = expandVariables(firstStep.message_content, friend as { id: string; display_name: string | null; user_id: string | null });
                const message = buildMessage(firstStep.message_type, expandedContent);
                await lineClient.replyMessage(event.replyToken, [message]);
                console.log(`Immediate delivery: sent step ${firstStep.id} to ${userId}`);

                // Log outgoing message (replyMessage = 無料)
                const logId = crypto.randomUUID();
                await db
                  .prepare(
                    `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, created_at)
                     VALUES (?, ?, 'outgoing', ?, ?, NULL, ?, 'reply', ?)`,
                  )
                  .bind(logId, friend.id, firstStep.message_type, firstStep.message_content, firstStep.id, jstNow())
                  .run();

                // Advance or complete the friend_scenario
                const secondStep = steps[1] ?? null;
                if (secondStep) {
                  const nextDeliveryDate = new Date(Date.now() + 9 * 60 * 60_000);
                  nextDeliveryDate.setMinutes(nextDeliveryDate.getMinutes() + secondStep.delay_minutes);
                  // Enforce 9:00-21:00 JST delivery window
                  const h = nextDeliveryDate.getUTCHours();
                  if (h < 9 || h >= 21) {
                    if (h >= 21) nextDeliveryDate.setUTCDate(nextDeliveryDate.getUTCDate() + 1);
                    nextDeliveryDate.setUTCHours(9, 0, 0, 0);
                  }
                  await advanceFriendScenario(db, friendScenario.id, firstStep.step_order, nextDeliveryDate.toISOString().slice(0, -1) + '+09:00');
                } else {
                  await completeFriendScenario(db, friendScenario.id);
                }
              } catch (err) {
                console.error('Failed immediate delivery for scenario', scenario.id, err);
              }
            }
          }
        } catch (err) {
          console.error('Failed to enroll friend in scenario', scenario.id, err);
        }
      }
    }

    // イベントバス発火: friend_add
    await fireEvent(db, 'friend_add', { friendId: friend.id, eventData: { displayName: friend.display_name } }, lineAccessToken, lineAccountId);
    return;
  }

  if (event.type === 'unfollow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    await updateFriendFollowStatus(db, userId, false);
    return;
  }

  // ========== Postback: 園担当者からの承認/否認 ==========
  if (event.type === 'postback') {
    const userId = event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    const data = new URLSearchParams(event.postback.data);
    const action = data.get('action');
    const bookingId = data.get('bookingId');

    if (!bookingId || (action !== 'approve' && action !== 'deny')) return;

    try {
      const booking = await getCalendarBookingById(db, bookingId);
      if (!booking) {
        await lineClient.replyMessage(event.replyToken, [
          { type: 'text', text: '該当の応募が見つかりませんでした。' },
        ]);
        return;
      }

      // 既に処理済みチェック
      if (booking.approval_status === 'approved' || booking.approval_status === 'denied') {
        const statusText = booking.approval_status === 'approved' ? '承認済み' : '否認済み';
        await lineClient.replyMessage(event.replyToken, [
          { type: 'text', text: `この応募はすでに${statusText}です。` },
        ]);
        return;
      }

      const meta = booking.metadata ? JSON.parse(booking.metadata) : null;
      const jobId = booking.job_id || meta?.jobId;
      const job = jobId ? await getJobById(db, jobId) : null;

      // 共通の日付計算
      const d = job ? new Date(job.work_date + 'T00:00:00') : null;
      const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
      const dateStr = d ? `${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]})` : '';

      if (action === 'approve') {
        await approveBooking(db, bookingId);

        // 承認した担当者にreplyで確認

        await lineClient.replyMessage(event.replyToken, [
          buildMessage('flex', JSON.stringify({
            type: 'bubble',
            body: {
              type: 'box', layout: 'vertical', paddingAll: '20px',
              contents: [
                { type: 'text', text: '✅ 承認しました', size: 'lg', weight: 'bold', color: '#16a34a' },
                { type: 'separator', margin: 'md' },
                { type: 'text', text: `📍 ${job?.nursery_name || ''}`, size: 'sm', margin: 'md', wrap: true },
                { type: 'text', text: `📅 ${dateStr} ${job?.start_time || ''}〜${job?.end_time || ''}`, size: 'sm', color: '#64748b', margin: 'sm' },
                { type: 'text', text: '応募者にも採用通知を送信しました。', size: 'xs', color: '#64748b', margin: 'lg', wrap: true },
              ],
            },
          })),
        ]);

        // 応募者にLINE通知（リッチ版）
        if (booking.friend_id) {
          const applicant = await getFriendById(db, booking.friend_id);
          if (applicant?.line_user_id) {
            const nursery = job?.nursery_id ? await getNurseryById(db, job.nursery_id) : null;
            const applicantName = applicant.display_name || 'ワーカー';
            const dateInfo = d ? `${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]}) ${job?.start_time || ''}〜${job?.end_time || ''}` : '';

            // 報酬計算
            let payInfo = '';
            if (job?.hourly_rate && job?.start_time && job?.end_time) {
              const [sh, sm] = job.start_time.split(':').map(Number);
              const [eh, em] = job.end_time.split(':').map(Number);
              const breakMin = nursery?.break_minutes ?? 60;
              const workMin = (eh * 60 + em) - (sh * 60 + sm) - breakMin;
              const workHours = Math.max(workMin / 60, 0);
              const transport = nursery?.transport_fee ?? 0;
              const gross = Math.round(job.hourly_rate * workHours + transport);
              const tax = Math.round(gross * 0.05105); // 源泉徴収（概算）
              const net = gross - tax;
              payInfo = `\n\n【報酬】\n報酬金額：¥${net.toLocaleString('ja-JP')}（時給${job.hourly_rate.toLocaleString('ja-JP')}円×${workHours.toFixed(1)}時間${transport > 0 ? `＋交通費${transport}円` : ''}）- 源泉税¥${tax.toLocaleString('ja-JP')}`;
            }

            // 園の詳細情報を組み立て
            const sections: string[] = [];

            if (nursery?.requirements) {
              sections.push(`【持ち物・服装】\n${nursery.requirements}`);
            } else {
              sections.push('【持ち物】\n・動きやすい服装\n・上履き\n・エプロン');
            }

            if (nursery?.notes) {
              sections.push(`【注意事項】\n${nursery.notes}`);
            }

            if (nursery?.access_info) {
              sections.push(`【施設入室方法】\n${nursery.access_info}`);
            }

            if (nursery?.break_minutes != null) {
              sections.push(`【休憩】\n${nursery.break_minutes}分`);
            }

            if (nursery?.address) {
              sections.push(`【施設住所】\n${nursery.address}`);
            }

            const detailText = sections.join('\n\n');

            await lineClient.pushMessage(applicant.line_user_id, [
              {
                type: 'text',
                text: `🎉 勤務決定のお知らせ\n\n${applicantName}さん、お仕事へのご応募ありがとうございます。\nご応募いただいた下記の内容で「勤務決定」となりました。\n${applicantName}さんに来てもらう前提で、園は当日に向けて準備を始めています。\n\n【ご応募いただいた求人情報】\n📍 ${job?.nursery_name || ''}\n📅 ${dateInfo}${payInfo}\n\n${detailText}\n\n※体調がすぐれない場合はお早めにご連絡ください。`,
              },
            ]);
          }
        }

        // 同じ園の他担当者にも承認済み通知
        if (job?.nursery_id) {
          const contacts = await getNurseryContacts(db, job.nursery_id);
          const approverFriend = await getFriendByLineUserId(db, userId);
          const approverName = approverFriend?.display_name || '担当者';

          for (const contact of contacts) {
            if (contact.line_user_id === userId) continue; // 承認した本人はスキップ
            try {
              await lineClient.pushMessage(contact.line_user_id, [
                { type: 'text', text: `✅ ${approverName}さんが応募を承認しました。\n\n📍 ${job.nursery_name}\n📅 ${dateStr} ${job.start_time}〜${job.end_time}` },
              ]);
            } catch (err) {
              console.error('Failed to notify other contact:', err);
            }
          }
        }
      } else {
        // deny
        await denyBooking(db, bookingId);

        // capacity解放
        if (jobId) {
          const jobData = await getJobById(db, jobId);
          if (jobData && jobData.status === 'filled') {
            const count = await getJobBookingCount(db, jobId);
            if (count < jobData.capacity) {
              await updateJobStatus(db, jobId, 'open');
            }
          }
        }

        await lineClient.replyMessage(event.replyToken, [
          { type: 'text', text: '❌ 応募を否認しました。' },
        ]);

        // 応募者に否認通知（丁寧版）
        if (booking.friend_id) {
          const applicant = await getFriendById(db, booking.friend_id);
          if (applicant?.line_user_id) {
            const applicantName = applicant.display_name || 'ワーカー';
            const dateInfo = d ? `${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]}) ${job?.start_time || ''}〜${job?.end_time || ''}` : '';
            await lineClient.pushMessage(applicant.line_user_id, [
              {
                type: 'text',
                text: `スポットほいく ${applicantName}さん、スポットほいくです✨\n\nこの度は以下の求人にご応募いただき、誠にありがとうございます。\n応募が多数あったため、今回の勤務は「お見送り」となりました。\n\n【ご応募いただいた求人情報】\n📍 ${job?.nursery_name || ''}\n📅 ${dateInfo}\n\nなお、今回の求人については見送りとなりましたが、別日程での応募は可能です。\n引き続きご応募いただければ幸いです。\n\nまた、他の求人にもご興味があれば、ぜひご応募をご検討ください。\nよろしくお願いいたします。`,
              },
            ]);
          }
        }
      }
    } catch (err) {
      console.error('Postback handling error:', err);
    }
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const textMessage = event.message as TextEventMessage;
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    const friend = await getFriendByLineUserId(db, userId);
    if (!friend) return;

    const incomingText = textMessage.text;
    const now = jstNow();
    const logId = crypto.randomUUID();

    // 受信メッセージをログに記録
    await db
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
         VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, ?)`,
      )
      .bind(logId, friend.id, incomingText, now)
      .run();

    // チャットを作成/更新（ユーザーの自発的メッセージのみ unread にする）
    // ボタンタップ等の自動応答キーワードは除外
    const autoKeywords = ['料金', '機能', 'API', 'フォーム', 'ヘルプ', 'UUID', 'UUID連携について教えて', 'UUID連携を確認', '配信時間', '導入支援を希望します', 'アカウント連携を見る', '体験を完了する', 'BAN対策を見る', '連携確認'];
    const isAutoKeyword = autoKeywords.some(k => incomingText === k);
    const isTimeCommand = /(?:配信時間|配信|届けて|通知)[はを]?\s*\d{1,2}\s*時/.test(incomingText);
    if (!isAutoKeyword && !isTimeCommand) {
      // Chat tracking removed (chats module not used in spot-hoiku)
    }

    // 配信時間設定: 「配信時間は○時」「○時に届けて」等のパターンを検出
    const timeMatch = incomingText.match(/(?:配信時間|配信|届けて|通知)[はを]?\s*(\d{1,2})\s*時/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      if (hour >= 6 && hour <= 22) {
        // Save preferred_hour to friend metadata
        const existing = await db.prepare('SELECT metadata FROM friends WHERE id = ?').bind(friend.id).first<{ metadata: string }>();
        const meta = JSON.parse(existing?.metadata || '{}');
        meta.preferred_hour = hour;
        await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(meta), jstNow(), friend.id).run();

        // Reply with confirmation
        try {
          const period = hour < 12 ? '午前' : '午後';
          const displayHour = hour <= 12 ? hour : hour - 12;
          await lineClient.replyMessage(event.replyToken, [
            buildMessage('flex', JSON.stringify({
              type: 'bubble',
              body: { type: 'box', layout: 'vertical', contents: [
                { type: 'text', text: '配信時間を設定しました', size: 'lg', weight: 'bold', color: '#1e293b' },
                { type: 'box', layout: 'vertical', contents: [
                  { type: 'text', text: `${period} ${displayHour}:00`, size: 'xxl', weight: 'bold', color: '#f59e0b', align: 'center' },
                  { type: 'text', text: `（${hour}:00〜）`, size: 'sm', color: '#64748b', align: 'center', margin: 'sm' },
                ], backgroundColor: '#fffbeb', cornerRadius: 'md', paddingAll: '20px', margin: 'lg' },
                { type: 'text', text: '今後のステップ配信はこの時間以降にお届けします。', size: 'xs', color: '#64748b', wrap: true, margin: 'lg' },
              ], paddingAll: '20px' },
            })),
          ]);
        } catch (err) {
          console.error('Failed to reply for time setting', err);
        }
        return;
      }
    }

    // Cross-account trigger: send message from another account via UUID
    if (incomingText === '体験を完了する' && lineAccountId) {
      try {
        const friendRecord = await db.prepare('SELECT user_id FROM friends WHERE id = ?').bind(friend.id).first<{ user_id: string | null }>();
        if (friendRecord?.user_id) {
          // Find the same user on other accounts
          const otherFriends = await db.prepare(
            'SELECT f.line_user_id, la.channel_access_token FROM friends f INNER JOIN line_accounts la ON la.id = f.line_account_id WHERE f.user_id = ? AND f.line_account_id != ? AND f.is_following = 1'
          ).bind(friendRecord.user_id, lineAccountId).all<{ line_user_id: string; channel_access_token: string }>();

          for (const other of otherFriends.results) {
            const otherClient = new LineClient(other.channel_access_token);
            const { buildMessage: bm } = await import('../services/step-delivery.js');
            await otherClient.pushMessage(other.line_user_id, [bm('flex', JSON.stringify({
              type: 'bubble', size: 'giga',
              header: { type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#fffbeb',
                contents: [{ type: 'text', text: `${friend.display_name || ''}さんへ`, size: 'lg', weight: 'bold', color: '#1e293b' }],
              },
              body: { type: 'box', layout: 'vertical', paddingAll: '20px',
                contents: [
                  { type: 'text', text: '別アカウントからのアクションを検知しました。', size: 'sm', color: '#06C755', weight: 'bold', wrap: true },
                  { type: 'text', text: 'アカウント連携が正常に動作しています。体験ありがとうございました。', size: 'sm', color: '#1e293b', wrap: true, margin: 'md' },
                  { type: 'separator', margin: 'lg' },
                  { type: 'text', text: 'ステップ配信・フォーム即返信・アカウント連携・リッチメニュー・自動返信 — 全て無料、全てOSS。', size: 'xs', color: '#64748b', wrap: true, margin: 'lg' },
                ],
              },
              footer: { type: 'box', layout: 'vertical', paddingAll: '16px',
                contents: [
                  { type: 'button', action: { type: 'message', label: '導入について相談する', text: '導入支援を希望します' }, style: 'primary', color: '#06C755' },
                  { type: 'button', action: { type: 'uri', label: 'フィードバックを送る', uri: 'https://liff.line.me/2009554425-4IMBmLQ9?page=form&id=0c81910a-fe27-41a7-bf8c-1411a9240155' }, style: 'secondary', margin: 'sm' },
                ],
              },
            }))]);
          }

          // Reply on Account ② confirming
          await lineClient.replyMessage(event.replyToken, [buildMessage('flex', JSON.stringify({
            type: 'bubble',
            body: { type: 'box', layout: 'vertical', paddingAll: '20px',
              contents: [
                { type: 'text', text: 'Account ① にメッセージを送りました', size: 'sm', color: '#06C755', weight: 'bold', align: 'center' },
                { type: 'text', text: 'Account ① のトーク画面を確認してください', size: 'xs', color: '#64748b', align: 'center', margin: 'md' },
              ],
            },
          }))]);
          return;
        }
      } catch (err) {
        console.error('Cross-account trigger error:', err);
      }
    }

    // 自動返信チェック（このアカウントのルール + グローバルルールのみ）
    // NOTE: Auto-replies use replyMessage (free, no quota) instead of pushMessage
    // The replyToken is only valid for ~1 minute after the message event
    type AutoReplyRow = {
      id: string;
      keyword: string;
      match_type: 'exact' | 'contains';
      response_type: string;
      response_content: string;
      is_active: number;
      created_at: string;
    };
    const autoReplyStmt = lineAccountId
      ? db.prepare(`SELECT * FROM auto_replies WHERE is_active = 1 AND (line_account_id IS NULL OR line_account_id = ?) ORDER BY created_at ASC`).bind(lineAccountId)
      : db.prepare(`SELECT * FROM auto_replies WHERE is_active = 1 AND line_account_id IS NULL ORDER BY created_at ASC`);
    const autoReplies = await autoReplyStmt.all<AutoReplyRow>();

    let matched = false;
    for (const rule of autoReplies.results) {
      const isMatch =
        rule.match_type === 'exact'
          ? incomingText === rule.keyword
          : incomingText.includes(rule.keyword);

      if (isMatch) {
        try {
          // Expand template variables ({{name}}, {{uid}}, {{auth_url:CHANNEL_ID}})
          const expandedContent = expandVariables(rule.response_content, friend as { id: string; display_name: string | null; user_id: string | null }, workerUrl);
          const replyMsg = buildMessage(rule.response_type, expandedContent);
          await lineClient.replyMessage(event.replyToken, [replyMsg]);

          // 送信ログ（replyMessage = 無料）
          const outLogId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, delivery_type, created_at)
               VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, 'reply', ?)`,
            )
            .bind(outLogId, friend.id, rule.response_type, rule.response_content, jstNow())
            .run();
        } catch (err) {
          console.error('Failed to send auto-reply', err);
        }

        matched = true;
        break;
      }
    }

    // イベントバス発火: message_received
    await fireEvent(db, 'message_received', {
      friendId: friend.id,
      eventData: { text: incomingText, matched },
    }, lineAccessToken, lineAccountId);

    return;
  }
}

export { webhook };
