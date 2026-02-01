import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { secrets, secretVersions, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';
import { encrypt, decrypt, maskSecret } from '@/lib/crypto';

// Request schema
const updateSecretSchema = z.object({
  value: z.string().min(1).optional(),
  description: z.string().optional(),
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

// GET /api/v1/vault/:vaultId - Get secret (with option to reveal value)
export async function GET(
  req: NextRequest,
  { params }: { params: { vaultId: string } }
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
    const reveal = searchParams.get('reveal') === 'true';

    const secret = await db.query.secrets.findFirst({
      where: eq(secrets.id, params.vaultId),
      with: {
        project: { columns: { id: true, name: true } },
        service: { columns: { id: true, name: true } },
        creator: { columns: { id: true, name: true } },
        versions: {
          orderBy: (v, { desc: d }) => [d(v.version)],
          limit: 10,
        },
      },
    });

    if (!secret) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Secret not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (need admin or higher to reveal)
    const requiredRoles = reveal ? ['owner', 'admin'] : ['owner', 'admin', 'developer', 'viewer'];
    const access = await checkOrgAccess(session.user.id, secret.orgId, requiredRoles);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const decryptedValue = decrypt(secret.encryptedValue);

    return NextResponse.json({
      success: true,
      data: {
        id: secret.id,
        org_id: secret.orgId,
        project_id: secret.projectId,
        service_id: secret.serviceId,
        name: secret.name,
        value: reveal ? decryptedValue : undefined,
        masked_value: maskSecret(decryptedValue),
        description: secret.description,
        key_version: secret.keyVersion,
        project: secret.project ? { id: secret.project.id, name: secret.project.name } : null,
        service: secret.service ? { id: secret.service.id, name: secret.service.name } : null,
        created_by: secret.creator ? { id: secret.creator.id, name: secret.creator.name } : null,
        versions: secret.versions.map((v) => ({
          version: v.version,
          created_at: v.createdAt?.toISOString(),
        })),
        created_at: secret.createdAt?.toISOString(),
        updated_at: secret.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/vault/:vaultId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/vault/:vaultId - Update secret
export async function PATCH(
  req: NextRequest,
  { params }: { params: { vaultId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const secret = await db.query.secrets.findFirst({
      where: eq(secrets.id, params.vaultId),
    });

    if (!secret) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Secret not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, secret.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateSecretSchema.safeParse(body);

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

    const { value, description } = parsed.data;
    const updateData: Partial<typeof secrets.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (description !== undefined) {
      updateData.description = description;
    }

    if (value) {
      // Create new version
      const latestVersion = await db.query.secretVersions.findFirst({
        where: eq(secretVersions.secretId, params.vaultId),
        orderBy: [desc(secretVersions.version)],
      });

      const newVersion = (latestVersion?.version || 0) + 1;
      const encryptedValue = encrypt(value);

      updateData.encryptedValue = encryptedValue;

      await db.insert(secretVersions).values({
        secretId: params.vaultId,
        version: newVersion,
        encryptedValue,
        keyVersion: secret.keyVersion,
        createdBy: session.user.id,
      });
    }

    const [updated] = await db
      .update(secrets)
      .set(updateData)
      .where(eq(secrets.id, params.vaultId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        masked_value: value ? maskSecret(value) : maskSecret(decrypt(updated.encryptedValue)),
        description: updated.description,
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/vault/:vaultId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/vault/:vaultId - Delete secret
export async function DELETE(
  req: NextRequest,
  { params }: { params: { vaultId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const secret = await db.query.secrets.findFirst({
      where: eq(secrets.id, params.vaultId),
    });

    if (!secret) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Secret not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (owner or admin only)
    const access = await checkOrgAccess(session.user.id, secret.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    await db.delete(secrets).where(eq(secrets.id, params.vaultId));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/v1/vault/:vaultId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
