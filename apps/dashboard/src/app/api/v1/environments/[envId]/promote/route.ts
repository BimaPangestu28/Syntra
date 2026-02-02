import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { environments, promotions, deployments, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schema
const promoteDeploymentSchema = z.object({
  deployment_id: z.string().uuid(),
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

// POST /api/v1/environments/:envId/promote - Promote deployment to this environment
export async function POST(
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
    const parsed = promoteDeploymentSchema.safeParse(body);

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

    const { deployment_id } = parsed.data;

    // Get target environment
    const targetEnvironment = await db.query.environments.findFirst({
      where: eq(environments.id, params.envId),
      with: {
        project: true,
      },
    });

    if (!targetEnvironment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Environment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (need owner, admin, or developer to promote)
    const access = await checkOrgAccess(session.user.id, targetEnvironment.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Check if environment is locked
    if (targetEnvironment.isLocked) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: `Environment is locked: ${targetEnvironment.lockedReason || 'No reason provided'}`, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Get source deployment
    const sourceDeployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, deployment_id),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!sourceDeployment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Deployment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Verify deployment belongs to the same project
    if (sourceDeployment.service.projectId !== targetEnvironment.projectId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'Deployment does not belong to this project', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Verify deployment is successful
    if (sourceDeployment.status !== 'running' && sourceDeployment.status !== 'stopped') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: 'Can only promote successful deployments', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Find source environment (the environment this deployment was deployed to)
    const sourceEnvironment = await db.query.environments.findFirst({
      where: and(
        eq(environments.projectId, targetEnvironment.projectId),
        eq(environments.activeDeploymentId, deployment_id)
      ),
    });

    if (!sourceEnvironment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Source environment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check if approval is required
    if (targetEnvironment.requiresApproval) {
      // Create pending promotion record
      const [promotion] = await db
        .insert(promotions)
        .values({
          projectId: targetEnvironment.projectId,
          fromEnvironmentId: sourceEnvironment.id,
          toEnvironmentId: targetEnvironment.id,
          deploymentId: deployment_id,
          status: 'pending',
          requestedBy: session.user.id,
          metadata: {
            source_environment_name: sourceEnvironment.name,
            target_environment_name: targetEnvironment.name,
            service_id: sourceDeployment.serviceId,
            service_name: sourceDeployment.service.name,
          },
        })
        .returning();

      return NextResponse.json(
        {
          success: true,
          data: {
            id: promotion.id,
            status: 'pending',
            message: 'Promotion request created. Waiting for approval.',
            from_environment_id: promotion.fromEnvironmentId,
            to_environment_id: promotion.toEnvironmentId,
            deployment_id: promotion.deploymentId,
            requested_by: promotion.requestedBy,
            created_at: promotion.createdAt?.toISOString(),
          },
        },
        { status: 201 }
      );
    }

    // No approval needed, create new deployment immediately
    const [newDeployment] = await db
      .insert(deployments)
      .values({
        serviceId: sourceDeployment.serviceId,
        serverId: sourceDeployment.serverId,
        status: 'pending',
        gitCommitSha: sourceDeployment.gitCommitSha,
        gitCommitMessage: sourceDeployment.gitCommitMessage,
        gitCommitAuthor: sourceDeployment.gitCommitAuthor,
        gitBranch: sourceDeployment.gitBranch,
        dockerImageTag: sourceDeployment.dockerImageTag,
        triggeredBy: session.user.id,
        triggerType: 'promotion',
        metadata: {
          promoted_from_deployment_id: deployment_id,
          promoted_from_environment_id: sourceEnvironment.id,
          promoted_to_environment_id: targetEnvironment.id,
        },
      })
      .returning();

    // Update target environment's active deployment
    await db
      .update(environments)
      .set({
        activeDeploymentId: newDeployment.id,
        updatedAt: new Date(),
      })
      .where(eq(environments.id, targetEnvironment.id));

    // Create promotion record with deployed status
    const [promotion] = await db
      .insert(promotions)
      .values({
        projectId: targetEnvironment.projectId,
        fromEnvironmentId: sourceEnvironment.id,
        toEnvironmentId: targetEnvironment.id,
        deploymentId: deployment_id,
        status: 'deployed',
        requestedBy: session.user.id,
        deployedAt: new Date(),
        metadata: {
          new_deployment_id: newDeployment.id,
          source_environment_name: sourceEnvironment.name,
          target_environment_name: targetEnvironment.name,
          service_id: sourceDeployment.serviceId,
          service_name: sourceDeployment.service.name,
        },
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: promotion.id,
          status: 'deployed',
          message: 'Deployment promoted successfully',
          from_environment_id: promotion.fromEnvironmentId,
          to_environment_id: promotion.toEnvironmentId,
          deployment_id: promotion.deploymentId,
          new_deployment_id: newDeployment.id,
          requested_by: promotion.requestedBy,
          deployed_at: promotion.deployedAt?.toISOString(),
          created_at: promotion.createdAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/environments/:envId/promote error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
