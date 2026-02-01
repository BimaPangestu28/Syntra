import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  services,
  deployments,
  errorGroups,
  organizationMembers,
  servers,
  domains,
  proxyConfigs,
  serviceVolumes,
  volumes,
  alerts,
  projects,
} from '@/lib/db/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { chat, chatStream, ChatMessage, ServiceContext } from '@/lib/ai';
import crypto from 'crypto';

// POST /api/v1/ai/chat - Chat with AI about services
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
    const { messages, service_id, stream = false } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'messages array is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Build service context if service_id provided
    let serviceContext: ServiceContext | undefined;

    if (service_id) {
      const service = await db.query.services.findFirst({
        where: eq(services.id, service_id),
        with: {
          project: true,
          server: true,
        },
      });

      if (service) {
        // Check access
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

        // Fetch all related data in parallel
        const [
          recentDeploys,
          recentErrors,
          serviceDomains,
          serviceProxyConfigs,
          serviceVolumesList,
          recentAlerts,
        ] = await Promise.all([
          // Recent deployments with git info
          db.query.deployments.findMany({
            where: eq(deployments.serviceId, service_id),
            orderBy: [desc(deployments.createdAt)],
            limit: 10,
          }),
          // Recent errors
          db.query.errorGroups.findMany({
            where: eq(errorGroups.serviceId, service_id),
            orderBy: [desc(errorGroups.lastSeenAt)],
            limit: 10,
          }),
          // Domains
          db.query.domains.findMany({
            where: eq(domains.serviceId, service_id),
          }),
          // Proxy configs
          db.query.proxyConfigs.findMany({
            where: eq(proxyConfigs.serviceId, service_id),
          }),
          // Volumes
          db.query.serviceVolumes.findMany({
            where: eq(serviceVolumes.serviceId, service_id),
            with: { volume: true },
          }),
          // Recent alerts for the org
          db.query.alerts.findMany({
            where: eq(alerts.orgId, service.project.orgId),
            orderBy: [desc(alerts.createdAt)],
            limit: 10,
          }),
        ]);

        // Build rich context
        serviceContext = {
          serviceName: service.name,
          serviceType: service.type,
          // Service configuration
          serviceConfig: {
            port: service.port,
            replicas: service.replicas,
            exposeEnabled: service.exposeEnabled,
            exposePort: service.exposePort,
            healthCheckPath: service.healthCheckPath,
            autoDeploy: service.autoDeploy,
            isActive: service.isActive,
            sourceType: service.sourceType,
            dockerImage: service.dockerImage,
            dockerfilePath: service.dockerfilePath,
            resources: service.resources,
            envVarsCount: service.envVars ? Object.keys(service.envVars).length : 0,
          },
          // Project info
          project: {
            name: service.project.name,
            gitRepoUrl: service.project.gitRepoUrl,
            gitBranch: service.project.gitBranch,
            buildCommand: service.project.buildCommand,
            installCommand: service.project.installCommand,
          },
          // Server info
          server: service.server ? {
            name: service.server.name,
            hostname: service.server.hostname,
            status: service.server.status,
            publicIp: service.server.publicIp,
            cpuCores: service.server.cpuCores,
            memoryMb: service.server.memoryMb,
            diskGb: service.server.diskGb,
            osName: service.server.osName,
            runtime: service.server.runtime,
            runtimeVersion: service.server.runtimeVersion,
          } : null,
          // Deployments with git commits
          recentDeployments: recentDeploys.map(d => ({
            id: d.id,
            status: d.status,
            triggerType: d.triggerType,
            gitCommitSha: d.gitCommitSha?.substring(0, 7),
            gitCommitMessage: d.gitCommitMessage,
            gitBranch: d.gitBranch,
            createdAt: d.createdAt?.toISOString(),
            deployFinishedAt: d.deployFinishedAt?.toISOString(),
            errorMessage: d.errorMessage,
          })),
          // Errors
          recentErrors: recentErrors.map(e => ({
            message: e.message,
            type: e.type,
            count: e.eventCount,
            firstSeen: e.firstSeenAt?.toISOString(),
            lastSeen: e.lastSeenAt?.toISOString(),
            status: e.status,
          })),
          // Domains
          domains: serviceDomains.map(d => ({
            domain: d.domain,
            status: d.status,
            isPrimary: d.isPrimary,
            sslEnabled: d.sslEnabled,
            sslStatus: d.sslStatus,
          })),
          // Proxy configuration
          proxyConfigs: serviceProxyConfigs.map(p => ({
            name: p.name,
            pathPattern: p.pathPattern,
            upstreamPort: p.upstreamPort,
            rateLimitEnabled: p.rateLimitEnabled,
            rateLimitRequests: p.rateLimitRequests,
            corsEnabled: p.corsEnabled,
            websocketEnabled: p.websocketEnabled,
            isEnabled: p.isEnabled,
          })),
          // Volumes
          volumes: serviceVolumesList.map(sv => ({
            name: sv.volume.name,
            sizeGb: sv.volume.sizeGb,
            mountPath: sv.mountPath,
            status: sv.volume.status,
          })),
          // Alerts
          recentAlerts: recentAlerts.map(a => ({
            type: a.type,
            severity: a.severity,
            title: a.title,
            status: a.status,
            createdAt: a.createdAt?.toISOString(),
            resolvedAt: a.resolvedAt?.toISOString(),
          })),
          // Placeholder for real metrics (would come from telemetry/monitoring)
          metrics: undefined,
        };
      }
    }

    const chatMessages: ChatMessage[] = messages.map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Streaming response
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of chatStream(chatMessages, serviceContext)) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new NextResponse(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming response
    const response = await chat(chatMessages, serviceContext);

    return NextResponse.json({
      success: true,
      data: {
        message: {
          role: 'assistant',
          content: response,
        },
        service_id,
      },
    });
  } catch (error) {
    console.error('POST /api/v1/ai/chat error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
