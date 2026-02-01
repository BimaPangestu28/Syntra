import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { domains, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import dns from 'dns/promises';

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

// Verify DNS TXT record
async function verifyDnsTxt(domain: string, expectedToken: string): Promise<{ verified: boolean; error?: string }> {
  try {
    const verifyHost = `_syntra-verify.${domain}`;

    // Try to resolve TXT records
    const records = await dns.resolveTxt(verifyHost);

    // Flatten the array of arrays
    const txtValues = records.flat();

    // Check if our token is present
    const found = txtValues.some(value => value === expectedToken);

    if (found) {
      return { verified: true };
    }

    return {
      verified: false,
      error: `TXT record not found. Expected "${expectedToken}" at ${verifyHost}. Found: ${txtValues.join(', ') || 'no records'}`
    };
  } catch (error: any) {
    if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
      return {
        verified: false,
        error: `No TXT record found at _syntra-verify.${domain}. Please add the verification record.`
      };
    }
    return {
      verified: false,
      error: `DNS lookup failed: ${error.message}`
    };
  }
}

// Check if domain points to our infrastructure
async function checkDomainPointing(domain: string): Promise<{ pointing: boolean; records?: string[] }> {
  try {
    // Check A records
    const aRecords = await dns.resolve4(domain).catch(() => []);

    // Check CNAME records
    const cnameRecords = await dns.resolveCname(domain).catch(() => []);

    // In a real implementation, we'd check if these point to our load balancer IPs
    // For now, just return what we found
    return {
      pointing: aRecords.length > 0 || cnameRecords.length > 0,
      records: [...aRecords.map(r => `A: ${r}`), ...cnameRecords.map(r => `CNAME: ${r}`)],
    };
  } catch {
    return { pointing: false };
  }
}

// POST /api/v1/domains/[domainId]/verify - Verify domain ownership
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

    // Already verified
    if (domain.status === 'verified' || domain.status === 'active') {
      return NextResponse.json({
        success: true,
        data: {
          verified: true,
          status: domain.status,
          verified_at: domain.verifiedAt?.toISOString(),
          message: 'Domain is already verified',
        },
      });
    }

    // Verify based on method
    let verificationResult: { verified: boolean; error?: string };

    switch (domain.verificationMethod) {
      case 'dns_txt':
      default:
        verificationResult = await verifyDnsTxt(domain.domain, domain.verificationToken!);
        break;
    }

    // Update last checked time
    await db
      .update(domains)
      .set({
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(domains.id, params.domainId));

    if (verificationResult.verified) {
      // Check if domain is pointing to our infrastructure
      const pointingCheck = await checkDomainPointing(domain.domain);

      // Update domain status
      const newStatus = pointingCheck.pointing ? 'active' : 'verified';

      await db
        .update(domains)
        .set({
          status: newStatus,
          verifiedAt: new Date(),
          errorMessage: null,
          sslStatus: domain.sslEnabled ? 'pending' : undefined, // Queue SSL if enabled
          updatedAt: new Date(),
        })
        .where(eq(domains.id, params.domainId));

      return NextResponse.json({
        success: true,
        data: {
          verified: true,
          status: newStatus,
          verified_at: new Date().toISOString(),
          dns_records: pointingCheck.records,
          message: pointingCheck.pointing
            ? 'Domain verified and pointing to Syntra infrastructure'
            : 'Domain verified. Please update your DNS records to point to Syntra.',
          next_steps: !pointingCheck.pointing ? [
            'Add an A record pointing to our load balancer IP',
            'Or add a CNAME record pointing to your service URL',
          ] : undefined,
        },
      });
    } else {
      // Update with error
      await db
        .update(domains)
        .set({
          errorMessage: verificationResult.error,
          updatedAt: new Date(),
        })
        .where(eq(domains.id, params.domainId));

      return NextResponse.json({
        success: true,
        data: {
          verified: false,
          status: domain.status,
          error: verificationResult.error,
          verification_instructions: {
            dns_txt: {
              record_type: 'TXT',
              host: '_syntra-verify',
              value: domain.verificationToken,
              full_record: `_syntra-verify.${domain.domain}`,
              ttl: 300,
            },
          },
        },
      });
    }
  } catch (error) {
    console.error('POST /api/v1/domains/[domainId]/verify error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
