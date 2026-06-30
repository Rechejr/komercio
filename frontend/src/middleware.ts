import { NextRequest, NextResponse } from 'next/server';

// Accessible to all; authenticated users get redirected to dashboard
const PUBLIC_PAGES = new Set(['/', '/register']);

// Only for unauthenticated; authenticated users get redirected to dashboard
const AUTH_PAGES = new Set(['/login', '/forgot-password', '/reset-password']);

// Always accessible, no matter the auth state — e.g. verify-email must work
// even if the user already logged in with an unverified account
const ALWAYS_OPEN_PAGES = new Set(['/verify-email']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has('refreshToken');

  if (ALWAYS_OPEN_PAGES.has(pathname)) {
    return NextResponse.next();
  }

  // Authenticated on public/auth pages → dashboard
  if (hasSession && (PUBLIC_PAGES.has(pathname) || AUTH_PAGES.has(pathname))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Public and auth pages → allow through
  if (PUBLIC_PAGES.has(pathname) || AUTH_PAGES.has(pathname)) {
    return NextResponse.next();
  }

  // Protected page without session → login
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/register',
    '/login',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/dashboard/:path*',
    '/superadmin/:path*',
    '/pos/:path*',
    '/ventas/:path*',
    '/inventario/:path*',
    '/compras/:path*',
    '/clientes/:path*',
    '/proveedores/:path*',
    '/gastos/:path*',
    '/creditos/:path*',
    '/caja/:path*',
    '/reportes/:path*',
    '/configuracion/:path*',
  ],
};
