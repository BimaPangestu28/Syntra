import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cronJobs, cronJobRuns, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
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

// Create cron job schema
const createCronJobSchema = z.object({
  org_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  server_id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  command: z.string().min(1),
  cron_expression: z.string().min(1).max(100),
  timezone: z.string().default('UTC'),
  timeout: z.number().int().min(1).max(86400).default(3600),
  retry_count: z.number().int().min(0).max(5).default(0),
  is_enabled: z.boolean().default(true),
});

// GET /api/v1/cron-jobs - List cron jobs
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

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const targetOrgIds = orgId && orgIds.includes(orgId) ? [orgId] : orgIds;

    const jobs = await db.query.cronJobs.findMany({
      where: (j, { and: andWhere, eq: eqWhere, inArray: inArrayWhere }) => {
        const conditions = [inArrayWhere(j.orgId, targetOrgIds)];
        if (serviceId) conditions.push(eqWhere(j.serviceId, serviceId));
        return andWhere(...conditions);
      },
      orderBy: [desc(cronJobs.createdAt)],
      with: {
        service: { columns: { id: true, name: true } },
        server: { columns: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: jobs.map(j => ({
        id: j.id,
        name: j.name,
        command: j.command,
        cron_expression: j.cronExpression,
        timezone: j.timezone,
        timeout: j.timeout,
        retry_count: j.retryCount,
        is_enabled: j.isEnabled,
        last_run_at: j.lastRunAt?.toISOString(),
        last_run_status: j.lastRunStatus,
        last_run_duration: j.lastRunDuration,
        next_run_at: j.nextRunAt?.toISOString(),
        service: j.service,
        server: j.server,
        created_at: j.createdAt.toISOString(),
        updated_at: j.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/cron-jobs error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/cron-jobs - Create cron job
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
    const parsed = createCronJobSchema.safeParse(body);

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

    const [job] = await db
      .insert(cronJobs)
      .values({
        orgId: parsed.data.org_id,
        serviceId: parsed.data.service_id,
        serverId: parsed.data.server_id,
        name: parsed.data.name,
        command: parsed.data.command,
        cronExpression: parsed.data.cron_expression,
        timezone: parsed.data.timezone,
        timeout: parsed.data.timeout,
        retryCount: parsed.data.retry_count,
        isEnabled: parsed.data.is_enabled,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: job.id,
          name: job.name,
          cron_expression: job.cronExpression,
          is_enabled: job.isEnabled,
          created_at: job.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/cron-jobs error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
