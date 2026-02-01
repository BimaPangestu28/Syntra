import crypto from 'crypto';
import type {
  DeployCommand,
  StopCommand,
  ScaleCommand,
  ExecCommand,
  LogsCommand,
  RestartCommand,
  RollbackCommand,
} from './types';

/**
 * Create a deploy command message
 */
export function createDeployCommand(params: DeployCommand) {
  return {
    id: crypto.randomUUID(),
    type: 'deploy',
    timestamp: new Date().toISOString(),
    payload: params,
  };
}

/**
 * Create a stop command message
 */
export function createStopCommand(params: StopCommand) {
  return {
    id: crypto.randomUUID(),
    type: 'stop',
    timestamp: new Date().toISOString(),
    payload: params,
  };
}

/**
 * Create a scale command message
 */
export function createScaleCommand(params: ScaleCommand) {
  return {
    id: crypto.randomUUID(),
    type: 'scale',
    timestamp: new Date().toISOString(),
    payload: params,
  };
}

/**
 * Create an exec command message
 */
export function createExecCommand(params: ExecCommand) {
  return {
    id: crypto.randomUUID(),
    type: 'exec',
    timestamp: new Date().toISOString(),
    payload: params,
  };
}

/**
 * Create a logs command message
 */
export function createLogsCommand(params: LogsCommand) {
  return {
    id: crypto.randomUUID(),
    type: 'logs',
    timestamp: new Date().toISOString(),
    payload: params,
  };
}

/**
 * Create a restart command message
 */
export function createRestartCommand(params: RestartCommand) {
  return {
    id: crypto.randomUUID(),
    type: 'restart',
    timestamp: new Date().toISOString(),
    payload: params,
  };
}

/**
 * Create a rollback command message
 */
export function createRollbackCommand(params: RollbackCommand) {
  return {
    id: crypto.randomUUID(),
    type: 'rollback',
    timestamp: new Date().toISOString(),
    payload: params,
  };
}

/**
 * Create a health check configuration command
 */
export function createHealthCheckCommand(serviceId: string, config: {
  path: string;
  interval: number;
  timeout: number;
  retries: number;
}) {
  return {
    id: crypto.randomUUID(),
    type: 'configure_health_check',
    timestamp: new Date().toISOString(),
    payload: {
      service_id: serviceId,
      ...config,
    },
  };
}

/**
 * Create an update agent command
 */
export function createUpdateAgentCommand(version: string, downloadUrl: string) {
  return {
    id: crypto.randomUUID(),
    type: 'update_agent',
    timestamp: new Date().toISOString(),
    payload: {
      version,
      download_url: downloadUrl,
    },
  };
}

/**
 * Create a ping/pong command for connection keep-alive
 */
export function createPingCommand() {
  return {
    id: crypto.randomUUID(),
    type: 'ping',
    timestamp: new Date().toISOString(),
    payload: {},
  };
}
