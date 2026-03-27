import type { Context, Next } from 'hono';
import type { Env } from '../index.js';

/**
 * 監査ログミドルウェア — 管理者の書き込み操作を自動記録
 * POST/PUT/PATCH/DELETE のみ記録。GETは除外。
 */
export async function auditMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  await next();

  // 読み取りリクエストは記録しない
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  // 認証情報がない場合はスキップ（webhook等）
  const adminId = c.get('adminId' as never) as string | undefined;
  const adminEmail = c.get('adminEmail' as never) as string | undefined;
  if (!adminId && !adminEmail) return;

  const path = new URL(c.req.url).pathname;

  // パスからリソース情報を抽出 (/api/jobs/abc123 → type=jobs, id=abc123)
  const pathParts = path.split('/').filter(Boolean);
  const apiIdx = pathParts.indexOf('api');
  const resourceType = apiIdx >= 0 && pathParts[apiIdx + 1] ? pathParts[apiIdx + 1] : null;
  const resourceId = apiIdx >= 0 && pathParts[apiIdx + 2] ? pathParts[apiIdx + 2] : null;

  // waitUntil: レスポンスを遅延させずに非同期でDBに書き込む
  const ctx = (c as unknown as { executionCtx?: ExecutionContext }).executionCtx;
  if (ctx?.waitUntil) {
    ctx.waitUntil(writeAuditLog(c.env.DB, {
      adminId: adminId || null,
      adminEmail: adminEmail || null,
      action: `${method} ${path}`,
      resourceType,
      resourceId,
      method,
      path,
      ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null,
    }));
  }
}

async function writeAuditLog(
  db: D1Database,
  entry: {
    adminId: string | null;
    adminEmail: string | null;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    method: string;
    path: string;
    ip: string | null;
  },
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO audit_log (id, admin_id, admin_email, action, resource_type, resource_id, method, path, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      entry.adminId,
      entry.adminEmail,
      entry.action,
      entry.resourceType,
      entry.resourceId,
      entry.method,
      entry.path,
      entry.ip,
    ).run();
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}
