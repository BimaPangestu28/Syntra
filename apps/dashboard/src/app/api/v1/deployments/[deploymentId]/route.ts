import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deployments, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { agentHub } from '@/lib/agent/hub';

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

// GET /api/v1/deployments/:deploymentId - Get deployment details
export async function GET(
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

    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, params.deploymentId),
      with: {
        service: {
          with: {
            project: true,
          },
        },
        server: true,
        triggeredByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
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

    // Check org access
    const access = await checkOrgAccess(session.user.id, deployment.service.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: deployment.id,
        service_id: deployment.serviceId,
        server_id: deployment.serverId,
        status: deployment.status,
        git_commit_sha: deployment.gitCommitSha,
        git_commit_message: deployment.gitCommitMessage,
        git_commit_author: deployment.gitCommitAuthor,
        git_branch: deployment.gitBranch,
        docker_image_tag: deployment.dockerImageTag,
        container_id: deployment.containerId,
        build_logs: deployment.buildLogs,
        deploy_logs: deployment.deployLogs,
        error_message: deployment.errorMessage,
        build_started_at: deployment.buildStartedAt?.toISOString(),
        build_finished_at: deployment.buildFinishedAt?.toISOString(),
        deploy_started_at: deployment.deployStartedAt?.toISOString(),
        deploy_finished_at: deployment.deployFinishedAt?.toISOString(),
        trigger_type: deployment.triggerType,
        rollback_from_id: deployment.rollbackFromId,
        triggered_by: deployment.triggeredByUser ? {
          id: deployment.triggeredByUser.id,
          name: deployment.triggeredByUser.name,
          email: deployment.triggeredByUser.email,
        } : null,
        service: {
          id: deployment.service.id,
          name: deployment.service.name,
          type: deployment.service.type,
          project: {
            id: deployment.service.project.id,
            name: deployment.service.project.name,
            slug: deployment.service.project.slug,
          },
        },
        server: deployment.server ? {
          id: deployment.server.id,
          name: deployment.server.name,
          hostname: deployment.server.hostname,
          status: deployment.server.status,
        } : null,
        created_at: deployment.createdAt?.toISOString(),
        updated_at: deployment.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/deployments/:deploymentId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/deployments/:deploymentId/cancel - Cancel deployment
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

    // Check action from URL
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

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

    // Check org access
    const access = await checkOrgAccess(session.user.id, deployment.service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    if (action === 'cancel') {
      // Only cancel if deployment is in progress
      if (!['pending', 'building', 'deploying'].includes(deployment.status)) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_STATE', message: 'Deployment cannot be cancelled', request_id: crypto.randomUUID() } },
          { status: 400 }
        );
      }

      // Send cancel command to agent
      if (deployment.serverId) {
        agentHub.sendToAgent(deployment.serverId, {
          id: crypto.randomUUID(),
          type: 'cancel_deploy',
          timestamp: new Date().toISOString(),
          payload: {
            deployment_id: deployment.id,
          },
        });
      }

      // Update deployment status
      const [updated] = await db
        .update(deployments)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(deployments.id, params.deploymentId))
        .returning();

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
          updated_at: updated.updatedAt?.toISOString(),
        },
      });
    }

    if (action === 'stop') {
      // Only stop if deployment is running
      if (deployment.status !== 'running') {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_STATE', message: 'Deployment is not running', request_id: crypto.randomUUID() } },
          { status: 400 }
        );
      }

      // Send stop command to agent
      if (deployment.serverId && deployment.containerId) {
        agentHub.sendToAgent(deployment.serverId, {
          id: crypto.randomUUID(),
          type: 'stop_container',
          timestamp: new Date().toISOString(),
          payload: {
            container_id: deployment.containerId,
            deployment_id: deployment.id,
          },
        });
      }

      // Update deployment status
      const [updated] = await db
        .update(deployments)
        .set({
          status: 'stopped',
          updatedAt: new Date(),
        })
        .where(eq(deployments.id, params.deploymentId))
        .returning();

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
          updated_at: updated.updatedAt?.toISOString(),
        },
      });
    }

    return NextResponse.json(
      { success: false, error: { code: 'INVALID_ACTION', message: 'Invalid action. Use ?action=cancel or ?action=stop', request_id: crypto.randomUUID() } },
      { status: 400 }
    );
  } catch (error) {
    console.error('POST /api/v1/deployments/:deploymentId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
