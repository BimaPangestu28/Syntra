import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '@/lib/db';
import { deployments, services, projects, organizations, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { NotificationJobData } from '../index';

// Redis connection
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });
};

// Webhook configuration
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const CUSTOM_WEBHOOK_URL = process.env.NOTIFICATION_WEBHOOK_URL;

// Email configuration (SendGrid, Resend, etc.)
const EMAIL_API_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@syntra.catalystlabs.id';

interface NotificationContext {
  deployment?: {
    id: string;
    status: string;
    serviceName: string;
    projectName: string;
    orgName: string;
    gitBranch?: string;
    gitCommitSha?: string;
    errorMessage?: string;
  };
  service?: {
    id: string;
    name: string;
  };
  server?: {
    id: string;
    name: string;
  };
}

async function getNotificationContext(data: NotificationJobData): Promise<NotificationContext> {
  const context: NotificationContext = {};

  if (data.deploymentId) {
    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, data.deploymentId),
      with: {
        service: {
          with: {
            project: {
              with: {
                organization: true,
              },
            },
          },
        },
      },
    });

    if (deployment) {
      context.deployment = {
        id: deployment.id,
        status: deployment.status,
        serviceName: deployment.service.name,
        projectName: deployment.service.project.name,
        orgName: deployment.service.project.organization.name,
        gitBranch: deployment.gitBranch || undefined,
        gitCommitSha: deployment.gitCommitSha || undefined,
        errorMessage: deployment.errorMessage || undefined,
      };
    }
  }

  return context;
}

function getStatusEmoji(type: string): string {
  switch (type) {
    case 'deployment_started':
      return '🚀';
    case 'deployment_success':
      return '✅';
    case 'deployment_failed':
      return '❌';
    case 'alert':
      return '⚠️';
    default:
      return '📢';
  }
}

function getStatusColor(type: string): string {
  switch (type) {
    case 'deployment_started':
      return '#3498db'; // Blue
    case 'deployment_success':
      return '#2ecc71'; // Green
    case 'deployment_failed':
      return '#e74c3c'; // Red
    case 'alert':
      return '#f39c12'; // Orange
    default:
      return '#95a5a6'; // Gray
  }
}

async function sendSlackNotification(
  data: NotificationJobData,
  context: NotificationContext
): Promise<void> {
  if (!SLACK_WEBHOOK_URL) {
    console.log('[NotificationWorker] Slack webhook not configured, skipping');
    return;
  }

  const emoji = getStatusEmoji(data.type);
  const color = getStatusColor(data.type);

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${data.message}*`,
      },
    },
  ];

  if (context.deployment) {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Service:*\n${context.deployment.serviceName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Project:*\n${context.deployment.projectName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Status:*\n${context.deployment.status}`,
        },
        {
          type: 'mrkdwn',
          text: `*Branch:*\n${context.deployment.gitBranch || 'N/A'}`,
        },
      ],
    });

    if (context.deployment.errorMessage) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error:*\n\`\`\`${context.deployment.errorMessage.slice(0, 500)}\`\`\``,
        },
      });
    }
  }

  const payload = {
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };

  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
  }

  console.log('[NotificationWorker] Slack notification sent');
}

async function sendDiscordNotification(
  data: NotificationJobData,
  context: NotificationContext
): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('[NotificationWorker] Discord webhook not configured, skipping');
    return;
  }

  const emoji = getStatusEmoji(data.type);
  const color = parseInt(getStatusColor(data.type).replace('#', ''), 16);

  const fields: any[] = [];

  if (context.deployment) {
    fields.push(
      { name: 'Service', value: context.deployment.serviceName, inline: true },
      { name: 'Project', value: context.deployment.projectName, inline: true },
      { name: 'Status', value: context.deployment.status, inline: true }
    );

    if (context.deployment.gitBranch) {
      fields.push({ name: 'Branch', value: context.deployment.gitBranch, inline: true });
    }

    if (context.deployment.errorMessage) {
      fields.push({
        name: 'Error',
        value: `\`\`\`${context.deployment.errorMessage.slice(0, 500)}\`\`\``,
        inline: false,
      });
    }
  }

  const payload = {
    embeds: [
      {
        title: `${emoji} ${data.message}`,
        color,
        fields,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Syntra PaaS',
        },
      },
    ],
  };

  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
  }

  console.log('[NotificationWorker] Discord notification sent');
}

async function sendWebhookNotification(
  data: NotificationJobData,
  context: NotificationContext
): Promise<void> {
  if (!CUSTOM_WEBHOOK_URL) {
    console.log('[NotificationWorker] Custom webhook not configured, skipping');
    return;
  }

  const payload = {
    type: data.type,
    message: data.message,
    timestamp: new Date().toISOString(),
    deployment: context.deployment,
    service: context.service,
    server: context.server,
  };

  const response = await fetch(CUSTOM_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Syntra-Event': data.type,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Custom webhook failed: ${response.status} ${response.statusText}`);
  }

  console.log('[NotificationWorker] Custom webhook notification sent');
}

async function sendEmailNotification(
  data: NotificationJobData,
  context: NotificationContext
): Promise<void> {
  if (!EMAIL_API_KEY || !data.recipients?.length) {
    console.log('[NotificationWorker] Email not configured or no recipients, skipping');
    return;
  }

  const emoji = getStatusEmoji(data.type);

  let subject = `${emoji} ${data.message}`;
  let body = `<h2>${data.message}</h2>`;

  if (context.deployment) {
    subject = `${emoji} ${context.deployment.serviceName}: ${data.type.replace('_', ' ')}`;
    body += `
      <table style="border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Service</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${context.deployment.serviceName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Project</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${context.deployment.projectName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Status</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${context.deployment.status}</td></tr>
        ${context.deployment.gitBranch ? `<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Branch</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${context.deployment.gitBranch}</td></tr>` : ''}
      </table>
    `;

    if (context.deployment.errorMessage) {
      body += `<h3>Error Details</h3><pre style="background: #f5f5f5; padding: 15px; border-radius: 4px;">${context.deployment.errorMessage}</pre>`;
    }
  }

  body += `<hr><p style="color: #888; font-size: 12px;">Sent by Syntra PaaS</p>`;

  // Generic email sending - can be adapted to SendGrid, Resend, etc.
  // This is a placeholder implementation
  console.log('[NotificationWorker] Email notification would be sent to:', data.recipients);
  console.log('[NotificationWorker] Subject:', subject);
}

async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const data = job.data;

  console.log(`[NotificationWorker] Processing notification: ${data.type}`);

  // Get context for enriching notifications
  const context = await getNotificationContext(data);

  // Process each channel
  const errors: Error[] = [];

  for (const channel of data.channels) {
    try {
      switch (channel) {
        case 'slack':
          await sendSlackNotification(data, context);
          await sendDiscordNotification(data, context); // Also try Discord for 'slack' channel
          break;
        case 'webhook':
          await sendWebhookNotification(data, context);
          break;
        case 'email':
          await sendEmailNotification(data, context);
          break;
        default:
          console.log(`[NotificationWorker] Unknown channel: ${channel}`);
      }
    } catch (error) {
      console.error(`[NotificationWorker] Failed to send to ${channel}:`, error);
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // If all channels failed, throw an error
  if (errors.length === data.channels.length && errors.length > 0) {
    throw new Error(`All notification channels failed: ${errors.map(e => e.message).join(', ')}`);
  }

  console.log(`[NotificationWorker] Notification processed successfully`);
}

// Create and start worker
let worker: Worker<NotificationJobData> | null = null;

export function startNotificationWorker() {
  if (worker) {
    console.log('[NotificationWorker] Worker already running');
    return worker;
  }

  worker = new Worker<NotificationJobData>(
    'notification',
    processNotification,
    {
      connection: getRedisConnection(),
      concurrency: 10, // Can handle many notifications in parallel
      limiter: {
        max: 100,
        duration: 60000, // Max 100 notifications per minute
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[NotificationWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[NotificationWorker] Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err) => {
    console.error('[NotificationWorker] Worker error:', err);
  });

  console.log('[NotificationWorker] Started');
  return worker;
}

export function stopNotificationWorker() {
  if (worker) {
    worker.close();
    worker = null;
    console.log('[NotificationWorker] Stopped');
  }
}

export { worker as notificationWorker };
