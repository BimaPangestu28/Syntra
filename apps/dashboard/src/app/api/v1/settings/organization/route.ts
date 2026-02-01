import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { organizations, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  logo: z.string().url().nullable().optional(),
});

async function getUserMembership(userId: string) {
  return db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, userId),
    with: {
      organization: true,
    },
  });
}

// GET /api/v1/settings/organization
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const membership = await getUserMembership(session.user.id);
    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'No organization found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const org = membership.organization;
    return NextResponse.json({
      success: true,
      data: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logo: org.logo,
        plan: org.plan,
        role: membership.role,
        created_at: org.createdAt?.toISOString(),
        updated_at: org.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/settings/organization error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/settings/organization
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const membership = await getUserMembership(session.user.id);
    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'No organization found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Only owners and admins can update organization settings', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateOrgSchema.safeParse(body);
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

    const { name, slug, logo } = parsed.data;

    // Check slug uniqueness if changing
    if (slug && slug !== membership.organization.slug) {
      const existing = await db.query.organizations.findFirst({
        where: eq(organizations.slug, slug),
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: { code: 'SLUG_TAKEN', message: 'This slug is already taken', request_id: crypto.randomUUID() } },
          { status: 400 }
        );
      }
    }

    const updateData: Partial<typeof organizations.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (logo !== undefined) updateData.logo = logo;

    const [updated] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, membership.organization.id))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        logo: updated.logo,
        plan: updated.plan,
        created_at: updated.createdAt?.toISOString(),
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/settings/organization error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
