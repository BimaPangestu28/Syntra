import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatConversations, chatMessages, organizationMembers, services, deployments, errorGroups, domains, proxyConfigs, serviceVolumes, alerts } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { chat, ChatMessage, ServiceContext } from '@/lib/ai';
import { z } from 'zod';
import crypto from 'crypto';

const addMessageSchema = z.object({
  content: z.string().min(1),
});

// POST /api/v1/ai/conversations/[conversationId]/messages - Add message and get AI response
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { conversationId } = await params;
    const body = await req.json();
    const parsed = addMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.errors, request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Verify conversation ownership
    const conversation = await db.query.chatConversations.findFirst({
      where: and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, session.user.id)
      ),
      with: {
        messages: {
          orderBy: [chatMessages.createdAt],
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Save user message
    const [userMessage] = await db
      .insert(chatMessages)
      .values({
        conversationId,
        role: 'user',
        content: parsed.data.content,
      })
      .returning();

    // Build message history for AI
    const allMessages: ChatMessage[] = [
      ...conversation.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: parsed.data.content },
    ];

    // Build service context if conversation has a service_id
    let serviceContext: ServiceContext | undefined;
    if (conversation.serviceId) {
      const service = await db.query.services.findFirst({
        where: eq(services.id, conversation.serviceId),
        with: { project: true, server: true },
      });

      if (service) {
        const [recentDeploys, recentErrors, serviceDomains] = await Promise.all([
          db.query.deployments.findMany({
            where: eq(deployments.serviceId, conversation.serviceId!),
            orderBy: [desc(deployments.createdAt)],
            limit: 5,
          }),
          db.query.errorGroups.findMany({
            where: eq(errorGroups.serviceId, conversation.serviceId!),
            orderBy: [desc(errorGroups.lastSeenAt)],
            limit: 5,
          }),
          db.query.domains.findMany({
            where: eq(domains.serviceId, conversation.serviceId!),
          }),
        ]);

        serviceContext = {
          serviceName: service.name,
          serviceType: service.type,
          serviceConfig: {
            port: service.port,
            replicas: service.replicas,
            sourceType: service.sourceType,
            isActive: service.isActive,
          },
          project: {
            name: service.project.name,
            gitRepoUrl: service.project.gitRepoUrl,
            gitBranch: service.project.gitBranch,
          },
          server: service.server ? {
            name: service.server.name,
            hostname: service.server.hostname,
            status: service.server.status,
          } : null,
          recentDeployments: recentDeploys.map(d => ({
            id: d.id,
            status: d.status,
            triggerType: d.triggerType,
            gitCommitMessage: d.gitCommitMessage,
            errorMessage: d.errorMessage,
          })),
          recentErrors: recentErrors.map(e => ({
            message: e.message,
            type: e.type,
            count: e.eventCount,
            status: e.status,
          })),
          domains: serviceDomains.map(d => ({
            domain: d.domain,
            status: d.status,
            sslEnabled: d.sslEnabled,
          })),
        };
      }
    }

    // Get AI response
    const aiResponse = await chat(allMessages, serviceContext);

    // Save AI response
    const [assistantMessage] = await db
      .insert(chatMessages)
      .values({
        conversationId,
        role: 'assistant',
        content: aiResponse,
      })
      .returning();

    // Update conversation timestamp
    await db
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, conversationId));

    return NextResponse.json({
      success: true,
      data: {
        user_message: {
          id: userMessage.id,
          role: 'user',
          content: userMessage.content,
          created_at: userMessage.createdAt.toISOString(),
        },
        assistant_message: {
          id: assistantMessage.id,
          role: 'assistant',
          content: assistantMessage.content,
          created_at: assistantMessage.createdAt.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('POST /api/v1/ai/conversations/[id]/messages error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
