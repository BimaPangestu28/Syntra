import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userNotificationPreferences } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

const NOTIFICATION_TYPES = ['deployment', 'error', 'member', 'workflow'] as const;

const updatePreferencesSchema = z.object({
  preferences: z.array(
    z.object({
      type: z.enum(NOTIFICATION_TYPES),
      enabled: z.boolean(),
    })
  ),
});

// GET /api/v1/settings/notifications
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const prefs = await db.query.userNotificationPreferences.findMany({
      where: eq(userNotificationPreferences.userId, session.user.id),
    });

    // Build full preferences map, defaulting to enabled
    const prefsMap = new Map(prefs.map((p) => [p.type, p.enabled]));
    const data = NOTIFICATION_TYPES.map((type) => ({
      type,
      enabled: prefsMap.has(type) ? prefsMap.get(type)! : true,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/v1/settings/notifications error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PUT /api/v1/settings/notifications
export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = updatePreferencesSchema.safeParse(body);
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

    const { preferences } = parsed.data;

    // Upsert each preference
    for (const pref of preferences) {
      const existing = await db.query.userNotificationPreferences.findFirst({
        where: and(
          eq(userNotificationPreferences.userId, session.user.id),
          eq(userNotificationPreferences.type, pref.type)
        ),
      });

      if (existing) {
        await db
          .update(userNotificationPreferences)
          .set({ enabled: pref.enabled, updatedAt: new Date() })
          .where(eq(userNotificationPreferences.id, existing.id));
      } else {
        await db.insert(userNotificationPreferences).values({
          userId: session.user.id,
          type: pref.type,
          enabled: pref.enabled,
        });
      }
    }

    // Return updated preferences
    const updatedPrefs = await db.query.userNotificationPreferences.findMany({
      where: eq(userNotificationPreferences.userId, session.user.id),
    });

    const prefsMap = new Map(updatedPrefs.map((p) => [p.type, p.enabled]));
    const data = NOTIFICATION_TYPES.map((type) => ({
      type,
      enabled: prefsMap.has(type) ? prefsMap.get(type)! : true,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('PUT /api/v1/settings/notifications error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
