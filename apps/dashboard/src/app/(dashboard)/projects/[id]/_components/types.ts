export interface Service {
  id: string;
  name: string;
  type: string;
  source_type: string;
  port?: number;
  replicas?: number;
  auto_deploy: boolean;
  is_active: boolean;
  server?: {
    id: string;
    name: string;
    status: string;
  };
  created_at: string;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description?: string;
  git_repo_url?: string;
  git_branch?: string;
  git_provider?: string;
  build_command?: string;
  install_command?: string;
  output_directory?: string;
  root_directory?: string;
  env_vars?: Record<string, string>;
  services: Service[];
  created_at: string;
  updated_at: string;
}

export interface ServerOption {
  id: string;
  name: string;
  status: string;
}

export interface VolumeOption {
  id: string;
  name: string;
  size_gb: number;
}

export const RESOURCE_PRESETS = {
  small: { cpu_request: '100m', cpu_limit: '500m', memory_request: '128Mi', memory_limit: '256Mi' },
  medium: { cpu_request: '250m', cpu_limit: '1', memory_request: '256Mi', memory_limit: '512Mi' },
  large: { cpu_request: '500m', cpu_limit: '2', memory_request: '512Mi', memory_limit: '1Gi' },
};