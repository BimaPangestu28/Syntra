import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

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
    return NextResponse.next();
  }

  // Redirect logged in users from login page to dashboard
  if (isOnLoginPage && isLoggedIn) {
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashboardUrl);
  }

  // Allow login page for non-logged in users
  if (isOnLoginPage) {
    return NextResponse.next();
  }

  // Redirect non-logged in users to login page for protected routes
  if (!isLoggedIn) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
