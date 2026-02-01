import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { volumes, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schemas
const createVolumeSchema = z.object({
  org_id: z.string().uuid(),
  server_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(255),
  size_gb: z.number().int().min(1).max(10000),
  storage_class: z.string().max(100).optional().default('standard'),
  host_path: z.string().max(500).optional(),
  driver: z.string().max(100).optional().default('local'),
  driver_options: z.record(z.string()).optional(),
  labels: z.record(z.string()).optional().default({}),
});

// Helper to get user's organizations
async function getUserOrgs(userId: string) {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
    with: {
      organization: true,
    },
  });

  return memberships.map((m) => m.organization);
}

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

// GET /api/v1/volumes - List volumes
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
    const serverId = searchParams.get('server_id');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20', 10), 100);

    // If org_id specified, check access
    if (orgId) {
      const access = await checkOrgAccess(session.user.id, orgId);
      if (!access) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
          { status: 403 }
        );
      }
    }

    // Get user's organizations
    const userOrgs = orgId
      ? [{ id: orgId }]
      : await getUserOrgs(session.user.id);

    const orgIds = userOrgs.map((o) => o.id);

    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0, page, per_page: perPage },
      });
    }

    const volumeList = await db.query.volumes.findMany({
      where: (volumes, { inArray, and, eq: whereEq }) => {
        const conditions = [inArray(volumes.orgId, orgIds)];
        if (serverId) {
          conditions.push(whereEq(volumes.serverId, serverId));
        }
        if (status && status !== 'all') {
          conditions.push(whereEq(volumes.status, status as any));
        }
        return and(...conditions);
      },
      with: {
        server: true,
        serviceVolumes: {
          with: {
            service: true,
          },
        },
      },
      orderBy: [desc(volumes.createdAt)],
      limit: perPage,
      offset: (page - 1) * perPage,
    });

    return NextResponse.json({
      success: true,
      data: volumeList.map((v) => ({
        id: v.id,
        org_id: v.orgId,
        server_id: v.serverId,
        name: v.name,
        size_gb: v.sizeGb,
        storage_class: v.storageClass,
        status: v.status,
        host_path: v.hostPath,
        driver: v.driver,
        driver_options: v.driverOptions,
        labels: v.labels,
        server: v.server ? {
          id: v.server.id,
          name: v.server.name,
          status: v.server.status,
        } : null,
        attached_services: v.serviceVolumes.map((sv) => ({
          id: sv.id,
          service_id: sv.serviceId,
          service_name: sv.service.name,
          mount_path: sv.mountPath,
          sub_path: sv.subPath,
          read_only: sv.readOnly,
        })),
        created_at: v.createdAt?.toISOString(),
        updated_at: v.updatedAt?.toISOString(),
      })),
      meta: {
        total: volumeList.length,
        page,
        per_page: perPage,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/volumes error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/volumes - Create volume
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
    const parsed = createVolumeSchema.safeParse(body);

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

    const { org_id, server_id, name, size_gb, storage_class, host_path, driver, driver_options, labels } = parsed.data;

    // Check org access
    const access = await checkOrgAccess(session.user.id, org_id, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Create volume
    const [volume] = await db
      .insert(volumes)
      .values({
        orgId: org_id,
        serverId: server_id || null,
        name,
        sizeGb: size_gb,
        storageClass: storage_class,
        hostPath: host_path,
        driver,
        driverOptions: driver_options,
        labels,
        status: 'pending',
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: volume.id,
          org_id: volume.orgId,
          server_id: volume.serverId,
          name: volume.name,
          size_gb: volume.sizeGb,
          storage_class: volume.storageClass,
          status: volume.status,
          host_path: volume.hostPath,
          driver: volume.driver,
          driver_options: volume.driverOptions,
          labels: volume.labels,
          created_at: volume.createdAt?.toISOString(),
          updated_at: volume.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/volumes error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
