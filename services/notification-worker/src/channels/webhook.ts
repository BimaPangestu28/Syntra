import type { NotificationJobData, NotificationContext, ChannelConfig } from '../types';

export async function sendWebhook(
  data: NotificationJobData,
  context: NotificationContext,
  channelConfig: ChannelConfig
): Promise<void> {
  const webhookUrl = channelConfig.webhookUrl;
  if (!webhookUrl) {
    throw new Error('Webhook channel config missing webhookUrl');
  }

  const payload = {
    type: data.type,
    message: data.message,
    timestamp: new Date().toISOString(),
    deployment: context.deployment
      ? {
          id: context.deployment.id,
          status: context.deployment.status,
          serviceName: context.deployment.serviceName,
          projectName: context.deployment.projectName,
          orgName: context.deployment.orgName,
          gitBranch: context.deployment.gitBranch,
          gitCommitSha: context.deployment.gitCommitSha,
          errorMessage: context.deployment.errorMessage,
        }
      : undefined,
  };

  const response = await fetch(webhookUrl, {
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

  console.log(`[NotificationWorker] Webhook delivered to ${webhookUrl}`);
}
