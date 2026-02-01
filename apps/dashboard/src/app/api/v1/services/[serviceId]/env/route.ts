import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// Helper to check org access
async function checkOrgAccess(
  userId: string,
  orgId: string,
  allowedRoles: string[] = ['owner', 'admin', 'developer']
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

// Mask secret values - show only first/last 2 chars for long values
function maskValue(value: string, isSecret: boolean): string {
  if (!isSecret) return value;
  if (value.length <= 8) return '*'.repeat(value.length);
  return value.slice(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
}

// Parse env vars object into array format
function formatEnvVars(envVars: Record<string, string> | null, showSecrets: boolean = false): Array<{
  key: string;
  value: string;
  masked_value: string;
  is_secret: boolean;
}> {
  if (!envVars) return [];

  return Object.entries(envVars).map(([key, value]) => {
    // Consider keys with certain patterns as secrets
    const isSecret = /password|secret|key|token|api_key|private|credential/i.test(key);
    return {
      key,
      value: showSecrets ? value : (isSecret ? '' : value),
      masked_value: maskValue(value, isSecret),
      is_secret: isSecret,
    };
  });
}

// GET /api/v1/services/:serviceId/env - Get environment variables
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

    // Check org access - need at least developer role to view
    const access = await checkOrgAccess(session.user.id, service.project.orgId, ['owner', 'admin', 'developer', 'viewer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Only admin/owner can see secret values
    const canSeeSecrets = ['owner', 'admin'].includes(access.role);

    return NextResponse.json({
      success: true,
      data: {
        service_id: service.id,
        service_name: service.name,
        env_vars: formatEnvVars(service.envVars as Record<string, string> | null, canSeeSecrets),
        can_edit: ['owner', 'admin', 'developer'].includes(access.role),
        can_view_secrets: canSeeSecrets,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/services/:serviceId/env error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/services/:serviceId/env - Add environment variable(s)
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

    const body = await req.json();
    const { env_vars } = body as { env_vars: Array<{ key: string; value: string }> };

    if (!env_vars || !Array.isArray(env_vars) || env_vars.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'env_vars array is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Validate env var keys
    const invalidKeys = env_vars.filter(e => !e.key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key));
    if (invalidKeys.length > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid environment variable key format', request_id: crypto.randomUUID() } },
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

    // Check org access - need at least developer role to edit
    const access = await checkOrgAccess(session.user.id, service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Merge new env vars with existing
    const currentEnvVars = (service.envVars as Record<string, string>) || {};
    const newEnvVars = env_vars.reduce((acc, { key, value }) => {
      acc[key] = value;
      return acc;
    }, currentEnvVars);

    // Update service
    const [updated] = await db
      .update(services)
      .set({
        envVars: newEnvVars,
        updatedAt: new Date(),
      })
      .where(eq(services.id, params.serviceId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        service_id: updated.id,
        env_vars: formatEnvVars(updated.envVars as Record<string, string> | null, false),
        added_count: env_vars.length,
      },
    });
  } catch (error) {
    console.error('POST /api/v1/services/:serviceId/env error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/services/:serviceId/env - Update environment variable(s)
export async function PATCH(
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

    const body = await req.json();
    const { env_vars } = body as { env_vars: Array<{ key: string; value: string }> };

    if (!env_vars || !Array.isArray(env_vars)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'env_vars array is required', request_id: crypto.randomUUID() } },
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

    // Update only specified env vars
    const currentEnvVars = (service.envVars as Record<string, string>) || {};
    for (const { key, value } of env_vars) {
      if (key in currentEnvVars) {
        currentEnvVars[key] = value;
      }
    }

    // Update service
    const [updated] = await db
      .update(services)
      .set({
        envVars: currentEnvVars,
        updatedAt: new Date(),
      })
      .where(eq(services.id, params.serviceId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        service_id: updated.id,
        env_vars: formatEnvVars(updated.envVars as Record<string, string> | null, false),
        updated_count: env_vars.length,
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/services/:serviceId/env error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/services/:serviceId/env - Delete environment variable(s)
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
    const keysParam = searchParams.get('keys');

    if (!keysParam) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'keys query parameter is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const keysToDelete = keysParam.split(',').map(k => k.trim());

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

    // Remove specified env vars
    const currentEnvVars = (service.envVars as Record<string, string>) || {};
    let deletedCount = 0;
    for (const key of keysToDelete) {
      if (key in currentEnvVars) {
        delete currentEnvVars[key];
        deletedCount++;
      }
    }

    // Update service
    const [updated] = await db
      .update(services)
      .set({
        envVars: currentEnvVars,
        updatedAt: new Date(),
      })
      .where(eq(services.id, params.serviceId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        service_id: updated.id,
        deleted_keys: keysToDelete.filter(k => deletedCount > 0),
        deleted_count: deletedCount,
      },
    });
  } catch (error) {
    console.error('DELETE /api/v1/services/:serviceId/env error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
