import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { environments, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schema
const updateEnvironmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  is_production: z.boolean().optional(),
  requires_approval: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  approvers: z.array(z.string().uuid()).optional(),
  env_vars: z.record(z.string()).optional(),
  auto_promote_from: z.string().uuid().nullable().optional(),
  is_locked: z.boolean().optional(),
  locked_reason: z.string().max(500).optional(),
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

// GET /api/v1/environments/:envId - Get environment details
export async function GET(
  req: NextRequest,
  { params }: { params: { envId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const environment = await db.query.environments.findFirst({
      where: eq(environments.id, params.envId),
      with: {
        project: true,
        activeDeployment: {
          with: {
            service: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!environment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Environment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, environment.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
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
        active_deployment: environment.activeDeployment ? {
          id: environment.activeDeployment.id,
          status: environment.activeDeployment.status,
          git_commit_sha: environment.activeDeployment.gitCommitSha,
          git_commit_message: environment.activeDeployment.gitCommitMessage,
          service: environment.activeDeployment.service ? {
            id: environment.activeDeployment.service.id,
            name: environment.activeDeployment.service.name,
          } : null,
          created_at: environment.activeDeployment.createdAt?.toISOString(),
        } : null,
        is_locked: environment.isLocked,
        locked_by: environment.lockedBy,
        locked_at: environment.lockedAt?.toISOString(),
        locked_reason: environment.lockedReason,
        created_at: environment.createdAt?.toISOString(),
        updated_at: environment.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/environments/:envId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/environments/:envId - Update environment
export async function PATCH(
  req: NextRequest,
  { params }: { params: { envId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = updateEnvironmentSchema.safeParse(body);

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

    const environment = await db.query.environments.findFirst({
      where: eq(environments.id, params.envId),
      with: {
        project: true,
      },
    });

    if (!environment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Environment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (need owner or admin to update)
    const access = await checkOrgAccess(session.user.id, environment.project.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const { name, description, is_production, requires_approval, sort_order, approvers, env_vars, auto_promote_from, is_locked, locked_reason } = parsed.data;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (is_production !== undefined) updateData.isProduction = is_production;
    if (requires_approval !== undefined) updateData.requiresApproval = requires_approval;
    if (sort_order !== undefined) updateData.sortOrder = sort_order;
    if (approvers !== undefined) updateData.approvers = approvers;
    if (env_vars !== undefined) updateData.envVars = env_vars;
    if (auto_promote_from !== undefined) updateData.autoPromoteFrom = auto_promote_from;
    if (is_locked !== undefined) {
      updateData.isLocked = is_locked;
      if (is_locked) {
        updateData.lockedBy = session.user.id;
        updateData.lockedAt = new Date();
        updateData.lockedReason = locked_reason || null;
      } else {
        updateData.lockedBy = null;
        updateData.lockedAt = null;
        updateData.lockedReason = null;
      }
    }

    const [updated] = await db
      .update(environments)
      .set(updateData)
      .where(eq(environments.id, params.envId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        project_id: updated.projectId,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        is_production: updated.isProduction,
        sort_order: updated.sortOrder,
        requires_approval: updated.requiresApproval,
        approvers: updated.approvers,
        auto_promote_from: updated.autoPromoteFrom,
        env_vars: updated.envVars,
        active_deployment_id: updated.activeDeploymentId,
        is_locked: updated.isLocked,
        locked_by: updated.lockedBy,
        locked_at: updated.lockedAt?.toISOString(),
        locked_reason: updated.lockedReason,
        created_at: updated.createdAt?.toISOString(),
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/environments/:envId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/environments/:envId - Delete environment
export async function DELETE(
  req: NextRequest,
  { params }: { params: { envId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const environment = await db.query.environments.findFirst({
      where: eq(environments.id, params.envId),
      with: {
        project: true,
      },
    });

    if (!environment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Environment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (need owner or admin to delete)
    const access = await checkOrgAccess(session.user.id, environment.project.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Cannot delete production environment
    if (environment.isProduction) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: 'Cannot delete production environment', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Cannot delete if there's an active deployment
    if (environment.activeDeploymentId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: 'Cannot delete environment with active deployment', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    await db.delete(environments).where(eq(environments.id, params.envId));

    return NextResponse.json({
      success: true,
      data: { id: params.envId },
    });
  } catch (error) {
    console.error('DELETE /api/v1/environments/:envId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
