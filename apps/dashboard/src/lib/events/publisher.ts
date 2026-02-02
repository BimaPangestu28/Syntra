import crypto from 'crypto';
import { db } from '@/lib/db';
import { notificationChannels } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { queueNotification } from '@/lib/queue';
import type { EventType, EventPayload, WebhookEvent } from './types';

/**
 * Sign a webhook payload with HMAC-SHA256 using the channel's secret.
 */
function signPayload(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Publish an event to all matching webhook channels for an organization.
 *
 * Looks up enabled webhook notification channels and queues a notification
 * job for each one with the event payload and HMAC signature.
 */
export async function publishEvent(
  orgId: string,
  eventType: EventType,
  payload: EventPayload
): Promise<void> {
  const event: WebhookEvent = {
    id: crypto.randomUUID(),
    type: eventType,
    timestamp: new Date().toISOString(),
    org_id: orgId,
    payload,
  };

  const channels = await db.query.notificationChannels.findMany({
    where: and(
      eq(notificationChannels.orgId, orgId),
      eq(notificationChannels.type, 'webhook')
    ),
  });

  for (const channel of channels) {
    if (!channel.isEnabled) continue;

    const webhookUrl = channel.config?.webhookUrl;
    if (!webhookUrl) continue;

    const body = JSON.stringify(event);
    const signature = signPayload(body, channel.id);

    try {
      await queueNotification({
        type: 'alert',
        message: body,
        channels: ['webhook'],
      });

      console.log(
        `[EventPublisher] Queued ${eventType} event for webhook channel ${channel.id}`
      );
    } catch (error) {
      console.error(
        `[EventPublisher] Failed to queue event for channel ${channel.id}:`,
        error
      );
    }
  }
}
