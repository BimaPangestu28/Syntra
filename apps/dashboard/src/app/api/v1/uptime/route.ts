import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { uptimeMonitors, uptimeChecks, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray, gte } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Helper to get user's org IDs
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

// Create monitor schema
const createMonitorSchema = z.object({
  org_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'HEAD']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  expected_status_code: z.number().int().min(100).max(599).default(200),
  expected_response_contains: z.string().optional(),
  interval_seconds: z.number().int().min(30).max(3600).default(60),
  timeout_seconds: z.number().int().min(5).max(120).default(30),
  alert_after_failures: z.number().int().min(1).max(10).default(3),
  is_enabled: z.boolean().default(true),
});

// GET /api/v1/uptime - List uptime monitors
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
    const serviceId = searchParams.get('service_id');
    const status = searchParams.get('status');

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const targetOrgIds = orgId && orgIds.includes(orgId) ? [orgId] : orgIds;

    const monitors = await db.query.uptimeMonitors.findMany({
      where: (m, { and: andWhere, eq: eqWhere, inArray: inArrayWhere }) => {
        const conditions = [inArrayWhere(m.orgId, targetOrgIds)];
        if (serviceId) conditions.push(eqWhere(m.serviceId, serviceId));
        if (status) conditions.push(eqWhere(m.lastStatus, status));
        return andWhere(...conditions);
      },
      orderBy: [desc(uptimeMonitors.createdAt)],
      with: {
        service: { columns: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: monitors.map(m => ({
        id: m.id,
        name: m.name,
        url: m.url,
        method: m.method,
        expected_status_code: m.expectedStatusCode,
        interval_seconds: m.intervalSeconds,
        timeout_seconds: m.timeoutSeconds,
        is_enabled: m.isEnabled,
        last_check_at: m.lastCheckAt?.toISOString(),
        last_status: m.lastStatus,
        last_response_time: m.lastResponseTime,
        consecutive_failures: m.consecutiveFailures,
        alert_after_failures: m.alertAfterFailures,
        service: m.service,
        created_at: m.createdAt.toISOString(),
        updated_at: m.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/uptime error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/uptime - Create uptime monitor
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
    const parsed = createMonitorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.errors, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const hasAccess = await checkOrgAccess(session.user.id, parsed.data.org_id);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const [monitor] = await db
      .insert(uptimeMonitors)
      .values({
        orgId: parsed.data.org_id,
        serviceId: parsed.data.service_id,
        name: parsed.data.name,
        url: parsed.data.url,
        method: parsed.data.method,
        headers: parsed.data.headers,
        body: parsed.data.body,
        expectedStatusCode: parsed.data.expected_status_code,
        expectedResponseContains: parsed.data.expected_response_contains,
        intervalSeconds: parsed.data.interval_seconds,
        timeoutSeconds: parsed.data.timeout_seconds,
        alertAfterFailures: parsed.data.alert_after_failures,
        isEnabled: parsed.data.is_enabled,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: monitor.id,
          name: monitor.name,
          url: monitor.url,
          is_enabled: monitor.isEnabled,
          created_at: monitor.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/uptime error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
