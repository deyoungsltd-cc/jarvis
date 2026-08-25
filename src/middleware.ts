import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Page routes that don't require authentication
const publicPages = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let ALL API routes through — they handle their own auth with requireAuth()/requireAdmin()
  // and return proper JSON errors (401/403) instead of HTML redirects
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Allow static files, _next, favicon, etc.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Allow public pages
  if (publicPages.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Protected pages: check for session token
  const sessionToken = request.cookies.get('next-auth.session-token')?.value ||
    request.cookies.get('__Secure-next-auth.session-token')?.value;

  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
