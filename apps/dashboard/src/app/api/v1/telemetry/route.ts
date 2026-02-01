import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { servers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { ingestTelemetryBatch } from '@/lib/telemetry/ingestion';
import { TelemetryBatch } from '@/lib/telemetry/types';

// Verify agent token and get server info
async function verifyAgentToken(token: string): Promise<{ serverId: string; orgId: string } | null> {
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const server = await db.query.servers.findFirst({
      where: eq(servers.agentTokenHash, tokenHash),
    });

    if (!server) return null;

    return {
      serverId: server.id,
      orgId: server.orgId,
    };
  } catch (error) {
    console.error('[Telemetry] Token verification error:', error);
    return null;
  }
}

// POST /api/v1/telemetry - Ingest telemetry batch from agent
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    // Verify agent token
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header', request_id: requestId } },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const serverInfo = await verifyAgentToken(token);

    if (!serverInfo) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid agent token', request_id: requestId } },
        { status: 401 }
      );
    }

    // Parse batch
    const body = await req.json();
    const batch: TelemetryBatch = {
      batch_id: body.batch_id || crypto.randomUUID(),
      server_id: serverInfo.serverId,
      agent_id: body.agent_id || 'unknown',
      timestamp: body.timestamp || new Date().toISOString(),
      metrics: body.metrics,
      logs: body.logs,
      events: body.events,
    };

    // Validate required fields
    if (!batch.metrics && !batch.logs && !batch.events) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Batch must contain metrics, logs, or events', request_id: requestId } },
        { status: 400 }
      );
    }

    // Ingest the batch
    await ingestTelemetryBatch(batch);

    return NextResponse.json({
      success: true,
      data: {
        batch_id: batch.batch_id,
        ingested_at: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[Telemetry] Ingestion error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to ingest telemetry', request_id: requestId } },
      { status: 500 }
    );
  }
}

// GET /api/v1/telemetry - Health check
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Telemetry ingestion endpoint is ready',
    version: '1.0',
  });
}
