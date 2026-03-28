import { Hono } from 'hono';
import {
  getNurseries,
  getNurseryById,
  createNursery,
  updateNursery,
  deactivateNursery,
  getNurseryContacts,
  addNurseryContact,
  removeNurseryContact,
} from '@line-crm/db';
import type { Env } from '../index.js';

const nurseries = new Hono<Env>();

// ========== 園一覧（公開: LIFF用） ==========

nurseries.get('/api/nurseries', async (c) => {
  try {
    const items = await getNurseries(c.env.DB, { activeOnly: true });
    const workerUrl = c.env.WORKER_URL || '';
    const data = items.map((n) => ({
      id: n.id,
      name: n.name,
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
      photoUrls: JSON.parse(n.photo_r2_keys || '[]').map((key: string) =>
        `${workerUrl}/api/nurseries/${n.id}/photo/${encodeURIComponent(key.split('/').pop() || key)}`
      ),
      photoR2Keys: JSON.parse(n.photo_r2_keys || '[]'),
    }));
    return c.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/nurseries error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 園詳細（公開: LIFF用） ==========

nurseries.get('/api/nurseries/:id', async (c) => {
  try {
    const n = await getNurseryById(c.env.DB, c.req.param('id'));
    if (!n) return c.json({ success: false, error: 'Nursery not found' }, 404);
    const workerUrl = c.env.WORKER_URL || '';
    return c.json({
      success: true,
      data: {
        id: n.id,
        name: n.name,
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
        photoUrls: JSON.parse(n.photo_r2_keys || '[]').map((key: string) =>
          `${workerUrl}/api/nurseries/${n.id}/photo/${encodeURIComponent(key.split('/').pop() || key)}`
        ),
        photoR2Keys: JSON.parse(n.photo_r2_keys || '[]'),
      },
    });
  } catch (err) {
    console.error('GET /api/nurseries/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 園作成（管理: API_KEY認証） ==========

nurseries.post('/api/nurseries', async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name) {
      return c.json({ success: false, error: 'name is required' }, 400);
    }
    const nursery = await createNursery(c.env.DB, body);
    return c.json({ success: true, data: { id: nursery.id, name: nursery.name } }, 201);
  } catch (err) {
    console.error('POST /api/nurseries error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 園更新（管理: API_KEY認証） ==========

nurseries.put('/api/nurseries/:id', async (c) => {
  try {
    const body = await c.req.json();
    const updated = await updateNursery(c.env.DB, c.req.param('id'), body);
    if (!updated) return c.json({ success: false, error: 'Nursery not found' }, 404);
    return c.json({ success: true, data: { id: updated.id, name: updated.name } });
  } catch (err) {
    console.error('PUT /api/nurseries/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 園削除（論理削除、管理: API_KEY認証） ==========

nurseries.delete('/api/nurseries/:id', async (c) => {
  try {
    await deactivateNursery(c.env.DB, c.req.param('id'));
    return c.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/nurseries/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 園写真アップロード（R2、管理: API_KEY認証） ==========

nurseries.post('/api/nurseries/:id/photos', async (c) => {
  try {
    const nurseryId = c.req.param('id');
    const nursery = await getNurseryById(c.env.DB, nurseryId);
    if (!nursery) return c.json({ success: false, error: 'Nursery not found' }, 404);

    const contentType = c.req.header('Content-Type') || '';
    const r2 = (c.env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
    if (!r2) {
      return c.json({ success: false, error: 'R2 not configured' }, 503);
    }

    let r2Key: string;

    if (contentType.includes('application/json')) {
      // Base64 JSON upload
      const body = await c.req.json<{ image: string; fileName?: string; contentType?: string }>();
      if (!body.image) return c.json({ success: false, error: 'image is required' }, 400);

      const base64Data = body.image.replace(/^data:[^;]+;base64,/, '');
      const fileMime = body.contentType || 'image/jpeg';
      const ext = fileMime.includes('png') ? 'png' : fileMime.includes('webp') ? 'webp' : 'jpg';
      r2Key = `nurseries/${nurseryId}/${Date.now()}.${ext}`;

      const binaryData = Uint8Array.from(atob(base64Data), (ch) => ch.charCodeAt(0));
      await r2.put(r2Key, binaryData, { httpMetadata: { contentType: fileMime } });
    } else {
      // Multipart upload
      const formData = await c.req.formData();
      const file = formData.get('file') as File;
      if (!file) return c.json({ success: false, error: 'file is required' }, 400);

      const fileMime = file.type || 'image/jpeg';
      const ext = fileMime.includes('png') ? 'png' : fileMime.includes('webp') ? 'webp' : 'jpg';
      r2Key = `nurseries/${nurseryId}/${Date.now()}.${ext}`;

      await r2.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType: fileMime } });
    }

    // photo_r2_keys に追加
    const existingKeys: string[] = JSON.parse(nursery.photo_r2_keys || '[]');
    existingKeys.push(r2Key);
    await updateNursery(c.env.DB, nurseryId, { photoR2Keys: existingKeys });

    return c.json({ success: true, data: { r2Key } }, 201);
  } catch (err) {
    console.error('POST /api/nurseries/:id/photos error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 園写真取得（R2から直接配信） ==========

nurseries.get('/api/nurseries/:id/photo/:fileName', async (c) => {
  try {
    const nurseryId = c.req.param('id');
    const fileName = decodeURIComponent(c.req.param('fileName'));
    const r2 = (c.env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
    if (!r2) return c.json({ success: false, error: 'R2 not configured' }, 503);

    // nursery のR2キーから該当ファイルを検索
    const nursery = await getNurseryById(c.env.DB, nurseryId);
    if (!nursery) return c.json({ success: false, error: 'Not found' }, 404);

    const keys: string[] = JSON.parse(nursery.photo_r2_keys || '[]');
    const matchKey = keys.find(k => k.endsWith(fileName)) || `nurseries/${nurseryId}/${fileName}`;

    const obj = await r2.get(matchKey);
    if (!obj) return c.json({ success: false, error: 'Photo not found' }, 404);

    const headers = new Headers();
    headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=86400');
    return new Response(obj.body, { headers });
  } catch (err) {
    console.error('GET /api/nurseries/:id/photo error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 園担当者一覧（管理: API_KEY認証） ==========

nurseries.get('/api/nurseries/:id/contacts', async (c) => {
  try {
    const contacts = await getNurseryContacts(c.env.DB, c.req.param('id'));
    return c.json({
      success: true,
      data: contacts.map((ct) => ({
        id: ct.id,
        nurseryId: ct.nursery_id,
        friendId: ct.friend_id,
        lineUserId: ct.line_user_id,
        displayName: ct.display_name,
        role: ct.role,
        createdAt: ct.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/nurseries/:id/contacts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 園担当者追加（管理: API_KEY認証） ==========

nurseries.post('/api/nurseries/:id/contacts', async (c) => {
  try {
    const nurseryId = c.req.param('id');
    const nursery = await getNurseryById(c.env.DB, nurseryId);
    if (!nursery) return c.json({ success: false, error: 'Nursery not found' }, 404);

    const body = await c.req.json<{ friendId: string; role?: string }>();
    if (!body.friendId) return c.json({ success: false, error: 'friendId is required' }, 400);

    const contact = await addNurseryContact(c.env.DB, nurseryId, body.friendId, body.role);
    return c.json({ success: true, data: contact }, 201);
  } catch (err) {
    console.error('POST /api/nurseries/:id/contacts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 園担当者削除（管理: API_KEY認証） ==========

nurseries.delete('/api/nurseries/:id/contacts/:friendId', async (c) => {
  try {
    await removeNurseryContact(c.env.DB, c.req.param('id'), c.req.param('friendId'));
    return c.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/nurseries/:id/contacts error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { nurseries };
