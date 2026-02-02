import { db } from '@/lib/db';
import { organizationMembers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

type Role = 'owner' | 'admin' | 'developer' | 'viewer';

type Permission =
  | 'org:manage'
  | 'org:billing'
  | 'org:members:invite'
  | 'org:members:remove'
  | 'org:members:change_role'
  | 'project:create'
  | 'project:delete'
  | 'project:settings'
  | 'service:create'
  | 'service:delete'
  | 'service:deploy'
  | 'service:env:read'
  | 'service:env:write'
  | 'service:env:read_secrets'
  | 'service:scale'
  | 'service:rollback'
  | 'service:proxy'
  | 'server:create'
  | 'server:delete'
  | 'server:manage'
  | 'database:create'
  | 'database:delete'
  | 'alert:manage'
  | 'workflow:manage';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'org:manage', 'org:billing', 'org:members:invite', 'org:members:remove', 'org:members:change_role',
    'project:create', 'project:delete', 'project:settings',
    'service:create', 'service:delete', 'service:deploy', 'service:env:read', 'service:env:write', 'service:env:read_secrets', 'service:scale', 'service:rollback', 'service:proxy',
    'server:create', 'server:delete', 'server:manage',
    'database:create', 'database:delete',
    'alert:manage', 'workflow:manage',
  ],
  admin: [
    'org:members:invite', 'org:members:remove',
    'project:create', 'project:delete', 'project:settings',
    'service:create', 'service:delete', 'service:deploy', 'service:env:read', 'service:env:write', 'service:env:read_secrets', 'service:scale', 'service:rollback', 'service:proxy',
    'server:create', 'server:delete', 'server:manage',
    'database:create', 'database:delete',
    'alert:manage', 'workflow:manage',
  ],
  developer: [
    'service:deploy', 'service:env:read', 'service:env:write', 'service:scale', 'service:rollback', 'service:proxy',
    'alert:manage',
  ],
  viewer: [
    'service:env:read',
  ],
};

/**
 * Check if a role has a specific permission.
 */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Get the user's role in an organization.
 */
export async function getUserRole(userId: string, orgId: string): Promise<Role | null> {
  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });

  return (member?.role as Role) || null;
}

/**
 * Check if user has a specific permission in an org.
 */
export async function checkPermission(userId: string, orgId: string, permission: Permission): Promise<boolean> {
  const role = await getUserRole(userId, orgId);
  if (!role) return false;
  return roleHasPermission(role, permission);
}

/**
 * Require a permission, throw if not authorized.
 * Use in API routes: await requirePermission(userId, orgId, 'service:deploy');
 */
export async function requirePermission(userId: string, orgId: string, permission: Permission): Promise<Role> {
  const role = await getUserRole(userId, orgId);
  if (!role) {
    throw new PermissionError('Not a member of this organization');
  }
  if (!roleHasPermission(role, permission)) {
    throw new PermissionError(`Insufficient permissions. Required: ${permission}`);
  }
  return role;
}

/**
 * Get all permissions for a role.
 */
export function getPermissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

export type { Role, Permission };
