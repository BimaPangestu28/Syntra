import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { secrets, secretVersions, projects, services, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';
import { encrypt, decrypt, maskSecret } from '@/lib/crypto';

// Request schemas
const createSecretSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  name: z.string().min(1).max(255).regex(/^[A-Z][A-Z0-9_]*$/, {
    message: 'Name must be uppercase with underscores (e.g., DATABASE_URL)',
  }),
  value: z.string().min(1),
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

// GET /api/v1/vault - List secrets (values are masked)
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
    const orgId = searchParams.get('org_id');
    const projectId = searchParams.get('project_id');
    const serviceId = searchParams.get('service_id');

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'org_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Build query conditions
    const conditions = [eq(secrets.orgId, orgId)];
    if (projectId) conditions.push(eq(secrets.projectId, projectId));
    if (serviceId) conditions.push(eq(secrets.serviceId, serviceId));

    const secretList = await db.query.secrets.findMany({
      where: and(...conditions),
      orderBy: [desc(secrets.createdAt)],
      with: {
        project: { columns: { id: true, name: true } },
        service: { columns: { id: true, name: true } },
        creator: { columns: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: secretList.map((s) => ({
        id: s.id,
        org_id: s.orgId,
        project_id: s.projectId,
        service_id: s.serviceId,
        name: s.name,
        masked_value: maskSecret(decrypt(s.encryptedValue)),
        description: s.description,
        key_version: s.keyVersion,
        project: s.project ? { id: s.project.id, name: s.project.name } : null,
        service: s.service ? { id: s.service.id, name: s.service.name } : null,
        created_by: s.creator ? { id: s.creator.id, name: s.creator.name } : null,
        created_at: s.createdAt?.toISOString(),
        updated_at: s.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/vault error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/vault - Create secret
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
    const parsed = createSecretSchema.safeParse(body);

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

    const { org_id, project_id, service_id, name, value, description } = parsed.data;

    // Check org access (need developer or higher)
    const access = await checkOrgAccess(session.user.id, org_id, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Validate project belongs to org if provided
    if (project_id) {
      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, project_id), eq(projects.orgId, org_id)),
      });
      if (!project) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Project not found', request_id: crypto.randomUUID() } },
          { status: 404 }
        );
      }
    }

    // Validate service belongs to project if provided
    if (service_id) {
      const service = await db.query.services.findFirst({
        where: eq(services.id, service_id),
        with: { project: true },
      });
      if (!service || service.project.orgId !== org_id) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
          { status: 404 }
        );
      }
    }

    // Check for duplicate
    const existingSecret = await db.query.secrets.findFirst({
      where: and(
        eq(secrets.orgId, org_id),
        eq(secrets.name, name),
        project_id ? eq(secrets.projectId, project_id) : undefined,
        service_id ? eq(secrets.serviceId, service_id) : undefined
      ),
    });

    if (existingSecret) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE', message: 'Secret with this name already exists', request_id: crypto.randomUUID() } },
        { status: 409 }
      );
    }

    // Encrypt and store
    const encryptedValue = encrypt(value);

    const [secret] = await db
      .insert(secrets)
      .values({
        orgId: org_id,
        projectId: project_id,
        serviceId: service_id,
        name,
        encryptedValue,
        keyVersion: 1,
        description,
        createdBy: session.user.id,
      })
      .returning();

    // Create initial version
    await db.insert(secretVersions).values({
      secretId: secret.id,
      version: 1,
      encryptedValue,
      keyVersion: 1,
      createdBy: session.user.id,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: secret.id,
          org_id: secret.orgId,
          project_id: secret.projectId,
          service_id: secret.serviceId,
          name: secret.name,
          masked_value: maskSecret(value),
          description: secret.description,
          created_at: secret.createdAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/vault error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
