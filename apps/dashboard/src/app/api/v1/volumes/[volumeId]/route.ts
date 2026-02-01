import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { volumes, organizationMembers, serviceVolumes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schema
const updateVolumeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  server_id: z.string().uuid().optional().nullable(),
  size_gb: z.number().int().min(1).max(10000).optional(),
  storage_class: z.string().max(100).optional(),
  status: z.enum(['pending', 'provisioning', 'available', 'in_use', 'error', 'deleting']).optional(),
  host_path: z.string().max(500).optional().nullable(),
  driver: z.string().max(100).optional(),
  driver_options: z.record(z.string()).optional(),
  labels: z.record(z.string()).optional(),
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

// GET /api/v1/volumes/:volumeId - Get volume details
export async function GET(
  req: NextRequest,
  { params }: { params: { volumeId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const volume = await db.query.volumes.findFirst({
      where: eq(volumes.id, params.volumeId),
      with: {
        server: true,
        serviceVolumes: {
          with: {
            service: true,
          },
        },
      },
    });

    if (!volume) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Volume not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, volume.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
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
        server: volume.server ? {
          id: volume.server.id,
          name: volume.server.name,
          status: volume.server.status,
        } : null,
        attached_services: volume.serviceVolumes.map((sv) => ({
          id: sv.id,
          service_id: sv.serviceId,
          service_name: sv.service.name,
          mount_path: sv.mountPath,
          sub_path: sv.subPath,
          read_only: sv.readOnly,
        })),
        created_at: volume.createdAt?.toISOString(),
        updated_at: volume.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/volumes/:volumeId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/volumes/:volumeId - Update volume
export async function PATCH(
  req: NextRequest,
  { params }: { params: { volumeId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const volume = await db.query.volumes.findFirst({
      where: eq(volumes.id, params.volumeId),
    });

    if (!volume) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Volume not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, volume.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateVolumeSchema.safeParse(body);

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

    const updateData: Partial<typeof volumes.$inferInsert> = {
      updatedAt: new Date(),
    };

    const { name, server_id, size_gb, storage_class, status, host_path, driver, driver_options, labels } = parsed.data;

    if (name !== undefined) updateData.name = name;
    if (server_id !== undefined) updateData.serverId = server_id;
    if (size_gb !== undefined) updateData.sizeGb = size_gb;
    if (storage_class !== undefined) updateData.storageClass = storage_class;
    if (status !== undefined) updateData.status = status;
    if (host_path !== undefined) updateData.hostPath = host_path;
    if (driver !== undefined) updateData.driver = driver;
    if (driver_options !== undefined) updateData.driverOptions = driver_options;
    if (labels !== undefined) updateData.labels = labels;

    const [updated] = await db
      .update(volumes)
      .set(updateData)
      .where(eq(volumes.id, params.volumeId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        org_id: updated.orgId,
        server_id: updated.serverId,
        name: updated.name,
        size_gb: updated.sizeGb,
        storage_class: updated.storageClass,
        status: updated.status,
        host_path: updated.hostPath,
        driver: updated.driver,
        driver_options: updated.driverOptions,
        labels: updated.labels,
        created_at: updated.createdAt?.toISOString(),
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/volumes/:volumeId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/volumes/:volumeId - Delete volume
export async function DELETE(
  req: NextRequest,
  { params }: { params: { volumeId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const volume = await db.query.volumes.findFirst({
      where: eq(volumes.id, params.volumeId),
      with: {
        serviceVolumes: true,
      },
    });

    if (!volume) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Volume not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, volume.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Check if volume is attached to any services
    if (volume.serviceVolumes.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VOLUME_IN_USE',
            message: 'Volume is attached to one or more services. Detach it first.',
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    // Delete volume
    await db.delete(volumes).where(eq(volumes.id, params.volumeId));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/v1/volumes/:volumeId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
