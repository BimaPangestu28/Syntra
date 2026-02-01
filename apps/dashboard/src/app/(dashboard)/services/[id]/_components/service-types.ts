export interface Deployment {
  id: string;
  status: string;
  git_commit_sha?: string;
  git_commit_message?: string;
  trigger_type?: string;
  created_at: string;
  deploy_finished_at?: string;
}

export interface ServiceDetail {
  id: string;
  project_id: string;
  server_id?: string;
  name: string;
  type: string;
  source_type: string;
  docker_image?: string;
  dockerfile_path?: string;
  port?: number;
  replicas?: number;
  health_check_path?: string;
  health_check_interval?: number;
  env_vars?: Record<string, string>;
  build_args?: Record<string, string>;
  resources?: {
    cpu_limit?: string;
    memory_limit?: string;
    cpu_request?: string;
    memory_request?: string;
  };
  auto_deploy: boolean;
  is_active: boolean;
  project: {
    id: string;
    name: string;
    slug: string;
    org_id: string;
    git_repo_url?: string;
    git_branch?: string;
  };
  server?: {
    id: string;
    name: string;
    hostname?: string;
    status: string;
  };
  deployments: Deployment[];
  created_at: string;
  updated_at: string;
}

export interface AvailableServer {
  id: string;
  name: string;
  status: string;
}

export interface EnvVar {
  key: string;
  value: string;
  masked_value: string;
  is_secret: boolean;
}

export const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  pending: 'secondary',
  building: 'warning',
  deploying: 'warning',
  running: 'success',
  stopped: 'secondary',
  failed: 'destructive',
  cancelled: 'secondary',
};

export const typeColors: Record<string, 'default' | 'secondary' | 'outline'> = {
  web: 'default',
  api: 'secondary',
  worker: 'outline',
  cron: 'outline',
};
