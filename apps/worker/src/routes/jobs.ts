import { Hono } from 'hono';
import {
  getJobs,
  getJobById,
  createJob,
  createJobsBatch,
  updateJobStatus,
  updateJob,
  getJobBookingCount,
  getCalendarBookingById,
  approveBooking,
  denyBooking,
  getPendingBookings,
  getFriendById,
  getNurseries,
  getNurseryContacts,
  getProfileByFriendId,
} from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';
import type { Env } from '../index.js';

const jobs = new Hono<Env>();

// ========== メール文面から求人を一括解析（管理: API_KEY認証） ==========

jobs.post('/api/jobs/parse-email', async (c) => {
  try {
    const { text } = await c.req.json<{ text: string }>();
    if (!text || text.trim().length === 0) {
      return c.json({ success: false, error: 'text is required' }, 400);
    }

    const apiKey = c.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return c.json({ success: false, error: 'ANTHROPIC_API_KEY not configured' }, 500);
    }

    // 登録済み園リストを取得してマッチング精度を上げる
    const nurseries = await getNurseries(c.env.DB);
    const nurseryList = nurseries.map((n) => ({
      id: n.id,
      name: n.name,
      address: n.address,
      station: n.station,
    }));

    const today = new Date().toISOString().split('T')[0];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: `以下のメール文面から求人情報を抽出してJSON配列で返してください。

## 登録済み園リスト
${JSON.stringify(nurseryList, null, 2)}

## ルール
- 園名が登録済みリストに一致する場合は nurseryId にそのIDを設定
- 一致しない場合は nurseryId を null にして nurseryName に記載の園名を設定
- 日付は YYYY-MM-DD 形式（今日: ${today}）。「来週月曜」等の相対表現も絶対日付に変換
- 時間は HH:MM 形式
- 時給の記載がなければ hourlyRate は null
- 定員の記載がなければ capacity は 1
- 業務内容があれば description に設定
- 資格要件があれば requirements に設定
- 1つのメールに複数日程がある場合は複数レコードに展開
- 「毎日」「平日毎日」「月〜金」等の繰り返し表現は、該当月の全対象日を1日ずつ個別レコードに展開すること。「4月の平日毎日」なら4月1日〜30日の月〜金を全日展開する（祝日: 昭和の日4/29は除外）。省略せず全日分出力すること
- 「休憩無し」「休憩なし」と記載があれば description に「休憩無し」と記載

## 出力形式（JSON配列のみ、説明不要）
[{
  "nurseryId": "string|null",
  "nurseryName": "string",
  "workDate": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "hourlyRate": number|null,
  "capacity": number,
  "description": "string|null",
  "requirements": "string|null"
}]

## メール文面
${text}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Anthropic API error:', res.status, errBody);
      return c.json({ success: false, error: 'AI parsing failed' }, 502);
    }

    const aiResult = await res.json<{
      content: Array<{ type: string; text: string }>;
    }>();

    const aiText = aiResult.content?.[0]?.text || '';

    // JSON配列を抽出（コードブロック内でも対応）
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('AI parse failed (no JSON array):', aiText.slice(0, 500));
      return c.json({ success: false, error: 'Failed to parse AI response' }, 422);
    }

    let parsed: unknown[];
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('AI parse failed (invalid JSON):', aiText.slice(0, 500));
      return c.json({ success: false, error: 'AI returned invalid JSON' }, 422);
    }

    if (!Array.isArray(parsed)) {
      console.error('AI parse failed (not array):', aiText.slice(0, 500));
      return c.json({ success: false, error: 'AI response is not an array' }, 422);
    }

    // バリデーション: 必須フィールドと形式チェック
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const timeRegex = /^\d{2}:\d{2}$/;
    const validated = parsed
      .filter((job: unknown): job is Record<string, unknown> => {
        if (!job || typeof job !== 'object') return false;
        const j = job as Record<string, unknown>;
        // 必須: nurseryName, workDate, startTime, endTime
        if (!j.nurseryName || typeof j.nurseryName !== 'string') return false;
        if (!j.workDate || typeof j.workDate !== 'string' || !dateRegex.test(j.workDate)) return false;
        if (!j.startTime || typeof j.startTime !== 'string' || !timeRegex.test(j.startTime)) return false;
        if (!j.endTime || typeof j.endTime !== 'string' || !timeRegex.test(j.endTime)) return false;
        return true;
      })
      .map((job) => ({
        nurseryId: (typeof job.nurseryId === 'string' ? job.nurseryId : null) as string | null,
        nurseryName: job.nurseryName as string,
        workDate: job.workDate as string,
        startTime: job.startTime as string,
        endTime: job.endTime as string,
        hourlyRate: typeof job.hourlyRate === 'number' ? job.hourlyRate : null,
        capacity: typeof job.capacity === 'number' && job.capacity > 0 ? job.capacity : 1,
        description: typeof job.description === 'string' ? job.description : null,
        requirements: typeof job.requirements === 'string' ? job.requirements : null,
        address: typeof job.address === 'string' ? job.address : null,
        station: typeof job.station === 'string' ? job.station : null,
      }));

    // 園名を補完（nurseryIdがある場合はリストから正式名称を取得）
    const enriched = validated.map((job) => {
      if (job.nurseryId) {
        const nursery = nurseries.find((n) => n.id === job.nurseryId);
        if (nursery) {
          return {
            ...job,
            nurseryName: nursery.name,
            address: nursery.address || job.address,
            station: nursery.station || job.station,
          };
        }
      }
      return job;
    });

    return c.json({
      success: true,
      data: enriched,
      meta: {
        parsedCount: parsed.length,
        validCount: enriched.length,
        skippedCount: parsed.length - enriched.length,
      },
    });
  } catch (err) {
    console.error('POST /api/jobs/parse-email error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 求人一覧（公開: LIFF用） ==========

jobs.get('/api/jobs', async (c) => {
  try {
    const status = c.req.query('status') ?? 'open';
    const fromDate = c.req.query('fromDate');
    const toDate = c.req.query('toDate');
    const connectionId = c.req.query('connectionId');
    const items = await getJobs(c.env.DB, {
      status: status || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      connectionId: connectionId || undefined,
    });

    // 各求人の残り枠数を一括で計算（N+1回避）
    const bookingCountMap = new Map<string, number>();
    if (items.length > 0) {
      const placeholders = items.map(() => '?').join(',');
      const countResult = await c.env.DB
        .prepare(
          `SELECT job_id, COUNT(*) as cnt FROM calendar_bookings
           WHERE job_id IN (${placeholders}) AND status != 'cancelled'
           GROUP BY job_id`,
        )
        .bind(...items.map(j => j.id))
        .all<{ job_id: string; cnt: number }>();
      for (const row of countResult.results) {
        bookingCountMap.set(row.job_id, row.cnt);
      }
    }

    // nursery_id がある求人はnurseryデータをJOIN
    const nurseryIds = [...new Set(items.map(j => (j as Record<string, unknown>).nursery_id as string).filter(Boolean))];
    const nurseryMap = new Map<string, Record<string, unknown>>();
    const workerUrl = c.env.WORKER_URL || '';

    if (nurseryIds.length > 0) {
      const nPlaceholders = nurseryIds.map(() => '?').join(',');
      const nResult = await c.env.DB
        .prepare(`SELECT * FROM nurseries WHERE id IN (${nPlaceholders})`)
        .bind(...nurseryIds)
        .all<Record<string, unknown>>();
      for (const n of nResult.results) {
        const photoKeys: string[] = JSON.parse((n.photo_r2_keys as string) || '[]');
        nurseryMap.set(n.id as string, {
          nurseryId: n.id,
          nurseryName: n.name,
          prefecture: n.prefecture,
          area: n.area,
          nurseryType: n.nursery_type,
          qualificationReq: n.qualification_req,
          address: n.address,
          station: n.station,
          accessInfo: n.access_info,
          hpUrl: n.hp_url,
          description: n.description,
          requirements: n.requirements,
          notes: n.notes,
          transportFee: n.transport_fee,
          breakMinutes: n.break_minutes,
          photoUrls: photoKeys.map((key: string) =>
            `${workerUrl}/api/nurseries/${n.id}/photo/${encodeURIComponent(key.split('/').pop() || key)}`
          ),
        });
      }
    }

    const data = items.map((job) => {
      const booked = bookingCountMap.get(job.id) ?? 0;
      const nurseryId = (job as Record<string, unknown>).nursery_id as string | null;
      const nurseryData = nurseryId ? nurseryMap.get(nurseryId) : null;

      return {
        id: job.id,
        nurseryName: job.nursery_name,
        address: job.address,
        station: job.station,
        hourlyRate: job.hourly_rate,
        description: job.description,
        requirements: job.requirements,
        capacity: job.capacity,
        remainingSlots: Math.max(0, job.capacity - booked),
        workDate: job.work_date,
        startTime: job.start_time,
        endTime: job.end_time,
        status: job.status,
        metadata: job.metadata ? JSON.parse(job.metadata) : null,
        createdAt: job.created_at,
        // nursery enrichment (nulls fall back to job-level fields)
        ...(nurseryData || {}),
      };
    });

    return c.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/jobs error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 求人詳細（公開: LIFF用） ==========

jobs.get('/api/jobs/:id', async (c) => {
  try {
    const job = await getJobById(c.env.DB, c.req.param('id'));
    if (!job) return c.json({ success: false, error: 'Job not found' }, 404);

    const booked = await getJobBookingCount(c.env.DB, job.id);

    return c.json({
      success: true,
      data: {
        id: job.id,
        nurseryName: job.nursery_name,
        address: job.address,
        station: job.station,
        hourlyRate: job.hourly_rate,
        description: job.description,
        requirements: job.requirements,
        capacity: job.capacity,
        remainingSlots: Math.max(0, job.capacity - booked),
        workDate: job.work_date,
        startTime: job.start_time,
        endTime: job.end_time,
        status: job.status,
        metadata: job.metadata ? JSON.parse(job.metadata) : null,
        createdAt: job.created_at,
      },
    });
  } catch (err) {
    console.error('GET /api/jobs/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 求人作成（管理: API_KEY認証） ==========

jobs.post('/api/jobs', async (c) => {
  try {
    const body = await c.req.json<{
      connectionId: string;
      nurseryName: string;
      address?: string;
      station?: string;
      hourlyRate?: number;
      description?: string;
      requirements?: string;
      capacity?: number;
      workDate: string;
      startTime: string;
      endTime: string;
      metadata?: Record<string, unknown>;
    }>();

    if (!body.connectionId || !body.nurseryName || !body.workDate || !body.startTime || !body.endTime) {
      return c.json({ success: false, error: 'connectionId, nurseryName, workDate, startTime, endTime are required' }, 400);
    }

    const job = await createJob(c.env.DB, {
      ...body,
      metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
    });

    return c.json({
      success: true,
      data: {
        id: job.id,
        nurseryName: job.nursery_name,
        workDate: job.work_date,
        startTime: job.start_time,
        endTime: job.end_time,
        status: job.status,
        createdAt: job.created_at,
      },
    }, 201);
  } catch (err) {
    console.error('POST /api/jobs error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 求人一括作成（管理: API_KEY認証） ==========

jobs.post('/api/jobs/batch', async (c) => {
  try {
    const body = await c.req.json<{
      jobs: Array<{
        connectionId: string;
        nurseryId?: string;
        nurseryName: string;
        address?: string;
        station?: string;
        hourlyRate?: number;
        description?: string;
        requirements?: string;
        capacity?: number;
        workDate: string;
        startTime: string;
        endTime: string;
        metadata?: Record<string, unknown>;
      }>;
    }>();

    if (!body.jobs || !Array.isArray(body.jobs) || body.jobs.length === 0) {
      return c.json({ success: false, error: 'jobs array is required' }, 400);
    }

    // connectionId が 'default' or 未設定の場合、最初のconnectionを自動解決
    let defaultConnectionId: string | null = null;
    if (body.jobs.some((j) => !j.connectionId || j.connectionId === 'default')) {
      const conn = await c.env.DB
        .prepare('SELECT id FROM google_calendar_connections LIMIT 1')
        .first<{ id: string }>();
      defaultConnectionId = conn?.id ?? null;
      if (!defaultConnectionId) {
        return c.json({ success: false, error: 'No calendar connection found. Please create one first.' }, 400);
      }
    }

    const inputs = body.jobs.map((j) => ({
      ...j,
      connectionId: (!j.connectionId || j.connectionId === 'default') ? defaultConnectionId! : j.connectionId,
      metadata: j.metadata ? JSON.stringify(j.metadata) : undefined,
    }));

    const created = await createJobsBatch(c.env.DB, inputs);

    return c.json({
      success: true,
      data: created.map((job) => ({
        id: job.id,
        nurseryName: job.nursery_name,
        workDate: job.work_date,
        startTime: job.start_time,
        endTime: job.end_time,
      })),
      count: created.length,
    }, 201);
  } catch (err) {
    console.error('POST /api/jobs/batch error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 求人ステータス更新（管理: API_KEY認証） ==========

jobs.put('/api/jobs/:id/status', async (c) => {
  try {
    const { status } = await c.req.json<{ status: string }>();
    if (!['open', 'filled', 'cancelled', 'completed'].includes(status)) {
      return c.json({ success: false, error: 'Invalid status' }, 400);
    }
    await updateJobStatus(c.env.DB, c.req.param('id'), status);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('PUT /api/jobs/:id/status error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 求人更新（管理: API_KEY認証） ==========

jobs.put('/api/jobs/:id', async (c) => {
  try {
    const body = await c.req.json();
    const updated = await updateJob(c.env.DB, c.req.param('id'), {
      nurseryName: body.nurseryName,
      address: body.address,
      station: body.station,
      hourlyRate: body.hourlyRate,
      description: body.description,
      requirements: body.requirements,
      capacity: body.capacity,
      workDate: body.workDate,
      startTime: body.startTime,
      endTime: body.endTime,
      metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
    });
    if (!updated) return c.json({ success: false, error: 'Job not found' }, 404);
    return c.json({ success: true, data: { id: updated.id } });
  } catch (err) {
    console.error('PUT /api/jobs/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 求人予約（公開: LIFF用） ==========

jobs.post('/api/jobs/:id/book', async (c) => {
  try {
    const jobId = c.req.param('id');
    const job = await getJobById(c.env.DB, jobId);
    if (!job) return c.json({ success: false, error: 'Job not found' }, 404);
    if (job.status !== 'open') return c.json({ success: false, error: 'Job is not available' }, 400);

    // capacity チェック
    const booked = await getJobBookingCount(c.env.DB, jobId);
    if (booked >= job.capacity) {
      return c.json({ success: false, error: 'No remaining slots' }, 400);
    }

    const body = await c.req.json<{ friendId?: string; displayName?: string }>();

    // 信用スコアチェック（0以下は応募不可）
    if (body.friendId) {
      const { getCreditScore } = await import('@line-crm/db');
      const score = await getCreditScore(c.env.DB, body.friendId);
      if (score.credit_score <= 0) {
        return c.json({
          success: false,
          error: 'キャンセルが多いため、現在応募が制限されています。運営にお問い合わせください。',
        }, 403);
      }
    }

    // calendar_bookings に予約レコード作成（job_id 紐付き）
    const { createCalendarBooking } = await import('@line-crm/db');
    const startAt = `${job.work_date}T${job.start_time}:00+09:00`;
    const endAt = `${job.work_date}T${job.end_time}:00+09:00`;

    const booking = await createCalendarBooking(c.env.DB, {
      connectionId: job.connection_id,
      friendId: body.friendId,
      title: `${body.displayName ?? '保育士'}様 - ${job.nursery_name}`,
      startAt,
      endAt,
      metadata: JSON.stringify({ jobId, nurseryName: job.nursery_name }),
    });

    // job_id と approval_status を calendar_bookings に書き込む
    await c.env.DB
      .prepare('UPDATE calendar_bookings SET job_id = ?, approval_status = ? WHERE id = ?')
      .bind(jobId, 'pending', booking.id)
      .run();

    // 楽観的ロック: INSERT後に再カウントし、capacity超過なら予約を取り消す
    const recount = await getJobBookingCount(c.env.DB, jobId);
    if (recount > job.capacity) {
      await c.env.DB
        .prepare("UPDATE calendar_bookings SET status = 'cancelled' WHERE id = ?")
        .bind(booking.id)
        .run();
      return c.json({ success: false, error: 'No remaining slots' }, 400);
    }

    // capacity 到達で自動クローズ
    if (recount >= job.capacity) {
      await updateJobStatus(c.env.DB, jobId, 'filled');
    }

    // ========== 応募完了LINEメッセージ送信 ==========
    if (body.friendId) {
      try {
        const { getFriendById } = await import('@line-crm/db');
        const friend = await getFriendById(c.env.DB, body.friendId);
        if (friend?.line_user_id) {
          const { LineClient } = await import('@line-crm/line-sdk');
          const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);

          // 日付フォーマット
          const d = new Date(job.work_date + 'T00:00:00');
          const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
          const dateStr = `${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]})`;

          await lineClient.pushMessage(friend.line_user_id, [
            {
              type: 'text',
              text: `✅ ご応募ありがとうございます！\n\n📍 ${job.nursery_name}\n📅 ${dateStr}\n⏰ ${job.start_time}〜${job.end_time}\n\nただいま担当者が確認中です。\n採用が決定しましたら、こちらのLINEでご連絡いたします。`,
            },
          ]);
        }
      } catch (lineErr) {
        // LINE送信失敗は応募自体を失敗させない
        console.error('LINE push message error:', lineErr);
      }
    }

    // ========== 園担当者への承認依頼通知（Flex Message + 承認ボタン） ==========
    {
      try {
        const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
        const d = new Date(job.work_date + 'T00:00:00');
        const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
        const dateStr = `${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]})`;

        // プロフィール情報を取得
        let applicantName = body.displayName ?? '保育士';
        let qualType = '';
        let experienceYears = '';
        let phone = '';
        let age = '';
        let gender = '';
        let bacterialTest = '';
        let allergiesMedical = '';
        let healthNotes = '';
        let completedCount = 0;
        let docStatus = '';

        if (body.friendId) {
          const { getProfileByFriendId, getDocumentsByFriendId } = await import('@line-crm/db');
          const profile = await getProfileByFriendId(c.env.DB, body.friendId);
          if (profile) {
            applicantName = profile.real_name || applicantName;
            qualType = profile.qualification_type || '';
            experienceYears = profile.experience_years ? `${profile.experience_years}年` : '';
            phone = profile.phone || '';
            gender = profile.gender || '';
            bacterialTest = profile.bacterial_test_status || '';
            allergiesMedical = profile.allergies_medical || '';
            healthNotes = profile.health_notes || '';
            if (profile.date_of_birth) {
              const birth = new Date(profile.date_of_birth);
              const today = new Date();
              let a = today.getFullYear() - birth.getFullYear();
              if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) a--;
              age = `${a}歳`;
            }
          }

          // 過去の勤務実績
          const pastResult = await c.env.DB
            .prepare("SELECT COUNT(*) as cnt FROM calendar_bookings WHERE friend_id = ? AND approval_status = 'approved' AND start_at < datetime('now')")
            .bind(body.friendId)
            .first<{ cnt: number }>();
          completedCount = pastResult?.cnt ?? 0;

          // 書類提出状況
          const docs = await getDocumentsByFriendId(c.env.DB, body.friendId);
          const docTypes = docs.map(d => d.doc_type);
          const hasIdFront = docTypes.includes('id_card');
          const hasIdBack = docTypes.includes('id_card_back');
          const hasQualCert = docTypes.includes('qualification_cert');
          const docParts: string[] = [];
          if (hasIdFront && hasIdBack) docParts.push('本人確認書類✓');
          else if (hasIdFront) docParts.push('本人確認書類(表のみ)');
          if (hasQualCert) docParts.push('資格証✓');
          docStatus = docParts.length > 0 ? docParts.join(' / ') : '未提出';
        }

        // 応募者詳細行を組み立て
        const detailLines: { type: string; text: string; size: string; color: string; wrap?: boolean }[] = [];

        // 基本情報（資格・経験・年齢・性別を1行に）
        const basicParts = [qualType, experienceYears, age, gender].filter(Boolean);
        if (basicParts.length > 0) {
          detailLines.push({ type: 'text', text: basicParts.join(' / '), size: 'sm', color: '#4b5563' });
        }
        if (phone) {
          detailLines.push({ type: 'text', text: `📞 ${phone}`, size: 'sm', color: '#4b5563' });
        }
        if (bacterialTest) {
          detailLines.push({ type: 'text', text: `🔬 検便: ${bacterialTest}`, size: 'sm', color: '#4b5563' });
        }
        if (allergiesMedical) {
          detailLines.push({ type: 'text', text: `⚠️ ${allergiesMedical}`, size: 'sm', color: '#b45309', wrap: true });
        }
        if (healthNotes) {
          detailLines.push({ type: 'text', text: `📝 ${healthNotes}`, size: 'sm', color: '#4b5563', wrap: true });
        }
        detailLines.push({ type: 'text', text: `📄 ${docStatus}`, size: 'sm', color: '#4b5563' });
        detailLines.push({ type: 'text', text: `✅ 過去勤務: ${completedCount}回`, size: 'sm', color: completedCount > 0 ? '#166534' : '#4b5563' });

        // Flex Message: 応募者情報 + 承認/否認ボタン
        const flexMessage = {
          type: 'flex' as const,
          altText: `📋 新しい応募: ${applicantName} - ${job.nursery_name}`,
          contents: {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: '#f0fdf4',
              contents: [
                { type: 'text', text: '📋 新しい応募が届きました', size: 'md', weight: 'bold', color: '#166534' },
              ],
            },
            body: {
              type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
              contents: [
                { type: 'text', text: applicantName, size: 'xl', weight: 'bold', color: '#1e293b' },
                { type: 'separator' },
                {
                  type: 'box', layout: 'vertical', spacing: 'sm',
                  contents: [
                    ...detailLines,
                  ],
                },
                { type: 'separator' },
                {
                  type: 'box', layout: 'vertical', spacing: 'sm',
                  contents: [
                    { type: 'text', text: `📍 ${job.nursery_name}`, size: 'sm', color: '#1e293b', wrap: true },
                    { type: 'text', text: `📅 ${dateStr}（${job.start_time}〜${job.end_time}）`, size: 'sm', color: '#64748b' },
                  ],
                },
              ],
            },
            footer: {
              type: 'box', layout: 'horizontal', paddingAll: '16px', spacing: 'md',
              contents: [
                {
                  type: 'button',
                  action: { type: 'postback', label: '✅ 承認', data: `action=approve&bookingId=${booking.id}`, displayText: '承認します' },
                  style: 'primary', color: '#16a34a', height: 'sm',
                },
                {
                  type: 'button',
                  action: { type: 'postback', label: '❌ 否認', data: `action=deny&bookingId=${booking.id}`, displayText: '否認します' },
                  style: 'secondary', height: 'sm',
                },
              ],
            },
          },
        };

        // 園の担当者全員に送信
        const contacts = job.nursery_id ? await getNurseryContacts(c.env.DB, job.nursery_id) : [];

        if (contacts.length > 0) {
          for (const contact of contacts) {
            try {
              await lineClient.pushMessage(contact.line_user_id, [flexMessage]);
            } catch (contactErr) {
              console.error(`Failed to notify nursery contact ${contact.friend_id}:`, contactErr);
            }
          }
        }

        // フォールバック: 担当者が未登録の場合はADMIN_LINE_USER_IDに送信
        if (contacts.length === 0 && c.env.ADMIN_LINE_USER_ID) {
          await lineClient.pushMessage(c.env.ADMIN_LINE_USER_ID, [flexMessage]);
        }
      } catch (notifyErr) {
        console.error('Nursery contact notification error:', notifyErr);
      }
    }

    return c.json({
      success: true,
      data: {
        bookingId: booking.id,
        jobId,
        nurseryName: job.nursery_name,
        workDate: job.work_date,
        startTime: job.start_time,
        endTime: job.end_time,
      },
    }, 201);
  } catch (err) {
    console.error('POST /api/jobs/:id/book error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 承認待ち応募一覧（管理: API_KEY認証） ==========

jobs.get('/api/bookings/pending', async (c) => {
  try {
    const includeCompleted = c.req.query('includeCompleted') === '1';
    let bookings;

    if (includeCompleted) {
      // レビュー画面用: 全予約を返す（pending + approved + denied）
      const result = await c.env.DB
        .prepare(`SELECT * FROM calendar_bookings WHERE status != 'cancelled' ORDER BY start_at DESC`)
        .all();
      bookings = result.results;
    } else {
      bookings = await getPendingBookings(c.env.DB);
    }

    // Enrich with job info and friend display name
    const data = await Promise.all(
      bookings.map(async (b: Record<string, unknown>) => {
        const meta = b.metadata ? JSON.parse(b.metadata as string) : null;
        const jobId = (b.job_id || meta?.jobId) as string | null;
        let nurseryName = meta?.nurseryName || '';
        let workDate = '';
        let startTime = '';
        let endTime = '';
        let hourlyRate: number | null = null;

        if (jobId) {
          const job = await getJobById(c.env.DB, jobId);
          if (job) {
            nurseryName = job.nursery_name;
            workDate = job.work_date;
            startTime = job.start_time;
            endTime = job.end_time;
            hourlyRate = job.hourly_rate;
          }
        }

        const friendId = b.friend_id as string | null;
        let displayName = '';
        let friendPictureUrl: string | null = null;
        let profile = null;

        if (friendId) {
          const friend = await getFriendById(c.env.DB, friendId);
          displayName = friend?.display_name || '';
          friendPictureUrl = friend?.picture_url || null;
          profile = await getProfileByFriendId(c.env.DB, friendId);
        }

        return {
          id: b.id,
          friendId,
          friendDisplayName: displayName,
          friendPictureUrl,
          nurseryName,
          workDate,
          startTime,
          endTime,
          hourlyRate,
          approvalStatus: b.approval_status,
          checkInAt: b.check_in_at || null,
          checkOutAt: b.check_out_at || null,
          actualHours: b.actual_hours || null,
          title: b.title,
          startAt: b.start_at,
          createdAt: b.created_at,
          qualificationType: profile?.qualification_type || null,
          profile: profile ? {
            realName: profile.real_name,
            realNameKana: profile.real_name_kana,
            phone: profile.phone,
            qualificationType: profile.qualification_type,
            experienceYears: (profile as Record<string, unknown>).experience_years,
          } : null,
        };
      }),
    );
    return c.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/bookings/pending error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 応募承認（管理: API_KEY認証） ==========

jobs.post('/api/bookings/:id/approve', async (c) => {
  try {
    const bookingId = c.req.param('id');
    const body = await c.req.json<{ note?: string }>().catch(() => ({}));

    const booking = await getCalendarBookingById(c.env.DB, bookingId);
    if (!booking) return c.json({ success: false, error: 'Booking not found' }, 404);
    if (booking.approval_status === 'approved') {
      return c.json({ success: false, error: 'Already approved' }, 400);
    }

    await approveBooking(c.env.DB, bookingId, (body as { note?: string }).note);

    // LINE通知: 承認メッセージを応募者 + 園担当者に送信
    try {
      const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
      const meta = booking.metadata ? JSON.parse(booking.metadata) : null;
      const jobId = booking.job_id || meta?.jobId;
      let nurseryName = meta?.nurseryName || '';
      let dateStr = '';
      let nurseryId: string | null = null;

      if (jobId) {
        const job = await getJobById(c.env.DB, jobId);
        if (job) {
          nurseryName = job.nursery_name;
          nurseryId = job.nursery_id || null;
          const d = new Date(job.work_date + 'T00:00:00');
          const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
          dateStr = `${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]}) ${job.start_time}〜${job.end_time}`;
        }
      }

      // 応募者に通知
      if (booking.friend_id) {
        const friend = await getFriendById(c.env.DB, booking.friend_id);
        if (friend?.line_user_id) {
          await lineClient.pushMessage(friend.line_user_id, [
            {
              type: 'text',
              text: `🎉 採用が決定しました！\n\n📍 ${nurseryName}\n📅 ${dateStr}\n\nご応募ありがとうございます。当日はよろしくお願いいたします。\n\n【持ち物】\n・筆記具\n・動きやすい服装\n・上履き\n・エプロン\n\n※体調がすぐれない場合はお早めにご連絡ください。`,
            },
          ]);
        }
      }

      // 園担当者全員に承認済み通知
      if (nurseryId) {
        const contacts = await getNurseryContacts(c.env.DB, nurseryId);
        for (const contact of contacts) {
          try {
            await lineClient.pushMessage(contact.line_user_id, [
              { type: 'text', text: `✅ 応募が承認されました。\n\n📍 ${nurseryName}\n📅 ${dateStr}` },
            ]);
          } catch (contactErr) {
            console.error(`Failed to notify contact ${contact.friend_id}:`, contactErr);
          }
        }
      }
    } catch (lineErr) {
      console.error('LINE approval notification error:', lineErr);
    }

    return c.json({ success: true, data: { bookingId, approvalStatus: 'approved' } });
  } catch (err) {
    console.error('POST /api/bookings/:id/approve error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 応募否認（管理: API_KEY認証） ==========

jobs.post('/api/bookings/:id/deny', async (c) => {
  try {
    const bookingId = c.req.param('id');
    const body = await c.req.json<{ note?: string }>().catch(() => ({}));

    const booking = await getCalendarBookingById(c.env.DB, bookingId);
    if (!booking) return c.json({ success: false, error: 'Booking not found' }, 404);
    if (booking.approval_status === 'denied') {
      return c.json({ success: false, error: 'Already denied' }, 400);
    }

    await denyBooking(c.env.DB, bookingId, (body as { note?: string }).note);

    // 否認時: capacity解放（filledだった場合にopenに戻す）
    const meta = booking.metadata ? JSON.parse(booking.metadata) : null;
    const jobId = booking.job_id || meta?.jobId;
    if (jobId) {
      const job = await getJobById(c.env.DB, jobId);
      if (job && job.status === 'filled') {
        await updateJobStatus(c.env.DB, jobId, 'open');
      }
    }

    // LINE通知: 否認メッセージを応募者に送信
    if (booking.friend_id) {
      try {
        const friend = await getFriendById(c.env.DB, booking.friend_id);
        if (friend?.line_user_id) {
          const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
          const nurseryName = meta?.nurseryName || '';

          await lineClient.pushMessage(friend.line_user_id, [
            {
              type: 'text',
              text: `${nurseryName}へのご応募について\n\n大変申し訳ございませんが、今回はご希望に添えない結果となりました。\n\nまた別の日程やお仕事でお会いできることを楽しみにしております。\n引き続き、スポットほいくをよろしくお願いいたします。`,
            },
          ]);
        }
      } catch (lineErr) {
        console.error('LINE deny notification error:', lineErr);
      }
    }

    return c.json({ success: true, data: { bookingId, approvalStatus: 'denied' } });
  } catch (err) {
    console.error('POST /api/bookings/:id/deny error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * ワーカー自己キャンセル — 応募済みの予約をワーカーが自分でキャンセル
 * 枠を復活させ、園への連絡を促すメッセージを送信
 */
jobs.post('/api/bookings/:id/cancel', async (c) => {
  try {
    const bookingId = c.req.param('id');
    const booking = await getCalendarBookingById(c.env.DB, bookingId);
    if (!booking) {
      return c.json({ success: false, error: 'Booking not found' }, 404);
    }
    if (booking.status === 'cancelled') {
      return c.json({ success: false, error: 'Already cancelled' }, 400);
    }

    const jobId = (booking as { job_id?: string }).job_id ?? null;
    let nurseryName = '';

    // 予約をキャンセル状態に更新
    await c.env.DB
      .prepare("UPDATE calendar_bookings SET status = 'cancelled', approval_status = 'denied' WHERE id = ?")
      .bind(bookingId)
      .run();

    // 求人の枠を復活（filledだったらopenに戻す）
    if (jobId) {
      const job = await getJobById(c.env.DB, jobId);
      if (job) {
        nurseryName = job.nursery_name;
        if (job.status === 'filled') {
          await updateJobStatus(c.env.DB, jobId, 'open');
        }
      }
    }

    // キャンセル通知 + 園への連絡を促すメッセージ
    try {
      const friend = await getFriendById(c.env.DB, booking.friend_id);
      if (friend?.line_user_id) {
        const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
        await lineClient.pushMessage(friend.line_user_id, [{
          type: 'text',
          text: `キャンセルを受け付けました。\n\n${nurseryName ? `📍 ${nurseryName}\n\n` : ''}⚠️ お手数ですが、園にも直接キャンセルのご連絡をお願いいたします。\n\n今後ともスポットほいくをよろしくお願いいたします。`,
        }]);
      }
    } catch (lineErr) {
      console.error('LINE cancel notification error:', lineErr);
    }

    return c.json({
      success: true,
      data: { bookingId, nurseryName },
    });
  } catch (err) {
    console.error('POST /api/bookings/:id/cancel error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { jobs };
