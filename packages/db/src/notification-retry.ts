import { jstNow } from './utils.js';

export interface NotificationRetryRow {
  id: string;
  line_user_id: string;
  messages: string;
  retry_count: number;
  max_retries: number;
  status: string;
  context: string | null;
  created_at: string;
  next_retry_at: string;
}

/**
 * 通知リトライキューに追加
 * 初回リトライは1分後、以降は指数バックオフ（1m, 5m, 15m）
 */
export async function enqueueNotificationRetry(
  db: D1Database,
  lineUserId: string,
  messages: unknown[],
  context?: string,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const nextRetry = new Date(Date.now() + 60 * 1000).toISOString(); // 1分後
  await db
    .prepare(
      `INSERT INTO notification_retries (id, line_user_id, messages, context, created_at, next_retry_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, lineUserId, JSON.stringify(messages), context ?? null, now, nextRetry)
    .run();
}

/**
 * 送信待ちの通知を取得（最大50件）
 */
export async function getPendingRetries(db: D1Database): Promise<NotificationRetryRow[]> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `SELECT * FROM notification_retries
       WHERE status = 'pending' AND next_retry_at <= ?
       ORDER BY next_retry_at ASC LIMIT 50`,
    )
    .bind(now)
    .all<NotificationRetryRow>();
  return result.results;
}

/**
 * リトライ成功 → sentに更新
 */
export async function markRetrySent(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE notification_retries SET status = 'sent', retry_count = retry_count + 1 WHERE id = ?")
    .bind(id)
    .run();
}

/**
 * リトライ失敗 → 次回リトライ時刻を更新 or 最大回数超過でfailed
 */
export async function markRetryFailed(db: D1Database, id: string, retryCount: number, maxRetries: number): Promise<void> {
  if (retryCount + 1 >= maxRetries) {
    await db
      .prepare("UPDATE notification_retries SET status = 'failed', retry_count = retry_count + 1 WHERE id = ?")
      .bind(id)
      .run();
  } else {
    // 指数バックオフ: 1分, 5分, 15分
    const delays = [60, 300, 900];
    const delayMs = (delays[retryCount] ?? 900) * 1000;
    const nextRetry = new Date(Date.now() + delayMs).toISOString();
    await db
      .prepare("UPDATE notification_retries SET retry_count = retry_count + 1, next_retry_at = ? WHERE id = ?")
      .bind(nextRetry, id)
      .run();
  }
}

/**
 * 古いレコードをクリーンアップ（7日超のsent/failedを削除）
 */
export async function cleanupOldRetries(db: D1Database): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db
    .prepare("DELETE FROM notification_retries WHERE status IN ('sent', 'failed') AND created_at < ?")
    .bind(cutoff)
    .run();
  return result.meta?.changes ?? 0;
}
