import { Hono } from 'hono';
import { getAdminByEmail, getAdminCount, createAdmin, verifyPassword } from '@line-crm/db';
import { signJwt } from '../middleware/jwt.js';
import type { Env } from '../index.js';

const adminAuth = new Hono<Env>();

// ログイン試行回数制限（IPベース、メモリキャッシュ）
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15分

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function clearRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

// キャッシュ掃除（500エントリ超で古いものを削除）
function pruneCache(): void {
  if (loginAttempts.size > 500) {
    const now = Date.now();
    for (const [key, val] of loginAttempts) {
      if (val.resetAt < now) loginAttempts.delete(key);
    }
  }
}

function getJwtSecret(env: Env['Bindings']): string {
  return env.JWT_SECRET || env.API_KEY;
}

/**
 * 管理者ログイン — email/password → JWT発行
 */
adminAuth.post('/auth/login', async (c) => {
  try {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    pruneCache();

    if (!checkRateLimit(ip)) {
      return c.json({ success: false, error: 'ログイン試行回数が上限に達しました。15分後に再試行してください' }, 429);
    }

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

    // ログイン成功 → レート制限リセット
    clearRateLimit(ip);

    const token = await signJwt(
      { sub: admin.id, email: admin.email },
      getJwtSecret(c.env),
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
      getJwtSecret(c.env),
    );

    return c.json({ success: true, token, admin: { id: admin.id, email: admin.email } }, 201);
  } catch (err) {
    console.error('POST /auth/setup error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { adminAuth };
