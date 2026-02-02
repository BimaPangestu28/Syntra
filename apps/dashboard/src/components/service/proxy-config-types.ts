export interface HeaderAction {
  action: 'set' | 'add' | 'remove';
  name: string;
  value?: string;
}

export interface ProxyConfig {
  id: string;
  service_id: string;
  name: string;
  is_enabled: boolean;
  priority: number;
  path_pattern: string;
  path_match_type: string;
  upstream_port?: number;
  upstream_path?: string;
  strip_path_prefix: boolean;
  request_headers: HeaderAction[];
  response_headers: HeaderAction[];
  connect_timeout: number;
  read_timeout: number;
  send_timeout: number;
  rate_limit_enabled: boolean;
  rate_limit_requests: number;
  rate_limit_window: number;
  cors_enabled: boolean;
  cors_allow_origins: string[];
  cors_allow_methods: string[];
  cors_allow_headers: string[];
  cors_expose_headers: string[];
  cors_max_age: number;
  cors_allow_credentials: boolean;
  basic_auth_enabled: boolean;
  basic_auth_username?: string;
  basic_auth_password?: string;
  ip_whitelist?: string[];
  ip_blacklist?: string[];
  websocket_enabled: boolean;
  max_body_size: string;
  buffering_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProxyTabProps {
  formData: Partial<ProxyConfig>;
  updateField: (field: keyof ProxyConfig, value: any) => void;
}

export const defaultConfig: Partial<ProxyConfig> = {
  name: '',
  is_enabled: true,
  priority: 0,
  path_pattern: '/',
  path_match_type: 'prefix',
  strip_path_prefix: false,
  request_headers: [],
  response_headers: [],
  connect_timeout: 60,
  read_timeout: 60,
  send_timeout: 60,
  rate_limit_enabled: false,
  rate_limit_requests: 100,
  rate_limit_window: 60,
  cors_enabled: false,
  cors_allow_origins: ['*'],
  cors_allow_methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  cors_allow_headers: ['*'],
  cors_expose_headers: [],
  cors_max_age: 86400,
  cors_allow_credentials: false,
  basic_auth_enabled: false,
  websocket_enabled: false,
  max_body_size: '10m',
  buffering_enabled: true,
};
