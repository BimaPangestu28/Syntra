import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { domains, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { issueCertificate } from '@/lib/ssl';

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

// GET /api/v1/domains/[domainId]/ssl - Get SSL status
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

    // Calculate days until expiration
    let daysUntilExpiration: number | null = null;
    if (domain.sslExpiresAt) {
      const now = new Date();
      const diff = domain.sslExpiresAt.getTime() - now.getTime();
      daysUntilExpiration = Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    return NextResponse.json({
      success: true,
      data: {
        enabled: domain.sslEnabled,
        status: domain.sslStatus,
        issued_at: domain.sslIssuedAt?.toISOString(),
        expires_at: domain.sslExpiresAt?.toISOString(),
        days_until_expiration: daysUntilExpiration,
        auto_renew: domain.sslAutoRenew,
        is_expiring_soon: daysUntilExpiration !== null && daysUntilExpiration <= 30,
        error_message: domain.sslStatus === 'failed' ? domain.errorMessage : undefined,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/domains/[domainId]/ssl error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/domains/[domainId]/ssl - Issue/renew SSL certificate
export async function POST(
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

    // Check if domain is verified
    if (domain.status !== 'verified' && domain.status !== 'active') {
      return NextResponse.json(
        { success: false, error: { code: 'DOMAIN_NOT_VERIFIED', message: 'Domain must be verified before issuing SSL certificate', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check if already issuing
    if (domain.sslStatus === 'issuing') {
      return NextResponse.json(
        { success: false, error: { code: 'SSL_ISSUING', message: 'SSL certificate is already being issued', request_id: crypto.randomUUID() } },
        { status: 409 }
      );
    }

    // Trigger certificate issuance asynchronously
    // Don't await - let it run in background
    issueCertificate(params.domainId).catch(err => {
      console.error(`[SSL] Certificate issuance failed for ${domain.domain}:`, err);
    });

    console.log(`[SSL] Initiated certificate issuance for domain: ${domain.domain}`);

    return NextResponse.json({
      success: true,
      data: {
        status: 'issuing',
        message: 'SSL certificate issuance initiated. This may take a few minutes.',
        domain: domain.domain,
      },
    });
  } catch (error) {
    console.error('POST /api/v1/domains/[domainId]/ssl error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/domains/[domainId]/ssl - Disable SSL
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

    // Disable SSL
    await db
      .update(domains)
      .set({
        sslEnabled: false,
        sslStatus: 'pending',
        sslCertificate: null,
        sslPrivateKey: null,
        sslChain: null,
        sslExpiresAt: null,
        sslIssuedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, params.domainId));

    return NextResponse.json({
      success: true,
      message: 'SSL disabled successfully',
    });
  } catch (error) {
    console.error('DELETE /api/v1/domains/[domainId]/ssl error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
