import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { errorGroups, services, deployments, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { analyzeError } from '@/lib/ai';
import crypto from 'crypto';

// POST /api/v1/ai/analyze-error - Analyze an error with AI
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { error_group_id, stack_trace, error_message, error_type, service_id } = body;

    // If error_group_id provided, fetch from database
    if (error_group_id) {
      const errorGroup = await db.query.errorGroups.findFirst({
        where: eq(errorGroups.id, error_group_id),
        with: {
          service: {
            with: {
              project: true,
            },
          },
        },
      });

      if (!errorGroup) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Error group not found', request_id: crypto.randomUUID() } },
          { status: 404 }
        );
      }

      // Check access
      const membership = await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.userId, session.user.id),
          eq(organizationMembers.orgId, errorGroup.service.project.orgId)
        ),
      });

      if (!membership) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
          { status: 403 }
        );
      }

      // Get recent deployments for context
      const recentDeploys = await db.query.deployments.findMany({
        where: eq(deployments.serviceId, errorGroup.serviceId),
        orderBy: [desc(deployments.createdAt)],
        limit: 5,
      });

      const recentChanges = recentDeploys.map(d =>
        `${d.gitCommitMessage || 'No commit message'} (${d.createdAt.toISOString()})`
      );

      const analysis = await analyzeError({
        stackTrace: (errorGroup.metadata as any)?.stackTrace || errorGroup.message,
        errorMessage: errorGroup.message,
        errorType: errorGroup.type,
        serviceName: errorGroup.service.name,
        environment: 'production',
        recentChanges,
        affectedUsers: errorGroup.userCount || undefined,
        frequency: errorGroup.eventCount,
      });

      // Store analysis in error group
      await db.update(errorGroups)
        .set({
          metadata: {
            ...(errorGroup.metadata as object || {}),
            aiAnalysis: analysis,
            aiAnalyzedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(errorGroups.id, error_group_id));

      return NextResponse.json({
        success: true,
        data: {
          error_group_id,
          analysis,
          analyzed_at: new Date().toISOString(),
        },
      });
    }

    // Direct analysis from provided data
    if (!stack_trace || !error_message) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'stack_trace and error_message are required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    let serviceName = 'Unknown Service';
    if (service_id) {
      const service = await db.query.services.findFirst({
        where: eq(services.id, service_id),
      });
      if (service) serviceName = service.name;
    }

    const analysis = await analyzeError({
      stackTrace: stack_trace,
      errorMessage: error_message,
      errorType: error_type || 'Error',
      serviceName,
    });

    return NextResponse.json({
      success: true,
      data: { analysis },
    });
  } catch (error) {
    console.error('POST /api/v1/ai/analyze-error error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
