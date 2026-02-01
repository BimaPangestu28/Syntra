import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimitRules, rateLimitLogs, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray, sql, gte } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Helper to get user's org IDs
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// Helper to check org admin access
async function checkOrgAccess(
  userId: string,
  orgId: string
): Promise<boolean> {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });
  return !!membership && ['owner', 'admin'].includes(membership.role);
}

// Create rate limit rule schema
const createRateLimitSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  endpoint: z.string().max(255).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  requests_per_window: z.number().int().min(1).max(100000),
  window_seconds: z.number().int().min(1).max(86400), // Max 1 day
  is_enabled: z.boolean().default(true),
});

// GET /api/v1/rate-limits - List rate limit rules
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
    const includeGlobal = searchParams.get('include_global') !== 'false';

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const targetOrgIds = orgId && orgIds.includes(orgId) ? [orgId] : orgIds;

    const rules = await db.query.rateLimitRules.findMany({
      where: (r, { and: andWhere, or: orWhere, inArray: inArrayWhere, eq: eqWhere }) => {
        if (includeGlobal) {
          return orWhere(
            inArrayWhere(r.orgId, targetOrgIds),
            eqWhere(r.isGlobal, true)
          );
        }
        return inArrayWhere(r.orgId, targetOrgIds);
      },
      orderBy: [desc(rateLimitRules.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: rules.map(r => ({
        id: r.id,
        org_id: r.orgId,
        name: r.name,
        endpoint: r.endpoint,
        method: r.method,
        requests_per_window: r.requestsPerWindow,
        window_seconds: r.windowSeconds,
        is_enabled: r.isEnabled,
        is_global: r.isGlobal,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/rate-limits error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/rate-limits - Create rate limit rule
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
    const parsed = createRateLimitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.errors, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const hasAccess = await checkOrgAccess(session.user.id, parsed.data.org_id);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const [rule] = await db
      .insert(rateLimitRules)
      .values({
        orgId: parsed.data.org_id,
        name: parsed.data.name,
        endpoint: parsed.data.endpoint,
        method: parsed.data.method,
        requestsPerWindow: parsed.data.requests_per_window,
        windowSeconds: parsed.data.window_seconds,
        isEnabled: parsed.data.is_enabled,
        isGlobal: false,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: rule.id,
          name: rule.name,
          endpoint: rule.endpoint,
          method: rule.method,
          requests_per_window: rule.requestsPerWindow,
          window_seconds: rule.windowSeconds,
          is_enabled: rule.isEnabled,
          created_at: rule.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/rate-limits error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/rate-limits - Update rate limit rule
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { rule_id, name, endpoint, method, requests_per_window, window_seconds, is_enabled } = body;

    if (!rule_id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'rule_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Get the rule and check ownership
    const rule = await db.query.rateLimitRules.findFirst({
      where: eq(rateLimitRules.id, rule_id),
    });

    if (!rule) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Rule not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    if (rule.isGlobal) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify global rules', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    if (rule.orgId) {
      const hasAccess = await checkOrgAccess(session.user.id, rule.orgId);
      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
          { status: 403 }
        );
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (endpoint !== undefined) updates.endpoint = endpoint;
    if (method !== undefined) updates.method = method;
    if (requests_per_window !== undefined) updates.requestsPerWindow = requests_per_window;
    if (window_seconds !== undefined) updates.windowSeconds = window_seconds;
    if (is_enabled !== undefined) updates.isEnabled = is_enabled;

    const [updated] = await db
      .update(rateLimitRules)
      .set(updates)
      .where(eq(rateLimitRules.id, rule_id))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        endpoint: updated.endpoint,
        method: updated.method,
        requests_per_window: updated.requestsPerWindow,
        window_seconds: updated.windowSeconds,
        is_enabled: updated.isEnabled,
        updated_at: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/rate-limits error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/rate-limits - Delete rate limit rule
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get('rule_id');

    if (!ruleId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'rule_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Get the rule and check ownership
    const rule = await db.query.rateLimitRules.findFirst({
      where: eq(rateLimitRules.id, ruleId),
    });

    if (!rule) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Rule not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    if (rule.isGlobal) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete global rules', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    if (rule.orgId) {
      const hasAccess = await checkOrgAccess(session.user.id, rule.orgId);
      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
          { status: 403 }
        );
      }
    }

    await db.delete(rateLimitRules).where(eq(rateLimitRules.id, ruleId));

    return NextResponse.json({
      success: true,
      data: { message: 'Rate limit rule deleted' },
    });
  } catch (error) {
    console.error('DELETE /api/v1/rate-limits error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
