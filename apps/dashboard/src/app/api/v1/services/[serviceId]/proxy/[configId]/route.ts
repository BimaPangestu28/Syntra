import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, projects, proxyConfigs, organizationMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Header action schema
const headerActionSchema = z.object({
  action: z.enum(['set', 'add', 'remove']),
  name: z.string().min(1).max(255),
  value: z.string().max(2000).optional(),
});

// Request schema for updates
const updateProxyConfigSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  is_enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),

  // Path matching
  path_pattern: z.string().max(500).optional(),
  path_match_type: z.enum(['prefix', 'exact', 'regex']).optional(),

  // Upstream
  upstream_port: z.number().int().min(1).max(65535).optional().nullable(),
  upstream_path: z.string().max(500).optional().nullable(),
  strip_path_prefix: z.boolean().optional(),

  // Headers
  request_headers: z.array(headerActionSchema).optional(),
  response_headers: z.array(headerActionSchema).optional(),

  // Timeouts
  connect_timeout: z.number().int().min(1).max(3600).optional(),
  read_timeout: z.number().int().min(1).max(3600).optional(),
  send_timeout: z.number().int().min(1).max(3600).optional(),

  // Rate limiting
  rate_limit_enabled: z.boolean().optional(),
  rate_limit_requests: z.number().int().min(1).max(100000).optional(),
  rate_limit_window: z.number().int().min(1).max(86400).optional(),

  // CORS
  cors_enabled: z.boolean().optional(),
  cors_allow_origins: z.array(z.string()).optional(),
  cors_allow_methods: z.array(z.string()).optional(),
  cors_allow_headers: z.array(z.string()).optional(),
  cors_expose_headers: z.array(z.string()).optional(),
  cors_max_age: z.number().int().min(0).max(86400).optional(),
  cors_allow_credentials: z.boolean().optional(),

  // Security
  basic_auth_enabled: z.boolean().optional(),
  basic_auth_username: z.string().max(255).optional().nullable(),
  basic_auth_password: z.string().max(255).optional(),
  ip_whitelist: z.array(z.string()).optional().nullable(),
  ip_blacklist: z.array(z.string()).optional().nullable(),

  // WebSocket & Buffering
  websocket_enabled: z.boolean().optional(),
  max_body_size: z.string().max(20).optional(),
  buffering_enabled: z.boolean().optional(),
});

// Helper to check org access
async function checkOrgAccess(
  userId: string,
  orgId: string,
  allowedRoles: string[] = ['owner', 'admin', 'developer', 'viewer']
) {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });

  if (!membership) return null;
  if (!allowedRoles.includes(membership.role)) return null;
  return membership;
}

// GET /api/v1/services/:serviceId/proxy/:configId - Get proxy config
export async function GET(
  req: NextRequest,
  { params }: { params: { serviceId: string; configId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const config = await db.query.proxyConfigs.findFirst({
      where: and(
        eq(proxyConfigs.id, params.configId),
        eq(proxyConfigs.serviceId, params.serviceId)
      ),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!config) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Proxy config not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, config.service.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        service_id: config.serviceId,
        name: config.name,
        is_enabled: config.isEnabled,
        priority: config.priority,
        path_pattern: config.pathPattern,
        path_match_type: config.pathMatchType,
        upstream_port: config.upstreamPort,
        upstream_path: config.upstreamPath,
        strip_path_prefix: config.stripPathPrefix,
        request_headers: config.requestHeaders,
        response_headers: config.responseHeaders,
        connect_timeout: config.connectTimeout,
        read_timeout: config.readTimeout,
        send_timeout: config.sendTimeout,
        rate_limit_enabled: config.rateLimitEnabled,
        rate_limit_requests: config.rateLimitRequests,
        rate_limit_window: config.rateLimitWindow,
        cors_enabled: config.corsEnabled,
        cors_allow_origins: config.corsAllowOrigins,
        cors_allow_methods: config.corsAllowMethods,
        cors_allow_headers: config.corsAllowHeaders,
        cors_expose_headers: config.corsExposeHeaders,
        cors_max_age: config.corsMaxAge,
        cors_allow_credentials: config.corsAllowCredentials,
        basic_auth_enabled: config.basicAuthEnabled,
        basic_auth_username: config.basicAuthUsername,
        ip_whitelist: config.ipWhitelist,
        ip_blacklist: config.ipBlacklist,
        websocket_enabled: config.websocketEnabled,
        max_body_size: config.maxBodySize,
        buffering_enabled: config.bufferingEnabled,
        created_at: config.createdAt?.toISOString(),
        updated_at: config.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/services/:serviceId/proxy/:configId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// PATCH /api/v1/services/:serviceId/proxy/:configId - Update proxy config
export async function PATCH(
  req: NextRequest,
  { params }: { params: { serviceId: string; configId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const config = await db.query.proxyConfigs.findFirst({
      where: and(
        eq(proxyConfigs.id, params.configId),
        eq(proxyConfigs.serviceId, params.serviceId)
      ),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!config) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Proxy config not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, config.service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateProxyConfigSchema.safeParse(body);

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

    const data = parsed.data;
    const updateData: Partial<typeof proxyConfigs.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.is_enabled !== undefined) updateData.isEnabled = data.is_enabled;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.path_pattern !== undefined) updateData.pathPattern = data.path_pattern;
    if (data.path_match_type !== undefined) updateData.pathMatchType = data.path_match_type;
    if (data.upstream_port !== undefined) updateData.upstreamPort = data.upstream_port;
    if (data.upstream_path !== undefined) updateData.upstreamPath = data.upstream_path;
    if (data.strip_path_prefix !== undefined) updateData.stripPathPrefix = data.strip_path_prefix;
    if (data.request_headers !== undefined) updateData.requestHeaders = data.request_headers;
    if (data.response_headers !== undefined) updateData.responseHeaders = data.response_headers;
    if (data.connect_timeout !== undefined) updateData.connectTimeout = data.connect_timeout;
    if (data.read_timeout !== undefined) updateData.readTimeout = data.read_timeout;
    if (data.send_timeout !== undefined) updateData.sendTimeout = data.send_timeout;
    if (data.rate_limit_enabled !== undefined) updateData.rateLimitEnabled = data.rate_limit_enabled;
    if (data.rate_limit_requests !== undefined) updateData.rateLimitRequests = data.rate_limit_requests;
    if (data.rate_limit_window !== undefined) updateData.rateLimitWindow = data.rate_limit_window;
    if (data.cors_enabled !== undefined) updateData.corsEnabled = data.cors_enabled;
    if (data.cors_allow_origins !== undefined) updateData.corsAllowOrigins = data.cors_allow_origins;
    if (data.cors_allow_methods !== undefined) updateData.corsAllowMethods = data.cors_allow_methods;
    if (data.cors_allow_headers !== undefined) updateData.corsAllowHeaders = data.cors_allow_headers;
    if (data.cors_expose_headers !== undefined) updateData.corsExposeHeaders = data.cors_expose_headers;
    if (data.cors_max_age !== undefined) updateData.corsMaxAge = data.cors_max_age;
    if (data.cors_allow_credentials !== undefined) updateData.corsAllowCredentials = data.cors_allow_credentials;
    if (data.basic_auth_enabled !== undefined) updateData.basicAuthEnabled = data.basic_auth_enabled;
    if (data.basic_auth_username !== undefined) updateData.basicAuthUsername = data.basic_auth_username;
    if (data.basic_auth_password !== undefined) {
      updateData.basicAuthPasswordHash = crypto.createHash('sha256').update(data.basic_auth_password).digest('hex');
    }
    if (data.ip_whitelist !== undefined) updateData.ipWhitelist = data.ip_whitelist;
    if (data.ip_blacklist !== undefined) updateData.ipBlacklist = data.ip_blacklist;
    if (data.websocket_enabled !== undefined) updateData.websocketEnabled = data.websocket_enabled;
    if (data.max_body_size !== undefined) updateData.maxBodySize = data.max_body_size;
    if (data.buffering_enabled !== undefined) updateData.bufferingEnabled = data.buffering_enabled;

    const [updated] = await db
      .update(proxyConfigs)
      .set(updateData)
      .where(eq(proxyConfigs.id, params.configId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        service_id: updated.serviceId,
        name: updated.name,
        is_enabled: updated.isEnabled,
        priority: updated.priority,
        path_pattern: updated.pathPattern,
        path_match_type: updated.pathMatchType,
        upstream_port: updated.upstreamPort,
        upstream_path: updated.upstreamPath,
        strip_path_prefix: updated.stripPathPrefix,
        request_headers: updated.requestHeaders,
        response_headers: updated.responseHeaders,
        connect_timeout: updated.connectTimeout,
        read_timeout: updated.readTimeout,
        send_timeout: updated.sendTimeout,
        rate_limit_enabled: updated.rateLimitEnabled,
        rate_limit_requests: updated.rateLimitRequests,
        rate_limit_window: updated.rateLimitWindow,
        cors_enabled: updated.corsEnabled,
        cors_allow_origins: updated.corsAllowOrigins,
        cors_allow_methods: updated.corsAllowMethods,
        cors_allow_headers: updated.corsAllowHeaders,
        cors_expose_headers: updated.corsExposeHeaders,
        cors_max_age: updated.corsMaxAge,
        cors_allow_credentials: updated.corsAllowCredentials,
        basic_auth_enabled: updated.basicAuthEnabled,
        basic_auth_username: updated.basicAuthUsername,
        ip_whitelist: updated.ipWhitelist,
        ip_blacklist: updated.ipBlacklist,
        websocket_enabled: updated.websocketEnabled,
        max_body_size: updated.maxBodySize,
        buffering_enabled: updated.bufferingEnabled,
        created_at: updated.createdAt?.toISOString(),
        updated_at: updated.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/v1/services/:serviceId/proxy/:configId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/services/:serviceId/proxy/:configId - Delete proxy config
export async function DELETE(
  req: NextRequest,
  { params }: { params: { serviceId: string; configId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const config = await db.query.proxyConfigs.findFirst({
      where: and(
        eq(proxyConfigs.id, params.configId),
        eq(proxyConfigs.serviceId, params.serviceId)
      ),
      with: {
        service: {
          with: {
            project: true,
          },
        },
      },
    });

    if (!config) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Proxy config not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, config.service.project.orgId, ['owner', 'admin']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    await db.delete(proxyConfigs).where(eq(proxyConfigs.id, params.configId));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/v1/services/:serviceId/proxy/:configId error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
