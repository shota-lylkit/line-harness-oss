import { Hono } from 'hono';
import {
  getIncomingWebhooks,
  getIncomingWebhookById,
  createIncomingWebhook,
  updateIncomingWebhook,
  deleteIncomingWebhook,
  getOutgoingWebhooks,
  getOutgoingWebhookById,
  createOutgoingWebhook,
  updateOutgoingWebhook,
  deleteOutgoingWebhook,
} from '@line-crm/db';
import type { Env } from '../index.js';

const webhooks = new Hono<Env>();

// ========== 受信Webhook ==========

webhooks.get('/api/webhooks/incoming', async (c) => {
  try {
    const items = await getIncomingWebhooks(c.env.DB);
    return c.json({
      success: true,
      data: items.map((w) => ({
        id: w.id,
        name: w.name,
        sourceType: w.source_type,
        secret: w.secret,
        isActive: Boolean(w.is_active),
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/webhooks/incoming error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.post('/api/webhooks/incoming', async (c) => {
  try {
    const body = await c.req.json<{ name: string; sourceType?: string; secret?: string }>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);
    const item = await createIncomingWebhook(c.env.DB, body);
    return c.json({ success: true, data: { id: item.id, name: item.name, sourceType: item.source_type, isActive: Boolean(item.is_active), createdAt: item.created_at } }, 201);
  } catch (err) {
    console.error('POST /api/webhooks/incoming error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.put('/api/webhooks/incoming/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    await updateIncomingWebhook(c.env.DB, id, body);
    const updated = await getIncomingWebhookById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: { id: updated.id, name: updated.name, sourceType: updated.source_type, isActive: Boolean(updated.is_active) } });
  } catch (err) {
    console.error('PUT /api/webhooks/incoming/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.delete('/api/webhooks/incoming/:id', async (c) => {
  try {
    await deleteIncomingWebhook(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/webhooks/incoming/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 送信Webhook ==========

webhooks.get('/api/webhooks/outgoing', async (c) => {
  try {
    const items = await getOutgoingWebhooks(c.env.DB);
    return c.json({
      success: true,
      data: items.map((w) => ({
        id: w.id,
        name: w.name,
        url: w.url,
        eventTypes: JSON.parse(w.event_types),
        secret: w.secret,
        isActive: Boolean(w.is_active),
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/webhooks/outgoing error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.post('/api/webhooks/outgoing', async (c) => {
  try {
    const body = await c.req.json<{ name: string; url: string; eventTypes: string[]; secret?: string }>();
    if (!body.name || !body.url) return c.json({ success: false, error: 'name and url are required' }, 400);
    const item = await createOutgoingWebhook(c.env.DB, { ...body, eventTypes: body.eventTypes ?? [] });
    return c.json({
      success: true,
      data: { id: item.id, name: item.name, url: item.url, eventTypes: JSON.parse(item.event_types), isActive: Boolean(item.is_active), createdAt: item.created_at },
    }, 201);
  } catch (err) {
    console.error('POST /api/webhooks/outgoing error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.put('/api/webhooks/outgoing/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    await updateOutgoingWebhook(c.env.DB, id, body);
    const updated = await getOutgoingWebhookById(c.env.DB, id);
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({ success: true, data: { id: updated.id, name: updated.name, url: updated.url, eventTypes: JSON.parse(updated.event_types), isActive: Boolean(updated.is_active) } });
  } catch (err) {
    console.error('PUT /api/webhooks/outgoing/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

webhooks.delete('/api/webhooks/outgoing/:id', async (c) => {
  try {
    await deleteOutgoingWebhook(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/webhooks/outgoing/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 受信Webhookエンドポイント (外部システムからの受信) ==========

// HMAC-SHA256 signature verification for incoming webhooks
async function verifyWebhookSignature(secret: string, rawBody: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // Constant-time-ish comparison (both are hex strings of same length)
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

webhooks.post('/api/webhooks/incoming/:id/receive', async (c) => {
  try {
    const id = c.req.param('id');
    const wh = await getIncomingWebhookById(c.env.DB, id);
    if (!wh || !wh.is_active) return c.json({ success: false, error: 'Webhook not found or inactive' }, 404);

    // Signature verification: if the webhook has a secret configured, require a valid signature
    let body: unknown;
    if (wh.secret) {
      const rawBody = await c.req.text();
      const signature = c.req.header('X-Webhook-Signature') ?? '';
      if (!signature) {
        return c.json({ success: false, error: 'Missing X-Webhook-Signature header' }, 401);
      }
      const valid = await verifyWebhookSignature(wh.secret, rawBody, signature);
      if (!valid) {
        return c.json({ success: false, error: 'Invalid signature' }, 401);
      }
      body = JSON.parse(rawBody);
    } else {
      body = await c.req.json();
    }

    // イベントバスに発火: source_type をイベントタイプとして使用
    const { fireEvent } = await import('../services/event-bus.js');
    const eventType = `incoming_webhook.${wh.source_type}`;
    await fireEvent(c.env.DB, eventType, {
      eventData: { webhookId: wh.id, source: wh.source_type, payload: body },
    });

    return c.json({ success: true, data: { received: true, source: wh.source_type } });
  } catch (err) {
    console.error('POST /api/webhooks/incoming/:id/receive error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { webhooks };
