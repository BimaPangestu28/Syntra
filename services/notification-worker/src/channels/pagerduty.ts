import type { NotificationJobData, NotificationContext, ChannelConfig } from '../types';

const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue';

function getSeverity(type: string): 'critical' | 'error' | 'warning' | 'info' {
  switch (type) {
    case 'deployment_failed': return 'error';
    case 'alert': return 'critical';
    case 'deployment_started': return 'info';
    case 'deployment_success': return 'info';
    default: return 'warning';
  }
}

export async function sendPagerDuty(
  data: NotificationJobData,
  context: NotificationContext,
  channelConfig: ChannelConfig
): Promise<void> {
  const routingKey = channelConfig.pagerdutyKey;
  if (!routingKey) {
    throw new Error('PagerDuty channel config missing pagerdutyKey');
  }

  const summary = context.deployment
    ? `${context.deployment.serviceName} (${context.deployment.projectName}): ${data.message}`
    : data.message;

  const payload = {
    routing_key: routingKey,
    event_action: 'trigger' as const,
    payload: {
      summary: summary.slice(0, 1024),
      severity: getSeverity(data.type),
      source: context.deployment?.serviceName || 'syntra',
      component: context.deployment?.projectName,
      group: context.deployment?.orgName,
      custom_details: {
        type: data.type,
        deployment_id: data.deploymentId,
        service_id: data.serviceId,
        status: context.deployment?.status,
        git_branch: context.deployment?.gitBranch,
        git_commit: context.deployment?.gitCommitSha,
        error_message: context.deployment?.errorMessage,
      },
    },
  };

  const response = await fetch(PAGERDUTY_EVENTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PagerDuty API failed: ${response.status} ${body}`);
  }

  console.log('[NotificationWorker] PagerDuty event sent');
}
