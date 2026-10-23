import { createHmac, timingSafeEqual } from 'crypto';
/** Time-limited HMAC signature for private files. Pure; secret passed in. */
export function signFile(secret: string, key: string, expiresAtMs: number): string {
  return createHmac('sha256', secret).update(`${key}.${expiresAtMs}`).digest('base64url');
}
export function verifyFile(secret: string, key: string, expiresAtMs: number, sig: string): boolean {
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return false;
  const a = Buffer.from(signFile(secret, key, expiresAtMs));
  const b = Buffer.from(sig || '');
  return a.length === b.length && timingSafeEqual(a, b);
}
