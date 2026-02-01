import { db } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema';
import { eq, and, desc, gte, lte, like, sql } from 'drizzle-orm';

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'organization.create'
  | 'organization.update'
  | 'organization.delete'
  | 'server.create'
  | 'server.update'
  | 'server.delete'
  | 'project.create'
  | 'project.update'
  | 'project.delete'
  | 'service.create'
  | 'service.update'
  | 'service.delete'
  | 'service.scale'
  | 'deployment.create'
  | 'deployment.start'
  | 'deployment.stop'
  | 'deployment.rollback'
  | 'secret.create'
  | 'secret.update'
  | 'secret.delete'
  | 'secret.read'
  | 'workflow.create'
  | 'workflow.update'
  | 'workflow.delete'
  | 'workflow.trigger'
  | 'domain.create'
  | 'domain.update'
  | 'domain.delete'
  | 'member.invite'
  | 'member.update'
  | 'member.remove'
  | 'billing.subscription.create'
  | 'billing.subscription.update'
  | 'billing.subscription.cancel';

export type ResourceType =
  | 'user'
  | 'organization'
  | 'server'
  | 'project'
  | 'service'
  | 'deployment'
  | 'secret'
  | 'workflow'
  | 'domain'
  | 'member'
  | 'subscription'
  | 'invoice';

export interface AuditLogEntry {
  id: string;
  orgId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  changes: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  } | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(params: {
  orgId: string;
  userId?: string;
  action: AuditAction | string;
  resourceType: ResourceType | string;
  resourceId?: string;
  resourceName?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}): Promise<string> {
  const [log] = await db
    .insert(auditLogs)
    .values({
      orgId: params.orgId,
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      resourceName: params.resourceName,
      changes: params.changes,
      metadata: params.metadata,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
    })
    .returning();

  return log.id;
}

/**
 * Search audit logs
 */
export async function searchAuditLogs(params: {
  orgId: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const {
    orgId,
    userId,
    action,
    resourceType,
    resourceId,
    startDate,
    endDate,
    search,
    limit = 50,
    offset = 0,
  } = params;

  const conditions = [eq(auditLogs.orgId, orgId)];

  if (userId) {
    conditions.push(eq(auditLogs.userId, userId));
  }

  if (action) {
    conditions.push(eq(auditLogs.action, action));
  }

  if (resourceType) {
    conditions.push(eq(auditLogs.resourceType, resourceType));
  }

  if (resourceId) {
    conditions.push(eq(auditLogs.resourceId, resourceId));
  }

  if (startDate) {
    conditions.push(gte(auditLogs.createdAt, startDate));
  }

  if (endDate) {
    conditions.push(lte(auditLogs.createdAt, endDate));
  }

  if (search) {
    conditions.push(like(auditLogs.resourceName, `%${search}%`));
  }

  const whereClause = and(...conditions);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(whereClause);

  const total = countResult[0]?.count || 0;

  // Get logs
  const logs = await db.query.auditLogs.findMany({
    where: whereClause,
    orderBy: [desc(auditLogs.createdAt)],
    limit: Math.min(limit, 500),
    offset,
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return {
    logs: logs.map(log => ({
      id: log.id,
      orgId: log.orgId,
      userId: log.userId,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      resourceName: log.resourceName,
      changes: log.changes,
      metadata: log.metadata,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      requestId: log.requestId,
      createdAt: log.createdAt,
    })),
    total,
  };
}

/**
 * Get audit log statistics
 */
export async function getAuditLogStats(
  orgId: string,
  days: number = 30
): Promise<{
  total: number;
  byAction: Record<string, number>;
  byResourceType: Record<string, number>;
  byUser: Record<string, number>;
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const whereClause = and(
    eq(auditLogs.orgId, orgId),
    gte(auditLogs.createdAt, startDate)
  );

  // Total count
  const totalResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(whereClause);

  // By action
  const byActionResult = await db
    .select({
      action: auditLogs.action,
      count: sql<number>`count(*)::int`,
    })
    .from(auditLogs)
    .where(whereClause)
    .groupBy(auditLogs.action);

  // By resource type
  const byResourceTypeResult = await db
    .select({
      resourceType: auditLogs.resourceType,
      count: sql<number>`count(*)::int`,
    })
    .from(auditLogs)
    .where(whereClause)
    .groupBy(auditLogs.resourceType);

  // By user
  const byUserResult = await db
    .select({
      userId: auditLogs.userId,
      count: sql<number>`count(*)::int`,
    })
    .from(auditLogs)
    .where(and(whereClause, sql`${auditLogs.userId} IS NOT NULL`))
    .groupBy(auditLogs.userId);

  const byAction: Record<string, number> = {};
  for (const row of byActionResult) {
    byAction[row.action] = row.count;
  }

  const byResourceType: Record<string, number> = {};
  for (const row of byResourceTypeResult) {
    byResourceType[row.resourceType] = row.count;
  }

  const byUser: Record<string, number> = {};
  for (const row of byUserResult) {
    if (row.userId) {
      byUser[row.userId] = row.count;
    }
  }

  return {
    total: totalResult[0]?.count || 0,
    byAction,
    byResourceType,
    byUser,
  };
}

/**
 * Cleanup old audit logs (for data retention)
 */
export async function cleanupOldAuditLogs(
  orgId: string,
  retentionDays: number = 90
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // Count first
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.orgId, orgId),
      lte(auditLogs.createdAt, cutoffDate)
    ));

  const count = countResult[0]?.count || 0;

  if (count > 0) {
    await db
      .delete(auditLogs)
      .where(and(
        eq(auditLogs.orgId, orgId),
        lte(auditLogs.createdAt, cutoffDate)
      ));
  }

  return count;
}

/**
 * Helper to extract changes between two objects
 */
export function extractChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): { before?: Record<string, unknown>; after?: Record<string, unknown> } | undefined {
  if (!before && !after) return undefined;

  const changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } = {};

  if (before) {
    changes.before = sanitizeForAudit(before);
  }

  if (after) {
    changes.after = sanitizeForAudit(after);
  }

  return changes;
}

/**
 * Remove sensitive fields from objects before logging
 */
function sanitizeForAudit(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = [
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'encryptedValue',
    'encrypted_value',
    'access_token',
    'refresh_token',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeForAudit(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
