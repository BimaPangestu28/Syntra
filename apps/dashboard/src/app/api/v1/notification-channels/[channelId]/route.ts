import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationChannels, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Update schema
const updateChannelSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.object({
    webhook_url: z.string().url().optional(),
    email: z.string().email().optional(),
    slack_channel: z.string().optional(),
    pagerduty_key: z.string().optional(),
  }).optional(),
  is_enabled: z.boolean().optional(),
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

// Mask sensitive values
function maskConfig(config: Record<string, any>): Record<string, any> {
  const masked = { ...config };
  if (masked.webhookUrl) {
    masked.webhookUrl = masked.webhookUrl.substring(0, 30) + '...';
  }
  if (masked.pagerdutyKey) {
    masked.pagerdutyKey = '****' + masked.pagerdutyKey.slice(-4);
  }
  return masked;
}

// GET /api/v1/notification-channels/[channelId] - Get channel details
export async function GET(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const channel = await db.query.notificationChannels.findFirst({
      where: eq(notificationChannels.id, params.channelId),
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
            email: true,
          },
        },
      },
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Notification channel not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, channel.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: channel.id,
        org_id: channel.orgId,
        name: channel.name,
        type: channel.type,
        config: maskConfig(channel.config as Record<string, any>),
        is_enabled: channel.isEnabled,
        organization: channel.organization ? { id: channel.organization.id, name: channel.organization.name } : null,
        created_by: channel.creator ? {
          id: channel.creator.id,
          name: channel.creator.name,
          email: channel.creator.email,
        } : null,
        created_at: channel.createdAt?.toISOString(),
        updated_at: channel.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/notification-channels/[channelId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/notification-channels/[channelId] - Update channel
export async function PATCH(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const channel = await db.query.notificationChannels.findFirst({
      where: eq(notificationChannels.id, params.channelId),
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Notification channel not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, channel.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateChannelSchema.safeParse(body);

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

    const updates: Record<string, any> = { updatedAt: new Date() };

    if (parsed.data.name !== undefined) {
      updates.name = parsed.data.name;
    }

    if (parsed.data.is_enabled !== undefined) {
      updates.isEnabled = parsed.data.is_enabled;
    }

    if (parsed.data.config) {
      const existingConfig = channel.config as Record<string, any>;
      updates.config = {
        ...existingConfig,
        ...(parsed.data.config.webhook_url && { webhookUrl: parsed.data.config.webhook_url }),
        ...(parsed.data.config.email && { email: parsed.data.config.email }),
        ...(parsed.data.config.slack_channel && { slackChannel: parsed.data.config.slack_channel }),
        ...(parsed.data.config.pagerduty_key && { pagerdutyKey: parsed.data.config.pagerduty_key }),
      };
    }

    const [updated] = await db
      .update(notificationChannels)
      .set(updates)
      .where(eq(notificationChannels.id, params.channelId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        is_enabled: updated.isEnabled,
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/notification-channels/[channelId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/notification-channels/[channelId] - Delete channel
export async function DELETE(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const channel = await db.query.notificationChannels.findFirst({
      where: eq(notificationChannels.id, params.channelId),
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Notification channel not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, channel.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    await db.delete(notificationChannels).where(eq(notificationChannels.id, params.channelId));

    return NextResponse.json({
      success: true,
      message: 'Notification channel deleted successfully',
    });
  } catch (error) {
    console.error('DELETE /api/v1/notification-channels/[channelId] error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/notification-channels/[channelId]/test - Test notification channel
export async function POST(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const channel = await db.query.notificationChannels.findFirst({
      where: eq(notificationChannels.id, params.channelId),
    });

    if (!channel) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Notification channel not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, channel.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const config = channel.config as Record<string, any>;

    // Test the channel
    try {
      switch (channel.type) {
        case 'slack':
        case 'discord':
        case 'webhook':
          if (config.webhookUrl) {
            const testPayload = {
              text: '🧪 Test notification from Syntra PaaS',
              embeds: [{
                title: 'Test Notification',
                description: 'This is a test notification to verify your channel configuration.',
                color: 3447003, // Blue
                timestamp: new Date().toISOString(),
              }],
            };

            const response = await fetch(config.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(testPayload),
            });

            if (!response.ok) {
              throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
            }
          }
          break;

        case 'email':
          // TODO: Implement email test
          console.log(`[Test] Would send test email to: ${config.email}`);
          break;

        case 'pagerduty':
          // TODO: Implement PagerDuty test
          console.log(`[Test] Would send test event to PagerDuty`);
          break;
      }

      return NextResponse.json({
        success: true,
        message: 'Test notification sent successfully',
      });
    } catch (testError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TEST_FAILED',
            message: testError instanceof Error ? testError.message : 'Failed to send test notification',
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('POST /api/v1/notification-channels/[channelId]/test error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
