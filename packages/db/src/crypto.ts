/**
 * AES-GCM encryption/decryption for sensitive data (bank account numbers etc.)
 * Uses Web Crypto API (available in Cloudflare Workers)
 *
 * Key is derived from a secret string via PBKDF2.
 * Format: base64(iv:ciphertext:tag) — all in one string for DB storage.
 */

const ALGO = 'AES-GCM';
const IV_LENGTH = 12;
const KEY_ITERATIONS = 10000;

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('spothoiku-pii-v1'), iterations: KEY_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptField(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const enc = new TextEncoder();
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    enc.encode(plaintext),
  );
  // iv + ciphertext を結合してbase64
  const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.length);
  return `enc:${btoa(String.fromCharCode(...combined))}`;
}

export async function decryptField(encrypted: string, secret: string): Promise<string> {
  if (!encrypted.startsWith('enc:')) return encrypted; // 非暗号化データはそのまま返す
  const key = await deriveKey(secret);
  const raw = Uint8Array.from(atob(encrypted.slice(4)), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, IV_LENGTH);
  const ciphertext = raw.slice(IV_LENGTH);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plainBuffer);
}
