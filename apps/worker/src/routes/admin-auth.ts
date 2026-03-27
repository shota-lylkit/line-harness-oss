import { Hono } from 'hono';
import { getAdminByEmail, getAdminCount, createAdmin, verifyPassword } from '@line-crm/db';
import { signJwt } from '../middleware/jwt.js';
import type { Env } from '../index.js';

const adminAuth = new Hono<Env>();

/**
 * 管理者ログイン — email/password → JWT発行
 */
adminAuth.post('/auth/login', async (c) => {
  try {
    const body = await c.req.json<{ email: string; password: string }>();
    if (!body.email || !body.password) {
      return c.json({ success: false, error: 'Email and password are required' }, 400);
    }

    const admin = await getAdminByEmail(c.env.DB, body.email);
    if (!admin) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    const valid = await verifyPassword(body.password, admin.password_hash);
    if (!valid) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    const token = await signJwt(
      { sub: admin.id, email: admin.email },
      c.env.API_KEY, // API_KEYをJWT署名鍵として再利用
    );

    return c.json({ success: true, token, admin: { id: admin.id, email: admin.email } });
  } catch (err) {
    console.error('POST /auth/login error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * 初回セットアップ — admin_usersが空の場合のみ管理者を作成
 */
adminAuth.post('/auth/setup', async (c) => {
  try {
    const count = await getAdminCount(c.env.DB);
    if (count > 0) {
      return c.json({ success: false, error: 'Admin already exists. Use /auth/login' }, 403);
    }

    const body = await c.req.json<{ email: string; password: string }>();
    if (!body.email || !body.password) {
      return c.json({ success: false, error: 'Email and password are required' }, 400);
    }
    if (body.password.length < 8) {
      return c.json({ success: false, error: 'Password must be at least 8 characters' }, 400);
    }

    const admin = await createAdmin(c.env.DB, body.email, body.password);
    const token = await signJwt(
      { sub: admin.id, email: admin.email },
      c.env.API_KEY,
    );

    return c.json({ success: true, token, admin: { id: admin.id, email: admin.email } }, 201);
  } catch (err) {
    console.error('POST /auth/setup error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { adminAuth };
