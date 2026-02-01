import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, projects, volumes, serviceVolumes, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schema for attaching a volume
const attachVolumeSchema = z.object({
  volume_id: z.string().uuid(),
  mount_path: z.string().min(1).max(500),
  sub_path: z.string().max(500).optional(),
  read_only: z.boolean().optional().default(false),
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

// GET /api/v1/services/:serviceId/volumes - List attached volumes
export async function GET(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, service.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Get attached volumes
    const attachedVolumes = await db.query.serviceVolumes.findMany({
      where: eq(serviceVolumes.serviceId, params.serviceId),
      with: {
        volume: {
          with: {
            server: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: attachedVolumes.map((sv) => ({
        id: sv.id,
        volume_id: sv.volumeId,
        mount_path: sv.mountPath,
        sub_path: sv.subPath,
        read_only: sv.readOnly,
        volume: {
          id: sv.volume.id,
          name: sv.volume.name,
          size_gb: sv.volume.sizeGb,
          status: sv.volume.status,
          storage_class: sv.volume.storageClass,
          server: sv.volume.server ? {
            id: sv.volume.server.id,
            name: sv.volume.server.name,
          } : null,
        },
        created_at: sv.createdAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/services/:serviceId/volumes error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/services/:serviceId/volumes - Attach volume to service
export async function POST(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = attachVolumeSchema.safeParse(body);

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

    const { volume_id, mount_path, sub_path, read_only } = parsed.data;

    // Verify volume exists and belongs to same org
    const volume = await db.query.volumes.findFirst({
      where: eq(volumes.id, volume_id),
    });

    if (!volume) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Volume not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    if (volume.orgId !== service.project.orgId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Volume belongs to a different organization', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Check if already attached
    const existing = await db.query.serviceVolumes.findFirst({
      where: and(
        eq(serviceVolumes.serviceId, params.serviceId),
        eq(serviceVolumes.volumeId, volume_id)
      ),
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_ATTACHED', message: 'Volume is already attached to this service', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check if mount path is already used
    const mountPathConflict = await db.query.serviceVolumes.findFirst({
      where: and(
        eq(serviceVolumes.serviceId, params.serviceId),
        eq(serviceVolumes.mountPath, mount_path)
      ),
    });

    if (mountPathConflict) {
      return NextResponse.json(
        { success: false, error: { code: 'MOUNT_PATH_CONFLICT', message: 'Mount path is already used by another volume', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Create attachment
    const [attachment] = await db
      .insert(serviceVolumes)
      .values({
        serviceId: params.serviceId,
        volumeId: volume_id,
        mountPath: mount_path,
        subPath: sub_path,
        readOnly: read_only,
      })
      .returning();

    // Update volume status to in_use
    await db
      .update(volumes)
      .set({ status: 'in_use', updatedAt: new Date() })
      .where(eq(volumes.id, volume_id));

    return NextResponse.json(
      {
        success: true,
        data: {
          id: attachment.id,
          volume_id: attachment.volumeId,
          mount_path: attachment.mountPath,
          sub_path: attachment.subPath,
          read_only: attachment.readOnly,
          created_at: attachment.createdAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/services/:serviceId/volumes error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/services/:serviceId/volumes?volume_id=xxx - Detach volume
export async function DELETE(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const volumeId = searchParams.get('volume_id');

    if (!volumeId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'volume_id query parameter is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Find and delete attachment
    const attachment = await db.query.serviceVolumes.findFirst({
      where: and(
        eq(serviceVolumes.serviceId, params.serviceId),
        eq(serviceVolumes.volumeId, volumeId)
      ),
    });

    if (!attachment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Volume is not attached to this service', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    await db.delete(serviceVolumes).where(eq(serviceVolumes.id, attachment.id));

    // Check if volume is still attached to other services
    const otherAttachments = await db.query.serviceVolumes.findMany({
      where: eq(serviceVolumes.volumeId, volumeId),
    });

    // Update volume status if not attached to any service
    if (otherAttachments.length === 0) {
      await db
        .update(volumes)
        .set({ status: 'available', updatedAt: new Date() })
        .where(eq(volumes.id, volumeId));
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/v1/services/:serviceId/volumes error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
