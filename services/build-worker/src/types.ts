export interface BuildJobData {
  deploymentId: string;
  serviceId: string;
  git: {
    repoUrl: string;
    branch: string;
    commitSha?: string;
  };
  dockerfile: string;
  buildArgs?: Record<string, string>;
  registry?: string;
}

export interface DeploymentJobData {
  deploymentId: string;
  serviceId: string;
  serverId: string;
  git?: {
    repoUrl: string;
    branch: string;
    commitSha?: string;
  };
  docker?: {
    image: string;
    tag: string;
  };
  envVars: Record<string, string>;
  triggeredBy?: string;
  triggerType: 'manual' | 'git_push' | 'api' | 'rollback';
}

export interface NotificationJobData {
  type: 'deployment_started' | 'deployment_success' | 'deployment_failed' | 'alert';
  deploymentId?: string;
  serviceId?: string;
  serverId?: string;
  message: string;
  channels: ('email' | 'slack' | 'webhook')[];
  recipients?: string[];
}

export interface BuildContext {
  workDir: string;
  deploymentId: string;
  serviceId: string;
  logs: string[];
}
