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

function getStatusColor(type: string): number {
  switch (type) {
    case 'deployment_started': return 0x3498db;
    case 'deployment_success': return 0x2ecc71;
    case 'deployment_failed': return 0xe74c3c;
    case 'alert': return 0xf39c12;
    default: return 0x95a5a6;
  }
}

export async function sendDiscord(
  data: NotificationJobData,
  context: NotificationContext,
  channelConfig: ChannelConfig
): Promise<void> {
  const webhookUrl = channelConfig.webhookUrl;
  if (!webhookUrl) {
    throw new Error('Discord channel config missing webhookUrl');
  }

  const emoji = getStatusEmoji(data.type);
  const color = getStatusColor(data.type);

  const fields: { name: string; value: string; inline: boolean }[] = [];

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
        footer: { text: 'Syntra PaaS' },
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
  }

  console.log('[NotificationWorker] Discord notification sent');
}
