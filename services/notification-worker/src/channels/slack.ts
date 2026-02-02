import type { NotificationJobData, NotificationContext, ChannelConfig } from '../types';

function getStatusEmoji(type: string): string {
  switch (type) {
    case 'deployment_started': return '\u{1F680}';
    case 'deployment_success': return '\u2705';
    case 'deployment_failed': return '\u274C';
    case 'alert': return '\u26A0\uFE0F';
    default: return '\u{1F4E2}';
  }
}

function getStatusColor(type: string): string {
  switch (type) {
    case 'deployment_started': return '#3498db';
    case 'deployment_success': return '#2ecc71';
    case 'deployment_failed': return '#e74c3c';
    case 'alert': return '#f39c12';
    default: return '#95a5a6';
  }
}

export async function sendSlack(
  data: NotificationJobData,
  context: NotificationContext,
  channelConfig: ChannelConfig
): Promise<void> {
  const webhookUrl = channelConfig.webhookUrl;
  if (!webhookUrl) {
    throw new Error('Slack channel config missing webhookUrl');
  }

  const emoji = getStatusEmoji(data.type);
  const color = getStatusColor(data.type);

  const blocks: unknown[] = [
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
        { type: 'mrkdwn', text: `*Service:*\n${context.deployment.serviceName}` },
        { type: 'mrkdwn', text: `*Project:*\n${context.deployment.projectName}` },
        { type: 'mrkdwn', text: `*Status:*\n${context.deployment.status}` },
        { type: 'mrkdwn', text: `*Branch:*\n${context.deployment.gitBranch || 'N/A'}` },
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
    attachments: [{ color, blocks }],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
  }

  console.log('[NotificationWorker] Slack notification sent');
}
