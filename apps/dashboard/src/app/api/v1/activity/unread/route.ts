import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { activityFeed, organizationMembers } from '@/lib/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const memberships = await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, session.user.id),
    });
    const orgIds = memberships.map((m) => m.orgId);

    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: { count: 0 } });
    }

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityFeed)
      .where(
        and(
          inArray(activityFeed.orgId, orgIds),
          eq(activityFeed.isRead, false)
        )
      );

    return NextResponse.json({
      success: true,
      data: { count: result[0]?.count ?? 0 },
    });
  } catch (error) {
    console.error('GET /api/v1/activity/unread error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
