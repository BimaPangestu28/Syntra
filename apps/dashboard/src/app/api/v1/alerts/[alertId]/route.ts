import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { alerts, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Update schema
const updateAlertSchema = z.object({
  action: z.enum(['acknowledge', 'resolve', 'reopen']),
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

// GET /api/v1/alerts/[alertId] - Get alert details
export async function GET(
  req: NextRequest,
  { params }: { params: { alertId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const alert = await db.query.alerts.findFirst({
      where: eq(alerts.id, params.alertId),
      with: {
        organization: {
          columns: {
            id: true,
            name: true,
          },
        },
        server: {
          columns: {
            id: true,
            name: true,
            status: true,
          },
        },
        service: {
          columns: {
            id: true,
            name: true,
          },
        },
        deployment: {
          columns: {
            id: true,
            status: true,
            gitBranch: true,
            gitCommitSha: true,
          },
        },
        acknowledger: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        resolver: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!alert) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Alert not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, alert.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: alert.id,
        org_id: alert.orgId,
        type: alert.type,
        severity: alert.severity,
        status: alert.status,
        title: alert.title,
        message: alert.message,
        metadata: alert.metadata,
        organization: alert.organization ? { id: alert.organization.id, name: alert.organization.name } : null,
        server: alert.server ? { id: alert.server.id, name: alert.server.name, status: alert.server.status } : null,
        service: alert.service ? { id: alert.service.id, name: alert.service.name } : null,
        deployment: alert.deployment ? {
          id: alert.deployment.id,
          status: alert.deployment.status,
          git_branch: alert.deployment.gitBranch,
          git_commit_sha: alert.deployment.gitCommitSha,
        } : null,
        acknowledged_at: alert.acknowledgedAt?.toISOString(),
        acknowledged_by: alert.acknowledger ? {
          id: alert.acknowledger.id,
          name: alert.acknowledger.name,
          email: alert.acknowledger.email,
        } : null,
        resolved_at: alert.resolvedAt?.toISOString(),
        resolved_by: alert.resolver ? {
          id: alert.resolver.id,
          name: alert.resolver.name,
          email: alert.resolver.email,
        } : null,
        created_at: alert.createdAt?.toISOString(),
        updated_at: alert.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/alerts/[alertId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/alerts/[alertId] - Update alert status (acknowledge/resolve/reopen)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { alertId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const alert = await db.query.alerts.findFirst({
      where: eq(alerts.id, params.alertId),
    });

    if (!alert) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Alert not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, alert.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateAlertSchema.safeParse(body);

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

    const updates: Record<string, any> = { updatedAt: new Date() };

    switch (parsed.data.action) {
      case 'acknowledge':
        if (alert.status === 'resolved') {
          return NextResponse.json(
            { success: false, error: { code: 'INVALID_STATE', message: 'Cannot acknowledge a resolved alert', request_id: crypto.randomUUID() } },
            { status: 400 }
          );
        }
        updates.status = 'acknowledged';
        updates.acknowledgedAt = new Date();
        updates.acknowledgedBy = session.user.id;
        break;

      case 'resolve':
        updates.status = 'resolved';
        updates.resolvedAt = new Date();
        updates.resolvedBy = session.user.id;
        break;

      case 'reopen':
        if (alert.status !== 'resolved') {
          return NextResponse.json(
            { success: false, error: { code: 'INVALID_STATE', message: 'Can only reopen resolved alerts', request_id: crypto.randomUUID() } },
            { status: 400 }
          );
        }
        updates.status = 'active';
        updates.resolvedAt = null;
        updates.resolvedBy = null;
        break;
    }

    const [updated] = await db
      .update(alerts)
      .set(updates)
      .where(eq(alerts.id, params.alertId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        acknowledged_at: updated.acknowledgedAt?.toISOString(),
        resolved_at: updated.resolvedAt?.toISOString(),
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/alerts/[alertId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/alerts/[alertId] - Delete alert
export async function DELETE(
  req: NextRequest,
  { params }: { params: { alertId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const alert = await db.query.alerts.findFirst({
      where: eq(alerts.id, params.alertId),
    });

    if (!alert) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Alert not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access - only admins can delete
    const access = await checkOrgAccess(session.user.id, alert.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    await db.delete(alerts).where(eq(alerts.id, params.alertId));

    return NextResponse.json({
      success: true,
      message: 'Alert deleted successfully',
    });
  } catch (error) {
    console.error('DELETE /api/v1/alerts/[alertId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
