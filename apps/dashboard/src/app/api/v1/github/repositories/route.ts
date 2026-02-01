import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  updated_at: string;
  pushed_at: string;
}

// GET /api/v1/github/repositories - List user's GitHub repositories
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    // Get GitHub account with access token
    const githubAccount = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.userId, session.user.id),
        eq(accounts.provider, 'github')
      ),
    });

    if (!githubAccount?.access_token) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_GITHUB_CONNECTION', message: 'No GitHub account connected', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '30', 10), 100);
    const sort = searchParams.get('sort') || 'pushed'; // pushed, updated, full_name
    const direction = searchParams.get('direction') || 'desc';

    // Fetch repositories from GitHub API
    const response = await fetch(
      `https://api.github.com/user/repos?page=${page}&per_page=${perPage}&sort=${sort}&direction=${direction}`,
      {
        headers: {
          Authorization: `Bearer ${githubAccount.access_token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub API error:', response.status, errorText);

      if (response.status === 401) {
        return NextResponse.json(
          { success: false, error: { code: 'GITHUB_TOKEN_EXPIRED', message: 'GitHub token expired. Please re-login.', request_id: crypto.randomUUID() } },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { success: false, error: { code: 'GITHUB_API_ERROR', message: 'Failed to fetch repositories from GitHub', request_id: crypto.randomUUID() } },
        { status: 500 }
      );
    }

    const repos: GitHubRepo[] = await response.json();

    // Get pagination info from headers
    const linkHeader = response.headers.get('Link');
    const hasNextPage = linkHeader?.includes('rel="next"') || false;
    const hasPrevPage = linkHeader?.includes('rel="prev"') || false;

    return NextResponse.json({
      success: true,
      data: repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        url: repo.html_url,
        description: repo.description,
        default_branch: repo.default_branch,
        language: repo.language,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
      })),
      pagination: {
        page,
        per_page: perPage,
        has_next_page: hasNextPage,
        has_prev_page: hasPrevPage,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/github/repositories error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
