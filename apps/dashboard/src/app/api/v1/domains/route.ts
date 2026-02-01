import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { domains, services, projects, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schemas
const createDomainSchema = z.object({
  service_id: z.string().uuid(),
  domain: z.string().min(1).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]$/, 'Invalid domain format'),
  is_primary: z.boolean().optional().default(false),
  ssl_enabled: z.boolean().optional().default(true),
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

// Helper to get user's org IDs
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// Generate verification token
function generateVerificationToken(): string {
  return `syntra-verify-${crypto.randomBytes(24).toString('hex')}`;
}

// GET /api/v1/domains - List domains
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
    const serviceId = searchParams.get('service_id');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '20', 10), 100);

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0, page, per_page: perPage },
      });
    }

    // Get domains with filters
    const domainList = await db.query.domains.findMany({
      where: (domains, { and: andWhere, eq: eqWhere }) => {
        const conditions = [];
        if (serviceId) {
          conditions.push(eqWhere(domains.serviceId, serviceId));
        }
        if (status) {
          conditions.push(eqWhere(domains.status, status as any));
        }
        return conditions.length > 0 ? andWhere(...conditions) : undefined;
      },
      orderBy: [desc(domains.createdAt)],
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        service: {
          with: {
            project: {
              columns: {
                id: true,
                name: true,
                orgId: true,
              },
            },
          },
        },
      },
    });

    // Filter by user's orgs
    const filtered = domainList.filter((d) => orgIds.includes(d.service.project.orgId));

    return NextResponse.json({
      success: true,
      data: filtered.map((d) => ({
        id: d.id,
        service_id: d.serviceId,
        domain: d.domain,
        is_primary: d.isPrimary,
        status: d.status,
        verification_method: d.verificationMethod,
        verification_token: d.verificationToken,
        verified_at: d.verifiedAt?.toISOString(),
        ssl_enabled: d.sslEnabled,
        ssl_status: d.sslStatus,
        ssl_expires_at: d.sslExpiresAt?.toISOString(),
        ssl_auto_renew: d.sslAutoRenew,
        error_message: d.errorMessage,
        service: {
          id: d.service.id,
          name: d.service.name,
          project: {
            id: d.service.project.id,
            name: d.service.project.name,
          },
        },
        created_at: d.createdAt?.toISOString(),
        updated_at: d.updatedAt?.toISOString(),
      })),
      meta: {
        total: filtered.length,
        page,
        per_page: perPage,
      },
    });
  } catch (error) {
    console.error('GET /api/v1/domains error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/domains - Add new domain
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
    const parsed = createDomainSchema.safeParse(body);

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

    // Get service with project
    const service = await db.query.services.findFirst({
      where: eq(services.id, parsed.data.service_id),
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

    // Check if domain already exists
    const existingDomain = await db.query.domains.findFirst({
      where: eq(domains.domain, parsed.data.domain.toLowerCase()),
    });

    if (existingDomain) {
      return NextResponse.json(
        { success: false, error: { code: 'DOMAIN_EXISTS', message: 'Domain already registered', request_id: crypto.randomUUID() } },
        { status: 409 }
      );
    }

    const verificationToken = generateVerificationToken();

    // Create domain record
    const [domain] = await db
      .insert(domains)
      .values({
        serviceId: parsed.data.service_id,
        domain: parsed.data.domain.toLowerCase(),
        isPrimary: parsed.data.is_primary,
        sslEnabled: parsed.data.ssl_enabled,
        verificationToken,
        verificationMethod: 'dns_txt',
        status: 'pending_verification',
        sslStatus: 'pending',
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: domain.id,
          service_id: domain.serviceId,
          domain: domain.domain,
          is_primary: domain.isPrimary,
          status: domain.status,
          verification_method: domain.verificationMethod,
          verification_token: domain.verificationToken,
          verification_instructions: {
            dns_txt: {
              record_type: 'TXT',
              host: '_syntra-verify',
              value: domain.verificationToken,
              ttl: 300,
            },
          },
          ssl_enabled: domain.sslEnabled,
          ssl_status: domain.sslStatus,
          created_at: domain.createdAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/domains error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
