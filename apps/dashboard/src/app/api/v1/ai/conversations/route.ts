import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatConversations, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import crypto from 'crypto';

const createConversationSchema = z.object({
  org_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
});

// GET /api/v1/ai/conversations - List conversations
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
    const orgId = searchParams.get('org_id');
    const serviceId = searchParams.get('service_id');

    // Get user's memberships
    const memberships = await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, session.user.id),
    });
    const orgIds = memberships.map(m => m.orgId);

    if (orgIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const targetOrgIds = orgId && orgIds.includes(orgId) ? [orgId] : orgIds;

    const conversations = await db.query.chatConversations.findMany({
      where: (c, { and: andWhere, eq: eqWhere, inArray }) => {
        const conditions = [
          inArray(c.orgId, targetOrgIds),
          eqWhere(c.userId, session.user.id),
        ];
        if (serviceId) conditions.push(eqWhere(c.serviceId, serviceId));
        return andWhere(...conditions);
      },
      orderBy: [desc(chatConversations.updatedAt)],
      limit: 50,
    });

    return NextResponse.json({
      success: true,
      data: conversations.map(c => ({
        id: c.id,
        title: c.title,
        service_id: c.serviceId,
        created_at: c.createdAt.toISOString(),
        updated_at: c.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/ai/conversations error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/ai/conversations - Create conversation
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = createConversationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.errors, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check org access
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.orgId, parsed.data.org_id)
      ),
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const [conversation] = await db
      .insert(chatConversations)
      .values({
        orgId: parsed.data.org_id,
        serviceId: parsed.data.service_id,
        userId: session.user.id,
        title: parsed.data.title,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: conversation.id,
          title: conversation.title,
          service_id: conversation.serviceId,
          created_at: conversation.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/ai/conversations error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
