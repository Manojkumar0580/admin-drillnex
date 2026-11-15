// Works in both the Edge runtime (middleware) and Node (route handlers): Web Crypto only.
export const COOKIE_NAME = 'rp_admin_token';

function b64urlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface AdminTokenPayload {
  id: string;
  scope: string;
  exp: number;
  iat: number;
}

/** Verifies an HS256 JWT signed with ADMIN_SECRET. Returns the payload, or null if invalid/expired. */
export async function verifyAdminToken(token: string | undefined): Promise<AdminTokenPayload | null> {
  const secret = process.env.ADMIN_SECRET;
  if (!token || !secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    if (header.alg !== 'HS256') return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p))) as AdminTokenPayload;
    if (payload.scope !== 'admin') return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
