/**
 * Service Reference Resolver
 *
 * Resolves ${{ref:service-name}} and ${{ref:service-name:port}} patterns
 * in environment variables at deploy time.
 *
 * Examples:
 *   ${{ref:api-server}} → resolved to internal hostname/IP
 *   ${{ref:api-server:port}} → resolved to the service's exposed port
 *   ${{ref:api-server:url}} → resolved to http://hostname:port
 */

import { db } from '@/lib/db';
import { services } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const REF_PATTERN = /\$\{\{ref:([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_]+))?\}\}/g;

interface ResolvedRef {
  original: string;
  serviceName: string;
  property: string | null;
  resolved: string;
}

/**
 * Resolve all service references in a map of env vars.
 * Returns the resolved env vars map and a list of what was resolved.
 */
export async function resolveServiceRefs(
  envVars: Record<string, string>,
  projectId: string
): Promise<{ resolved: Record<string, string>; refs: ResolvedRef[] }> {
  // Collect all referenced service names
  const refNames = new Set<string>();
  for (const value of Object.values(envVars)) {
    let match;
    REF_PATTERN.lastIndex = 0;
    while ((match = REF_PATTERN.exec(value)) !== null) {
      refNames.add(match[1]);
    }
  }

  if (refNames.size === 0) {
    return { resolved: envVars, refs: [] };
  }

  // Look up all referenced services in the same project
  const referencedServices = await db.query.services.findMany({
    where: eq(services.projectId, projectId),
  });

  const serviceMap = new Map<string, typeof referencedServices[number]>();
  for (const svc of referencedServices) {
    serviceMap.set(svc.name, svc);
  }

  // Resolve references
  const refs: ResolvedRef[] = [];
  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(envVars)) {
    REF_PATTERN.lastIndex = 0;
    resolved[key] = value.replace(REF_PATTERN, (original, serviceName, property) => {
      const svc = serviceMap.get(serviceName);
      if (!svc) {
        // Leave unresolved if service not found
        return original;
      }

      let resolvedValue: string;
      const hostname = `${svc.name}.internal`;
      const port = String((svc as any).port || 3000);

      switch (property) {
        case 'port':
          resolvedValue = port;
          break;
        case 'url':
          resolvedValue = `http://${hostname}:${port}`;
          break;
        case 'host':
        case 'hostname':
          resolvedValue = hostname;
          break;
        default:
          // No property specified: return hostname
          resolvedValue = hostname;
          break;
      }

      refs.push({ original, serviceName, property, resolved: resolvedValue });
      return resolvedValue;
    });
  }

  return { resolved, refs };
}

/**
 * Check if a string contains any service references.
 */
export function hasServiceRefs(value: string): boolean {
  REF_PATTERN.lastIndex = 0;
  return REF_PATTERN.test(value);
}

/**
 * Extract all service reference names from a string.
 */
export function extractServiceRefNames(value: string): string[] {
  const names: string[] = [];
  let match;
  REF_PATTERN.lastIndex = 0;
  while ((match = REF_PATTERN.exec(value)) !== null) {
    names.push(match[1]);
  }
  return names;
}
