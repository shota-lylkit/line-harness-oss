import { jstNow } from './utils.js';

export interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

/**
 * PBKDF2-SHA256でパスワードをハッシュ化
 * 形式: "salt_hex:hash_hex"
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

/**
 * パスワードを検証
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, storedHashHex] = stored.split(':');
  if (!saltHex || !storedHashHex) return false;

  const encoder = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === storedHashHex;
}

// --- Admin CRUD ---

export async function getAdminByEmail(db: D1Database, email: string): Promise<AdminUser | null> {
  return db.prepare('SELECT * FROM admin_users WHERE email = ?').bind(email).first<AdminUser>();
}

export async function getAdminCount(db: D1Database): Promise<number> {
  const result = await db.prepare('SELECT COUNT(*) as count FROM admin_users').first<{ count: number }>();
  return result?.count ?? 0;
}

export async function createAdmin(db: D1Database, email: string, password: string): Promise<AdminUser> {
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = jstNow();
  await db.prepare(
    'INSERT INTO admin_users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).bind(id, email, passwordHash, now).run();
  return { id, email, password_hash: passwordHash, created_at: now };
}
