/**
 * Outgoing webhook event types and payload interfaces.
 */

export type EventType =
  | 'deployment.started'
  | 'deployment.completed'
  | 'deployment.failed'
  | 'service.health_changed'
  | 'alert.fired'
  | 'alert.resolved';

export interface DeploymentStartedPayload {
  deployment_id: string;
  service_id: string;
  service_name: string;
  trigger_type: string;
  git_commit_sha?: string;
  triggered_by?: string;
}

export interface DeploymentCompletedPayload {
  deployment_id: string;
  service_id: string;
  service_name: string;
  trigger_type: string;
  git_commit_sha?: string;
  duration_ms?: number;
}

export interface DeploymentFailedPayload {
  deployment_id: string;
  service_id: string;
  service_name: string;
  trigger_type: string;
  error_message?: string;
  git_commit_sha?: string;
}

export interface ServiceHealthChangedPayload {
  service_id: string;
  service_name: string;
  previous_status: string;
  current_status: string;
}

export interface AlertFiredPayload {
  alert_id: string;
  rule_id: string;
  rule_name: string;
  severity: string;
  metric: string;
  metric_value: number;
  threshold: number;
  operator: string;
  service_id?: string;
}

export interface AlertResolvedPayload {
  alert_id: string;
  rule_id: string;
  rule_name: string;
  resolved_by?: string;
}

export type EventPayload =
  | DeploymentStartedPayload
  | DeploymentCompletedPayload
  | DeploymentFailedPayload
  | ServiceHealthChangedPayload
  | AlertFiredPayload
  | AlertResolvedPayload;

export interface WebhookEvent {
  id: string;
  type: EventType;
  timestamp: string;
  org_id: string;
  payload: EventPayload;
}
