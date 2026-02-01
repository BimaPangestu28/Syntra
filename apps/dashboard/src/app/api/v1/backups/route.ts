import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { backups, backupSchedules, organizationMembers } from '@/lib/db/schema';
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
  allowedRoles: string[] = ['owner', 'admin']
): Promise<boolean> {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });
  return !!membership && allowedRoles.includes(membership.role);
}

// Create backup schema
const createBackupSchema = z.object({
  org_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  database_id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  type: z.enum(['service', 'database', 'volume', 'full']),
  retention_days: z.number().int().min(1).max(365).default(30),
});

// GET /api/v1/backups - List backups
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
    const databaseId = searchParams.get('database_id');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const targetOrgIds = orgId && orgIds.includes(orgId) ? [orgId] : orgIds;

    const backupList = await db.query.backups.findMany({
      where: (b, { and: andWhere, eq: eqWhere, inArray: inArrayWhere }) => {
        const conditions = [inArrayWhere(b.orgId, targetOrgIds)];
        if (serviceId) conditions.push(eqWhere(b.serviceId, serviceId));
        if (databaseId) conditions.push(eqWhere(b.databaseId, databaseId));
        if (type) conditions.push(eqWhere(b.type, type as any));
        return andWhere(...conditions);
      },
      orderBy: [desc(backups.createdAt)],
      limit: Math.min(limit, 100),
      with: {
        service: { columns: { id: true, name: true } },
        database: { columns: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: backupList.map(b => ({
        id: b.id,
        name: b.name,
        type: b.type,
        status: b.status,
        size_mb: b.sizeMb,
        storage_path: b.storagePath,
        retention_days: b.retentionDays,
        expires_at: b.expiresAt?.toISOString(),
        started_at: b.startedAt?.toISOString(),
        completed_at: b.completedAt?.toISOString(),
        error_message: b.errorMessage,
        service: b.service,
        database: b.database,
        created_at: b.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/backups error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/backups - Create backup
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
    const parsed = createBackupSchema.safeParse(body);

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

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parsed.data.retention_days);

    const [backup] = await db
      .insert(backups)
      .values({
        orgId: parsed.data.org_id,
        serviceId: parsed.data.service_id,
        databaseId: parsed.data.database_id,
        name: parsed.data.name,
        type: parsed.data.type,
        status: 'pending',
        retentionDays: parsed.data.retention_days,
        expiresAt,
        createdBy: session.user.id,
      })
      .returning();

    // TODO: Queue backup job

    return NextResponse.json(
      {
        success: true,
        data: {
          id: backup.id,
          name: backup.name,
          type: backup.type,
          status: backup.status,
          expires_at: backup.expiresAt?.toISOString(),
          created_at: backup.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/backups error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
