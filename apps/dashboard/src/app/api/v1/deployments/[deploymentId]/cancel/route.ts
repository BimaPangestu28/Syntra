import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deployments, services, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { agentHub } from '@/lib/agent/hub';

// Helper to check org access
async function checkOrgAccess(
  userId: string,
  orgId: string,
  allowedRoles: string[] = ['owner', 'admin', 'developer']
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

const CANCELLABLE_STATUSES = ['pending', 'building', 'deploying'] as const;

/**
 * POST /api/v1/deployments/:deploymentId/cancel - Cancel a deployment
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { deploymentId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    // Get deployment with service and project info
    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, params.deploymentId),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!deployment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Deployment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access with deploy permission
    const access = await checkOrgAccess(
      session.user.id,
      deployment.service.project.orgId,
      ['owner', 'admin', 'developer']
    );
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Check if deployment can be cancelled
    if (!CANCELLABLE_STATUSES.includes(deployment.status as any)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: `Cannot cancel deployment in '${deployment.status}' status. Only pending, building, or deploying deployments can be cancelled.`,
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    // Send cancel command to agent if server is connected
    if (deployment.serverId && agentHub.isAgentConnected(deployment.serverId)) {
      try {
        await agentHub.sendCommand(deployment.serverId, 'stop', {
          deployment_id: deployment.id,
        });
      } catch (agentError) {
        console.warn(
          `[CancelDeploy] Failed to send stop command to agent for deployment ${deployment.id}:`,
          agentError
        );
      }
    }

    // Update deployment status to cancelled
    const [updated] = await db
      .update(deployments)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, params.deploymentId))
      .returning();

    console.log(`[CancelDeploy] Deployment ${deployment.id} cancelled by ${session.user.id}`);

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        service_id: updated.serviceId,
        status: updated.status,
        previous_status: deployment.status,
        cancelled_at: updated.updatedAt?.toISOString(),
        cancelled_by: session.user.id,
      },
    });
  } catch (error) {
    console.error('POST /api/v1/deployments/:deploymentId/cancel error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
