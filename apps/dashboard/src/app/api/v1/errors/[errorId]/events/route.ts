import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorGroups, services, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getClickHouseClient } from '@/lib/clickhouse/client';
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

interface ErrorEvent {
  error_group_id: string;
  service_id: string;
  fingerprint: string;
  type: string;
  message: string;
  stack_trace: string;
  metadata: string;
  timestamp: string;
}

/**
 * GET /api/v1/errors/:errorId/events - Get individual error occurrences
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { errorId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    // Get error group
    const errorGroup = await db.query.errorGroups.findFirst({
      where: eq(errorGroups.id, params.errorId),
    });

    if (!errorGroup) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Error group not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Get service to check org access
    const service = await db.query.services.findFirst({
      where: eq(services.id, errorGroup.serviceId),
      with: { project: true },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const access = await checkOrgAccess(session.user.id, service.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '50', 10), 200);
    const offset = (page - 1) * perPage;

    // Query ClickHouse for individual error events by fingerprint
    const ch = getClickHouseClient();
    const result = await ch.query({
      query: `
        SELECT
          error_group_id,
          service_id,
          fingerprint,
          type,
          message,
          stack_trace,
          metadata,
          timestamp
        FROM errors
        WHERE fingerprint = {fingerprint:String}
          AND service_id = {serviceId:UUID}
        ORDER BY timestamp DESC
        LIMIT {limit:UInt32}
        OFFSET {offset:UInt32}
      `,
      query_params: {
        fingerprint: errorGroup.fingerprint,
        serviceId: errorGroup.serviceId,
        limit: perPage,
        offset,
      },
      format: 'JSONEachRow',
    });

    const events = await result.json<ErrorEvent[]>();

    return NextResponse.json({
      success: true,
      data: {
        error_group: {
          id: errorGroup.id,
          fingerprint: errorGroup.fingerprint,
          type: errorGroup.type,
          message: errorGroup.message,
          status: errorGroup.status,
          event_count: errorGroup.eventCount,
          first_seen_at: errorGroup.firstSeenAt.toISOString(),
          last_seen_at: errorGroup.lastSeenAt.toISOString(),
        },
        events: events.map((e) => ({
          type: e.type,
          message: e.message,
          stack_trace: e.stack_trace || null,
          metadata: e.metadata ? JSON.parse(e.metadata) : null,
          timestamp: e.timestamp,
        })),
      },
      meta: {
        page,
        per_page: perPage,
        has_more: events.length === perPage,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/errors/:errorId/events error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
