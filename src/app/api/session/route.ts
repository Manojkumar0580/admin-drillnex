import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ success: false }, { status: 401 });

  try {
    const upstream = await fetch(`${API}/admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return NextResponse.json({ success: false }, { status: 401 });
    return NextResponse.json({ success: true, user: data.user });
  } catch {
    return NextResponse.json({ success: false }, { status: 502 });
  }
}
