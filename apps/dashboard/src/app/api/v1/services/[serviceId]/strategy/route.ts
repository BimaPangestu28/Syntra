import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deploymentStrategies, services, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';
import {
  blueGreenSwitch,
  blueGreenRollback,
  canaryStart,
  canaryAdvance,
  canaryAbort,
} from '@/lib/deployments/strategies';

// Helper to check org access
async function checkOrgAccess(
  userId: string,
  orgId: string,
  allowedRoles: string[] = ['owner', 'admin', 'developer', 'viewer']
) {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });

  if (!membership) return null;
  if (!allowedRoles.includes(membership.role)) return null;
  return membership;
}

// Zod schemas
const updateStrategySchema = z.object({
  strategy: z.enum(['rolling', 'blue_green', 'canary']),
  canary_steps: z.array(z.number().int().min(0).max(100)).optional(),
  canary_auto_promote: z.boolean().optional(),
  canary_auto_promote_delay: z.number().int().min(30).max(3600).optional(),
  canary_error_threshold: z.number().int().min(0).max(100).optional(),
  canary_latency_threshold: z.number().int().min(100).max(10000).optional(),
});

const executeActionSchema = z.object({
  action: z.enum(['switch', 'rollback', 'canary_start', 'canary_advance', 'canary_abort']),
  deployment_id: z.string().uuid().optional(),
});

// GET /api/v1/services/:serviceId/strategy - Get current strategy for service
export async function GET(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    // Get service with project
    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, service.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Get strategy
    const strategy = await db.query.deploymentStrategies.findFirst({
      where: eq(deploymentStrategies.serviceId, params.serviceId),
    });

    if (!strategy) {
      return NextResponse.json({
        success: true,
        data: {
          service_id: params.serviceId,
          strategy: 'rolling',
          is_configured: false,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: strategy.id,
        service_id: strategy.serviceId,
        strategy: strategy.strategy,
        is_configured: true,
        // Blue-green details
        blue_deployment_id: strategy.blueDeploymentId,
        green_deployment_id: strategy.greenDeploymentId,
        active_color: strategy.activeColor,
        // Canary details
        canary_deployment_id: strategy.canaryDeploymentId,
        canary_weight: strategy.canaryWeight,
        canary_steps: strategy.canarySteps,
        canary_current_step: strategy.canaryCurrentStep,
        canary_auto_promote: strategy.canaryAutoPromote,
        canary_auto_promote_delay: strategy.canaryAutoPromoteDelay,
        canary_error_threshold: strategy.canaryErrorThreshold,
        canary_latency_threshold: strategy.canaryLatencyThreshold,
        // Status
        is_active: strategy.isActive,
        last_switched_at: strategy.lastSwitchedAt?.toISOString(),
        created_at: strategy.createdAt?.toISOString(),
        updated_at: strategy.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/services/:serviceId/strategy error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PUT /api/v1/services/:serviceId/strategy - Configure strategy
export async function PUT(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    // Get service with project
    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (admin or owner required for strategy changes)
    const access = await checkOrgAccess(session.user.id, service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Validate request body
    const body = await req.json();
    const parsed = updateStrategySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parsed.error.errors,
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    const {
      strategy,
      canary_steps,
      canary_auto_promote,
      canary_auto_promote_delay,
      canary_error_threshold,
      canary_latency_threshold,
    } = parsed.data;

    // Check if strategy exists
    const existingStrategy = await db.query.deploymentStrategies.findFirst({
      where: eq(deploymentStrategies.serviceId, params.serviceId),
    });

    const strategyData: Partial<typeof deploymentStrategies.$inferInsert> = {
      strategy,
      updatedAt: new Date(),
    };

    if (canary_steps !== undefined) strategyData.canarySteps = canary_steps;
    if (canary_auto_promote !== undefined) strategyData.canaryAutoPromote = canary_auto_promote;
    if (canary_auto_promote_delay !== undefined) strategyData.canaryAutoPromoteDelay = canary_auto_promote_delay;
    if (canary_error_threshold !== undefined) strategyData.canaryErrorThreshold = canary_error_threshold;
    if (canary_latency_threshold !== undefined) strategyData.canaryLatencyThreshold = canary_latency_threshold;

    let result;

    if (existingStrategy) {
      // Update existing strategy
      [result] = await db
        .update(deploymentStrategies)
        .set(strategyData)
        .where(eq(deploymentStrategies.id, existingStrategy.id))
        .returning();
    } else {
      // Create new strategy
      [result] = await db
        .insert(deploymentStrategies)
        .values({
          ...strategyData,
          serviceId: params.serviceId,
        })
        .returning();
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.id,
        service_id: result.serviceId,
        strategy: result.strategy,
        canary_steps: result.canarySteps,
        canary_auto_promote: result.canaryAutoPromote,
        canary_auto_promote_delay: result.canaryAutoPromoteDelay,
        canary_error_threshold: result.canaryErrorThreshold,
        canary_latency_threshold: result.canaryLatencyThreshold,
        created_at: result.createdAt?.toISOString(),
        updated_at: result.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PUT /api/v1/services/:serviceId/strategy error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/services/:serviceId/strategy - Execute strategy action
export async function POST(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    // Get service with project
    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access (admin or owner required for deployments)
    const access = await checkOrgAccess(session.user.id, service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Validate request body
    const body = await req.json();
    const parsed = executeActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parsed.error.errors,
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    const { action, deployment_id } = parsed.data;

    // Execute action
    try {
      switch (action) {
        case 'switch': {
          if (!deployment_id) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'deployment_id is required for switch action',
                  request_id: crypto.randomUUID(),
                },
              },
              { status: 400 }
            );
          }
          const result = await blueGreenSwitch(params.serviceId, deployment_id);
          return NextResponse.json({
            success: true,
            data: {
              action: 'switch',
              previous_color: result.previousColor,
              new_color: result.newColor,
              deployment_id,
            },
          });
        }

        case 'rollback': {
          await blueGreenRollback(params.serviceId);
          return NextResponse.json({
            success: true,
            data: {
              action: 'rollback',
              message: 'Blue-green rollback completed',
            },
          });
        }

        case 'canary_start': {
          if (!deployment_id) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'deployment_id is required for canary_start action',
                  request_id: crypto.randomUUID(),
                },
              },
              { status: 400 }
            );
          }
          const result = await canaryStart(params.serviceId, deployment_id);
          return NextResponse.json({
            success: true,
            data: {
              action: 'canary_start',
              deployment_id,
              weight: result.weight,
            },
          });
        }

        case 'canary_advance': {
          const result = await canaryAdvance(params.serviceId);
          return NextResponse.json({
            success: true,
            data: {
              action: 'canary_advance',
              weight: result.weight,
              is_complete: result.isComplete,
            },
          });
        }

        case 'canary_abort': {
          await canaryAbort(params.serviceId);
          return NextResponse.json({
            success: true,
            data: {
              action: 'canary_abort',
              message: 'Canary deployment aborted',
            },
          });
        }

        default:
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'INVALID_ACTION',
                message: `Unknown action: ${action}`,
                request_id: crypto.randomUUID(),
              },
            },
            { status: 400 }
          );
      }
    } catch (strategyError) {
      console.error('Strategy execution error:', strategyError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'STRATEGY_ERROR',
            message: strategyError instanceof Error ? strategyError.message : 'Strategy execution failed',
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('POST /api/v1/services/:serviceId/strategy error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
