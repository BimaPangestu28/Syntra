import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { serviceDependencies, services, managedDatabases, organizationMembers, projects } from '@/lib/db/schema';
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

// Create dependency schema
const createDependencySchema = z.object({
  depends_on_service_id: z.string().uuid().optional(),
  depends_on_database_id: z.string().uuid().optional(),
  is_required: z.boolean().default(true),
  health_check_required: z.boolean().default(true),
  startup_order: z.number().int().min(0).max(100).default(0),
}).refine((data) => data.depends_on_service_id || data.depends_on_database_id, {
  message: 'Either depends_on_service_id or depends_on_database_id is required',
});

// GET /api/v1/services/[serviceId]/dependencies - List service dependencies
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

    const dependencies = await db.query.serviceDependencies.findMany({
      where: eq(serviceDependencies.serviceId, serviceId),
      with: {
        dependsOnService: {
          columns: { id: true, name: true, type: true, isActive: true },
        },
        dependsOnDatabase: {
          columns: { id: true, name: true, type: true, status: true },
        },
      },
      orderBy: [desc(serviceDependencies.startupOrder)],
    });

    return NextResponse.json({
      success: true,
      data: dependencies.map(d => ({
        id: d.id,
        depends_on_service: d.dependsOnService ? {
          id: d.dependsOnService.id,
          name: d.dependsOnService.name,
          type: d.dependsOnService.type,
          is_active: d.dependsOnService.isActive,
        } : null,
        depends_on_database: d.dependsOnDatabase ? {
          id: d.dependsOnDatabase.id,
          name: d.dependsOnDatabase.name,
          type: d.dependsOnDatabase.type,
          status: d.dependsOnDatabase.status,
        } : null,
        is_required: d.isRequired,
        health_check_required: d.healthCheckRequired,
        startup_order: d.startupOrder,
        created_at: d.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/services/[serviceId]/dependencies error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/services/[serviceId]/dependencies - Add a dependency
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
    const { hasAccess, service } = await checkServiceAccess(session.user.id, serviceId);

    if (!hasAccess || !service) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createDependencySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.errors, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Prevent self-dependency
    if (parsed.data.depends_on_service_id === serviceId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Service cannot depend on itself', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check for circular dependency
    if (parsed.data.depends_on_service_id) {
      const circularCheck = await db.query.serviceDependencies.findFirst({
        where: and(
          eq(serviceDependencies.serviceId, parsed.data.depends_on_service_id),
          eq(serviceDependencies.dependsOnServiceId, serviceId)
        ),
      });

      if (circularCheck) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Circular dependency detected', request_id: crypto.randomUUID() } },
          { status: 400 }
        );
      }
    }

    // Check for duplicate
    const existing = await db.query.serviceDependencies.findFirst({
      where: and(
        eq(serviceDependencies.serviceId, serviceId),
        parsed.data.depends_on_service_id
          ? eq(serviceDependencies.dependsOnServiceId, parsed.data.depends_on_service_id)
          : eq(serviceDependencies.dependsOnDatabaseId, parsed.data.depends_on_database_id!)
      ),
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Dependency already exists', request_id: crypto.randomUUID() } },
        { status: 409 }
      );
    }

    const [dependency] = await db
      .insert(serviceDependencies)
      .values({
        serviceId,
        dependsOnServiceId: parsed.data.depends_on_service_id,
        dependsOnDatabaseId: parsed.data.depends_on_database_id,
        isRequired: parsed.data.is_required,
        healthCheckRequired: parsed.data.health_check_required,
        startupOrder: parsed.data.startup_order,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: dependency.id,
          service_id: dependency.serviceId,
          depends_on_service_id: dependency.dependsOnServiceId,
          depends_on_database_id: dependency.dependsOnDatabaseId,
          is_required: dependency.isRequired,
          health_check_required: dependency.healthCheckRequired,
          startup_order: dependency.startupOrder,
          created_at: dependency.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/services/[serviceId]/dependencies error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/services/[serviceId]/dependencies - Remove a dependency
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
    const dependencyId = searchParams.get('dependency_id');

    if (!dependencyId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'dependency_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const deleted = await db
      .delete(serviceDependencies)
      .where(and(
        eq(serviceDependencies.id, dependencyId),
        eq(serviceDependencies.serviceId, serviceId)
      ))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Dependency not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Dependency removed' },
    });
  } catch (error) {
    console.error('DELETE /api/v1/services/[serviceId]/dependencies error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
