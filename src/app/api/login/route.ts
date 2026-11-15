import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifyAdminToken } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 });
  }
  if (!body.email || !body.password) {
    return NextResponse.json({ success: false, message: 'Email and password are required' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API}/admin/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.get('x-forwarded-for') ? { 'X-Forwarded-For': req.headers.get('x-forwarded-for')! } : {}),
        ...(req.headers.get('user-agent') ? { 'User-Agent': req.headers.get('user-agent')! } : {}),
      },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ success: false, message: 'Cannot reach the API server' }, { status: 502 });
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !data.token) {
    const message = upstream.status === 429 ? 'Too many attempts, try again later' : data.message || 'Login failed';
    return NextResponse.json({ success: false, message }, { status: upstream.status === 429 ? 429 : 401 });
  }

  // Refuse a token this panel could not verify (secret mismatch would otherwise cause a redirect loop).
  const payload = await verifyAdminToken(data.token);
  if (!payload) {
    return NextResponse.json(
      { success: false, message: 'Server misconfigured: ADMIN_SECRET does not match the API' },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ success: true, user: data.user });
  res.cookies.set(COOKIE_NAME, data.token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.max(0, payload.exp - Math.floor(Date.now() / 1000)),
  });
  return res;
}
