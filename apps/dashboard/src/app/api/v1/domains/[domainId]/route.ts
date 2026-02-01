import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { domains, services, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Update schema
const updateDomainSchema = z.object({
  is_primary: z.boolean().optional(),
  ssl_enabled: z.boolean().optional(),
  ssl_auto_renew: z.boolean().optional(),
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

// GET /api/v1/domains/[domainId] - Get domain details
export async function GET(
  req: NextRequest,
  { params }: { params: { domainId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const domain = await db.query.domains.findFirst({
      where: eq(domains.id, params.domainId),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!domain) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Domain not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, domain.service.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: domain.id,
        service_id: domain.serviceId,
        domain: domain.domain,
        is_primary: domain.isPrimary,
        status: domain.status,
        verification_method: domain.verificationMethod,
        verification_token: domain.verificationToken,
        verified_at: domain.verifiedAt?.toISOString(),
        ssl_enabled: domain.sslEnabled,
        ssl_status: domain.sslStatus,
        ssl_expires_at: domain.sslExpiresAt?.toISOString(),
        ssl_issued_at: domain.sslIssuedAt?.toISOString(),
        ssl_auto_renew: domain.sslAutoRenew,
        last_checked_at: domain.lastCheckedAt?.toISOString(),
        error_message: domain.errorMessage,
        service: {
          id: domain.service.id,
          name: domain.service.name,
          project: {
            id: domain.service.project.id,
            name: domain.service.project.name,
          },
        },
        verification_instructions: domain.status === 'pending_verification' ? {
          dns_txt: {
            record_type: 'TXT',
            host: '_syntra-verify',
            value: domain.verificationToken,
            ttl: 300,
            full_record: `_syntra-verify.${domain.domain}`,
          },
        } : undefined,
        created_at: domain.createdAt?.toISOString(),
        updated_at: domain.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/domains/[domainId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/domains/[domainId] - Update domain
export async function PATCH(
  req: NextRequest,
  { params }: { params: { domainId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const domain = await db.query.domains.findFirst({
      where: eq(domains.id, params.domainId),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!domain) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Domain not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, domain.service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateDomainSchema.safeParse(body);

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

    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (parsed.data.is_primary !== undefined) {
      updates.isPrimary = parsed.data.is_primary;

      // If setting as primary, unset other domains for this service
      if (parsed.data.is_primary) {
        await db
          .update(domains)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(
            eq(domains.serviceId, domain.serviceId),
            eq(domains.isPrimary, true)
          ));
      }
    }

    if (parsed.data.ssl_enabled !== undefined) {
      updates.sslEnabled = parsed.data.ssl_enabled;
      if (parsed.data.ssl_enabled && domain.status === 'verified') {
        updates.sslStatus = 'pending'; // Trigger SSL issuance
      }
    }

    if (parsed.data.ssl_auto_renew !== undefined) {
      updates.sslAutoRenew = parsed.data.ssl_auto_renew;
    }

    const [updated] = await db
      .update(domains)
      .set(updates)
      .where(eq(domains.id, params.domainId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        domain: updated.domain,
        is_primary: updated.isPrimary,
        status: updated.status,
        ssl_enabled: updated.sslEnabled,
        ssl_status: updated.sslStatus,
        ssl_auto_renew: updated.sslAutoRenew,
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/domains/[domainId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/domains/[domainId] - Remove domain
export async function DELETE(
  req: NextRequest,
  { params }: { params: { domainId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const domain = await db.query.domains.findFirst({
      where: eq(domains.id, params.domainId),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!domain) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Domain not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, domain.service.project.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    await db.delete(domains).where(eq(domains.id, params.domainId));

    return NextResponse.json({
      success: true,
      message: 'Domain deleted successfully',
    });
  } catch (error) {
    console.error('DELETE /api/v1/domains/[domainId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
