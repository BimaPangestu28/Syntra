import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { managedDatabases, organizationMembers } from '@/lib/db/schema';
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

// Create database schema
const createDatabaseSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  server_id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  type: z.enum(['postgresql', 'mysql', 'redis', 'mongodb']),
  version: z.string().optional(),
  storage_size_mb: z.number().int().min(256).max(102400).default(1024),
  max_connections: z.number().int().min(10).max(1000).default(100),
  backup_enabled: z.boolean().default(true),
  backup_schedule: z.string().optional(),
});

// GET /api/v1/databases - List managed databases
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
    const projectId = searchParams.get('project_id');
    const type = searchParams.get('type');

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const targetOrgIds = orgId && orgIds.includes(orgId) ? [orgId] : orgIds;

    const databases = await db.query.managedDatabases.findMany({
      where: (db, { and: andWhere, eq: eqWhere, inArray: inArrayWhere }) => {
        const conditions = [inArrayWhere(db.orgId, targetOrgIds)];
        if (projectId) conditions.push(eqWhere(db.projectId, projectId));
        if (type) conditions.push(eqWhere(db.type, type as any));
        return andWhere(...conditions);
      },
      orderBy: [desc(managedDatabases.createdAt)],
      with: {
        project: { columns: { id: true, name: true } },
        server: { columns: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: databases.map(d => ({
        id: d.id,
        org_id: d.orgId,
        project_id: d.projectId,
        server_id: d.serverId,
        name: d.name,
        type: d.type,
        version: d.version,
        host: d.host,
        port: d.port,
        database_name: d.databaseName,
        status: d.status,
        storage_size_mb: d.storageSizeMb,
        max_connections: d.maxConnections,
        backup_enabled: d.backupEnabled,
        project: d.project,
        server: d.server,
        created_at: d.createdAt.toISOString(),
        updated_at: d.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/databases error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/databases - Create managed database
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
    const parsed = createDatabaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.errors, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const hasAccess = await checkOrgAccess(session.user.id, parsed.data.org_id, ['owner', 'admin']);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Generate credentials
    const username = `db_${crypto.randomBytes(4).toString('hex')}`;
    const password = crypto.randomBytes(16).toString('base64url');
    const databaseName = parsed.data.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    const [database] = await db
      .insert(managedDatabases)
      .values({
        orgId: parsed.data.org_id,
        projectId: parsed.data.project_id,
        serverId: parsed.data.server_id,
        name: parsed.data.name,
        type: parsed.data.type,
        version: parsed.data.version,
        username,
        databaseName,
        storageSizeMb: parsed.data.storage_size_mb,
        maxConnections: parsed.data.max_connections,
        backupEnabled: parsed.data.backup_enabled,
        backupSchedule: parsed.data.backup_schedule,
        status: 'provisioning',
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: database.id,
          name: database.name,
          type: database.type,
          status: database.status,
          credentials: {
            username,
            password, // Only returned on creation
            database_name: databaseName,
          },
          created_at: database.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/databases error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
