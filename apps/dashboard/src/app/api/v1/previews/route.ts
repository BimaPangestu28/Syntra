import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { previewDeployments, services, organizationMembers, projects } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

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

// GET /api/v1/previews - List preview deployments
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
    const status = searchParams.get('status');
    const prNumber = searchParams.get('pr_number');

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // Build query conditions
    let previews;

    if (serviceId) {
      // Check service access first
      const service = await db.query.services.findFirst({
        where: eq(services.id, serviceId),
        with: {
          project: true,
        },
      });

      if (!service || !orgIds.includes(service.project.orgId)) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
          { status: 403 }
        );
      }

      previews = await db.query.previewDeployments.findMany({
        where: (pv, { and: andWhere, eq: eqWhere }) => {
          const conditions = [eqWhere(pv.serviceId, serviceId)];

          if (status) {
            conditions.push(eqWhere(pv.status, status as any));
          }

          if (prNumber) {
            conditions.push(eqWhere(pv.prNumber, parseInt(prNumber, 10)));
          }

          return andWhere(...conditions);
        },
        orderBy: [desc(previewDeployments.createdAt)],
        with: {
          service: {
            columns: {
              id: true,
              name: true,
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
    } else {
      // Get all previews for user's orgs
      const userServices = await db.query.services.findMany({
        where: (svc, { inArray: inArrayWhere }) => {
          return inArrayWhere(svc.projectId,
            db.select({ id: projects.id }).from(projects).where(inArray(projects.orgId, orgIds))
          );
        },
        columns: { id: true },
      });

      const serviceIds = userServices.map(s => s.id);

      if (serviceIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
        });
      }

      previews = await db.query.previewDeployments.findMany({
        where: (pv, { and: andWhere, eq: eqWhere, inArray: inArrayWhere }) => {
          const conditions = [inArrayWhere(pv.serviceId, serviceIds)];

          if (status) {
            conditions.push(eqWhere(pv.status, status as any));
          }

          if (prNumber) {
            conditions.push(eqWhere(pv.prNumber, parseInt(prNumber, 10)));
          }

          return andWhere(...conditions);
        },
        orderBy: [desc(previewDeployments.createdAt)],
        limit: 50,
        with: {
          service: {
            columns: {
              id: true,
              name: true,
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
    }

    return NextResponse.json({
      success: true,
      data: previews.map(p => ({
        id: p.id,
        service_id: p.serviceId,
        server_id: p.serverId,
        pr_number: p.prNumber,
        pr_title: p.prTitle,
        pr_author: p.prAuthor,
        pr_branch: p.prBranch,
        base_branch: p.baseBranch,
        git_commit_sha: p.gitCommitSha,
        status: p.status,
        preview_url: p.previewUrl,
        preview_subdomain: p.previewSubdomain,
        port: p.port,
        container_id: p.containerId,
        docker_image_tag: p.dockerImageTag,
        error_message: p.errorMessage,
        build_started_at: p.buildStartedAt?.toISOString(),
        build_finished_at: p.buildFinishedAt?.toISOString(),
        deploy_started_at: p.deployStartedAt?.toISOString(),
        deploy_finished_at: p.deployFinishedAt?.toISOString(),
        expires_at: p.expiresAt?.toISOString(),
        service: p.service ? { id: p.service.id, name: p.service.name } : null,
        server: p.server ? { id: p.server.id, name: p.server.name } : null,
        created_at: p.createdAt?.toISOString(),
        updated_at: p.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/previews error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
