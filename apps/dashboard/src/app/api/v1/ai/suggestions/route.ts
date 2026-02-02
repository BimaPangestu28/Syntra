import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { aiSuggestions, organizationMembers, services } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// GET /api/v1/ai/suggestions - Get suggestions for a service
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
    const serviceId = searchParams.get('service_id');

    if (!serviceId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'service_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Get service to check org access
    const service = await db.query.services.findFirst({
      where: eq(services.id, serviceId),
      with: { project: true },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.orgId, service.project.orgId)
      ),
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Get non-dismissed suggestions
    const suggestions = await db.query.aiSuggestions.findMany({
      where: and(
        eq(aiSuggestions.serviceId, serviceId),
        isNull(aiSuggestions.dismissedAt)
      ),
      orderBy: [desc(aiSuggestions.createdAt)],
      limit: 10,
    });

    return NextResponse.json({
      success: true,
      data: suggestions.map(s => ({
        id: s.id,
        type: s.type,
        severity: s.severity,
        title: s.title,
        description: s.description,
        created_at: s.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/ai/suggestions error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/ai/suggestions - Dismiss a suggestion
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
    const { suggestion_id } = body;

    if (!suggestion_id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'suggestion_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const suggestion = await db.query.aiSuggestions.findFirst({
      where: eq(aiSuggestions.id, suggestion_id),
    });

    if (!suggestion) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Suggestion not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const membership = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.orgId, suggestion.orgId)
      ),
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    await db
      .update(aiSuggestions)
      .set({
        dismissedAt: new Date(),
        dismissedBy: session.user.id,
      })
      .where(eq(aiSuggestions.id, suggestion_id));

    return NextResponse.json({
      success: true,
      data: { dismissed: true },
    });
  } catch (error) {
    console.error('POST /api/v1/ai/suggestions error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
