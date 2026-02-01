import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiKeys, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  expires_in_days: z.number().int().min(1).max(365).nullable().optional(),
});

// GET /api/v1/settings/api-keys
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const keys = await db.query.apiKeys.findMany({
      where: eq(apiKeys.userId, session.user.id),
      orderBy: [desc(apiKeys.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: keys.map((k) => ({
        id: k.id,
        name: k.name,
        key_prefix: k.keyPrefix,
        last_used_at: k.lastUsedAt?.toISOString() ?? null,
        expires_at: k.expiresAt?.toISOString() ?? null,
        created_at: k.createdAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/settings/api-keys error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/settings/api-keys
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
    const parsed = createApiKeySchema.safeParse(body);
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

    // Get user's first org
    const membership = await db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, session.user.id),
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'No organization found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const { name, expires_in_days } = parsed.data;

    // Generate API key
    const rawKey = `sk_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);

    let expiresAt: Date | undefined;
    if (expires_in_days) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expires_in_days);
    }

    const [apiKey] = await db
      .insert(apiKeys)
      .values({
        userId: session.user.id,
        orgId: membership.orgId,
        name,
        keyHash,
        keyPrefix,
        expiresAt,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: apiKey.id,
          name: apiKey.name,
          key: rawKey, // Only returned once
          key_prefix: apiKey.keyPrefix,
          expires_at: apiKey.expiresAt?.toISOString() ?? null,
          created_at: apiKey.createdAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/settings/api-keys error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
