import { db } from '@/lib/db';
import { deploymentStrategies, deployments, services } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { agentHub } from '@/lib/agent/hub';

/**
 * Start a blue-green deployment switch.
 * The inactive color gets the new deployment, then traffic switches.
 */
export async function blueGreenSwitch(serviceId: string, newDeploymentId: string): Promise<{ previousColor: string; newColor: string }> {
  const strategy = await db.query.deploymentStrategies.findFirst({
    where: eq(deploymentStrategies.serviceId, serviceId),
  });

  if (!strategy || strategy.strategy !== 'blue_green') {
    throw new Error('Service does not have blue-green strategy configured');
  }

  const previousColor = strategy.activeColor || 'blue';
  const newColor = previousColor === 'blue' ? 'green' : 'blue';

  // Update strategy: assign new deployment to inactive color, switch active
  const updateData: Record<string, unknown> = {
    activeColor: newColor,
    lastSwitchedAt: new Date(),
    updatedAt: new Date(),
  };

  if (newColor === 'blue') {
    updateData.blueDeploymentId = newDeploymentId;
  } else {
    updateData.greenDeploymentId = newDeploymentId;
  }

  await db.update(deploymentStrategies)
    .set(updateData)
    .where(eq(deploymentStrategies.id, strategy.id));

  // Send traffic switch command to agent
  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (service?.serverId && agentHub.isAgentConnected(service.serverId)) {
    await agentHub.sendCommand(service.serverId, 'traffic_switch', {
      service_id: serviceId,
      active_deployment_id: newDeploymentId,
      strategy: 'blue_green',
    });
  }

  return { previousColor, newColor };
}

/**
 * Rollback blue-green by switching back to previous color.
 */
export async function blueGreenRollback(serviceId: string): Promise<void> {
  const strategy = await db.query.deploymentStrategies.findFirst({
    where: eq(deploymentStrategies.serviceId, serviceId),
  });

  if (!strategy || strategy.strategy !== 'blue_green') {
    throw new Error('Service does not have blue-green strategy configured');
  }

  const previousColor = strategy.activeColor === 'blue' ? 'green' : 'blue';
  const previousDeploymentId = previousColor === 'blue'
    ? strategy.blueDeploymentId
    : strategy.greenDeploymentId;

  if (!previousDeploymentId) {
    throw new Error('No previous deployment to rollback to');
  }

  await db.update(deploymentStrategies)
    .set({ activeColor: previousColor, lastSwitchedAt: new Date(), updatedAt: new Date() })
    .where(eq(deploymentStrategies.id, strategy.id));

  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (service?.serverId && agentHub.isAgentConnected(service.serverId)) {
    await agentHub.sendCommand(service.serverId, 'traffic_switch', {
      service_id: serviceId,
      active_deployment_id: previousDeploymentId,
      strategy: 'blue_green',
    });
  }
}

/**
 * Start canary deployment: set initial weight to first step.
 */
export async function canaryStart(serviceId: string, canaryDeploymentId: string): Promise<{ weight: number }> {
  const strategy = await db.query.deploymentStrategies.findFirst({
    where: eq(deploymentStrategies.serviceId, serviceId),
  });

  if (!strategy || strategy.strategy !== 'canary') {
    throw new Error('Service does not have canary strategy configured');
  }

  const steps = (strategy.canarySteps as number[]) || [10, 25, 50, 75, 100];
  const firstStep = steps[0] || 10;

  await db.update(deploymentStrategies)
    .set({
      canaryDeploymentId,
      canaryWeight: firstStep,
      canaryCurrentStep: 0,
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(deploymentStrategies.id, strategy.id));

  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (service?.serverId && agentHub.isAgentConnected(service.serverId)) {
    await agentHub.sendCommand(service.serverId, 'traffic_split', {
      service_id: serviceId,
      canary_deployment_id: canaryDeploymentId,
      weight: firstStep,
    });
  }

  return { weight: firstStep };
}

/**
 * Advance canary to next step.
 */
export async function canaryAdvance(serviceId: string): Promise<{ weight: number; isComplete: boolean }> {
  const strategy = await db.query.deploymentStrategies.findFirst({
    where: eq(deploymentStrategies.serviceId, serviceId),
  });

  if (!strategy || strategy.strategy !== 'canary' || !strategy.isActive) {
    throw new Error('No active canary deployment');
  }

  const steps = (strategy.canarySteps as number[]) || [10, 25, 50, 75, 100];
  const nextStepIndex = (strategy.canaryCurrentStep || 0) + 1;
  const isComplete = nextStepIndex >= steps.length;
  const weight = isComplete ? 100 : steps[nextStepIndex];

  if (isComplete) {
    // Promote canary to full traffic
    await db.update(deploymentStrategies)
      .set({
        canaryWeight: 100,
        canaryCurrentStep: nextStepIndex,
        isActive: false,
        lastSwitchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deploymentStrategies.id, strategy.id));
  } else {
    await db.update(deploymentStrategies)
      .set({
        canaryWeight: weight,
        canaryCurrentStep: nextStepIndex,
        updatedAt: new Date(),
      })
      .where(eq(deploymentStrategies.id, strategy.id));
  }

  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (service?.serverId && agentHub.isAgentConnected(service.serverId)) {
    await agentHub.sendCommand(service.serverId, 'traffic_split', {
      service_id: serviceId,
      canary_deployment_id: strategy.canaryDeploymentId,
      weight,
    });
  }

  return { weight, isComplete };
}

/**
 * Abort canary: route all traffic back to stable deployment.
 */
export async function canaryAbort(serviceId: string): Promise<void> {
  const strategy = await db.query.deploymentStrategies.findFirst({
    where: eq(deploymentStrategies.serviceId, serviceId),
  });

  if (!strategy || strategy.strategy !== 'canary') {
    throw new Error('Service does not have canary strategy');
  }

  await db.update(deploymentStrategies)
    .set({
      canaryWeight: 0,
      canaryCurrentStep: 0,
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(deploymentStrategies.id, strategy.id));

  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (service?.serverId && agentHub.isAgentConnected(service.serverId)) {
    await agentHub.sendCommand(service.serverId, 'traffic_split', {
      service_id: serviceId,
      canary_deployment_id: null,
      weight: 0,
    });
  }
}
