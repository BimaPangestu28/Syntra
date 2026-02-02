import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  return response;
}

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const pathname = req.nextUrl.pathname;

  // Public routes - no auth required
  const isLandingPage = pathname === '/';
  const isOnLoginPage = pathname === '/login';
  const isOnApiAuth = pathname.startsWith('/api/auth');
  const isPublicStatusPage = pathname.startsWith('/status');
  const isPublicStatusApi = pathname.startsWith('/api/v1/status');
  const isPublicPage = pathname.startsWith('/about') ||
    pathname.startsWith('/blog') ||
    pathname.startsWith('/contact') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/security') ||
    pathname.startsWith('/docs') ||
    pathname.startsWith('/changelog') ||
    pathname.startsWith('/careers');

  // Allow public routes
  if (isLandingPage || isOnApiAuth || isPublicStatusPage || isPublicStatusApi || isPublicPage) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Redirect logged in users from login page to dashboard
  if (isOnLoginPage && isLoggedIn) {
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    return addSecurityHeaders(NextResponse.redirect(dashboardUrl));
  }

  // Allow login page for non-logged in users
  if (isOnLoginPage) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Redirect non-logged in users to login page for protected routes
  if (!isLoggedIn) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    return addSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return addSecurityHeaders(NextResponse.next());
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
