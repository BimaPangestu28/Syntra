import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { environments, organizationMembers, projects } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schema
const createEnvironmentSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  is_production: z.boolean().default(false),
  requires_approval: z.boolean().default(false),
  sort_order: z.number().int().default(0),
  approvers: z.array(z.string().uuid()).optional(),
  env_vars: z.record(z.string()).optional(),
});

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

// GET /api/v1/environments - List environments for a project
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
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'project_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Get project and verify org access
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Project not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Fetch environments with active deployment info
    const envList = await db.query.environments.findMany({
      where: eq(environments.projectId, projectId),
      orderBy: [asc(environments.sortOrder), asc(environments.createdAt)],
      with: {
        activeDeployment: {
          columns: {
            id: true,
            status: true,
            gitCommitSha: true,
            gitCommitMessage: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: envList.map((env) => ({
        id: env.id,
        project_id: env.projectId,
        name: env.name,
        slug: env.slug,
        description: env.description,
        is_production: env.isProduction,
        sort_order: env.sortOrder,
        requires_approval: env.requiresApproval,
        approvers: env.approvers,
        auto_promote_from: env.autoPromoteFrom,
        env_vars: env.envVars,
        active_deployment_id: env.activeDeploymentId,
        active_deployment: env.activeDeployment ? {
          id: env.activeDeployment.id,
          status: env.activeDeployment.status,
          git_commit_sha: env.activeDeployment.gitCommitSha,
          git_commit_message: env.activeDeployment.gitCommitMessage,
          created_at: env.activeDeployment.createdAt?.toISOString(),
        } : null,
        is_locked: env.isLocked,
        locked_by: env.lockedBy,
        locked_at: env.lockedAt?.toISOString(),
        locked_reason: env.lockedReason,
        created_at: env.createdAt?.toISOString(),
        updated_at: env.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/environments error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/environments - Create a new environment
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
    const parsed = createEnvironmentSchema.safeParse(body);

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

    const { project_id, name, slug, description, is_production, requires_approval, sort_order, approvers, env_vars } = parsed.data;

    // Get project and verify org access
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, project_id),
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Project not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (need owner or admin to create environments)
    const access = await checkOrgAccess(session.user.id, project.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Generate unique slug
    const envSlug = slug || generateSlug(name);
    const existingEnv = await db.query.environments.findFirst({
      where: and(eq(environments.projectId, project_id), eq(environments.slug, envSlug)),
    });
    if (existingEnv) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Environment with this slug already exists', request_id: crypto.randomUUID() } },
        { status: 409 }
      );
    }

    const [environment] = await db
      .insert(environments)
      .values({
        projectId: project_id,
        name,
        slug: envSlug,
        description,
        isProduction: is_production,
        requiresApproval: requires_approval,
        sortOrder: sort_order,
        approvers: approvers || [],
        envVars: env_vars || {},
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: environment.id,
          project_id: environment.projectId,
          name: environment.name,
          slug: environment.slug,
          description: environment.description,
          is_production: environment.isProduction,
          sort_order: environment.sortOrder,
          requires_approval: environment.requiresApproval,
          approvers: environment.approvers,
          auto_promote_from: environment.autoPromoteFrom,
          env_vars: environment.envVars,
          active_deployment_id: environment.activeDeploymentId,
          is_locked: environment.isLocked,
          locked_by: environment.lockedBy,
          locked_at: environment.lockedAt?.toISOString(),
          locked_reason: environment.lockedReason,
          created_at: environment.createdAt?.toISOString(),
          updated_at: environment.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/environments error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
