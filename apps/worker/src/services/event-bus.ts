/**
 * イベントバス — システム内イベントの発火と処理
 *
 * spot-hoiku向けに簡素化: 通知ルール処理のみ
 */

import {
  getActiveNotificationRulesByEvent,
  createNotification,
  jstNow,
} from '@line-crm/db';

interface EventPayload {
  friendId?: string;
  eventData?: Record<string, unknown>;
}

/**
 * イベントを発火し、通知ルールを処理
 */
export async function fireEvent(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
  _lineAccessToken?: string,
  lineAccountId?: string | null,
): Promise<void> {
  await processNotifications(db, eventType, payload, lineAccountId);
}

/** 通知ルール処理 */
async function processNotifications(
  db: D1Database,
  eventType: string,
  payload: EventPayload,
  lineAccountId?: string | null,
): Promise<void> {
  try {
    const allRules = await getActiveNotificationRulesByEvent(db, eventType);
    const rules = allRules.filter(
      (r) => !r.line_account_id || !lineAccountId || r.line_account_id === lineAccountId,
    );

    for (const rule of rules) {
      let channels: string[] = JSON.parse(rule.channels);
      if (typeof channels === 'string') channels = JSON.parse(channels);

      for (const channel of channels) {
        await createNotification(db, {
          ruleId: rule.id,
          eventType,
          title: `${rule.name}: ${eventType}`,
          body: JSON.stringify(payload),
          channel,
          metadata: JSON.stringify(payload.eventData ?? {}),
        });
      }
    }
  } catch (err) {
    console.error('processNotifications error:', err);
  }
}
