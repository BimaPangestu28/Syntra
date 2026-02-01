import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, projects, proxyConfigs, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { z } from 'zod';

// Header action schema
const headerActionSchema = z.object({
  action: z.enum(['set', 'add', 'remove']),
  name: z.string().min(1).max(255),
  value: z.string().max(2000).optional(),
});

// Request schema
const createProxyConfigSchema = z.object({
  name: z.string().min(1).max(255),
  is_enabled: z.boolean().optional().default(true),
  priority: z.number().int().min(0).max(1000).optional().default(0),

  // Path matching
  path_pattern: z.string().max(500).optional().default('/'),
  path_match_type: z.enum(['prefix', 'exact', 'regex']).optional().default('prefix'),

  // Upstream
  upstream_port: z.number().int().min(1).max(65535).optional(),
  upstream_path: z.string().max(500).optional(),
  strip_path_prefix: z.boolean().optional().default(false),

  // Headers
  request_headers: z.array(headerActionSchema).optional().default([]),
  response_headers: z.array(headerActionSchema).optional().default([]),

  // Timeouts
  connect_timeout: z.number().int().min(1).max(3600).optional().default(60),
  read_timeout: z.number().int().min(1).max(3600).optional().default(60),
  send_timeout: z.number().int().min(1).max(3600).optional().default(60),

  // Rate limiting
  rate_limit_enabled: z.boolean().optional().default(false),
  rate_limit_requests: z.number().int().min(1).max(100000).optional().default(100),
  rate_limit_window: z.number().int().min(1).max(86400).optional().default(60),

  // CORS
  cors_enabled: z.boolean().optional().default(false),
  cors_allow_origins: z.array(z.string()).optional().default(['*']),
  cors_allow_methods: z.array(z.string()).optional().default(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']),
  cors_allow_headers: z.array(z.string()).optional().default(['*']),
  cors_expose_headers: z.array(z.string()).optional().default([]),
  cors_max_age: z.number().int().min(0).max(86400).optional().default(86400),
  cors_allow_credentials: z.boolean().optional().default(false),

  // Security
  basic_auth_enabled: z.boolean().optional().default(false),
  basic_auth_username: z.string().max(255).optional(),
  basic_auth_password: z.string().max(255).optional(),
  ip_whitelist: z.array(z.string()).optional(),
  ip_blacklist: z.array(z.string()).optional(),

  // WebSocket & Buffering
  websocket_enabled: z.boolean().optional().default(false),
  max_body_size: z.string().max(20).optional().default('10m'),
  buffering_enabled: z.boolean().optional().default(true),
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

// GET /api/v1/services/:serviceId/proxy - List proxy configs
export async function GET(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, service.project.orgId);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const configs = await db.query.proxyConfigs.findMany({
      where: eq(proxyConfigs.serviceId, params.serviceId),
      orderBy: [desc(proxyConfigs.priority), desc(proxyConfigs.createdAt)],
    });

    return NextResponse.json({
      success: true,
      data: configs.map((c) => ({
        id: c.id,
        service_id: c.serviceId,
        name: c.name,
        is_enabled: c.isEnabled,
        priority: c.priority,
        path_pattern: c.pathPattern,
        path_match_type: c.pathMatchType,
        upstream_port: c.upstreamPort,
        upstream_path: c.upstreamPath,
        strip_path_prefix: c.stripPathPrefix,
        request_headers: c.requestHeaders,
        response_headers: c.responseHeaders,
        connect_timeout: c.connectTimeout,
        read_timeout: c.readTimeout,
        send_timeout: c.sendTimeout,
        rate_limit_enabled: c.rateLimitEnabled,
        rate_limit_requests: c.rateLimitRequests,
        rate_limit_window: c.rateLimitWindow,
        cors_enabled: c.corsEnabled,
        cors_allow_origins: c.corsAllowOrigins,
        cors_allow_methods: c.corsAllowMethods,
        cors_allow_headers: c.corsAllowHeaders,
        cors_expose_headers: c.corsExposeHeaders,
        cors_max_age: c.corsMaxAge,
        cors_allow_credentials: c.corsAllowCredentials,
        basic_auth_enabled: c.basicAuthEnabled,
        basic_auth_username: c.basicAuthUsername,
        ip_whitelist: c.ipWhitelist,
        ip_blacklist: c.ipBlacklist,
        websocket_enabled: c.websocketEnabled,
        max_body_size: c.maxBodySize,
        buffering_enabled: c.bufferingEnabled,
        created_at: c.createdAt?.toISOString(),
        updated_at: c.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/services/:serviceId/proxy error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/services/:serviceId/proxy - Create proxy config
export async function POST(
  req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const service = await db.query.services.findFirst({
      where: eq(services.id, params.serviceId),
      with: {
        project: true,
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Service not found', request_id: crypto.randomUUID() } },
        { status: 404 }
      );
    }

    // Check org access
    const access = await checkOrgAccess(session.user.id, service.project.orgId, ['owner', 'admin', 'developer']);
    if (!access) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createProxyConfigSchema.safeParse(body);

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

    // Hash password if provided
    let passwordHash: string | undefined;
    if (data.basic_auth_password) {
      passwordHash = crypto.createHash('sha256').update(data.basic_auth_password).digest('hex');
    }

    const [config] = await db
      .insert(proxyConfigs)
      .values({
        serviceId: params.serviceId,
        name: data.name,
        isEnabled: data.is_enabled,
        priority: data.priority,
        pathPattern: data.path_pattern,
        pathMatchType: data.path_match_type,
        upstreamPort: data.upstream_port,
        upstreamPath: data.upstream_path,
        stripPathPrefix: data.strip_path_prefix,
        requestHeaders: data.request_headers,
        responseHeaders: data.response_headers,
        connectTimeout: data.connect_timeout,
        readTimeout: data.read_timeout,
        sendTimeout: data.send_timeout,
        rateLimitEnabled: data.rate_limit_enabled,
        rateLimitRequests: data.rate_limit_requests,
        rateLimitWindow: data.rate_limit_window,
        corsEnabled: data.cors_enabled,
        corsAllowOrigins: data.cors_allow_origins,
        corsAllowMethods: data.cors_allow_methods,
        corsAllowHeaders: data.cors_allow_headers,
        corsExposeHeaders: data.cors_expose_headers,
        corsMaxAge: data.cors_max_age,
        corsAllowCredentials: data.cors_allow_credentials,
        basicAuthEnabled: data.basic_auth_enabled,
        basicAuthUsername: data.basic_auth_username,
        basicAuthPasswordHash: passwordHash,
        ipWhitelist: data.ip_whitelist,
        ipBlacklist: data.ip_blacklist,
        websocketEnabled: data.websocket_enabled,
        maxBodySize: data.max_body_size,
        bufferingEnabled: data.buffering_enabled,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        data: {
          id: config.id,
          service_id: config.serviceId,
          name: config.name,
          is_enabled: config.isEnabled,
          priority: config.priority,
          path_pattern: config.pathPattern,
          path_match_type: config.pathMatchType,
          created_at: config.createdAt?.toISOString(),
          updated_at: config.updatedAt?.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/v1/services/:serviceId/proxy error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}
