import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifyAdminToken } from '@/lib/session';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const valid = await verifyAdminToken(req.cookies.get(COOKIE_NAME)?.value);

  if (pathname === '/login') {
    if (valid) return NextResponse.redirect(new URL('/dashboard', req.url));
    return NextResponse.next();
  }

  if (!valid) {
    const res = NextResponse.redirect(new URL('/login', req.url));
    if (req.cookies.has(COOKIE_NAME)) res.cookies.delete(COOKIE_NAME);
    return res;
  }
  return NextResponse.next();
}

// Everything except Next internals, static files and the auth API routes (which check on their own).
export const config = {
  matcher: ['/((?!api/|_next/|favicon.ico|.*\\..*).*)'],
};
