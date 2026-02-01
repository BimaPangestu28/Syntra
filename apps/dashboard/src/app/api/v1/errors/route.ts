import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { errorGroups, services, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import crypto from 'crypto';

// GET /api/v1/errors - List error groups for a service or project
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
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!serviceId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'service_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check service access
    const service = await db.query.services.findFirst({
      where: eq(services.id, serviceId),
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

    // Check membership
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.orgId, service.project.orgId)
      ),
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Build query conditions
    const conditions = [eq(errorGroups.serviceId, serviceId)];
    if (status) {
      conditions.push(eq(errorGroups.status, status));
    }

    // Get error groups
    const errors = await db.query.errorGroups.findMany({
      where: and(...conditions),
      orderBy: [desc(errorGroups.lastSeenAt)],
      limit,
      offset,
      with: {
        assignee: {
          columns: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(errorGroups)
      .where(and(...conditions));

    const total = Number(countResult[0].count);

    return NextResponse.json({
      success: true,
      data: errors.map((e) => ({
        id: e.id,
        service_id: e.serviceId,
        fingerprint: e.fingerprint,
        type: e.type,
        message: e.message,
        status: e.status,
        first_seen_at: e.firstSeenAt.toISOString(),
        last_seen_at: e.lastSeenAt.toISOString(),
        event_count: e.eventCount,
        user_count: e.userCount,
        assigned_to: e.assignee
          ? {
              id: e.assignee.id,
              name: e.assignee.name,
              email: e.assignee.email,
              image: e.assignee.image,
            }
          : null,
        resolved_at: e.resolvedAt?.toISOString() || null,
        metadata: e.metadata,
        has_ai_analysis: !!(e.metadata as { aiAnalysis?: unknown })?.aiAnalysis,
        created_at: e.createdAt.toISOString(),
        updated_at: e.updatedAt.toISOString(),
      })),
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + errors.length < total,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/errors error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
