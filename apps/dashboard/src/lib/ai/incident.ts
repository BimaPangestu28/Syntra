import { getAnthropicClient, MODEL } from './client';

/**
 * Generate AI incident summary for alerts
 */
export async function generateIncidentSummary(incident: {
  alertType: string;
  serviceName: string;
  message: string;
  startedAt: string;
  metrics?: Record<string, number>;
  recentDeployments?: Array<{ id: string; createdAt: string }>;
}): Promise<{
  summary: string;
  likelyCause: string;
  recommendedAction: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}> {
  const prompt = `Generate a concise incident summary for the following alert.

## Alert Details
- **Type**: ${incident.alertType}
- **Service**: ${incident.serviceName}
- **Message**: ${incident.message}
- **Started At**: ${incident.startedAt}

${incident.metrics ? `## Current Metrics\n${Object.entries(incident.metrics).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : ''}

${incident.recentDeployments?.length ? `## Recent Deployments\n${incident.recentDeployments.map(d => `- ${d.id} at ${d.createdAt}`).join('\n')}` : ''}

Respond in JSON format:
{
  "summary": "One-sentence summary of the incident",
  "likelyCause": "Most probable cause based on the data",
  "recommendedAction": "Immediate action to take",
  "severity": "low|medium|high|critical"
}`;

  const response = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  try {
    return JSON.parse(content.text);
  } catch {
    return {
      summary: incident.message,
      likelyCause: 'Unable to determine',
      recommendedAction: 'Investigate manually',
      severity: 'medium',
    };
  }
}
