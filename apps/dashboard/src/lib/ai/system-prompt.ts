import type { ServiceContext } from './index';

/**
 * Build rich system prompt from service context
 */
export function buildSystemPrompt(ctx?: ServiceContext): string {
  let prompt = `You are Syntra AI, an expert DevOps assistant integrated into a PaaS platform. You help developers understand their deployments, debug issues, optimize performance, and configure services.

You have access to comprehensive information about the user's services, servers, deployments, and configurations. Use this data to provide specific, actionable advice.`;

  if (!ctx) {
    return prompt + '\n\nNo service context provided. Ask the user which service they want to discuss.';
  }

  prompt += `

## Service: ${ctx.serviceName}
- **Type**: ${ctx.serviceType}
- **Status**: ${ctx.serviceConfig?.isActive ? 'Active' : 'Inactive'}`;

  // Service Configuration
  if (ctx.serviceConfig) {
    const cfg = ctx.serviceConfig;
    prompt += `

### Configuration
- Port: ${cfg.port || 'Not set'}
- Replicas: ${cfg.replicas || 1}
- Source: ${cfg.sourceType}${cfg.dockerImage ? ` (${cfg.dockerImage})` : ''}
- Auto Deploy: ${cfg.autoDeploy ? 'Yes' : 'No'}
- Health Check: ${cfg.healthCheckPath || '/'}
- Expose: ${cfg.exposeEnabled ? `Yes (port ${cfg.exposePort})` : 'No'}
- Environment Variables: ${cfg.envVarsCount || 0} configured
- Resources: ${cfg.resources ? `CPU: ${cfg.resources.cpu_limit || 'unlimited'}, Memory: ${cfg.resources.memory_limit || 'unlimited'}` : 'Not configured'}`;
  }

  // Project Info
  if (ctx.project) {
    prompt += `

### Project
- Name: ${ctx.project.name}
- Repository: ${ctx.project.gitRepoUrl || 'Not connected'}
- Branch: ${ctx.project.gitBranch || 'main'}
- Build: ${ctx.project.buildCommand || 'Default'}
- Install: ${ctx.project.installCommand || 'Default'}`;
  }

  // Server Info
  if (ctx.server) {
    const srv = ctx.server;
    prompt += `

### Server
- Name: ${srv.name}
- Status: ${srv.status}
- IP: ${srv.publicIp || 'N/A'}
- OS: ${srv.osName || 'Unknown'}
- Runtime: ${srv.runtime || 'Unknown'}${srv.runtimeVersion ? ` v${srv.runtimeVersion}` : ''}
- Specs: ${srv.cpuCores || '?'} CPU, ${srv.memoryMb ? Math.round(srv.memoryMb / 1024) + 'GB RAM' : '?'}, ${srv.diskGb || '?'}GB disk`;
  }

  // Domains
  if (ctx.domains?.length) {
    prompt += `

### Domains (${ctx.domains.length})
${ctx.domains.map(d => `- ${d.domain} [${d.status}]${d.isPrimary ? ' (primary)' : ''} SSL: ${d.sslEnabled ? d.sslStatus : 'disabled'}`).join('\n')}`;
  }

  // Volumes
  if (ctx.volumes?.length) {
    prompt += `

### Volumes (${ctx.volumes.length})
${ctx.volumes.map(v => `- ${v.name} (${v.sizeGb}GB) → ${v.mountPath} [${v.status}]`).join('\n')}`;
  }

  // Proxy Configs
  if (ctx.proxyConfigs?.length) {
    prompt += `

### Proxy Rules (${ctx.proxyConfigs.length})
${ctx.proxyConfigs.map(p => `- ${p.name}: ${p.pathPattern || '/'} → :${p.upstreamPort}${p.rateLimitEnabled ? ' (rate limited)' : ''}${p.corsEnabled ? ' (CORS)' : ''}${p.websocketEnabled ? ' (WebSocket)' : ''}`).join('\n')}`;
  }

  // Recent Deployments
  if (ctx.recentDeployments?.length) {
    prompt += `

### Recent Deployments (last ${ctx.recentDeployments.length})
${ctx.recentDeployments.slice(0, 5).map(d => {
  let line = `- [${d.status.toUpperCase()}] ${d.gitCommitSha || d.id.substring(0, 7)}`;
  if (d.gitCommitMessage) line += `: "${d.gitCommitMessage.substring(0, 50)}"`;
  if (d.gitBranch) line += ` (${d.gitBranch})`;
  if (d.triggerType) line += ` - ${d.triggerType}`;
  if (d.errorMessage) line += ` ERROR: ${d.errorMessage.substring(0, 100)}`;
  return line;
}).join('\n')}`;
  }

  // Recent Errors
  if (ctx.recentErrors?.length) {
    prompt += `

### Recent Errors (${ctx.recentErrors.length} groups)
${ctx.recentErrors.slice(0, 5).map(e => `- [${e.status || 'open'}] ${e.message.substring(0, 80)} (${e.count}x, last: ${e.lastSeen || 'unknown'})`).join('\n')}`;
  }

  // Recent Alerts
  if (ctx.recentAlerts?.length) {
    prompt += `

### Recent Alerts
${ctx.recentAlerts.slice(0, 5).map(a => `- [${a.severity.toUpperCase()}] ${a.title} - ${a.status}`).join('\n')}`;
  }

  // Metrics (if available)
  if (ctx.metrics) {
    const m = ctx.metrics;
    prompt += `

### Current Metrics
- Request Rate: ${m.requestRate ?? 'N/A'} req/s
- Error Rate: ${m.errorRate ?? 'N/A'}%
- P95 Latency: ${m.p95Latency ?? 'N/A'}ms
- CPU: ${m.cpuUsage ?? 'N/A'}%
- Memory: ${m.memoryUsage ?? 'N/A'}%`;
  }

  prompt += `

## Instructions
- Be concise but thorough
- When suggesting fixes, provide specific actionable steps
- When analyzing deployments, correlate with recent commits
- When debugging errors, consider recent changes
- Suggest configuration improvements when relevant
- If data is missing, explain what would help with the analysis`;

  return prompt;
}
