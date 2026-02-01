/**
 * GET /api/v1/traces/[traceId] - Get trace detail with all spans
 *
 * Returns all spans for a trace in a waterfall-friendly format.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTraceById, TraceSpan } from '@/lib/clickhouse/client';

interface WaterfallSpan {
  span_id: string;
  parent_span_id: string | null;
  operation_name: string;
  service_id: string;
  deployment_id: string;
  span_kind: string;
  start_time: string;
  duration_ms: number;
  status_code: string;
  status_message: string;
  attributes: Record<string, string>;
  events: Array<{
    name: string;
    timestamp_ns: number;
    attributes: Record<string, string | number | boolean>;
  }>;
  // HTTP specific
  http_method?: string;
  http_status_code?: number;
  http_route?: string;
  // Computed for waterfall
  depth: number;
  offset_ms: number;
  children: string[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const { traceId } = await params;
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

    // Get all spans for this trace
    const spans = await getTraceById(traceId);

    if (spans.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Trace not found',
            request_id: requestId,
          },
        },
        { status: 404 }
      );
    }

    // Find the earliest start time for offset calculation
    const earliestStartTime = new Date(
      Math.min(...spans.map((s) => new Date(s.start_time).getTime()))
    );

    // Build parent-child relationships
    const spanMap = new Map<string, WaterfallSpan>();
    const rootSpans: string[] = [];

    // First pass: create all spans
    for (const span of spans) {
      const startTime = new Date(span.start_time);
      const offsetMs = startTime.getTime() - earliestStartTime.getTime();

      let events: WaterfallSpan['events'] = [];
      try {
        events = JSON.parse(span.events || '[]');
      } catch {
        events = [];
      }

      const waterfallSpan: WaterfallSpan = {
        span_id: span.span_id,
        parent_span_id: span.parent_span_id,
        operation_name: span.operation_name,
        service_id: span.service_id,
        deployment_id: span.deployment_id,
        span_kind: span.span_kind,
        start_time: span.start_time,
        duration_ms: span.duration_ns / 1_000_000,
        status_code: span.status_code,
        status_message: span.status_message,
        attributes: span.attributes,
        events,
        http_method: span.http_method,
        http_status_code: span.http_status_code,
        http_route: span.http_route,
        depth: 0,
        offset_ms: offsetMs,
        children: [],
      };

      spanMap.set(span.span_id, waterfallSpan);

      if (!span.parent_span_id) {
        rootSpans.push(span.span_id);
      }
    }

    // Second pass: build parent-child relationships and calculate depth
    for (const [spanId, span] of spanMap) {
      if (span.parent_span_id) {
        const parent = spanMap.get(span.parent_span_id);
        if (parent) {
          parent.children.push(spanId);
        } else {
          // Parent not in this trace, treat as root
          rootSpans.push(spanId);
        }
      }
    }

    // Third pass: calculate depth
    function calculateDepth(spanId: string, depth: number) {
      const span = spanMap.get(spanId);
      if (!span) return;
      span.depth = depth;
      for (const childId of span.children) {
        calculateDepth(childId, depth + 1);
      }
    }

    for (const rootId of rootSpans) {
      calculateDepth(rootId, 0);
    }

    // Sort spans for waterfall display (by start time, then by depth)
    const sortedSpans = Array.from(spanMap.values()).sort((a, b) => {
      const timeDiff = a.offset_ms - b.offset_ms;
      if (timeDiff !== 0) return timeDiff;
      return a.depth - b.depth;
    });

    // Calculate trace summary
    const totalDurationMs = Math.max(...sortedSpans.map((s) => s.offset_ms + s.duration_ms));
    const services = new Set(sortedSpans.map((s) => s.service_id));
    const hasErrors = sortedSpans.some((s) => s.status_code === 'error');

    return NextResponse.json({
      success: true,
      data: {
        trace_id: traceId,
        spans: sortedSpans,
        summary: {
          span_count: sortedSpans.length,
          service_count: services.size,
          services: Array.from(services),
          total_duration_ms: totalDurationMs,
          start_time: earliestStartTime.toISOString(),
          has_errors: hasErrors,
          root_span: rootSpans.length > 0 ? spanMap.get(rootSpans[0]) : null,
        },
      },
    });
  } catch (error) {
    console.error('[API] Trace detail error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get trace detail',
          request_id: requestId,
        },
      },
      { status: 500 }
    );
  }
}
