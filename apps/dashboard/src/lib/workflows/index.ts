import { db } from '@/lib/db';
import { workflows, workflowRuns, promotions } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { executeAction, ActionType, WorkflowContext } from './actions';

export type { ActionType, WorkflowContext };
export type TriggerType = 'error' | 'metric' | 'schedule' | 'manual';

interface ActionResult {
  action: string;
  success: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}

interface ExecutionResult {
  workflowId: string;
  success: boolean;
  actions: ActionResult[];
  executedAt: string;
  duration: number;
}

/**
 * Execute a workflow by ID
 */
export async function executeWorkflow(
  workflowId: string,
  context: WorkflowContext
): Promise<ExecutionResult> {
  const startTime = Date.now();

  const workflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, workflowId),
  });

  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  if (!workflow.isActive) {
    throw new Error(`Workflow ${workflowId} is not active`);
  }

  console.log(`[Workflow] Executing workflow "${workflow.name}" (${workflowId})`);

  // Create workflow run record
  const [run] = await db.insert(workflowRuns).values({
    workflowId,
    status: 'running',
    trigger: context.trigger,
    context: context as Record<string, unknown>,
    triggeredBy: context.triggeredBy || null,
  }).returning();

  const actions = workflow.actions as Array<{ type: ActionType; config: Record<string, unknown> }>;
  const results: ActionResult[] = [];
  let allSuccess = true;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    try {
      const result = await executeAction(action.type, action.config, context, workflow.orgId);

      // Check if this is an approval gate that requires pausing
      const resultData = result.data as { status?: string; promotionId?: string } | undefined;
      if (action.type === 'approval' && resultData?.status === 'waiting_approval') {
        results.push({
          action: action.type,
          success: true,
          message: result.message,
          data: {
            ...resultData,
            paused: true,
            paused_at_step: i,
            remaining_actions: actions.length - i - 1,
          },
        });

        // Save workflow run state for resumption
        // Store paused state in the promotion's metadata
        if (resultData.promotionId) {
          await db
            .update(promotions)
            .set({
              metadata: {
                workflow_approval: true,
                workflow_id: workflowId,
                paused_at_step: i + 1, // Resume from next step
                context,
                remaining_actions: actions.slice(i + 1),
              },
            })
            .where(eq(promotions.id, resultData.promotionId));
        }

        // Update run as paused
        await db.update(workflowRuns).set({
          status: 'paused',
          actions: results,
          duration: Date.now() - startTime,
        }).where(eq(workflowRuns.id, run.id));

        // Return early — workflow is paused
        return {
          workflowId,
          success: true,
          actions: results,
          executedAt: new Date().toISOString(),
          duration: Date.now() - startTime,
        };
      }

      results.push({
        action: action.type,
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      allSuccess = false;
      results.push({
        action: action.type,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      console.error(`[Workflow] Action ${action.type} failed:`, error);
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[Workflow] Completed "${workflow.name}" in ${duration}ms - ${allSuccess ? 'SUCCESS' : 'PARTIAL FAILURE'}`);

  // Update workflow run record
  await db.update(workflowRuns).set({
    status: allSuccess ? 'completed' : 'partial_failure',
    actions: results,
    duration,
    completedAt: new Date(),
  }).where(eq(workflowRuns.id, run.id));

  return {
    workflowId,
    success: allSuccess,
    actions: results,
    executedAt: new Date().toISOString(),
    duration,
  };
}

/**
 * Trigger workflows based on event type
 */
export async function triggerWorkflows(
  orgId: string,
  triggerType: TriggerType,
  context: WorkflowContext
): Promise<ExecutionResult[]> {
  const allWorkflows = await db.query.workflows.findMany({
    where: and(
      eq(workflows.orgId, orgId),
      eq(workflows.isActive, true)
    ),
  });

  // Filter by trigger type from the jsonb field
  const matchingWorkflows = allWorkflows.filter(w => {
    const trigger = w.trigger as { type: string } | null;
    return trigger?.type === triggerType;
  });

  console.log(`[Workflow] Found ${matchingWorkflows.length} workflows for trigger "${triggerType}"`);

  const results: ExecutionResult[] = [];

  for (const workflow of matchingWorkflows) {
    if (shouldTriggerWorkflow(workflow, context)) {
      try {
        const result = await executeWorkflow(workflow.id, context);
        results.push(result);
      } catch (error) {
        console.error(`[Workflow] Failed to execute workflow ${workflow.id}:`, error);
        results.push({
          workflowId: workflow.id,
          success: false,
          actions: [],
          executedAt: new Date().toISOString(),
          duration: 0,
        });
      }
    }
  }

  return results;
}

/**
 * Check if workflow conditions match the context
 */
function shouldTriggerWorkflow(
  workflow: typeof workflows.$inferSelect,
  context: WorkflowContext
): boolean {
  const trigger = workflow.trigger as { type: string; conditions?: Record<string, unknown> } | null;
  const conditions = trigger?.conditions;

  if (!conditions || Object.keys(conditions).length === 0) {
    return true;
  }

  // Check service filter
  if (conditions.service_ids && Array.isArray(conditions.service_ids)) {
    if (context.serviceId && !conditions.service_ids.includes(context.serviceId)) {
      return false;
    }
  }

  // Check server filter
  if (conditions.server_ids && Array.isArray(conditions.server_ids)) {
    if (context.serverId && !conditions.server_ids.includes(context.serverId)) {
      return false;
    }
  }

  // Check metric threshold
  if (conditions.metric_name && context.metricName !== conditions.metric_name) {
    return false;
  }

  if (conditions.threshold !== undefined && context.metricValue !== undefined) {
    const threshold = conditions.threshold as number;
    const operator = (conditions.operator as string) || 'gt';

    switch (operator) {
      case 'gt': return context.metricValue > threshold;
      case 'lt': return context.metricValue < threshold;
      case 'gte': return context.metricValue >= threshold;
      case 'lte': return context.metricValue <= threshold;
      case 'eq': return context.metricValue === threshold;
      default: return true;
    }
  }

  // Check error severity
  if (conditions.min_severity && context.errorSeverity) {
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const minIndex = severityOrder.indexOf(conditions.min_severity as string);
    const contextIndex = severityOrder.indexOf(context.errorSeverity as string);
    if (contextIndex < minIndex) return false;
  }

  return true;
}

/**
 * Trigger error-based workflows
 */
export async function triggerErrorWorkflows(
  orgId: string,
  errorContext: {
    serviceId: string;
    errorMessage: string;
    errorType?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    deploymentId?: string;
  }
): Promise<ExecutionResult[]> {
  return triggerWorkflows(orgId, 'error', {
    trigger: 'error',
    ...errorContext,
    errorSeverity: errorContext.severity,
  });
}

/**
 * Trigger metric-based workflows
 */
export async function triggerMetricWorkflows(
  orgId: string,
  metricContext: {
    serverId?: string;
    serviceId?: string;
    metricName: string;
    metricValue: number;
  }
): Promise<ExecutionResult[]> {
  return triggerWorkflows(orgId, 'metric', {
    trigger: 'metric',
    ...metricContext,
  });
}

/**
 * Resume a paused workflow run after approval.
 * Reads the saved state from the promotion record and continues execution.
 */
export async function resumeWorkflowRun(promotionId: string): Promise<ExecutionResult | null> {
  const promotion = await db.query.promotions.findFirst({
    where: eq(promotions.id, promotionId),
  });

  if (!promotion) {
    console.error(`[Workflow] Promotion ${promotionId} not found for resume`);
    return null;
  }

  const metadata = promotion.metadata as {
    workflow_approval?: boolean;
    workflow_id?: string;
    paused_at_step?: number;
    context?: WorkflowContext;
    remaining_actions?: Array<{ type: ActionType; config: Record<string, unknown> }>;
  } | null;

  if (!metadata?.workflow_approval || !metadata.workflow_id || !metadata.remaining_actions) {
    console.error(`[Workflow] Promotion ${promotionId} does not contain workflow resume state`);
    return null;
  }

  const workflow = await db.query.workflows.findFirst({
    where: eq(workflows.id, metadata.workflow_id),
  });

  if (!workflow) {
    console.error(`[Workflow] Workflow ${metadata.workflow_id} not found`);
    return null;
  }

  console.log(
    `[Workflow] Resuming workflow "${workflow.name}" from step ${metadata.paused_at_step}, ${metadata.remaining_actions.length} actions remaining`
  );

  const context = metadata.context || { trigger: 'manual' };
  const startTime = Date.now();
  const results: ActionResult[] = [];
  let allSuccess = true;

  for (const action of metadata.remaining_actions) {
    try {
      const result = await executeAction(action.type, action.config, context, workflow.orgId);
      results.push({
        action: action.type,
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      allSuccess = false;
      results.push({
        action: action.type,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      console.error(`[Workflow] Action ${action.type} failed:`, error);
    }
  }

  // Update promotion to deployed
  await db
    .update(promotions)
    .set({
      status: allSuccess ? 'deployed' : 'failed',
      deployedAt: allSuccess ? new Date() : undefined,
    })
    .where(eq(promotions.id, promotionId));

  const duration = Date.now() - startTime;
  console.log(`[Workflow] Resumed "${workflow.name}" completed in ${duration}ms - ${allSuccess ? 'SUCCESS' : 'PARTIAL FAILURE'}`);

  return {
    workflowId: workflow.id,
    success: allSuccess,
    actions: results,
    executedAt: new Date().toISOString(),
    duration,
  };
}

/**
 * Get workflow execution history
 */
export async function getWorkflowHistory(
  workflowId: string,
  limit = 20
): Promise<Array<{
  id: string;
  status: string;
  startedAt: string;
  duration: number;
  triggeredBy?: string;
}>> {
  const runs = await db.query.workflowRuns.findMany({
    where: eq(workflowRuns.workflowId, workflowId),
    orderBy: [desc(workflowRuns.startedAt)],
    limit,
  });

  return runs.map((r) => ({
    id: r.id,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    duration: r.duration ?? 0,
    triggeredBy: r.triggeredBy ?? undefined,
  }));
}
