import { NextRequest, NextResponse } from 'next/server';

// Accessible to all; authenticated users get redirected to dashboard
const PUBLIC_PAGES = new Set(['/', '/register']);

// Only for unauthenticated; authenticated users get redirected to dashboard
const AUTH_PAGES = new Set(['/login', '/forgot-password', '/reset-password']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has('refreshToken');

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
