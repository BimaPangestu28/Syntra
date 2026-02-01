import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { searchAuditLogs, getAuditLogStats } from '@/lib/audit';

// Helper to check org access (only admins can view audit logs)
async function checkAuditAccess(
  userId: string,
  orgId: string
): Promise<boolean> {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });
  return !!membership && ['owner', 'admin'].includes(membership.role);
}

// GET /api/v1/audit-logs - Search audit logs
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
    const orgId = searchParams.get('org_id');
    const userId = searchParams.get('user_id');
    const action = searchParams.get('action');
    const resourceType = searchParams.get('resource_type');
    const resourceId = searchParams.get('resource_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const search = searchParams.get('search');
    const view = searchParams.get('view'); // logs or stats
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'org_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check access
    const hasAccess = await checkAuditAccess(session.user.id, orgId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied. Only admins can view audit logs.', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    if (view === 'stats') {
      const days = parseInt(searchParams.get('days') || '30', 10);
      const stats = await getAuditLogStats(orgId, days);

      return NextResponse.json({
        success: true,
        data: {
          days,
          total: stats.total,
          by_action: stats.byAction,
          by_resource_type: stats.byResourceType,
          by_user: stats.byUser,
        },
      });
    }

    const result = await searchAuditLogs({
      orgId,
      userId: userId || undefined,
      action: action || undefined,
      resourceType: resourceType || undefined,
      resourceId: resourceId || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      search: search || undefined,
      limit: Math.min(limit, 500),
      offset,
    });

    return NextResponse.json({
      success: true,
      data: {
        logs: result.logs.map(log => ({
          id: log.id,
          user_id: log.userId,
          action: log.action,
          resource_type: log.resourceType,
          resource_id: log.resourceId,
          resource_name: log.resourceName,
          changes: log.changes,
          metadata: log.metadata,
          ip_address: log.ipAddress,
          request_id: log.requestId,
          created_at: log.createdAt.toISOString(),
        })),
        total: result.total,
        has_more: offset + result.logs.length < result.total,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/audit-logs error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
