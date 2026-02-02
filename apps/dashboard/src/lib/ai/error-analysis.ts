import { getAnthropicClient, MODEL } from './client';

export interface ErrorContext {
  stackTrace: string;
  errorMessage: string;
  errorType: string;
  serviceName: string;
  environment?: string;
  recentChanges?: string[];
  breadcrumbs?: Array<{ timestamp: string; message: string; category: string }>;
  affectedUsers?: number;
  frequency?: number;
}

export interface ErrorAnalysis {
  rootCause: string;
  whyNow: string;
  suggestedFix: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedScope: string;
  relatedIssues?: string[];
}

/**
 * Analyze an error and provide root cause + fix suggestions
 */
export async function analyzeError(context: ErrorContext): Promise<ErrorAnalysis> {
  const prompt = `You are an expert DevOps engineer analyzing a production error. Analyze the following error and provide actionable insights.

## Error Details
- **Service**: ${context.serviceName}
- **Environment**: ${context.environment || 'production'}
- **Error Type**: ${context.errorType}
- **Error Message**: ${context.errorMessage}
- **Affected Users**: ${context.affectedUsers || 'Unknown'}
- **Frequency**: ${context.frequency || 'Unknown'} occurrences

## Stack Trace
\`\`\`
${context.stackTrace}
\`\`\`

${context.recentChanges?.length ? `## Recent Changes\n${context.recentChanges.map(c => `- ${c}`).join('\n')}` : ''}

${context.breadcrumbs?.length ? `## Breadcrumbs (last events before error)\n${context.breadcrumbs.slice(-10).map(b => `- [${b.timestamp}] ${b.category}: ${b.message}`).join('\n')}` : ''}

Provide your analysis in the following JSON format:
{
  "rootCause": "Clear explanation of what caused the error",
  "whyNow": "Why this error is happening now (correlate with recent changes if applicable)",
  "suggestedFix": "Specific code or configuration fix to resolve the issue",
  "severity": "low|medium|high|critical",
  "affectedScope": "Description of what's affected (users, routes, features)"
}

Respond ONLY with the JSON object, no additional text.`;

  const response = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  try {
    return JSON.parse(content.text) as ErrorAnalysis;
  } catch {
    // If JSON parsing fails, return a structured response
    return {
      rootCause: content.text,
      whyNow: 'Analysis could not determine timing correlation',
      suggestedFix: 'Review the error details and stack trace manually',
      severity: 'medium',
      affectedScope: context.serviceName,
    };
  }
}
