import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { uptimeMonitors, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';
import { rescheduleMonitor, unscheduleMonitor } from '@/lib/cron/uptime-scheduler';

async function checkOrgAccess(
  userId: string,
  orgId: string,
  allowedRoles: string[] = ['owner', 'admin', 'developer']
): Promise<boolean> {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });
  return !!membership && allowedRoles.includes(membership.role);
}

const updateMonitorSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'HEAD']).optional(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  expected_status_code: z.number().int().min(100).max(599).optional(),
  expected_response_contains: z.string().optional(),
  interval_seconds: z.number().int().min(30).max(3600).optional(),
  timeout_seconds: z.number().int().min(5).max(120).optional(),
  alert_after_failures: z.number().int().min(1).max(10).optional(),
  is_enabled: z.boolean().optional(),
});

// GET /api/v1/uptime/[monitorId] - Get single monitor
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { monitorId } = await params;
    const monitor = await db.query.uptimeMonitors.findFirst({
      where: eq(uptimeMonitors.id, monitorId),
      with: {
        service: { columns: { id: true, name: true } },
      },
    });

    if (!monitor) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Monitor not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const hasAccess = await checkOrgAccess(session.user.id, monitor.orgId, ['owner', 'admin', 'developer', 'viewer']);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: monitor.id,
        name: monitor.name,
        url: monitor.url,
        method: monitor.method,
        headers: monitor.headers,
        body: monitor.body,
        expected_status_code: monitor.expectedStatusCode,
        expected_response_contains: monitor.expectedResponseContains,
        interval_seconds: monitor.intervalSeconds,
        timeout_seconds: monitor.timeoutSeconds,
        is_enabled: monitor.isEnabled,
        last_check_at: monitor.lastCheckAt?.toISOString(),
        last_status: monitor.lastStatus,
        last_response_time: monitor.lastResponseTime,
        consecutive_failures: monitor.consecutiveFailures,
        alert_after_failures: monitor.alertAfterFailures,
        service: monitor.service,
        created_at: monitor.createdAt.toISOString(),
        updated_at: monitor.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/uptime/[monitorId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/uptime/[monitorId] - Update monitor
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { monitorId } = await params;
    const monitor = await db.query.uptimeMonitors.findFirst({
      where: eq(uptimeMonitors.id, monitorId),
    });

    if (!monitor) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Monitor not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const hasAccess = await checkOrgAccess(session.user.id, monitor.orgId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateMonitorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.errors, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.url !== undefined) updates.url = parsed.data.url;
    if (parsed.data.method !== undefined) updates.method = parsed.data.method;
    if (parsed.data.headers !== undefined) updates.headers = parsed.data.headers;
    if (parsed.data.body !== undefined) updates.body = parsed.data.body;
    if (parsed.data.expected_status_code !== undefined) updates.expectedStatusCode = parsed.data.expected_status_code;
    if (parsed.data.expected_response_contains !== undefined) updates.expectedResponseContains = parsed.data.expected_response_contains;
    if (parsed.data.interval_seconds !== undefined) updates.intervalSeconds = parsed.data.interval_seconds;
    if (parsed.data.timeout_seconds !== undefined) updates.timeoutSeconds = parsed.data.timeout_seconds;
    if (parsed.data.alert_after_failures !== undefined) updates.alertAfterFailures = parsed.data.alert_after_failures;
    if (parsed.data.is_enabled !== undefined) updates.isEnabled = parsed.data.is_enabled;

    const [updated] = await db
      .update(uptimeMonitors)
      .set(updates)
      .where(eq(uptimeMonitors.id, monitorId))
      .returning();

    // Reschedule the monitor with BullMQ
    await rescheduleMonitor(monitorId);

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        url: updated.url,
        is_enabled: updated.isEnabled,
        updated_at: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/uptime/[monitorId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/uptime/[monitorId] - Delete monitor
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { monitorId } = await params;
    const monitor = await db.query.uptimeMonitors.findFirst({
      where: eq(uptimeMonitors.id, monitorId),
    });

    if (!monitor) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Monitor not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const hasAccess = await checkOrgAccess(session.user.id, monitor.orgId, ['owner', 'admin']);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Unschedule from BullMQ
    await unscheduleMonitor(monitorId);

    await db.delete(uptimeMonitors).where(eq(uptimeMonitors.id, monitorId));

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('DELETE /api/v1/uptime/[monitorId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
