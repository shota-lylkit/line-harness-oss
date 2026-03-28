/**
 * 求人リマインド＆口コミ依頼 — cronトリガーで5分毎に実行
 *
 * - 前日 18:00: 「明日は〇〇園です」
 * - 当日 07:00: 「本日〇時〜 〇〇園です」
 * - 勤務終了 10分後: Flexメッセージ「お疲れ様でした！レビューをお願いします」
 * - 勤務終了 10分後(園側): 園の担当者にワーカーレビュー依頼
 */

import { getFriendById, getProfileByFriendId, jstNow } from '@line-crm/db';
import type { LineClient } from '@line-crm/line-sdk';

interface BookingWithJob {
  booking_id: string;
  friend_id: string;
  job_id: string;
  nursery_name: string;
  nursery_id: string | null;
  work_date: string;
  start_time: string;
  end_time: string;
  address: string | null;
  reminder_day_before_sent: number;
  reminder_day_of_sent: number;
  review_request_sent: number;
}

function getJstNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60_000);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]})`;
}

export async function processJobReminders(
  db: D1Database,
  lineClient: LineClient,
  liffUrl?: string,
): Promise<void> {
  const jstNowDate = getJstNow();
  const todayStr = `${jstNowDate.getFullYear()}-${String(jstNowDate.getMonth() + 1).padStart(2, '0')}-${String(jstNowDate.getDate()).padStart(2, '0')}`;
  const hour = jstNowDate.getHours();
  const minute = jstNowDate.getMinutes();

  // 翌日の日付
  const tomorrow = new Date(jstNowDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  // 求人付き予約を取得（confirmed のみ）
  const bookings = await db
    .prepare(`
      SELECT
        cb.id as booking_id,
        cb.friend_id,
        cb.job_id,
        j.nursery_name,
        j.nursery_id,
        j.work_date,
        j.start_time,
        j.end_time,
        j.address,
        cb.reminder_day_before_sent,
        cb.reminder_day_of_sent,
        cb.review_request_sent
      FROM calendar_bookings cb
      JOIN jobs j ON cb.job_id = j.id
      WHERE cb.status = 'confirmed'
        AND cb.friend_id IS NOT NULL
        AND cb.job_id IS NOT NULL
        AND j.work_date >= ?
    `)
    .bind(todayStr)
    .all<BookingWithJob>();

  if (!bookings.results.length) return;

  for (const b of bookings.results) {
    try {
      // ========== 前日リマインド (18:00以降) ==========
      if (
        b.work_date === tomorrowStr &&
        !b.reminder_day_before_sent &&
        hour >= 18
      ) {
        await sendReminder(db, lineClient, b, 'day_before');
      }

      // ========== 当日リマインド (07:00以降) ==========
      if (
        b.work_date === todayStr &&
        !b.reminder_day_of_sent &&
        hour >= 7
      ) {
        await sendReminder(db, lineClient, b, 'day_of');
      }
    } catch (err) {
      console.error(`Job reminder error (booking ${b.booking_id}):`, err);
    }
  }

  // ========== 口コミ依頼（勤務終了10分後） ==========
  const pastBookings = await db
    .prepare(`
      SELECT
        cb.id as booking_id,
        cb.friend_id,
        cb.job_id,
        j.nursery_name,
        j.nursery_id,
        j.work_date,
        j.start_time,
        j.end_time,
        j.address,
        cb.reminder_day_before_sent,
        cb.reminder_day_of_sent,
        cb.review_request_sent
      FROM calendar_bookings cb
      JOIN jobs j ON cb.job_id = j.id
      WHERE cb.status = 'confirmed'
        AND cb.friend_id IS NOT NULL
        AND cb.job_id IS NOT NULL
        AND cb.review_request_sent = 0
        AND j.work_date = ?
    `)
    .bind(todayStr)
    .all<BookingWithJob>();

  for (const b of pastBookings.results) {
    try {
      const [endH, endM] = b.end_time.split(':').map(Number);
      const endMinutes = endH * 60 + endM;
      const nowMinutes = hour * 60 + minute;

      // 勤務終了10分後かつ21時まで
      if (nowMinutes >= endMinutes + 10 && hour <= 21) {
        await sendReviewRequest(db, lineClient, b, liffUrl);
        // 園側にもワーカーレビュー依頼を送信
        await sendNurseryReviewRequest(db, lineClient, b, liffUrl);
      }
    } catch (err) {
      console.error(`Review request error (booking ${b.booking_id}):`, err);
    }
  }
}

async function sendReminder(
  db: D1Database,
  lineClient: LineClient,
  booking: BookingWithJob,
  type: 'day_before' | 'day_of',
): Promise<void> {
  const friend = await getFriendById(db, booking.friend_id);
  if (!friend || !friend.is_following) return;

  const profile = await getProfileByFriendId(db, booking.friend_id);
  const name = profile?.real_name || friend.display_name || '';

  const dateStr = formatDate(booking.work_date);
  let message: string;

  if (type === 'day_before') {
    message = [
      `${name}様`,
      '',
      `明日のお仕事のリマインドです。`,
      '',
      `📍 ${booking.nursery_name}`,
      `📅 ${dateStr}`,
      `⏰ ${booking.start_time}〜${booking.end_time}`,
      booking.address ? `📌 ${booking.address}` : '',
      '',
      `お気をつけてお越しください。`,
      `ご不明点があればお気軽にメッセージください。`,
    ].filter(Boolean).join('\n');
  } else {
    message = [
      `${name}様`,
      '',
      `本日のお仕事のリマインドです。`,
      '',
      `📍 ${booking.nursery_name}`,
      `⏰ ${booking.start_time}〜${booking.end_time}`,
      booking.address ? `📌 ${booking.address}` : '',
      '',
      `本日もよろしくお願いいたします！`,
    ].filter(Boolean).join('\n');
  }

  await lineClient.pushMessage(friend.line_user_id, [
    { type: 'text', text: message },
  ]);

  const column = type === 'day_before' ? 'reminder_day_before_sent' : 'reminder_day_of_sent';
  await db
    .prepare(`UPDATE calendar_bookings SET ${column} = 1 WHERE id = ?`)
    .bind(booking.booking_id)
    .run();

  await db
    .prepare(
      `INSERT INTO messages_log (id, friend_id, direction, message_type, content, created_at)
       VALUES (?, ?, 'outgoing', 'text', ?, ?)`,
    )
    .bind(crypto.randomUUID(), friend.id, message, jstNow())
    .run();
}

// ========== ワーカー → 園レビュー依頼（Flexメッセージ） ==========

async function sendReviewRequest(
  db: D1Database,
  lineClient: LineClient,
  booking: BookingWithJob,
  liffUrl?: string,
): Promise<void> {
  const friend = await getFriendById(db, booking.friend_id);
  if (!friend || !friend.is_following) return;

  const profile = await getProfileByFriendId(db, booking.friend_id);
  const name = profile?.real_name || friend.display_name || '';
  const dateStr = formatDate(booking.work_date);

  // LIFFレビューフォームへのURL（liff.line.me形式 = LINE内で自動認証）
  const reviewUrl = liffUrl
    ? `${liffUrl}/review?bookingId=${booking.booking_id}`
    : null;

  if (reviewUrl) {
    // Flex メッセージでレビュー依頼
    const flexMessage = {
      type: 'flex' as const,
      altText: `${booking.nursery_name}のレビューをお願いします`,
      contents: {
        type: 'bubble' as const,
        body: {
          type: 'box' as const,
          layout: 'vertical' as const,
          contents: [
            {
              type: 'text' as const,
              text: 'お疲れ様でした！',
              weight: 'bold' as const,
              size: 'lg' as const,
              color: '#E91E8C',
            },
            {
              type: 'text' as const,
              text: `${name}様、本日は${booking.nursery_name}でのお仕事ありがとうございました。`,
              size: 'sm' as const,
              color: '#555555',
              wrap: true,
              margin: 'md' as const,
            },
            {
              type: 'box' as const,
              layout: 'vertical' as const,
              contents: [
                {
                  type: 'box' as const,
                  layout: 'horizontal' as const,
                  contents: [
                    { type: 'text' as const, text: '📍', size: 'sm' as const, flex: 0 },
                    { type: 'text' as const, text: booking.nursery_name, size: 'sm' as const, color: '#333333', flex: 5 },
                  ],
                  spacing: 'sm' as const,
                },
                {
                  type: 'box' as const,
                  layout: 'horizontal' as const,
                  contents: [
                    { type: 'text' as const, text: '📅', size: 'sm' as const, flex: 0 },
                    { type: 'text' as const, text: `${dateStr} ${booking.start_time}〜${booking.end_time}`, size: 'sm' as const, color: '#333333', flex: 5 },
                  ],
                  spacing: 'sm' as const,
                },
              ],
              margin: 'lg' as const,
              spacing: 'sm' as const,
              backgroundColor: '#F8F8F8',
              cornerRadius: '8px' as const,
              paddingAll: '12px' as const,
            },
            {
              type: 'text' as const,
              text: '今後応募される方の参考になりますので、ぜひ園の感想をお聞かせください。',
              size: 'xs' as const,
              color: '#999999',
              wrap: true,
              margin: 'lg' as const,
            },
          ],
        },
        footer: {
          type: 'box' as const,
          layout: 'vertical' as const,
          contents: [
            {
              type: 'button' as const,
              action: {
                type: 'uri' as const,
                label: '⭐ レビューを書く',
                uri: reviewUrl,
              },
              style: 'primary' as const,
              color: '#E91E8C',
              height: 'md' as const,
            },
          ],
        },
      },
    };

    await lineClient.pushMessage(friend.line_user_id, [flexMessage]);
  } else {
    // LIFF URLがない場合はテキストフォールバック
    const message = [
      `${name}様`,
      '',
      `本日は${booking.nursery_name}でのお仕事、お疲れ様でした！`,
      '',
      `よろしければ、園の雰囲気や働きやすさについてレビューをお聞かせください。`,
      `今後応募される方の参考になります。`,
    ].join('\n');

    await lineClient.pushMessage(friend.line_user_id, [
      { type: 'text', text: message },
    ]);
  }

  // フラグ更新
  await db
    .prepare('UPDATE calendar_bookings SET review_request_sent = 1 WHERE id = ?')
    .bind(booking.booking_id)
    .run();

  // メッセージログ
  await db
    .prepare(
      `INSERT INTO messages_log (id, friend_id, direction, message_type, content, created_at)
       VALUES (?, ?, 'outgoing', 'flex', ?, ?)`,
    )
    .bind(crypto.randomUUID(), friend.id, `レビュー依頼: ${booking.nursery_name}`, jstNow())
    .run();
}

// ========== 園側 → ワーカーレビュー依頼 ==========

async function sendNurseryReviewRequest(
  db: D1Database,
  lineClient: LineClient,
  booking: BookingWithJob,
  liffUrl?: string,
): Promise<void> {
  if (!booking.nursery_id) return;

  // 園のLINE担当者を取得
  const contacts = await db
    .prepare(
      `SELECT nc.friend_id, f.line_user_id, f.display_name, f.is_following
       FROM nursery_contacts nc
       JOIN friends f ON nc.friend_id = f.id
       WHERE nc.nursery_id = ? AND f.is_following = 1`,
    )
    .bind(booking.nursery_id)
    .all<{ friend_id: string; line_user_id: string; display_name: string; is_following: number }>();

  if (!contacts.results.length) return;

  // ワーカー情報
  const workerProfile = await getProfileByFriendId(db, booking.friend_id);
  const workerName = workerProfile?.real_name || '（名前未登録）';
  const dateStr = formatDate(booking.work_date);

  for (const contact of contacts.results) {
    try {
      const message = [
        `【ワーカーレビューのお願い】`,
        '',
        `本日勤務いただいた${workerName}様のレビューにご協力ください。`,
        '',
        `📅 ${dateStr} ${booking.start_time}〜${booking.end_time}`,
        `👤 ${workerName}`,
        '',
        `働きぶりの評価は、今後のマッチング精度向上に役立ちます。`,
        `管理画面からレビューをお願いします。`,
      ].join('\n');

      await lineClient.pushMessage(contact.line_user_id, [
        { type: 'text', text: message },
      ]);

      // メッセージログ
      await db
        .prepare(
          `INSERT INTO messages_log (id, friend_id, direction, message_type, content, created_at)
           VALUES (?, ?, 'outgoing', 'text', ?, ?)`,
        )
        .bind(crypto.randomUUID(), contact.friend_id, message, jstNow())
        .run();
    } catch (err) {
      console.error(`Nursery review request error (contact ${contact.friend_id}):`, err);
    }
  }
}
