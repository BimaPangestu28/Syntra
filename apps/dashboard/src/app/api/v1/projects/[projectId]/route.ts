import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schema
const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  git_repo_url: z.string().url().optional().nullable(),
  git_branch: z.string().optional(),
  git_provider: z.enum(['github', 'gitlab', 'bitbucket']).optional().nullable(),
  build_command: z.string().optional().nullable(),
  install_command: z.string().optional().nullable(),
  output_directory: z.string().optional().nullable(),
  root_directory: z.string().optional(),
  env_vars: z.record(z.string()).optional(),
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

// GET /api/v1/projects/:projectId - Get project details
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, params.projectId),
      with: {
        services: {
          with: {
            server: {
              columns: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Project not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: project.id,
        org_id: project.orgId,
        name: project.name,
        slug: project.slug,
        description: project.description,
        git_repo_url: project.gitRepoUrl,
        git_branch: project.gitBranch,
        git_provider: project.gitProvider,
        build_command: project.buildCommand,
        install_command: project.installCommand,
        output_directory: project.outputDirectory,
        root_directory: project.rootDirectory,
        env_vars: project.envVars,
        services: project.services.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          source_type: s.sourceType,
          port: s.port,
          replicas: s.replicas,
          auto_deploy: s.autoDeploy,
          is_active: s.isActive,
          server: s.server ? {
            id: s.server.id,
            name: s.server.name,
            status: s.server.status,
          } : null,
          created_at: s.createdAt?.toISOString(),
        })),
        created_at: project.createdAt?.toISOString(),
        updated_at: project.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/projects/:projectId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/projects/:projectId - Update project
export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, params.projectId),
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Project not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (need admin or owner)
    const access = await checkOrgAccess(session.user.id, project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateProjectSchema.safeParse(body);

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

    const updateData: Partial<typeof projects.$inferInsert> = {
      updatedAt: new Date(),
    };

    const { name, description, git_repo_url, git_branch, git_provider, build_command, install_command, output_directory, root_directory, env_vars } = parsed.data;

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (git_repo_url !== undefined) updateData.gitRepoUrl = git_repo_url;
    if (git_branch !== undefined) updateData.gitBranch = git_branch;
    if (git_provider !== undefined) updateData.gitProvider = git_provider;
    if (build_command !== undefined) updateData.buildCommand = build_command;
    if (install_command !== undefined) updateData.installCommand = install_command;
    if (output_directory !== undefined) updateData.outputDirectory = output_directory;
    if (root_directory !== undefined) updateData.rootDirectory = root_directory;
    if (env_vars !== undefined) updateData.envVars = env_vars;

    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, params.projectId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        org_id: updated.orgId,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        git_repo_url: updated.gitRepoUrl,
        git_branch: updated.gitBranch,
        git_provider: updated.gitProvider,
        build_command: updated.buildCommand,
        install_command: updated.installCommand,
        output_directory: updated.outputDirectory,
        root_directory: updated.rootDirectory,
        env_vars: updated.envVars,
        created_at: updated.createdAt?.toISOString(),
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/projects/:projectId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/projects/:projectId - Delete project
export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, params.projectId),
      with: {
        services: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Project not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (need admin or owner)
    const access = await checkOrgAccess(session.user.id, project.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Check if project has active services
    const activeServices = project.services.filter((s) => s.isActive);
    if (activeServices.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'HAS_ACTIVE_SERVICES',
            message: `Project has ${activeServices.length} active service(s). Please stop or delete them first.`,
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    await db.delete(projects).where(eq(projects.id, params.projectId));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/v1/projects/:projectId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
