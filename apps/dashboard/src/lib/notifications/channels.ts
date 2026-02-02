/**
 * Multi-channel notification delivery
 *
 * Supports:
 * - Email (via Resend)
 * - Slack (webhook)
 * - PagerDuty (Events API v2)
 * - Custom webhooks
 */

import { getResend } from '@/lib/email';

export interface NotificationChannel {
  type: 'email' | 'slack' | 'pagerduty' | 'webhook';
}

export interface ChannelConfig {
  email?: string;
  webhookUrl?: string;
  routingKey?: string;
  url?: string;
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'Syntra <noreply@syntra.io>';
const PAGERDUTY_API_URL = 'https://events.pagerduty.com/v2/enqueue';

/**
 * Deliver notification to email via Resend
 */
async function deliverEmailNotification(
  message: string,
  config: ChannelConfig
): Promise<void> {
  if (!config.email) {
    throw new Error('Email address not provided in channel config');
  }

  try {
    const resend = getResend();

    await resend.emails.send({
      from: FROM_EMAIL,
      to: config.email,
      subject: 'Alert Notification - Syntra',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #111;">Alert Notification</h2>
          <p style="color: #555; font-size: 16px; line-height: 24px;">
            ${message}
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #888; font-size: 14px;">
            This is an automated alert from Syntra. If you no longer wish to receive these notifications,
            please update your notification settings in the dashboard.
          </p>
        </div>
      `,
    });

    console.log(`[Notifications] Email sent to ${config.email}`);
  } catch (error) {
    // Check if Resend is not configured
    if (
      error instanceof Error &&
      error.message.includes('RESEND_API_KEY')
    ) {
      console.warn(
        '[Notifications] Resend not configured, skipping email notification'
      );
      return;
    }
    throw error;
  }
}

/**
 * Deliver notification to Slack via webhook
 */
async function deliverSlackNotification(
  message: string,
  config: ChannelConfig
): Promise<void> {
  if (!config.webhookUrl) {
    throw new Error('Slack webhook URL not provided in channel config');
  }

  const payload = {
    text: message,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sent by Syntra at ${new Date().toISOString()}`,
          },
        ],
      },
    ],
  };

  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Slack webhook request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  console.log('[Notifications] Slack notification sent');
}

/**
 * Deliver notification to PagerDuty via Events API v2
 */
async function deliverPagerDutyNotification(
  message: string,
  config: ChannelConfig
): Promise<void> {
  if (!config.routingKey) {
    throw new Error('PagerDuty routing key not provided in channel config');
  }

  const payload = {
    routing_key: config.routingKey,
    event_action: 'trigger',
    payload: {
      summary: message,
      severity: 'error',
      source: 'Syntra',
      timestamp: new Date().toISOString(),
    },
  };

  const response = await fetch(PAGERDUTY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `PagerDuty API request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const result = await response.json();
  console.log(
    `[Notifications] PagerDuty incident triggered: ${result.dedup_key || 'unknown'}`
  );
}

/**
 * Deliver notification to custom webhook
 */
async function deliverWebhookNotification(
  message: string,
  config: ChannelConfig
): Promise<void> {
  if (!config.url) {
    throw new Error('Webhook URL not provided in channel config');
  }

  const payload = {
    message,
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Syntra/1.0',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Webhook request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  console.log(`[Notifications] Webhook notification sent to ${config.url}`);
}

/**
 * Main delivery function - routes to appropriate channel handler
 */
export async function deliverNotification(
  channel: NotificationChannel,
  message: string,
  config: ChannelConfig
): Promise<void> {
  console.log(`[Notifications] Delivering to ${channel.type}`);

  try {
    switch (channel.type) {
      case 'email':
        await deliverEmailNotification(message, config);
        break;

      case 'slack':
        await deliverSlackNotification(message, config);
        break;

      case 'pagerduty':
        await deliverPagerDutyNotification(message, config);
        break;

      case 'webhook':
        await deliverWebhookNotification(message, config);
        break;

      default:
        throw new Error(`Unknown notification channel type: ${(channel as any).type}`);
    }
  } catch (error) {
    console.error(
      `[Notifications] Failed to deliver to ${channel.type}:`,
      error
    );
    throw error;
  }
}
