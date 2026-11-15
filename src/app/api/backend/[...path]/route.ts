import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// The admin token is in an httpOnly cookie, so browser code calls the API through this proxy,
// which adds the Authorization header. Only /admin/* endpoints can be reached, and path segments
// are strictly validated so the proxy cannot be steered to another route.
async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) {
    return NextResponse.json({ success: false, message: 'Bad path' }, { status: 400 });
  }

  // Defence in depth on top of the SameSite=Strict cookie: state-changing calls must come from this site.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin');
    if (origin && origin !== req.nextUrl.origin) {
      return NextResponse.json({ success: false, message: 'Cross-origin request refused' }, { status: 403 });
    }
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ success: false, message: 'Not signed in' }, { status: 401 });

  const url = `${API}/admin/${path.join('/')}${req.nextUrl.search}`;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        // Let the API's audit log record the real browser, not just this proxy.
        ...(req.headers.get('x-forwarded-for') ? { 'X-Forwarded-For': req.headers.get('x-forwarded-for')! } : {}),
        ...(req.headers.get('user-agent') ? { 'User-Agent': req.headers.get('user-agent')! } : {}),
      },
      body: hasBody ? await req.text() : undefined,
      cache: 'no-store',
    });
    // Stream the body through instead of buffering it: a CSV export can be tens of megabytes.
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        // CSV exports arrive as a file download.
        ...(upstream.headers.get('content-disposition') ? { 'Content-Disposition': upstream.headers.get('content-disposition')! } : {}),
      },
    });
  } catch {
    return NextResponse.json({ success: false, message: 'Cannot reach the API server' }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
