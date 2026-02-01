import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationChannels, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Request schemas
const createChannelSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: z.enum(['slack', 'discord', 'email', 'webhook', 'pagerduty']),
  config: z.object({
    webhook_url: z.string().url().optional(),
    email: z.string().email().optional(),
    slack_channel: z.string().optional(),
    pagerduty_key: z.string().optional(),
  }),
  is_enabled: z.boolean().optional().default(true),
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

// Mask sensitive values
function maskConfig(config: Record<string, any>): Record<string, any> {
  const masked = { ...config };
  if (masked.webhook_url) {
    masked.webhook_url = masked.webhook_url.substring(0, 30) + '...';
  }
  if (masked.pagerduty_key) {
    masked.pagerduty_key = '****' + masked.pagerduty_key.slice(-4);
  }
  return masked;
}

// GET /api/v1/notification-channels - List notification channels
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
    const type = searchParams.get('type');

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // Filter to specific org if provided
    const targetOrgIds = orgId && orgIds.includes(orgId) ? [orgId] : orgIds;

    const channels = await db.query.notificationChannels.findMany({
      where: (notificationChannels, { and: andWhere, eq: eqWhere, inArray: inArrayWhere }) => {
        const conditions = [inArrayWhere(notificationChannels.orgId, targetOrgIds)];

        if (type) {
          conditions.push(eqWhere(notificationChannels.type, type));
        }

        return andWhere(...conditions);
      },
      orderBy: [desc(notificationChannels.createdAt)],
      with: {
        organization: {
          columns: {
            id: true,
            name: true,
          },
        },
        creator: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: channels.map((c) => ({
        id: c.id,
        org_id: c.orgId,
        name: c.name,
        type: c.type,
        config: maskConfig(c.config as Record<string, any>),
        is_enabled: c.isEnabled,
        organization: c.organization ? { id: c.organization.id, name: c.organization.name } : null,
        created_by: c.creator ? { id: c.creator.id, name: c.creator.name } : null,
        created_at: c.createdAt?.toISOString(),
        updated_at: c.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/notification-channels error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/notification-channels - Create notification channel
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
    const parsed = createChannelSchema.safeParse(body);

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

    // Check org access
    const access = await checkOrgAccess(session.user.id, parsed.data.org_id, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Validate config based on type
    const config = parsed.data.config;
    switch (parsed.data.type) {
      case 'slack':
      case 'discord':
      case 'webhook':
        if (!config.webhook_url) {
          return NextResponse.json(
            { success: false, error: { code: 'VALIDATION_ERROR', message: 'webhook_url is required for this channel type', request_id: crypto.randomUUID() } },
            { status: 400 }
          );
        }
        break;
      case 'email':
        if (!config.email) {
          return NextResponse.json(
            { success: false, error: { code: 'VALIDATION_ERROR', message: 'email is required for email channel type', request_id: crypto.randomUUID() } },
            { status: 400 }
          );
        }
        break;
      case 'pagerduty':
        if (!config.pagerduty_key) {
          return NextResponse.json(
            { success: false, error: { code: 'VALIDATION_ERROR', message: 'pagerduty_key is required for PagerDuty channel type', request_id: crypto.randomUUID() } },
            { status: 400 }
          );
        }
        break;
    }

    // Create channel
    const [channel] = await db
      .insert(notificationChannels)
      .values({
        orgId: parsed.data.org_id,
        name: parsed.data.name,
        type: parsed.data.type,
        config: {
          webhookUrl: config.webhook_url,
          email: config.email,
          slackChannel: config.slack_channel,
          pagerdutyKey: config.pagerduty_key,
        },
        isEnabled: parsed.data.is_enabled,
        createdBy: session.user.id,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: channel.id,
          org_id: channel.orgId,
          name: channel.name,
          type: channel.type,
          is_enabled: channel.isEnabled,
          created_at: channel.createdAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/notification-channels error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
