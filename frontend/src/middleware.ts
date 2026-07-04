import { NextRequest, NextResponse } from 'next/server';

// The httpOnly auth cookies live on the Railway backend domain and are invisible
// here. Instead, the auth store sets a lightweight non-sensitive `logged_in=1`
// cookie on login (cleared on logout) that this middleware can read to redirect
// unauthenticated users before React hydrates — preventing a flash of the
// protected dashboard. Real auth enforcement stays on the backend API.
export function middleware(request: NextRequest) {
  const loggedIn = request.cookies.get('logged_in')?.value === '1';
  const { pathname } = request.nextUrl;

  if (!loggedIn) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard',
    '/pos/:path*',
    '/inventario/:path*',
    '/ventas/:path*',
    '/clientes/:path*',
    '/proveedores/:path*',
    '/compras/:path*',
    '/creditos/:path*',
    '/gastos/:path*',
    '/caja/:path*',
    '/reportes/:path*',
    '/configuracion/:path*',
    '/superadmin/:path*',
  ],
};