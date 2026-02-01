import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import { users, accounts, sessions, verificationTokens } from '@/lib/db/schema';

const githubId = process.env.GITHUB_CLIENT_ID;
const githubSecret = process.env.GITHUB_CLIENT_SECRET;

if (!githubId || !githubSecret) {
  console.error('Missing GitHub OAuth credentials:');
  console.error('GITHUB_CLIENT_ID:', githubId ? 'SET' : 'MISSING');
  console.error('GITHUB_CLIENT_SECRET:', githubSecret ? 'SET' : 'MISSING');
}

export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    GitHub({
      clientId: githubId || '',
      clientSecret: githubSecret || '',
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  trustHost: true,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // If url is relative, make it absolute using the provided baseUrl
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`;
      }

      // If url is on the same origin, allow it
      try {
        const urlObj = new URL(url);
        const baseUrlObj = new URL(baseUrl);
        if (urlObj.origin === baseUrlObj.origin) {
          return url;
        }
      } catch {
        // Invalid URL, fall through to default
      }

      // Default to base URL
      return baseUrl;
    },
    async authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnAuth = nextUrl.pathname.startsWith('/login');
      const isPublicPath = nextUrl.pathname === '/' || isOnAuth;

      if (isOnAuth) {
        if (isLoggedIn) {
          const dashboardUrl = nextUrl.clone();
          dashboardUrl.pathname = '/dashboard';
          return Response.redirect(dashboardUrl);
        }
        return true;
      }

      if (!isPublicPath && !isLoggedIn) {
        return false;
      }

      return true;
    },
  },
};
