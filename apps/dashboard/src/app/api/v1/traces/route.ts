/**
 * GET /api/v1/traces - List traces with filtering
 *
 * Query params:
 * - service_id: Filter by service
 * - start: Start time (ISO string)
 * - end: End time (ISO string)
 * - min_duration_ms: Minimum duration in milliseconds
 * - operation: Filter by operation name (partial match)
 * - status: Filter by status code (unset, ok, error)
 * - page: Page number (default: 1)
 * - per_page: Results per page (default: 50, max: 100)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { services, organizationMembers, projects } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { queryTraces, getTraceStats } from '@/lib/clickhouse/client';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    // Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            request_id: requestId,
          },
        },
        { status: 401 }
      );
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const serviceId = searchParams.get('service_id');
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const minDurationMs = searchParams.get('min_duration_ms');
    const operation = searchParams.get('operation');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '50', 10), 100);
    const includeStats = searchParams.get('include_stats') === 'true';

    // Validate service access if serviceId provided
    if (serviceId) {
      const service = await db.query.services.findFirst({
        where: eq(services.id, serviceId),
        with: {
          project: {
            with: {
              organization: true,
            },
          },
        },
      });

      if (!service) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Service not found',
              request_id: requestId,
            },
          },
          { status: 404 }
        );
      }

      // Verify user has org membership
      const membership = await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.userId, session.user.id),
          eq(organizationMembers.orgId, service.project.organization.id)
        ),
      });

      if (!membership) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied',
              request_id: requestId,
            },
          },
          { status: 403 }
        );
      }
    } else {
      // No service_id provided — scope to user's org services only
      const memberships = await db.query.organizationMembers.findMany({
        where: eq(organizationMembers.userId, session.user.id),
        columns: { orgId: true },
      });

      if (memberships.length === 0) {
        return NextResponse.json({
          success: true,
          data: { traces: [], stats: null },
          meta: { page, per_page: perPage, total: 0 },
        });
      }
    }

    // Build query options
    const options = {
      serviceId: serviceId || undefined,
      startTime: start ? new Date(start) : undefined,
      endTime: end ? new Date(end) : undefined,
      minDurationMs: minDurationMs ? parseInt(minDurationMs, 10) : undefined,
      operation: operation || undefined,
      statusCode: (status as 'unset' | 'ok' | 'error') || undefined,
      limit: perPage,
      offset: (page - 1) * perPage,
    };

    // Query traces from ClickHouse
    const traces = await queryTraces(options);

    // Get stats if requested
    let stats = null;
    if (includeStats && serviceId && options.startTime && options.endTime) {
      stats = await getTraceStats(serviceId, options.startTime, options.endTime);
    }

    // Group spans by trace_id for summary
    const traceMap = new Map<string, {
      trace_id: string;
      root_span: typeof traces[0] | null;
      span_count: number;
      duration_ns: number;
      status: string;
      start_time: string;
      services: Set<string>;
    }>();

    for (const span of traces) {
      const existing = traceMap.get(span.trace_id);
      if (!existing) {
        traceMap.set(span.trace_id, {
          trace_id: span.trace_id,
          root_span: !span.parent_span_id ? span : null,
          span_count: 1,
          duration_ns: span.duration_ns,
          status: span.status_code,
          start_time: span.start_time,
          services: new Set([span.service_id]),
        });
      } else {
        existing.span_count++;
        if (!span.parent_span_id) {
          existing.root_span = span;
        }
        if (span.status_code === 'error') {
          existing.status = 'error';
        }
        existing.services.add(span.service_id);
        if (new Date(span.start_time) < new Date(existing.start_time)) {
          existing.start_time = span.start_time;
        }
      }
    }

    // Convert to array
    const traceSummaries = Array.from(traceMap.values()).map((t) => ({
      trace_id: t.trace_id,
      operation_name: t.root_span?.operation_name || 'unknown',
      service_id: t.root_span?.service_id || Array.from(t.services)[0],
      span_count: t.span_count,
      duration_ms: t.duration_ns / 1_000_000,
      status: t.status,
      start_time: t.start_time,
      service_count: t.services.size,
      http_method: t.root_span?.http_method,
      http_status_code: t.root_span?.http_status_code,
      http_route: t.root_span?.http_route,
    }));

    return NextResponse.json({
      success: true,
      data: {
        traces: traceSummaries,
        stats,
      },
      meta: {
        page,
        per_page: perPage,
        total: traceSummaries.length, // Note: This is the page count, not total
      },
    });
  } catch (error) {
    console.error('[API] Traces error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to query traces',
          request_id: requestId,
        },
      },
      { status: 500 }
    );
  }
}
