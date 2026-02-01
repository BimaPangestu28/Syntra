import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schemas
const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  git_repo_url: z.string().url().optional(),
  git_branch: z.string().default('main'),
  git_provider: z.enum(['github', 'gitlab', 'bitbucket']).optional(),
  build_command: z.string().optional(),
  install_command: z.string().optional(),
  output_directory: z.string().optional(),
  root_directory: z.string().default('/'),
  env_vars: z.record(z.string()).optional(),
});

// Helper to get user's organizations
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// Helper to check org access
async function checkOrgAccess(
  userId: string,
  orgId: string,
  allowedRoles: string[] = ['owner', 'admin', 'developer', 'viewer']
) {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });

  if (!membership) return null;
  if (!allowedRoles.includes(membership.role)) return null;
  return membership;
}

// Generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

// GET /api/v1/projects - List projects
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20', 10), 100);

    // If org_id specified, check access
    if (orgId) {
      const access = await checkOrgAccess(session.user.id, orgId);
      if (!access) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
          { status: 403 }
        );
      }
    }

    // Get user's organizations
    const orgIds = orgId ? [orgId] : await getUserOrgIds(session.user.id);

    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0, page, per_page: perPage },
      });
    }

    const projectList = await db.query.projects.findMany({
      where: inArray(projects.orgId, orgIds),
      orderBy: [desc(projects.createdAt)],
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        services: {
          columns: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: projectList.map((p) => ({
        id: p.id,
        org_id: p.orgId,
        name: p.name,
        slug: p.slug,
        description: p.description,
        git_repo_url: p.gitRepoUrl,
        git_branch: p.gitBranch,
        git_provider: p.gitProvider,
        services_count: p.services.length,
        created_at: p.createdAt?.toISOString(),
        updated_at: p.updatedAt?.toISOString(),
      })),
      meta: {
        total: projectList.length,
        page,
        per_page: perPage,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/projects error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/projects - Create project
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = createProjectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parsed.error.errors,
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    // Get org_id from query or use first organization
    const { searchParams } = new URL(req.url);
    let orgId = searchParams.get('org_id');

    if (!orgId) {
      const orgIds = await getUserOrgIds(session.user.id);
      if (orgIds.length === 0) {
        return NextResponse.json(
          { success: false, error: { code: 'NO_ORGANIZATION', message: 'No organization found', request_id: crypto.randomUUID() } },
          { status: 400 }
        );
      }
      orgId = orgIds[0];
    }

    // Verify org access (need admin or owner to create)
    const access = await checkOrgAccess(session.user.id, orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const { name, description, git_repo_url, git_branch, git_provider, build_command, install_command, output_directory, root_directory, env_vars } = parsed.data;

    // Generate unique slug
    let slug = generateSlug(name);
    const existingProject = await db.query.projects.findFirst({
      where: and(eq(projects.orgId, orgId), eq(projects.slug, slug)),
    });
    if (existingProject) {
      slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    const [project] = await db
      .insert(projects)
      .values({
        orgId,
        name,
        slug,
        description,
        gitRepoUrl: git_repo_url,
        gitBranch: git_branch,
        gitProvider: git_provider,
        buildCommand: build_command,
        installCommand: install_command,
        outputDirectory: output_directory,
        rootDirectory: root_directory,
        envVars: env_vars || {},
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: project.id,
          org_id: project.orgId,
          name: project.name,
          slug: project.slug,
          description: project.description,
          git_repo_url: project.gitRepoUrl,
          git_branch: project.gitBranch,
          git_provider: project.gitProvider,
          build_command: project.buildCommand,
          install_command: project.installCommand,
          output_directory: project.outputDirectory,
          root_directory: project.rootDirectory,
          created_at: project.createdAt?.toISOString(),
          updated_at: project.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/projects error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
