import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiKeys } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// DELETE /api/v1/settings/api-keys/[keyId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { keyId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const key = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.id, params.keyId),
        eq(apiKeys.userId, session.user.id)
      ),
    });

    if (!key) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'API key not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    await db.delete(apiKeys).where(eq(apiKeys.id, params.keyId));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/v1/settings/api-keys/:keyId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
