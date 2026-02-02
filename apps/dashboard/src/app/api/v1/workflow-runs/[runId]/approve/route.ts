import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promotions, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { resumeWorkflowRun } from '@/lib/workflows';

// Helper to check org access
async function checkOrgAccess(
  userId: string,
  orgId: string,
  allowedRoles: string[] = ['owner', 'admin', 'developer']
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

/**
 * POST /api/v1/workflow-runs/:runId/approve - Approve or reject a workflow approval gate
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const action = body.action as 'approve' | 'reject';
    const reason = body.reason as string | undefined;

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'action must be "approve" or "reject"',
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    // Find the pending promotion (used as approval gate record)
    const promotion = await db.query.promotions.findFirst({
      where: and(
        eq(promotions.id, params.runId),
        eq(promotions.status, 'pending')
      ),
      with: {
        project: true,
      },
    });

    if (!promotion) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Pending approval not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, promotion.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    if (action === 'approve') {
      // Update promotion record
      const [updated] = await db
        .update(promotions)
        .set({
          status: 'approved',
          approvedBy: session.user.id,
          approvedAt: new Date(),
        })
        .where(eq(promotions.id, params.runId))
        .returning();

      // Resume the workflow run
      try {
        await resumeWorkflowRun(params.runId);
      } catch (resumeError) {
        console.error(`[WorkflowApprove] Failed to resume workflow run ${params.runId}:`, resumeError);
      }

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          status: 'approved',
          approved_by: session.user.id,
          approved_at: updated.approvedAt?.toISOString(),
        },
      });
    } else {
      // Reject
      const [updated] = await db
        .update(promotions)
        .set({
          status: 'rejected',
          rejectedBy: session.user.id,
          rejectedAt: new Date(),
          rejectedReason: reason || undefined,
        })
        .where(eq(promotions.id, params.runId))
        .returning();

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          status: 'rejected',
          rejected_by: session.user.id,
          rejected_at: updated.rejectedAt?.toISOString(),
          rejected_reason: updated.rejectedReason,
        },
      });
    }
  } catch (error) {
    console.error('POST /api/v1/workflow-runs/:runId/approve error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
