import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { previewDeployments, services, organizationMembers } from '@/lib/db/schema';
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

// GET /api/v1/previews/[previewId] - Get preview deployment details
export async function GET(
  req: NextRequest,
  { params }: { params: { previewId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const preview = await db.query.previewDeployments.findFirst({
      where: eq(previewDeployments.id, params.previewId),
      with: {
        service: {
          with: {
            project: true,
          },
        },
        server: {
          columns: {
            id: true,
            name: true,
            hostname: true,
            status: true,
          },
        },
      },
    });

    if (!preview) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Preview deployment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, preview.service.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: preview.id,
        service_id: preview.serviceId,
        server_id: preview.serverId,
        pr_number: preview.prNumber,
        pr_title: preview.prTitle,
        pr_author: preview.prAuthor,
        pr_branch: preview.prBranch,
        base_branch: preview.baseBranch,
        git_commit_sha: preview.gitCommitSha,
        status: preview.status,
        preview_url: preview.previewUrl,
        preview_subdomain: preview.previewSubdomain,
        port: preview.port,
        container_id: preview.containerId,
        docker_image_tag: preview.dockerImageTag,
        error_message: preview.errorMessage,
        build_started_at: preview.buildStartedAt?.toISOString(),
        build_finished_at: preview.buildFinishedAt?.toISOString(),
        deploy_started_at: preview.deployStartedAt?.toISOString(),
        deploy_finished_at: preview.deployFinishedAt?.toISOString(),
        expires_at: preview.expiresAt?.toISOString(),
        service: {
          id: preview.service.id,
          name: preview.service.name,
          type: preview.service.type,
        },
        server: preview.server ? {
          id: preview.server.id,
          name: preview.server.name,
          hostname: preview.server.hostname,
          status: preview.server.status,
        } : null,
        project: {
          id: preview.service.project.id,
          name: preview.service.project.name,
        },
        created_at: preview.createdAt?.toISOString(),
        updated_at: preview.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/previews/[previewId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/previews/[previewId] - Rebuild/restart preview
export async function POST(
  req: NextRequest,
  { params }: { params: { previewId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const preview = await db.query.previewDeployments.findFirst({
      where: eq(previewDeployments.id, params.previewId),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!preview) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Preview deployment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (developer or higher can rebuild)
    const access = await checkOrgAccess(session.user.id, preview.service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'rebuild';

    if (action === 'rebuild') {
      // Reset status and queue rebuild
      await db
        .update(previewDeployments)
        .set({
          status: 'pending',
          errorMessage: null,
          buildStartedAt: null,
          buildFinishedAt: null,
          deployStartedAt: null,
          deployFinishedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(previewDeployments.id, params.previewId));

      // Queue build would happen here
      // await queueBuild({ ... })

      return NextResponse.json({
        success: true,
        data: {
          preview_id: params.previewId,
          action: 'rebuild',
          status: 'pending',
          message: 'Rebuild queued',
        },
      });
    } else if (action === 'restart') {
      // Restart container
      if (!preview.containerId || !preview.serverId) {
        return NextResponse.json(
          { success: false, error: { code: 'BAD_REQUEST', message: 'Preview has no running container', request_id: crypto.randomUUID() } },
          { status: 400 }
        );
      }

      if (!agentHub.isAgentConnected(preview.serverId)) {
        return NextResponse.json(
          { success: false, error: { code: 'SERVER_OFFLINE', message: 'Server is offline', request_id: crypto.randomUUID() } },
          { status: 503 }
        );
      }

      agentHub.sendToAgent(preview.serverId, {
        id: crypto.randomUUID(),
        type: 'container_restart',
        timestamp: new Date().toISOString(),
        payload: {
          container_id: preview.containerId,
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          preview_id: params.previewId,
          action: 'restart',
          message: 'Restart command sent',
        },
      });
    } else {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid action. Use "rebuild" or "restart"', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('POST /api/v1/previews/[previewId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/previews/[previewId] - Stop and delete preview
export async function DELETE(
  req: NextRequest,
  { params }: { params: { previewId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const preview = await db.query.previewDeployments.findFirst({
      where: eq(previewDeployments.id, params.previewId),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!preview) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Preview deployment not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (developer or higher can delete)
    const access = await checkOrgAccess(session.user.id, preview.service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Stop container if running
    if (preview.containerId && preview.serverId && agentHub.isAgentConnected(preview.serverId)) {
      agentHub.sendToAgent(preview.serverId, {
        id: crypto.randomUUID(),
        type: 'container_stop',
        timestamp: new Date().toISOString(),
        payload: {
          container_id: preview.containerId,
          remove: true,
        },
      });
    }

    // Delete preview record
    await db.delete(previewDeployments).where(eq(previewDeployments.id, params.previewId));

    return NextResponse.json({
      success: true,
      message: 'Preview deployment deleted',
    });
  } catch (error) {
    console.error('DELETE /api/v1/previews/[previewId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
