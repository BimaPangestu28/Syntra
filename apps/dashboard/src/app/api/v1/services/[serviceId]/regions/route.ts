import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { serviceRegions, services, regions, organizationMembers, servers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Helper to check service access
async function checkServiceAccess(
  userId: string,
  serviceId: string
): Promise<{ hasAccess: boolean; service?: typeof services.$inferSelect }> {
  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
    with: {
      project: {
        columns: { orgId: true },
      },
    },
  });

  if (!service || !service.project) {
    return { hasAccess: false };
  }

  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, service.project.orgId)
    ),
  });

  return {
    hasAccess: !!membership && ['owner', 'admin', 'developer'].includes(membership.role),
    service,
  };
}

// Add region schema
const addRegionSchema = z.object({
  region_id: z.string().uuid(),
  server_id: z.string().uuid().optional(),
  is_primary: z.boolean().default(false),
  replicas: z.number().int().min(1).max(10).default(1),
});

// GET /api/v1/services/[serviceId]/regions - List service regions
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { serviceId } = await params;
    const { hasAccess } = await checkServiceAccess(session.user.id, serviceId);

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const serviceRegionList = await db.query.serviceRegions.findMany({
      where: eq(serviceRegions.serviceId, serviceId),
      with: {
        region: true,
        server: {
          columns: { id: true, name: true, status: true, publicIp: true },
        },
      },
      orderBy: [desc(serviceRegions.isPrimary), desc(serviceRegions.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: serviceRegionList.map(sr => ({
        id: sr.id,
        region: {
          id: sr.region.id,
          name: sr.region.name,
          display_name: sr.region.displayName,
          code: sr.region.code,
          provider: sr.region.provider,
          latitude: sr.region.latitude,
          longitude: sr.region.longitude,
        },
        server: sr.server ? {
          id: sr.server.id,
          name: sr.server.name,
          status: sr.server.status,
          public_ip: sr.server.publicIp,
        } : null,
        is_primary: sr.isPrimary,
        replicas: sr.replicas,
        status: sr.status,
        created_at: sr.createdAt.toISOString(),
        updated_at: sr.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/services/[serviceId]/regions error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/services/[serviceId]/regions - Deploy to a region
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { serviceId } = await params;
    const { hasAccess } = await checkServiceAccess(session.user.id, serviceId);

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = addRegionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.errors, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check region exists and is active
    const region = await db.query.regions.findFirst({
      where: and(
        eq(regions.id, parsed.data.region_id),
        eq(regions.isActive, true)
      ),
    });

    if (!region) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Region not found or inactive', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check if already deployed to this region
    const existing = await db.query.serviceRegions.findFirst({
      where: and(
        eq(serviceRegions.serviceId, serviceId),
        eq(serviceRegions.regionId, parsed.data.region_id)
      ),
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Service already deployed to this region', request_id: crypto.randomUUID() } },
        { status: 409 }
      );
    }

    // If setting as primary, unset existing primary
    if (parsed.data.is_primary) {
      await db
        .update(serviceRegions)
        .set({ isPrimary: false })
        .where(eq(serviceRegions.serviceId, serviceId));
    }

    const [serviceRegion] = await db
      .insert(serviceRegions)
      .values({
        serviceId,
        regionId: parsed.data.region_id,
        serverId: parsed.data.server_id,
        isPrimary: parsed.data.is_primary,
        replicas: parsed.data.replicas,
        status: 'pending',
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: serviceRegion.id,
          service_id: serviceRegion.serviceId,
          region_id: serviceRegion.regionId,
          server_id: serviceRegion.serverId,
          is_primary: serviceRegion.isPrimary,
          replicas: serviceRegion.replicas,
          status: serviceRegion.status,
          created_at: serviceRegion.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/services/[serviceId]/regions error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/services/[serviceId]/regions - Update region deployment
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { serviceId } = await params;
    const { hasAccess } = await checkServiceAccess(session.user.id, serviceId);

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { service_region_id, is_primary, replicas } = body;

    if (!service_region_id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'service_region_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const updates: Partial<{ isPrimary: boolean; replicas: number; updatedAt: Date }> = {
      updatedAt: new Date(),
    };

    if (typeof replicas === 'number') {
      updates.replicas = replicas;
    }

    if (is_primary === true) {
      // Unset existing primary
      await db
        .update(serviceRegions)
        .set({ isPrimary: false })
        .where(eq(serviceRegions.serviceId, serviceId));
      updates.isPrimary = true;
    } else if (is_primary === false) {
      updates.isPrimary = false;
    }

    const [updated] = await db
      .update(serviceRegions)
      .set(updates)
      .where(and(
        eq(serviceRegions.id, service_region_id),
        eq(serviceRegions.serviceId, serviceId)
      ))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service region not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        is_primary: updated.isPrimary,
        replicas: updated.replicas,
        status: updated.status,
        updated_at: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/services/[serviceId]/regions error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/services/[serviceId]/regions - Remove from region
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { serviceId } = await params;
    const { hasAccess } = await checkServiceAccess(session.user.id, serviceId);

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const serviceRegionId = searchParams.get('service_region_id');

    if (!serviceRegionId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'service_region_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check if it's the only region
    const regionCount = await db.query.serviceRegions.findMany({
      where: eq(serviceRegions.serviceId, serviceId),
      columns: { id: true },
    });

    if (regionCount.length <= 1) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Cannot remove last region deployment', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const deleted = await db
      .delete(serviceRegions)
      .where(and(
        eq(serviceRegions.id, serviceRegionId),
        eq(serviceRegions.serviceId, serviceId)
      ))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service region not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Service removed from region' },
    });
  } catch (error) {
    console.error('DELETE /api/v1/services/[serviceId]/regions error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
