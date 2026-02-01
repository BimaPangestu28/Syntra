import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { services, deployments, errorGroups, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { getRecommendations, ServiceContext } from '@/lib/ai';
import crypto from 'crypto';

// GET /api/v1/ai/recommendations - Get AI recommendations for a service
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const serviceId = searchParams.get('service_id');

    if (!serviceId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'service_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const service = await db.query.services.findFirst({
      where: eq(services.id, serviceId),
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

    // Check access
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.orgId, service.project.orgId)
      ),
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Get recent errors
    const recentErrors = await db.query.errorGroups.findMany({
      where: eq(errorGroups.serviceId, serviceId),
      orderBy: [desc(errorGroups.eventCount)],
      limit: 10,
    });

    // Build service context
    const serviceContext: ServiceContext = {
      serviceName: service.name,
      serviceType: service.type,
      recentErrors: recentErrors.map(e => ({
        message: e.message,
        count: e.eventCount,
      })),
      // TODO: Replace with real metrics from telemetry
      metrics: {
        requestRate: Math.random() * 100,
        errorRate: recentErrors.length > 0 ? Math.random() * 5 : 0,
        p95Latency: Math.random() * 500 + 50,
        cpuUsage: Math.random() * 50 + 10,
        memoryUsage: Math.random() * 60 + 20,
      },
    };

    const result = await getRecommendations(serviceContext);

    return NextResponse.json({
      success: true,
      data: {
        service_id: serviceId,
        service_name: service.name,
        recommendations: result.recommendations,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/ai/recommendations error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
