import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { alerts, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray, or } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schemas
const createAlertSchema = z.object({
  org_id: z.string().uuid(),
  server_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  deployment_id: z.string().uuid().optional(),
  type: z.string().min(1).max(100),
  severity: z.enum(['info', 'warning', 'error', 'critical']).default('warning'),
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
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

// Helper to get user's org IDs
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// GET /api/v1/alerts - List alerts
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
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const serverId = searchParams.get('server_id');
    const serviceId = searchParams.get('service_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20', 10), 100);

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0, page, per_page: perPage },
      });
    }

    // Build query conditions
    const alertList = await db.query.alerts.findMany({
      where: (alerts, { and: andWhere, eq: eqWhere, inArray: inArrayWhere }) => {
        const conditions = [inArrayWhere(alerts.orgId, orgIds)];

        if (status) {
          conditions.push(eqWhere(alerts.status, status as any));
        }
        if (severity) {
          conditions.push(eqWhere(alerts.severity, severity as any));
        }
        if (serverId) {
          conditions.push(eqWhere(alerts.serverId, serverId));
        }
        if (serviceId) {
          conditions.push(eqWhere(alerts.serviceId, serviceId));
        }

        return andWhere(...conditions);
      },
      orderBy: [desc(alerts.createdAt)],
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        server: {
          columns: {
            id: true,
            name: true,
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

    // Get total count
    const countResult = await db.query.alerts.findMany({
      where: inArray(alerts.orgId, orgIds),
      columns: { id: true },
    });

    return NextResponse.json({
      success: true,
      data: alertList.map((a) => ({
        id: a.id,
        org_id: a.orgId,
        type: a.type,
        severity: a.severity,
        status: a.status,
        title: a.title,
        message: a.message,
        metadata: a.metadata,
        server: a.server ? { id: a.server.id, name: a.server.name } : null,
        service: a.service ? { id: a.service.id, name: a.service.name } : null,
        deployment: a.deployment ? { id: a.deployment.id, status: a.deployment.status } : null,
        acknowledged_at: a.acknowledgedAt?.toISOString(),
        acknowledged_by: a.acknowledger ? { id: a.acknowledger.id, name: a.acknowledger.name } : null,
        resolved_at: a.resolvedAt?.toISOString(),
        resolved_by: a.resolver ? { id: a.resolver.id, name: a.resolver.name } : null,
        created_at: a.createdAt?.toISOString(),
        updated_at: a.updatedAt?.toISOString(),
      })),
      meta: {
        total: countResult.length,
        page,
        per_page: perPage,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/alerts error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/alerts - Create new alert
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
    const parsed = createAlertSchema.safeParse(body);

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

    // Check org access
    const access = await checkOrgAccess(session.user.id, parsed.data.org_id, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Create alert
    const [alert] = await db
      .insert(alerts)
      .values({
        orgId: parsed.data.org_id,
        serverId: parsed.data.server_id,
        serviceId: parsed.data.service_id,
        deploymentId: parsed.data.deployment_id,
        type: parsed.data.type,
        severity: parsed.data.severity,
        status: 'active',
        title: parsed.data.title,
        message: parsed.data.message,
        metadata: parsed.data.metadata,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: alert.id,
          org_id: alert.orgId,
          type: alert.type,
          severity: alert.severity,
          status: alert.status,
          title: alert.title,
          message: alert.message,
          created_at: alert.createdAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/alerts error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
