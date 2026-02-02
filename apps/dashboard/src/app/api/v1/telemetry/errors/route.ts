import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { verifySdkKey } from '@/lib/telemetry/sdk-auth';
import { pushToTelemetryStream } from '@/lib/telemetry/sdk-ingest';

const errorItemSchema = z.object({
  timestamp: z.string(),
  error_type: z.string(),
  message: z.string(),
  stack_trace: z.string().optional().default(''),
  fingerprint: z.string(),
  trace_id: z.string().optional(),
  span_id: z.string().optional(),
  user_id: z.string().optional(),
  attributes: z.record(z.unknown()).optional().default({}),
});

const batchSchema = z.object({
  batch_id: z.string(),
  timestamp: z.string(),
  service_id: z.string(),
  deployment_id: z.string().optional(),
  errors: z.array(errorItemSchema).min(1),
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

    const { errors, service_id, deployment_id } = parsed.data;

    // Enrich each error with service/deployment IDs
    const enriched = errors.map((e) => ({
      ...e,
      service_id,
      deployment_id: deployment_id || '',
    }));

    const accepted = await pushToTelemetryStream('errors', enriched, {
      service_id,
      deployment_id,
    });

    return NextResponse.json({
      success: true,
      data: { accepted },
    });
  } catch (error) {
    console.error('[SDK Telemetry] Error ingestion failed:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to ingest errors', request_id: requestId } },
      { status: 500 }
    );
  }
}
