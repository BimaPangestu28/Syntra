import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { activityFeed, deployments, services, projects, organizationMembers, users } from '@/lib/db/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// Helper to get user's org IDs
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// Unified activity item shape
interface ActivityItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  user: { id: string; name: string | null; image: string | null } | null;
  resource: { type: string; id: string; name: string } | null;
  created_at: string;
}

// GET /api/v1/activity - Get activity feed
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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const perPage = Math.min(Math.max(1, parseInt(searchParams.get('per_page') || '30', 10)), 100);
    const typeFilter = searchParams.get('type');

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          items: [],
          meta: { page, per_page: perPage, has_more: false },
        },
      });
    }

    // 1. Fetch activity feed items
    const conditions = [inArray(activityFeed.orgId, orgIds)];
    if (typeFilter) {
      conditions.push(eq(activityFeed.type, typeFilter));
    }

    const feedItems = await db.query.activityFeed.findMany({
      where: and(...conditions),
      orderBy: [desc(activityFeed.createdAt)],
      limit: 200,
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    const activityItems: ActivityItem[] = feedItems.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      message: a.message,
      user: a.user
        ? { id: a.user.id, name: a.user.name, image: a.user.image }
        : null,
      resource:
        a.resourceType && a.resourceId
          ? { type: a.resourceType, id: a.resourceId, name: a.resourceName || '' }
          : null,
      created_at: a.createdAt.toISOString(),
    }));

    // 2. Fetch recent deployments as supplementary activity
    const shouldIncludeDeployments = !typeFilter || typeFilter.startsWith('deployment.');

    if (shouldIncludeDeployments) {
      const recentDeployments = await db.query.deployments.findMany({
        orderBy: [desc(deployments.createdAt)],
        limit: 50,
        with: {
          service: {
            columns: { id: true, name: true, projectId: true },
            with: {
              project: {
                columns: { id: true, name: true, orgId: true },
              },
            },
          },
          triggeredByUser: {
            columns: { id: true, name: true, image: true },
          },
        },
      });

      // Filter to only deployments belonging to the user's orgs
      const orgDeployments = recentDeployments.filter(
        (d) => d.service?.project?.orgId && orgIds.includes(d.service.project.orgId)
      );

      // Existing feed IDs to avoid duplicates
      const existingIds = new Set(activityItems.map((a) => a.id));

      for (const d of orgDeployments) {
        // Skip if this deployment was already in the activity feed
        const deploymentFeedId = `deployment-${d.id}`;
        if (existingIds.has(deploymentFeedId)) continue;

        let deployType = 'deployment.started';
        let title = `Deployment started`;
        if (d.status === 'running') {
          deployType = 'deployment.completed';
          title = 'Deployment completed successfully';
        } else if (d.status === 'failed') {
          deployType = 'deployment.failed';
          title = 'Deployment failed';
        } else if (d.status === 'building') {
          deployType = 'deployment.building';
          title = 'Deployment is building';
        } else if (d.status === 'deploying') {
          deployType = 'deployment.deploying';
          title = 'Deployment is deploying';
        } else if (d.status === 'cancelled') {
          deployType = 'deployment.cancelled';
          title = 'Deployment was cancelled';
        } else if (d.status === 'stopped') {
          deployType = 'deployment.stopped';
          title = 'Deployment was stopped';
        }

        // Apply type filter for deployment subtypes
        if (typeFilter && typeFilter !== deployType) continue;

        const serviceName = d.service?.name || 'Unknown service';
        const message = d.gitCommitMessage
          ? `${d.gitCommitMessage}${d.gitBranch ? ` (${d.gitBranch})` : ''}`
          : d.triggerType
            ? `Triggered via ${d.triggerType}`
            : null;

        activityItems.push({
          id: deploymentFeedId,
          type: deployType,
          title,
          message,
          user: d.triggeredByUser
            ? { id: d.triggeredByUser.id, name: d.triggeredByUser.name, image: d.triggeredByUser.image }
            : null,
          resource: { type: 'service', id: d.service?.id || d.serviceId, name: serviceName },
          created_at: d.createdAt.toISOString(),
        });
      }
    }

    // 3. Sort merged results by date descending
    activityItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // 4. Paginate
    const startIndex = (page - 1) * perPage;
    const paginatedItems = activityItems.slice(startIndex, startIndex + perPage);
    const hasMore = startIndex + perPage < activityItems.length;

    return NextResponse.json({
      success: true,
      data: {
        items: paginatedItems,
        meta: {
          page,
          per_page: perPage,
          has_more: hasMore,
        },
      },
    });
  } catch (error) {
    console.error('GET /api/v1/activity error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/activity/mark-read - Mark activities as read
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
    const { activity_ids, mark_all } = body;

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: { updated: 0 } });
    }

    if (mark_all) {
      await db
        .update(activityFeed)
        .set({ isRead: true })
        .where(and(
          inArray(activityFeed.orgId, orgIds),
          eq(activityFeed.isRead, false)
        ));

      return NextResponse.json({
        success: true,
        data: { message: 'All activities marked as read' },
      });
    }

    if (activity_ids && Array.isArray(activity_ids)) {
      await db
        .update(activityFeed)
        .set({ isRead: true })
        .where(and(
          inArray(activityFeed.id, activity_ids),
          inArray(activityFeed.orgId, orgIds)
        ));

      return NextResponse.json({
        success: true,
        data: { updated: activity_ids.length },
      });
    }

    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide activity_ids or mark_all', request_id: crypto.randomUUID() } },
      { status: 400 }
    );
  } catch (error) {
    console.error('POST /api/v1/activity error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
