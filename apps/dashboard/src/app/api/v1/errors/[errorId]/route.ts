import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { errorGroups, services, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

// GET /api/v1/errors/[errorId] - Get a single error group
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

    const errorGroup = await db.query.errorGroups.findFirst({
      where: eq(errorGroups.id, params.errorId),
      with: {
        service: {
          with: {
            project: true,
          },
        },
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

    if (!errorGroup) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Error group not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check membership
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.orgId, errorGroup.service.project.orgId)
      ),
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const metadata = errorGroup.metadata as Record<string, unknown> | null;

    return NextResponse.json({
      success: true,
      data: {
        id: errorGroup.id,
        service_id: errorGroup.serviceId,
        service_name: errorGroup.service.name,
        fingerprint: errorGroup.fingerprint,
        type: errorGroup.type,
        message: errorGroup.message,
        status: errorGroup.status,
        first_seen_at: errorGroup.firstSeenAt.toISOString(),
        last_seen_at: errorGroup.lastSeenAt.toISOString(),
        event_count: errorGroup.eventCount,
        user_count: errorGroup.userCount,
        assigned_to: errorGroup.assignee
          ? {
              id: errorGroup.assignee.id,
              name: errorGroup.assignee.name,
              email: errorGroup.assignee.email,
              image: errorGroup.assignee.image,
            }
          : null,
        resolved_at: errorGroup.resolvedAt?.toISOString() || null,
        stack_trace: metadata?.stackTrace || null,
        ai_analysis: metadata?.aiAnalysis || null,
        ai_analyzed_at: metadata?.aiAnalyzedAt || null,
        metadata: metadata,
        created_at: errorGroup.createdAt.toISOString(),
        updated_at: errorGroup.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/errors/[errorId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/errors/[errorId] - Update error group status
export async function PATCH(
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

    const errorGroup = await db.query.errorGroups.findFirst({
      where: eq(errorGroups.id, params.errorId),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!errorGroup) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Error group not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check membership
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.orgId, errorGroup.service.project.orgId)
      ),
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { status, assigned_to } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (status) {
      if (!['unresolved', 'resolved', 'ignored'].includes(status)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid status', request_id: crypto.randomUUID() } },
          { status: 400 }
        );
      }
      updateData.status = status;
      if (status === 'resolved') {
        updateData.resolvedAt = new Date();
        updateData.resolvedBy = session.user.id;
      } else if (status === 'unresolved') {
        updateData.resolvedAt = null;
        updateData.resolvedBy = null;
      }
    }

    if (assigned_to !== undefined) {
      updateData.assignedTo = assigned_to || null;
    }

    const [updated] = await db
      .update(errorGroups)
      .set(updateData)
      .where(eq(errorGroups.id, params.errorId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        assigned_to: updated.assignedTo,
        resolved_at: updated.resolvedAt?.toISOString() || null,
        updated_at: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/errors/[errorId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
