import type { Context, Next } from 'hono';
import type { Env } from '../index.js';
import { verifyJwt } from './jwt.js';

export async function authMiddleware(c: Context<Env>, next: Next): Promise<Response | void> {
  // Skip auth for public endpoints
  const path = new URL(c.req.url).pathname;
  if (
    path === '/webhook' ||
    path === '/docs' ||
    path === '/openapi.json' ||
    path.startsWith('/r/') ||
    path.startsWith('/api/liff/') ||
    path.startsWith('/auth/') ||
    path.match(/^\/api\/forms\/[^/]+\/submit$/) ||
    path.match(/^\/api\/forms\/[^/]+$/) || // GET form definition (public for LIFF)
    (path === '/api/jobs' && c.req.method === 'GET') ||
    (path.match(/^\/api\/jobs\/[^/]+$/) && c.req.method === 'GET') ||
    // Nurseries (LIFF public — read only)
    (path === '/api/nurseries' && c.req.method === 'GET') ||
    (path.match(/^\/api\/nurseries\/[^/]+$/) && c.req.method === 'GET') ||
    (path.match(/^\/api\/nurseries\/[^/]+\/photo\//) && c.req.method === 'GET') ||
    (path.match(/^\/api\/jobs\/[^/]+\/book$/) && c.req.method === 'POST') ||
    // Profile & Documents (LIFF public)
    path.match(/^\/api\/profiles(\/[^/]+)?$/) ||
    (path === '/api/documents/upload' && c.req.method === 'POST') ||
    (path.match(/^\/api\/documents\/[^/]+$/) && !path.includes('/file/') && c.req.method === 'GET') ||
    path.match(/^\/api\/favorites(\/[^/]+)?(\/[^/]+)?$/) ||
    (path.match(/^\/api\/liff\/mypage\/[^/]+$/) && c.req.method === 'GET') ||
    // Attendance (LIFF public)
    (path === '/api/attendance/checkin' && c.req.method === 'POST') ||
    (path === '/api/attendance/checkout' && c.req.method === 'POST') ||
    (path === '/api/attendance/status' && c.req.method === 'GET') ||
    // Reviews & Credit Score (LIFF public)
    (path === '/api/reviews' && c.req.method === 'POST') ||
    (path === '/api/reviews/check' && c.req.method === 'GET') ||
    path.match(/^\/api\/reviews\/stats\/[^/]+$/) ||
    path.match(/^\/api\/reviews\/target\/[^/]+$/) ||
    path.match(/^\/api\/credit-score\/[^/]+$/)
  ) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice('Bearer '.length);

  // 1. JWT検証を優先
  const jwtPayload = await verifyJwt(token, c.env.API_KEY);
  if (jwtPayload) {
    c.set('adminId' as never, jwtPayload.sub as never);
    c.set('adminEmail' as never, jwtPayload.email as never);
    return next();
  }

  // 2. フォールバック: API_KEY直接照合（移行期間中の互換性維持）
  if (token === c.env.API_KEY) {
    c.set('adminId' as never, 'api-key' as never);
    c.set('adminEmail' as never, 'api-key-auth' as never);
    return next();
  }

  return c.json({ success: false, error: 'Unauthorized' }, 401);
}
