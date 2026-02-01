import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, projects, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schemas
const createServiceSchema = z.object({
  project_id: z.string().uuid(),
  server_id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  type: z.enum(['web', 'api', 'worker', 'cron']).default('web'),
  source_type: z.enum(['git', 'docker_image', 'dockerfile']).default('git'),
  docker_image: z.string().optional(),
  dockerfile_path: z.string().default('Dockerfile'),
  port: z.number().int().min(1).max(65535).default(3000),
  expose_enabled: z.boolean().default(false),
  expose_port: z.number().int().min(1).max(65535).optional(),
  replicas: z.number().int().min(1).max(10).default(1),
  health_check_path: z.string().default('/'),
  health_check_interval: z.number().int().min(5).max(300).default(30),
  env_vars: z.record(z.string()).optional(),
  build_args: z.record(z.string()).optional(),
  resources: z.object({
    cpu_limit: z.string().optional(),
    memory_limit: z.string().optional(),
    cpu_request: z.string().optional(),
    memory_request: z.string().optional(),
  }).optional(),
  auto_deploy: z.boolean().default(true),
});

// Helper to get user's organizations
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

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

// GET /api/v1/services - List services
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
    const serverId = searchParams.get('server_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20', 10), 100);

    // Get user's organizations
    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0, page, per_page: perPage },
      });
    }

    // Build query
    const serviceList = await db.query.services.findMany({
      where: (services, { and: andWhere, eq: eqWhere }) => {
        const conditions = [];
        if (projectId) {
          conditions.push(eqWhere(services.projectId, projectId));
        }
        if (serverId) {
          conditions.push(eqWhere(services.serverId, serverId));
        }
        return conditions.length > 0 ? andWhere(...conditions) : undefined;
      },
      orderBy: [desc(services.createdAt)],
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        project: {
          columns: {
            id: true,
            name: true,
            orgId: true,
          },
        },
        server: {
          columns: {
            id: true,
            name: true,
            status: true,
          },
        },
        deployments: {
          orderBy: (deployments, { desc: descOrder }) => [descOrder(deployments.createdAt)],
          limit: 1,
          columns: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    // Filter by user's orgs
    const filteredServices = serviceList.filter((s) => orgIds.includes(s.project.orgId));

    return NextResponse.json({
      success: true,
      data: filteredServices.map((s) => ({
        id: s.id,
        project_id: s.projectId,
        server_id: s.serverId,
        name: s.name,
        type: s.type,
        source_type: s.sourceType,
        docker_image: s.dockerImage,
        port: s.port,
        replicas: s.replicas,
        auto_deploy: s.autoDeploy,
        is_active: s.isActive,
        project: {
          id: s.project.id,
          name: s.project.name,
        },
        server: s.server ? {
          id: s.server.id,
          name: s.server.name,
          status: s.server.status,
        } : null,
        latest_deployment: s.deployments[0] ? {
          id: s.deployments[0].id,
          status: s.deployments[0].status,
          created_at: s.deployments[0].createdAt?.toISOString(),
        } : null,
        created_at: s.createdAt?.toISOString(),
        updated_at: s.updatedAt?.toISOString(),
      })),
      meta: {
        total: filteredServices.length,
        page,
        per_page: perPage,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/services error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/services - Create service
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
    const parsed = createServiceSchema.safeParse(body);

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

    // Verify project exists and user has access
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, parsed.data.project_id),
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Project not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const access = await checkOrgAccess(session.user.id, project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const {
      project_id,
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
    } = parsed.data;

    const [service] = await db
      .insert(services)
      .values({
        projectId: project_id,
        serverId: server_id,
        name,
        type,
        sourceType: source_type,
        dockerImage: docker_image,
        dockerfilePath: dockerfile_path,
        port,
        exposeEnabled: expose_enabled,
        exposePort: expose_port,
        replicas,
        healthCheckPath: health_check_path,
        healthCheckInterval: health_check_interval,
        envVars: env_vars || {},
        buildArgs: build_args || {},
        resources,
        autoDeploy: auto_deploy,
      })
      .returning();

    return NextResponse.json(
      {
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
          created_at: service.createdAt?.toISOString(),
          updated_at: service.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/services error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
