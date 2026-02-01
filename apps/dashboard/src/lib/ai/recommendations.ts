import Anthropic from '@anthropic-ai/sdk';
import type { ServiceContext } from './index';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const MODEL = 'claude-3-5-haiku-20241022';

/**
 * Get resource optimization recommendations
 */
export async function getRecommendations(serviceContext: ServiceContext): Promise<{
  recommendations: Array<{
    type: 'scale' | 'resource' | 'config' | 'performance';
    title: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    estimatedSavings?: string;
    action?: string;
  }>;
}> {
  const prompt = `Analyze the following service metrics and provide optimization recommendations.

## Service: ${serviceContext.serviceName}
Type: ${serviceContext.serviceType}

## Current Metrics
${serviceContext.metrics ? `
- Request Rate: ${serviceContext.metrics.requestRate || 'N/A'} req/s
- Error Rate: ${serviceContext.metrics.errorRate || 'N/A'}%
- P95 Latency: ${serviceContext.metrics.p95Latency || 'N/A'}ms
- CPU Usage: ${serviceContext.metrics.cpuUsage || 'N/A'}%
- Memory Usage: ${serviceContext.metrics.memoryUsage || 'N/A'}%
` : 'No metrics available'}

${serviceContext.recentErrors?.length ? `## Recent Errors (top 5)
${serviceContext.recentErrors.slice(0, 5).map(e => `- ${e.message} (${e.count} occurrences)`).join('\n')}` : ''}

Provide recommendations in JSON format:
{
  "recommendations": [
    {
      "type": "scale|resource|config|performance",
      "title": "Short title",
      "description": "Detailed explanation",
      "impact": "low|medium|high",
      "estimatedSavings": "Optional: e.g., '$10/month' or '20% faster'",
      "action": "Optional: specific action to take"
    }
  ]
}

Respond ONLY with the JSON object.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  try {
    return JSON.parse(content.text);
  } catch {
    return { recommendations: [] };
  }
}
