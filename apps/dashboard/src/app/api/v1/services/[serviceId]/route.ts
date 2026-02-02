import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, projects, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { checkPermission } from '@/lib/auth/require-permission';
import { agentHub } from '@/lib/agent/hub';
import crypto from 'crypto';
import { z } from 'zod';

// Request schema
const updateServiceSchema = z.object({
  server_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['web', 'api', 'worker', 'cron']).optional(),
  source_type: z.enum(['git', 'docker_image', 'dockerfile']).optional(),
  docker_image: z.string().optional().nullable(),
  dockerfile_path: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  expose_enabled: z.boolean().optional(),
  expose_port: z.number().int().min(1).max(65535).optional().nullable(),
  replicas: z.number().int().min(1).max(10).optional(),
  health_check_path: z.string().optional(),
  health_check_interval: z.number().int().min(5).max(300).optional(),
  env_vars: z.record(z.string()).optional(),
  build_args: z.record(z.string()).optional(),
  resources: z.object({
    cpu_limit: z.string().optional(),
    memory_limit: z.string().optional(),
    cpu_request: z.string().optional(),
    memory_request: z.string().optional(),
  }).optional().nullable(),
  auto_deploy: z.boolean().optional(),
  is_active: z.boolean().optional(),
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

// GET /api/v1/services/:serviceId - Get service details
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

    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
        server: true,
        deployments: {
          orderBy: (deployments, { desc }) => [desc(deployments.createdAt)],
          limit: 10,
        },
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

    return NextResponse.json({
      success: true,
      data: {
        id: service.id,
        project_id: service.projectId,
        server_id: service.serverId,
        name: service.name,
        type: service.type,
        source_type: service.sourceType,
        docker_image: service.dockerImage,
        dockerfile_path: service.dockerfilePath,
        port: service.port,
        expose_enabled: service.exposeEnabled,
        expose_port: service.exposePort,
        replicas: service.replicas,
        health_check_path: service.healthCheckPath,
        health_check_interval: service.healthCheckInterval,
        env_vars: service.envVars,
        build_args: service.buildArgs,
        resources: service.resources,
        auto_deploy: service.autoDeploy,
        is_active: service.isActive,
        project: {
          id: service.project.id,
          name: service.project.name,
          slug: service.project.slug,
          org_id: service.project.orgId,
          git_repo_url: service.project.gitRepoUrl,
          git_branch: service.project.gitBranch,
        },
        server: service.server ? {
          id: service.server.id,
          name: service.server.name,
          hostname: service.server.hostname,
          status: service.server.status,
        } : null,
        deployments: service.deployments.map((d) => ({
          id: d.id,
          status: d.status,
          git_commit_sha: d.gitCommitSha,
          git_commit_message: d.gitCommitMessage,
          trigger_type: d.triggerType,
          created_at: d.createdAt?.toISOString(),
          deploy_finished_at: d.deployFinishedAt?.toISOString(),
        })),
        created_at: service.createdAt?.toISOString(),
        updated_at: service.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/services/:serviceId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/services/:serviceId - Update service
export async function PATCH(
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

    // Check permission for service updates
    const access = await checkPermission(session.user.id, service.project.orgId, 'service:deploy');
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions: service:deploy required', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateServiceSchema.safeParse(body);

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

    const updateData: Partial<typeof services.$inferInsert> = {
      updatedAt: new Date(),
    };

    const {
      server_id,
      name,
      type,
      source_type,
      docker_image,
      dockerfile_path,
      port,
      expose_enabled,
      expose_port,
      replicas,
      health_check_path,
      health_check_interval,
      env_vars,
      build_args,
      resources,
      auto_deploy,
      is_active,
    } = parsed.data;

    if (server_id !== undefined) updateData.serverId = server_id;
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (source_type !== undefined) updateData.sourceType = source_type;
    if (docker_image !== undefined) updateData.dockerImage = docker_image;
    if (dockerfile_path !== undefined) updateData.dockerfilePath = dockerfile_path;
    if (port !== undefined) updateData.port = port;
    if (expose_enabled !== undefined) updateData.exposeEnabled = expose_enabled;
    if (expose_port !== undefined) updateData.exposePort = expose_port;
    if (replicas !== undefined) updateData.replicas = replicas;
    if (health_check_path !== undefined) updateData.healthCheckPath = health_check_path;
    if (health_check_interval !== undefined) updateData.healthCheckInterval = health_check_interval;
    if (env_vars !== undefined) updateData.envVars = env_vars;
    if (build_args !== undefined) updateData.buildArgs = build_args;
    if (resources !== undefined) updateData.resources = resources;
    if (auto_deploy !== undefined) updateData.autoDeploy = auto_deploy;
    if (is_active !== undefined) updateData.isActive = is_active;

    const [updated] = await db
      .update(services)
      .set(updateData)
      .where(eq(services.id, params.serviceId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        project_id: updated.projectId,
        server_id: updated.serverId,
        name: updated.name,
        type: updated.type,
        source_type: updated.sourceType,
        docker_image: updated.dockerImage,
        dockerfile_path: updated.dockerfilePath,
        port: updated.port,
        expose_enabled: updated.exposeEnabled,
        expose_port: updated.exposePort,
        replicas: updated.replicas,
        health_check_path: updated.healthCheckPath,
        health_check_interval: updated.healthCheckInterval,
        env_vars: updated.envVars,
        build_args: updated.buildArgs,
        resources: updated.resources,
        auto_deploy: updated.autoDeploy,
        is_active: updated.isActive,
        created_at: updated.createdAt?.toISOString(),
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/services/:serviceId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/services/:serviceId - Delete service
export async function DELETE(
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

    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
        deployments: {
          where: (deployments, { inArray }) =>
            inArray(deployments.status, ['running', 'deploying', 'building']),
        },
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check permission for service deletion
    const deleteAccess = await checkPermission(session.user.id, service.project.orgId, 'service:delete');
    if (!deleteAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions: service:delete required', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Check if service has active deployments
    if (service.deployments.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'HAS_ACTIVE_DEPLOYMENTS',
            message: 'Service has active deployments. Please stop them first.',
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    // Send stop command to agent if server is connected
    if (service.serverId && agentHub.isAgentConnected(service.serverId)) {
      try {
        await agentHub.sendCommand(service.serverId, 'stop', {
          service_id: service.id,
          reason: 'service_deleted',
        });
      } catch (err) {
        console.warn(`[API] Failed to send stop command for service ${service.id}:`, err);
      }
    }

    await db.delete(services).where(eq(services.id, params.serviceId));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/v1/services/:serviceId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
