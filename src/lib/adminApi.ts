export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Calls the backend's /api/admin/* through the panel's own proxy (/api/backend/*), which adds the
 * admin token from the httpOnly cookie. Errors carry the server's message, including field
 * validation details, so forms can show something useful.
 */
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/backend/${path}`, { cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && typeof window !== 'undefined') {
    // Session expired or token invalid: back to the login page.
    window.location.href = '/login';
    throw new ApiError('Session expired', 401);
  }
  if (!res.ok) {
    const details = Array.isArray(data.errors)
      ? ': ' + data.errors.map((e: { field?: string; message: string }) => (e.field ? `${e.field} ${e.message}` : e.message)).join('; ')
      : '';
    throw new ApiError((data.message || `Request failed (${res.status})`) + details, res.status);
  }
  return data as T;
}

export const send = (method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

// ---- shapes returned by the backend

export interface Company {
  id: string; name: string; country: string; isActive: boolean;
  slug?: string; industry?: string; subscriptionPlan?: 'free' | 'starter' | 'pro' | 'enterprise';
  subscriptionExpiresAt?: string | null; userCount?: number; wellCount?: number; createdAt?: string;
}
export interface WellLite { id: string; name: string; wellNumber: string; companyId: string }

export interface WellFull extends WellLite {
  padId?: string | null;
  status: 'planning' | 'drilling' | 'completed' | 'suspended' | 'abandoned';
  type: 'vertical' | 'directional' | 'horizontal' | 'lateral';
  field: string; basin: string; country: string; lat: number | null; lng: number | null;
  targetDepth: number; currentDepth: number; spudDate: string | null; operator: string; contractor: string; createdAt?: string;
}

export interface UserRow {
  id: string; companyId: string; name: string; email: string;
  role: 'operator' | 'engineer' | 'manager' | 'viewer'; isActive: boolean; lastLogin: string | null; createdAt?: string;
}

/**
 * A random password that meets the server's rules (8+ chars, an uppercase letter and a digit).
 * Uses crypto.getRandomValues and skips look-alike characters (0/O, 1/l/I) so it can be read out
 * or typed without mistakes.
 */
export function generatePassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lower = 'abcdefghijkmnpqrstuvwxyz', digits = '23456789';
  const all = upper + lower + digits;
  const rnd = (n: number) => {
    // rejection sampling: no modulo bias
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  };
  const pick = (set: string) => set[rnd(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

export interface AuditEntry {
  id: string; time: string; actor: { id?: string; email?: string; name?: string };
  action: string; targetType: string; targetId: string | null; targetLabel: string | null;
  companyId: string | null; summary: string; meta: Record<string, unknown> | null; ip: string | null; result: 'success' | 'failure';
}

export interface ChannelInfo { key: string; label: string; unit: string }

export interface ImportPreview {
  well: { id: string; name: string };
  rows: number; usable: number;
  rejected: { noTime: number; future: number; tooOld: number };
  duplicates: number; from: number | null; to: number | null;
  mapped: { header: string; channel: string; unit: string; autoDetected: boolean }[];
  unmapped: string[]; problems: string[];
  quality: Record<string, { suspect: number; missing: number }>;
  existingInRange: number; retentionDays: number; warnings: string[];
  sample: { t: number; values: Record<string, number> }[];
}

export interface RigRow {
  id: string; companyId: string; name: string; rigNumber: string;
  type: 'land' | 'jackup' | 'semisubmersible' | 'drillship'; status: 'active' | 'idle' | 'maintenance' | 'stacked'; contractor: string;
  currentWellId: string | null; currentWell: { id: string; name: string; wellNumber: string } | null;
  maxDepth: number | null; horsepower: number | null; hookload: number | null;
  protocol: 'WITSML' | 'WITS_L0' | 'OPC_UA' | 'manual' | null; isConnected: boolean; lastDataAt: string | null;
}

export interface ChannelDef { key: string; label: string; unit: string; min: number; max: number; aliases: string[] }
export interface CustomAlias { id: string; mnemonic: string; channel: string; unit: string | null; createdAt: string }

export interface PadRow {
  id: string; companyId: string; name: string; notes: string;
  wells: { id: string; name: string; wellNumber: string }[]; wellCount: number;
}

export interface Connection {
  id: string; companyId: string; name: string; url: string; loginName: string;
  isActive: boolean; status: 'unknown' | 'ok' | 'auth_failed' | 'error'; lastError?: string; lastTestAt?: string;
}

export interface LogMapRow {
  id: string; companyId: string; connectionId: string; wellId: string;
  uidWell: string; uidWellbore: string; uidLog: string;
  dataState: 'ON' | 'OFF'; intervalSec: number; backfillMinutes: number;
  status: 'idle' | 'ok' | 'error' | 'blocked'; lastError?: string;
  lastIndexAt?: string; lastRunAt?: string; lastSuccessAt?: string; lastRowCount?: number; totalRows: number; failures: number;
}

export function timeAgo(iso?: string, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
