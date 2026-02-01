// Types - exported from barrel for use by sub-modules and consumers

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

export interface DockerfileContext {
  files: Array<{ path: string; content: string }>;
  packageManager?: string;
  framework?: string;
  language?: string;
}

export interface DockerfileResult {
  dockerfile: string;
  explanation: string;
  buildCommand: string;
  runCommand: string;
  optimizations: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ServiceContext {
  serviceName: string;
  serviceType: string;
  serviceConfig?: {
    port?: number | null;
    replicas?: number | null;
    exposeEnabled?: boolean | null;
    exposePort?: number | null;
    healthCheckPath?: string | null;
    autoDeploy?: boolean | null;
    isActive?: boolean | null;
    sourceType?: string | null;
    dockerImage?: string | null;
    dockerfilePath?: string | null;
    resources?: Record<string, string> | null;
    envVarsCount?: number;
  };
  project?: {
    name: string;
    gitRepoUrl?: string | null;
    gitBranch?: string | null;
    buildCommand?: string | null;
    installCommand?: string | null;
  };
  server?: {
    name: string;
    hostname?: string | null;
    status: string;
    publicIp?: string | null;
    cpuCores?: number | null;
    memoryMb?: number | null;
    diskGb?: number | null;
    osName?: string | null;
    runtime?: string | null;
    runtimeVersion?: string | null;
  } | null;
  recentDeployments?: Array<{
    id: string;
    status: string;
    triggerType?: string | null;
    gitCommitSha?: string | null;
    gitCommitMessage?: string | null;
    gitBranch?: string | null;
    createdAt?: string;
    deployFinishedAt?: string | null;
    errorMessage?: string | null;
  }>;
  recentErrors?: Array<{
    message: string;
    type?: string | null;
    count: number;
    firstSeen?: string;
    lastSeen?: string;
    status?: string | null;
  }>;
  domains?: Array<{
    domain: string;
    status: string;
    isPrimary?: boolean | null;
    sslEnabled?: boolean | null;
    sslStatus?: string | null;
  }>;
  proxyConfigs?: Array<{
    name: string;
    pathPattern?: string | null;
    upstreamPort?: number | null;
    rateLimitEnabled?: boolean | null;
    rateLimitRequests?: number | null;
    corsEnabled?: boolean | null;
    websocketEnabled?: boolean | null;
    isEnabled?: boolean | null;
  }>;
  volumes?: Array<{
    name: string;
    sizeGb: number;
    mountPath: string;
    status: string;
  }>;
  recentAlerts?: Array<{
    type: string;
    severity: string;
    title: string;
    status: string;
    createdAt?: string;
    resolvedAt?: string | null;
  }>;
  metrics?: {
    requestRate?: number;
    errorRate?: number;
    p95Latency?: number;
    cpuUsage?: number;
    memoryUsage?: number;
  };
}

export { analyzeError } from './error-analysis';
export { generateDockerfile } from './dockerfile';
export { chat, chatStream } from './chat';
export { getRecommendations } from './recommendations';
export { generateIncidentSummary } from './incident';
export { buildSystemPrompt } from './system-prompt';
