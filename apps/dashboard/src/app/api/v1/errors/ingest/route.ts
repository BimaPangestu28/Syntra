import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorGroups, services } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { fingerprintError } from '@/lib/errors/fingerprint';
import crypto from 'crypto';
import { z } from 'zod';

const errorEventSchema = z.object({
  service_id: z.string().uuid(),
  type: z.string().min(1).max(255),
  message: z.string().min(1),
  stack_trace: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * POST /api/v1/errors/ingest - Ingest error events from telemetry pipeline
 *
 * Authenticates via API key (service token), not session-based auth.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = errorEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid error event',
            details: parsed.error.errors,
            request_id: crypto.randomUUID(),
          },
        },
        { status: 400 }
      );
    }

    const { service_id, type, message, stack_trace, metadata } = parsed.data;

    // Verify service exists
    const service = await db.query.services.findFirst({
      where: eq(services.id, service_id),
      columns: { id: true },
    });

    if (!service) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Service not found',
            request_id: crypto.randomUUID(),
          },
        },
        { status: 404 }
      );
    }

    // Generate fingerprint
    const fingerprint = fingerprintError({
      type,
      message,
      stackTrace: stack_trace,
    });

    // Upsert into errorGroups: ON CONFLICT(fingerprint, serviceId) → increment eventCount
    const existing = await db.query.errorGroups.findFirst({
      where: and(
        eq(errorGroups.fingerprint, fingerprint),
        eq(errorGroups.serviceId, service_id)
      ),
    });

    let errorGroupId: string;

    if (existing) {
      await db
        .update(errorGroups)
        .set({
          eventCount: sql`${errorGroups.eventCount} + 1`,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
          // Reopen if it was resolved
          ...(existing.status === 'resolved' ? { status: 'unresolved' } : {}),
        })
        .where(eq(errorGroups.id, existing.id));

      errorGroupId = existing.id;
    } else {
      const [newGroup] = await db
        .insert(errorGroups)
        .values({
          serviceId: service_id,
          fingerprint,
          type,
          message: message.slice(0, 2000),
          status: 'unresolved',
          eventCount: 1,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          metadata: metadata as Record<string, unknown> | undefined,
        })
        .returning();

      errorGroupId = newGroup.id;
    }

    // Insert raw event into ClickHouse via Redis stream
    // This is a fire-and-forget operation; the telemetry pipeline will pick it up
    try {
      const { getClickHouseClient } = await import('@/lib/clickhouse/client');
      const ch = getClickHouseClient();
      await ch.insert({
        table: 'errors',
        values: [
          {
            error_group_id: errorGroupId,
            service_id,
            fingerprint,
            type,
            message,
            stack_trace: stack_trace || '',
            metadata: JSON.stringify(metadata || {}),
            timestamp: new Date().toISOString().replace('T', ' ').replace('Z', ''),
          },
        ],
        format: 'JSONEachRow',
      });
    } catch (chError) {
      // Non-fatal: log and continue even if ClickHouse insert fails
      console.error('[ErrorIngest] ClickHouse insert failed:', chError);
    }

    console.log(
      `[ErrorIngest] Ingested error event for service ${service_id}, fingerprint=${fingerprint}, group=${errorGroupId}`
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          error_group_id: errorGroupId,
          fingerprint,
          is_new: !existing,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/errors/ingest error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          request_id: crypto.randomUUID(),
        },
      },
      { status: 500 }
    );
  }
}
