import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deployments, services, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, ne } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { checkPermission } from '@/lib/auth/require-permission';
import crypto from 'crypto';
import { queueDeployment } from '@/lib/queue';
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

// POST /api/v1/services/[serviceId]/rollback - Quick rollback to last successful deployment
export async function POST(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    // Get service
    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
        server: true,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check service:deploy permission for rollback
    const access = await checkPermission(session.user.id, service.project.orgId, 'service:deploy');
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions: service:deploy required', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Check server availability
    if (!service.serverId) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_SERVER', message: 'Service has no server assigned', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    if (!agentHub.isAgentConnected(service.serverId)) {
      return NextResponse.json(
        { success: false, error: { code: 'SERVER_OFFLINE', message: 'Server is offline', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Get current running deployment
    const currentDeployment = await db.query.deployments.findFirst({
      where: and(
        eq(deployments.serviceId, params.serviceId),
        eq(deployments.status, 'running')
      ),
      orderBy: [desc(deployments.createdAt)],
    });

    // Find the last successful deployment before the current one
    const targetDeployment = await db.query.deployments.findFirst({
      where: and(
        eq(deployments.serviceId, params.serviceId),
        ne(deployments.id, currentDeployment?.id || ''),
        ne(deployments.dockerImageTag, ''),
      ),
      orderBy: [desc(deployments.deployFinishedAt)],
    });

    if (!targetDeployment || !targetDeployment.dockerImageTag) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_ROLLBACK_TARGET', message: 'No previous successful deployment found to rollback to', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Create new deployment record for rollback
    const [rollbackDeployment] = await db
      .insert(deployments)
      .values({
        serviceId: service.id,
        serverId: service.serverId,
        status: 'pending',
        gitCommitSha: targetDeployment.gitCommitSha,
        gitCommitMessage: `Quick rollback to ${targetDeployment.gitCommitSha?.slice(0, 7) || targetDeployment.id.slice(0, 8)}`,
        gitCommitAuthor: targetDeployment.gitCommitAuthor,
        gitBranch: targetDeployment.gitBranch,
        dockerImageTag: targetDeployment.dockerImageTag,
        triggerType: 'rollback',
        triggeredBy: session.user.id,
        rollbackFromId: currentDeployment?.id,
        metadata: {
          rollback_target_id: targetDeployment.id,
          rollback_reason: 'Quick rollback to last successful deployment',
        },
      })
      .returning();

    // Queue the deployment
    await queueDeployment({
      deploymentId: rollbackDeployment.id,
      serviceId: service.id,
      serverId: service.serverId!,
      docker: {
        image: targetDeployment.dockerImageTag,
        tag: 'rollback',
      },
      envVars: {
        ...(service.project.envVars as Record<string, string> || {}),
        ...(service.envVars as Record<string, string> || {}),
      },
      triggerType: 'rollback',
    });

    // Update status
    await db
      .update(deployments)
      .set({
        status: 'deploying',
        deployStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, rollbackDeployment.id));

    console.log(`[Rollback] Quick rollback initiated for service ${service.name}: ${rollbackDeployment.id}`);

    return NextResponse.json({
      success: true,
      data: {
        deployment_id: rollbackDeployment.id,
        service_id: service.id,
        service_name: service.name,
        status: 'deploying',
        rollback_from: currentDeployment ? {
          id: currentDeployment.id,
          git_commit_sha: currentDeployment.gitCommitSha,
        } : null,
        rollback_to: {
          id: targetDeployment.id,
          git_commit_sha: targetDeployment.gitCommitSha,
          docker_image_tag: targetDeployment.dockerImageTag,
        },
        message: `Rolling back ${service.name} to previous deployment`,
      },
    });
  } catch (error) {
    console.error('POST /api/v1/services/[serviceId]/rollback error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// GET /api/v1/services/[serviceId]/rollback - Get rollback history and candidates
export async function GET(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    // Get service
    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, service.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Get current deployment
    const currentDeployment = await db.query.deployments.findFirst({
      where: and(
        eq(deployments.serviceId, params.serviceId),
        eq(deployments.status, 'running')
      ),
      orderBy: [desc(deployments.createdAt)],
    });

    // Get successful deployments that can be rolled back to
    const allDeployments = await db.query.deployments.findMany({
      where: eq(deployments.serviceId, params.serviceId),
      orderBy: [desc(deployments.createdAt)],
      limit: 20,
    });

    // Filter valid rollback candidates
    const candidates = allDeployments.filter(d =>
      d.dockerImageTag &&
      d.id !== currentDeployment?.id &&
      (d.status === 'running' || d.status === 'stopped' || d.deployFinishedAt)
    );

    // Get rollback history (deployments triggered by rollback)
    const rollbackHistory = allDeployments.filter(d => d.triggerType === 'rollback');

    return NextResponse.json({
      success: true,
      data: {
        service: {
          id: service.id,
          name: service.name,
        },
        current_deployment: currentDeployment ? {
          id: currentDeployment.id,
          status: currentDeployment.status,
          git_commit_sha: currentDeployment.gitCommitSha,
          git_commit_message: currentDeployment.gitCommitMessage,
          docker_image_tag: currentDeployment.dockerImageTag,
          deploy_finished_at: currentDeployment.deployFinishedAt?.toISOString(),
          created_at: currentDeployment.createdAt?.toISOString(),
        } : null,
        rollback_candidates: candidates.slice(0, 10).map(d => ({
          id: d.id,
          status: d.status,
          git_commit_sha: d.gitCommitSha,
          git_commit_message: d.gitCommitMessage,
          git_branch: d.gitBranch,
          docker_image_tag: d.dockerImageTag,
          trigger_type: d.triggerType,
          deploy_finished_at: d.deployFinishedAt?.toISOString(),
          created_at: d.createdAt?.toISOString(),
        })),
        rollback_history: rollbackHistory.map(d => ({
          id: d.id,
          status: d.status,
          rollback_from_id: d.rollbackFromId,
          rollback_target_id: (d.metadata as any)?.rollback_target_id,
          created_at: d.createdAt?.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/services/[serviceId]/rollback error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
