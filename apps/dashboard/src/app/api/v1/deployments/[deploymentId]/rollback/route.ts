import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deployments, services, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, ne } from 'drizzle-orm';
import { auth } from '@/lib/auth';
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

// POST /api/v1/deployments/[deploymentId]/rollback - Rollback to this deployment
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

    // Get the target deployment (the one we're rolling back TO)
    const targetDeployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, params.deploymentId),
      with: {
        service: {
          with: {
            project: true,
            server: true,
          },
        },
      },
    });

    if (!targetDeployment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Deployment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(
      session.user.id,
      targetDeployment.service.project.orgId,
      ['owner', 'admin', 'developer']
    );
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Validate rollback target
    if (targetDeployment.status !== 'running' && targetDeployment.status !== 'stopped') {
      // Check if it was ever successful
      if (!targetDeployment.deployFinishedAt || targetDeployment.status === 'failed') {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_ROLLBACK_TARGET', message: 'Cannot rollback to a deployment that never succeeded', request_id: crypto.randomUUID() } },
          { status: 400 }
        );
      }
    }

    // Check if docker image is available
    if (!targetDeployment.dockerImageTag) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_IMAGE', message: 'Target deployment has no Docker image to rollback to', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const service = targetDeployment.service;

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

    // Get current active deployment (the one we're rolling back FROM)
    const currentDeployment = await db.query.deployments.findFirst({
      where: and(
        eq(deployments.serviceId, service.id),
        eq(deployments.status, 'running')
      ),
      orderBy: [desc(deployments.createdAt)],
    });

    // Create new deployment record for rollback
    const [rollbackDeployment] = await db
      .insert(deployments)
      .values({
        serviceId: service.id,
        serverId: service.serverId,
        status: 'pending',
        gitCommitSha: targetDeployment.gitCommitSha,
        gitCommitMessage: `Rollback to ${targetDeployment.gitCommitSha?.slice(0, 7) || targetDeployment.id.slice(0, 8)}`,
        gitCommitAuthor: targetDeployment.gitCommitAuthor,
        gitBranch: targetDeployment.gitBranch,
        dockerImageTag: targetDeployment.dockerImageTag,
        triggerType: 'rollback',
        triggeredBy: session.user.id,
        rollbackFromId: currentDeployment?.id,
        metadata: {
          rollback_target_id: targetDeployment.id,
          rollback_reason: 'Manual rollback requested',
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

    // Update rollback deployment status
    await db
      .update(deployments)
      .set({
        status: 'deploying',
        deployStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, rollbackDeployment.id));

    console.log(`[Rollback] Created rollback deployment ${rollbackDeployment.id} from ${targetDeployment.id}`);

    return NextResponse.json({
      success: true,
      data: {
        id: rollbackDeployment.id,
        service_id: rollbackDeployment.serviceId,
        server_id: rollbackDeployment.serverId,
        status: 'deploying',
        trigger_type: 'rollback',
        rollback_from_id: currentDeployment?.id,
        rollback_target_id: targetDeployment.id,
        docker_image_tag: rollbackDeployment.dockerImageTag,
        message: `Rolling back to deployment ${targetDeployment.id.slice(0, 8)}`,
        created_at: rollbackDeployment.createdAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('POST /api/v1/deployments/[deploymentId]/rollback error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// GET /api/v1/deployments/[deploymentId]/rollback - Get rollback candidates
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

    // Get current deployment
    const currentDeployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, params.deploymentId),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!currentDeployment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Deployment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(
      session.user.id,
      currentDeployment.service.project.orgId
    );
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Get previous successful deployments for this service
    const rollbackCandidates = await db.query.deployments.findMany({
      where: and(
        eq(deployments.serviceId, currentDeployment.serviceId),
        ne(deployments.id, params.deploymentId),
        // Only deployments that completed successfully (have a docker image)
        ne(deployments.dockerImageTag, '')
      ),
      orderBy: [desc(deployments.createdAt)],
      limit: 10,
    });

    // Filter to only include deployments that can be rolled back to
    const validCandidates = rollbackCandidates.filter(d =>
      d.dockerImageTag &&
      (d.status === 'running' || d.status === 'stopped' || d.deployFinishedAt)
    );

    return NextResponse.json({
      success: true,
      data: {
        current_deployment: {
          id: currentDeployment.id,
          status: currentDeployment.status,
          git_commit_sha: currentDeployment.gitCommitSha,
          docker_image_tag: currentDeployment.dockerImageTag,
          created_at: currentDeployment.createdAt?.toISOString(),
        },
        rollback_candidates: validCandidates.map(d => ({
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
      },
    });
  } catch (error) {
    console.error('GET /api/v1/deployments/[deploymentId]/rollback error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
