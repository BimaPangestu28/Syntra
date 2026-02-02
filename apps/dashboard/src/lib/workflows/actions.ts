import { db } from '@/lib/db';
import { services, deployments, servers, promotions } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { queueNotification, queueDeployment } from '@/lib/queue';
import { agentHub } from '@/lib/agent/hub';

export type ActionType = 'notify' | 'scale' | 'restart' | 'rollback' | 'run_command' | 'ai_analyze' | 'approval';

export interface WorkflowContext {
  trigger: string;
  triggeredBy?: string;
  serverId?: string;
  serviceId?: string;
  deploymentId?: string;
  alertId?: string;
  errorMessage?: string;
  metricName?: string;
  metricValue?: number;
  [key: string]: unknown;
}

interface ActionResult {
  message?: string;
  data?: unknown;
}

/**
 * Execute a single workflow action
 */
export async function executeAction(
  type: ActionType,
  config: Record<string, unknown>,
  context: WorkflowContext,
  orgId: string
): Promise<ActionResult> {
  switch (type) {
    case 'notify':
      return executeNotifyAction(config, context, orgId);
    case 'scale':
      return executeScaleAction(config, context);
    case 'restart':
      return executeRestartAction(config, context);
    case 'rollback':
      return executeRollbackAction(config, context);
    case 'run_command':
      return executeRunCommandAction(config, context);
    case 'ai_analyze':
      return executeAiAnalyzeAction(config, context);
    case 'approval':
      return executeApprovalAction(config, context, orgId);
    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

/**
 * Send notification
 */
async function executeNotifyAction(
  config: Record<string, unknown>,
  context: WorkflowContext,
  orgId: string
): Promise<ActionResult> {
  const channel = config.channel as string;
  const messageTemplate = config.message as string;

  const message = interpolateTemplate(messageTemplate, context);

  await queueNotification({
    type: 'alert',
    message,
    channels: [channel as 'email' | 'slack' | 'webhook'],
  });

  return { message: `Notification sent to ${channel}` };
}

/**
 * Scale service
 */
async function executeScaleAction(
  config: Record<string, unknown>,
  context: WorkflowContext
): Promise<ActionResult> {
  const serviceId = (config.service_id as string) || context.serviceId;
  const replicas = config.replicas as number;

  if (!serviceId) throw new Error('service_id is required for scale action');
  if (typeof replicas !== 'number') throw new Error('replicas must be a number');

  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
  });

  if (!service) throw new Error(`Service ${serviceId} not found`);
  if (!service.serverId) throw new Error(`Service ${serviceId} has no assigned server`);

  await db.update(services)
    .set({ replicas, updatedAt: new Date() })
    .where(eq(services.id, serviceId));

  if (agentHub.isAgentConnected(service.serverId)) {
    await agentHub.sendCommand(service.serverId, 'scale', {
      service_id: serviceId,
      replicas,
    });
  }

  return {
    message: `Scaled service to ${replicas} replicas`,
    data: { serviceId, replicas },
  };
}

/**
 * Restart service
 */
async function executeRestartAction(
  config: Record<string, unknown>,
  context: WorkflowContext
): Promise<ActionResult> {
  const serviceId = (config.service_id as string) || context.serviceId;

  if (!serviceId) throw new Error('service_id is required for restart action');

  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
  });

  if (!service) throw new Error(`Service ${serviceId} not found`);
  if (!service.serverId) throw new Error(`Service ${serviceId} has no assigned server`);

  if (agentHub.isAgentConnected(service.serverId)) {
    await agentHub.sendCommand(service.serverId, 'restart', {
      service_id: serviceId,
    });
  }

  return { message: `Restart command sent for service ${serviceId}` };
}

/**
 * Rollback to previous deployment
 */
async function executeRollbackAction(
  config: Record<string, unknown>,
  context: WorkflowContext
): Promise<ActionResult> {
  const serviceId = (config.service_id as string) || context.serviceId;
  const targetDeploymentId = config.target_deployment_id as string | undefined;

  if (!serviceId) throw new Error('service_id is required for rollback action');

  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
    with: { project: true },
  });

  if (!service) throw new Error(`Service ${serviceId} not found`);

  // Find target deployment
  let targetDeployment;
  if (targetDeploymentId) {
    targetDeployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, targetDeploymentId),
    });
  } else {
    // Find last successful deployment
    const recentDeployments = await db.query.deployments.findMany({
      where: eq(deployments.serviceId, serviceId),
      orderBy: [desc(deployments.createdAt)],
      limit: 5,
    });

    targetDeployment = recentDeployments.find(
      d => d.status === 'running' || d.status === 'stopped'
    );
  }

  if (!targetDeployment) throw new Error('No suitable deployment found for rollback');
  if (!targetDeployment.dockerImageTag) throw new Error('Target deployment has no image');

  // Create a new deployment record for the rollback
  const [newDeployment] = await db.insert(deployments).values({
    serviceId,
    serverId: service.serverId!,
    status: 'pending',
    triggerType: 'rollback',
    rollbackFromId: context.deploymentId,
    dockerImageTag: targetDeployment.dockerImageTag,
    gitCommitSha: targetDeployment.gitCommitSha,
    gitCommitMessage: `Rollback to ${targetDeployment.id}`,
  }).returning();

  await queueDeployment({
    deploymentId: newDeployment.id,
    serviceId,
    serverId: service.serverId!,
    docker: {
      image: `${service.name}`,
      tag: targetDeployment.dockerImageTag,
    },
    envVars: service.envVars as Record<string, string> || {},
    triggerType: 'rollback',
  });

  return {
    message: `Rollback initiated to deployment ${targetDeployment.id}`,
    data: { newDeploymentId: newDeployment.id, targetDeploymentId: targetDeployment.id },
  };
}

/**
 * Run command in service container
 */
async function executeRunCommandAction(
  config: Record<string, unknown>,
  context: WorkflowContext
): Promise<ActionResult> {
  const serviceId = (config.service_id as string) || context.serviceId;
  const command = config.command as string | string[];

  if (!serviceId) throw new Error('service_id is required for run_command action');
  if (!command) throw new Error('command is required for run_command action');

  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
  });

  if (!service) throw new Error(`Service ${serviceId} not found`);
  if (!service.serverId) throw new Error(`Service ${serviceId} has no assigned server`);

  const cmdArray = Array.isArray(command) ? command : command.split(' ');

  if (agentHub.isAgentConnected(service.serverId)) {
    const result = await agentHub.sendCommand(service.serverId, 'exec', {
      service_id: serviceId,
      command: cmdArray,
      timeout: (config.timeout as number) || 60000,
    });

    return {
      message: 'Command executed',
      data: result,
    };
  }

  throw new Error(`Server ${service.serverId} is not connected`);
}

/**
 * Trigger AI analysis
 */
async function executeAiAnalyzeAction(
  config: Record<string, unknown>,
  context: WorkflowContext
): Promise<ActionResult> {
  // TODO: Implement AI analysis integration
  console.log('[Workflow] AI analyze action triggered:', config, context);
  return { message: 'AI analysis queued' };
}

/**
 * Execute approval gate action.
 * Creates a pending promotion record and pauses the workflow until approved.
 */
async function executeApprovalAction(
  config: Record<string, unknown>,
  context: WorkflowContext,
  orgId: string
): Promise<ActionResult> {
  const serviceId = (config.service_id as string) || context.serviceId;
  const description = (config.description as string) || 'Workflow approval required';

  if (!serviceId) throw new Error('service_id is required for approval action');

  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
    columns: { id: true, projectId: true },
  });

  if (!service) throw new Error(`Service ${serviceId} not found`);

  // Create a pending promotion record to represent the approval gate
  const [promotion] = await db
    .insert(promotions)
    .values({
      projectId: service.projectId,
      fromEnvironmentId: (config.from_environment_id as string) || service.projectId, // fallback
      toEnvironmentId: (config.to_environment_id as string) || service.projectId,
      deploymentId: context.deploymentId || null,
      status: 'pending',
      requestedBy: context.triggeredBy || orgId,
      metadata: {
        workflow_approval: true,
        description,
        service_id: serviceId,
        workflow_context: {
          trigger: context.trigger,
          serviceId: context.serviceId,
          deploymentId: context.deploymentId,
        },
      },
    })
    .returning();

  return {
    message: `Approval gate created (${promotion.id}). Workflow paused until approved.`,
    data: { status: 'waiting_approval', promotionId: promotion.id },
  };
}

/**
 * Interpolate template variables
 */
function interpolateTemplate(template: string, context: WorkflowContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = context[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}
