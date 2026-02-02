import { Resend } from 'resend';
import { config } from '../config';
import type { NotificationJobData, NotificationContext, ChannelConfig } from '../types';

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!config.email.resendApiKey) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(config.email.resendApiKey);
  }
  return resendClient;
}

function getStatusEmoji(type: string): string {
  switch (type) {
    case 'deployment_started': return '\u{1F680}';
    case 'deployment_success': return '\u2705';
    case 'deployment_failed': return '\u274C';
    case 'alert': return '\u26A0\uFE0F';
    default: return '\u{1F4E2}';
  }
}

function buildEmailHtml(data: NotificationJobData, context: NotificationContext): string {
  const emoji = getStatusEmoji(data.type);
  let body = `<h2>${emoji} ${data.message}</h2>`;

  if (context.deployment) {
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
  return body;
}

export async function sendEmail(
  data: NotificationJobData,
  context: NotificationContext,
  channelConfig: ChannelConfig
): Promise<void> {
  const client = getResendClient();
  if (!client) {
    console.log('[NotificationWorker] RESEND_API_KEY not configured, skipping email');
    return;
  }

  const recipient = channelConfig.email;
  if (!recipient) {
    console.log('[NotificationWorker] No email address in channel config, skipping');
    return;
  }

  const emoji = getStatusEmoji(data.type);
  const subject = context.deployment
    ? `${emoji} ${context.deployment.serviceName}: ${data.type.replace(/_/g, ' ')}`
    : `${emoji} ${data.message}`;

  await client.emails.send({
    from: config.email.from,
    to: [recipient],
    subject,
    html: buildEmailHtml(data, context),
  });

  console.log(`[NotificationWorker] Email sent to ${recipient}`);
}
