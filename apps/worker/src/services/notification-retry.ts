import {
  getPendingRetries,
  markRetrySent,
  markRetryFailed,
  cleanupOldRetries,
} from '@line-crm/db';
import type { LineClient } from '@line-crm/line-sdk';

/**
 * リトライキューから送信待ち通知を処理
 * Cronで5分ごとに実行される
 */
export async function processNotificationRetries(
  db: D1Database,
  lineClient: LineClient,
): Promise<void> {
  const retries = await getPendingRetries(db);
  if (retries.length === 0) return;

  for (const retry of retries) {
    try {
      const messages = JSON.parse(retry.messages);
      await lineClient.pushMessage(retry.line_user_id, messages);
      await markRetrySent(db, retry.id);
    } catch (err) {
      console.error(`Notification retry failed (${retry.id}, attempt ${retry.retry_count + 1}):`, err);
      await markRetryFailed(db, retry.id, retry.retry_count, retry.max_retries);
    }
  }

  // 7日以上前の完了レコードをクリーンアップ
  await cleanupOldRetries(db);
}
