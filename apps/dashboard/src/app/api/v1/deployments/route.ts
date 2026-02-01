import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deployments, services, projects, servers, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';
import { agentHub } from '@/lib/agent/hub';
import { queueBuild, queueDeployment } from '@/lib/queue';

// Request schemas
const createDeploymentSchema = z.object({
  service_id: z.string().uuid(),
  git_commit_sha: z.string().length(40).optional(),
  git_branch: z.string().optional(),
  docker_image_tag: z.string().optional(),
  trigger_type: z.enum(['manual', 'git_push', 'api', 'rollback']).default('manual'),
  rollback_from_id: z.string().uuid().optional(),
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

// Helper to get user's org IDs
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// GET /api/v1/deployments - List deployments
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
    const serviceId = searchParams.get('service_id');
    const projectId = searchParams.get('project_id');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20', 10), 100);

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0, page, per_page: perPage },
      });
    }

    // Get deployments with filters
    const deploymentList = await db.query.deployments.findMany({
      where: (deployments, { and: andWhere, eq: eqWhere }) => {
        const conditions = [];
        if (serviceId) {
          conditions.push(eqWhere(deployments.serviceId, serviceId));
        }
        if (status) {
          conditions.push(eqWhere(deployments.status, status as any));
        }
        return conditions.length > 0 ? andWhere(...conditions) : undefined;
      },
      orderBy: [desc(deployments.createdAt)],
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        service: {
          with: {
            project: {
              columns: {
                id: true,
                name: true,
                orgId: true,
              },
            },
          },
        },
        server: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Filter by user's orgs
    let filtered = deploymentList.filter((d) => orgIds.includes(d.service.project.orgId));

    // Filter by project if specified
    if (projectId) {
      filtered = filtered.filter((d) => d.service.project.id === projectId);
    }

    return NextResponse.json({
      success: true,
      data: filtered.map((d) => ({
        id: d.id,
        service_id: d.serviceId,
        server_id: d.serverId,
        status: d.status,
        git_commit_sha: d.gitCommitSha,
        git_commit_message: d.gitCommitMessage,
        git_commit_author: d.gitCommitAuthor,
        git_branch: d.gitBranch,
        docker_image_tag: d.dockerImageTag,
        trigger_type: d.triggerType,
        error_message: d.errorMessage,
        build_started_at: d.buildStartedAt?.toISOString(),
        build_finished_at: d.buildFinishedAt?.toISOString(),
        deploy_started_at: d.deployStartedAt?.toISOString(),
        deploy_finished_at: d.deployFinishedAt?.toISOString(),
        service: {
          id: d.service.id,
          name: d.service.name,
          project: {
            id: d.service.project.id,
            name: d.service.project.name,
          },
        },
        server: d.server ? {
          id: d.server.id,
          name: d.server.name,
        } : null,
        created_at: d.createdAt?.toISOString(),
      })),
      meta: {
        total: filtered.length,
        page,
        per_page: perPage,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/deployments error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/deployments - Trigger new deployment
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
    const parsed = createDeploymentSchema.safeParse(body);

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

    // Get service with project and server
    const service = await db.query.services.findFirst({
      where: eq(services.id, parsed.data.service_id),
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

    // Check org access
    const access = await checkOrgAccess(session.user.id, service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Check if server is assigned
    if (!service.serverId) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_SERVER', message: 'Service has no server assigned', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check if server is online
    if (!service.server || service.server.status !== 'online') {
      const isConnected = agentHub.isAgentConnected(service.serverId);
      if (!isConnected) {
        return NextResponse.json(
          { success: false, error: { code: 'SERVER_OFFLINE', message: 'Server is offline', request_id: crypto.randomUUID() } },
          { status: 400 }
        );
      }
    }

    const {
      service_id,
      git_commit_sha,
      git_branch,
      docker_image_tag,
      trigger_type,
      rollback_from_id,
    } = parsed.data;

    // Create deployment record
    const [deployment] = await db
      .insert(deployments)
      .values({
        serviceId: service_id,
        serverId: service.serverId,
        status: 'pending',
        gitCommitSha: git_commit_sha,
        gitBranch: git_branch || service.project.gitBranch,
        dockerImageTag: docker_image_tag,
        triggerType: trigger_type,
        triggeredBy: session.user.id,
        rollbackFromId: rollback_from_id,
      })
      .returning();

    // Determine deployment strategy based on source type
    const sourceType = service.sourceType;
    const needsBuild = sourceType === 'git' && service.dockerfilePath;

    try {
      if (needsBuild) {
        // Queue build job first
        await queueBuild({
          deploymentId: deployment.id,
          serviceId: service.id,
          git: {
            repoUrl: service.project.gitRepoUrl!,
            branch: git_branch || service.project.gitBranch || 'main',
            commitSha: git_commit_sha,
          },
          dockerfile: service.dockerfilePath || 'Dockerfile',
          buildArgs: service.buildArgs as Record<string, string> | undefined,
        });

        console.log(`[Deployments] Queued build job for deployment ${deployment.id}`);

      } else if (sourceType === 'docker_image' || docker_image_tag) {
        // Direct deployment with Docker image
        const dockerImage = docker_image_tag || service.dockerImage;

        if (!dockerImage) {
          throw new Error('No Docker image specified');
        }

        // Queue deployment job
        await queueDeployment({
          deploymentId: deployment.id,
          serviceId: service.id,
          serverId: service.serverId!,
          docker: {
            image: dockerImage,
            tag: 'latest',
          },
          envVars: { ...(service.project.envVars as Record<string, string> || {}), ...(service.envVars as Record<string, string> || {}) },
          triggerType: trigger_type,
        });

        // Update status
        await db
          .update(deployments)
          .set({ status: 'deploying', deployStartedAt: new Date() })
          .where(eq(deployments.id, deployment.id));

        console.log(`[Deployments] Queued deployment job for deployment ${deployment.id}`);

      } else {
        // Fallback: Send direct deploy command to agent (for legacy/simple deployments)
        const deployPayload = {
          deployment_id: deployment.id,
          service: {
            id: service.id,
            name: service.name,
            type: service.type,
            source_type: service.sourceType,
            docker_image: service.dockerImage,
            dockerfile_path: service.dockerfilePath,
            port: service.port,
            replicas: service.replicas,
            health_check: {
              path: service.healthCheckPath,
              interval_seconds: service.healthCheckInterval,
            },
            env_vars: { ...(service.project.envVars || {}), ...(service.envVars || {}) },
            resources: service.resources,
          },
          git: service.sourceType === 'git' ? {
            repo_url: service.project.gitRepoUrl,
            branch: git_branch || service.project.gitBranch,
            commit_sha: git_commit_sha,
          } : undefined,
        };

        const sent = agentHub.sendToAgent(service.serverId!, {
          id: crypto.randomUUID(),
          type: 'deploy',
          timestamp: new Date().toISOString(),
          payload: deployPayload,
        });

        if (sent) {
          await db
            .update(deployments)
            .set({ status: 'building', buildStartedAt: new Date() })
            .where(eq(deployments.id, deployment.id));
        }
      }
    } catch (deployError) {
      console.error('Failed to queue deployment:', deployError);
      // Update deployment as failed
      await db
        .update(deployments)
        .set({
          status: 'failed',
          errorMessage: deployError instanceof Error ? deployError.message : 'Failed to queue deployment'
        })
        .where(eq(deployments.id, deployment.id));
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: deployment.id,
          service_id: deployment.serviceId,
          server_id: deployment.serverId,
          status: deployment.status,
          git_commit_sha: deployment.gitCommitSha,
          git_branch: deployment.gitBranch,
          docker_image_tag: deployment.dockerImageTag,
          trigger_type: deployment.triggerType,
          created_at: deployment.createdAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/deployments error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
