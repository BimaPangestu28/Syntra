import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { verifySdkKey } from '@/lib/telemetry/sdk-auth';
import { pushToTelemetryStream } from '@/lib/telemetry/sdk-ingest';

const spanItemSchema = z.object({
  trace_id: z.string(),
  span_id: z.string(),
  parent_span_id: z.string().optional(),
  operation_name: z.string(),
  span_kind: z.enum(['internal', 'server', 'client', 'producer', 'consumer']),
  start_time_ns: z.number(),
  duration_ns: z.number(),
  status: z.object({
    code: z.enum(['unset', 'ok', 'error']),
    message: z.string().optional(),
  }),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
  events: z.array(z.object({
    name: z.string(),
    timestamp_ns: z.number(),
    attributes: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
  })).optional().default([]),
  links: z.array(z.object({
    trace_id: z.string(),
    span_id: z.string(),
    attributes: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
  })).optional().default([]),
});

const batchSchema = z.object({
  batch_id: z.string(),
  timestamp: z.string(),
  service_id: z.string(),
  deployment_id: z.string().optional(),
  spans: z.array(spanItemSchema).min(1),
});

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const apiKey = req.headers.get('x-syntra-key');
    const projectId = req.headers.get('x-syntra-project');

    if (!apiKey || !projectId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing X-Syntra-Key or X-Syntra-Project header', request_id: requestId } },
        { status: 401 }
      );
    }

    const auth = await verifySdkKey(apiKey, projectId);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid API key or project', request_id: requestId } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = batchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.errors, request_id: requestId } },
        { status: 400 }
      );
    }

    const { spans, service_id, deployment_id } = parsed.data;

    const enriched = spans.map((s) => ({
      ...s,
      service_id,
      deployment_id: deployment_id || '',
    }));

    const accepted = await pushToTelemetryStream('traces', enriched, {
      service_id,
      deployment_id,
    });

    return NextResponse.json({
      success: true,
      data: { accepted },
    });
  } catch (error) {
    console.error('[SDK Telemetry] Span ingestion failed:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to ingest spans', request_id: requestId } },
      { status: 500 }
    );
  }
}
