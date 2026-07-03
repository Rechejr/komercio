import { NextRequest, NextResponse } from 'next/server';

// The refreshToken cookie is set by the Railway backend on its own domain.
// Cross-domain cookies are invisible to Next.js middleware running on Vercel,
// so server-side route protection here would always fail. Auth is enforced
// client-side in each layout (dashboard, superadmin, etc.) instead.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
