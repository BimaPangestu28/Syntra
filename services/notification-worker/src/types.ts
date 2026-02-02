export interface NotificationJobData {
  type: 'deployment_started' | 'deployment_success' | 'deployment_failed' | 'alert';
  deploymentId?: string;
  serviceId?: string;
  serverId?: string;
  message: string;
  channels: ('email' | 'slack' | 'webhook')[];
  recipients?: string[];
}

export interface NotificationContext {
  deployment?: {
    id: string;
    status: string;
    serviceName: string;
    projectName: string;
    orgId: string;
    orgName: string;
    gitBranch?: string;
    gitCommitSha?: string;
    errorMessage?: string;
  };
  orgId?: string;
}

export interface ChannelConfig {
  webhookUrl?: string;
  email?: string;
  slackChannel?: string;
  pagerdutyKey?: string;
}

export interface NotificationChannel {
  id: string;
  orgId: string;
  name: string;
  type: string;
  config: ChannelConfig;
  isEnabled: boolean | null;
}
