import type { ParsedDSN } from '../types';

/**
 * Parse a Syntra DSN string
 * Format: syn://<public_key>@<host>/<project_id>
 *
 * @example
 * parseDSN('syn://pk_abc123@syntra.io/proj_xyz')
 * // { protocol: 'syn', publicKey: 'pk_abc123', host: 'syntra.io', projectId: 'proj_xyz' }
 */
export function parseDSN(dsn: string): ParsedDSN {
  if (!dsn) {
    throw new Error('DSN is required');
  }

  const dsnRegex = /^(syn|https?):\/\/([^@]+)@([^/]+)\/(.+)$/;
  const match = dsn.match(dsnRegex);

  if (!match) {
    throw new Error(
      `Invalid DSN format. Expected: syn://<public_key>@<host>/<project_id>, got: ${dsn}`
    );
  }

  const [, protocol, publicKey, host, projectId] = match;

  if (!publicKey) {
    throw new Error('DSN missing public key');
  }

  if (!host) {
    throw new Error('DSN missing host');
  }

  if (!projectId) {
    throw new Error('DSN missing project ID');
  }

  return {
    protocol,
    publicKey,
    host,
    projectId,
  };
}

/**
 * Build the ingest URL from parsed DSN
 */
export function buildIngestUrl(dsn: ParsedDSN): string {
  const protocol = dsn.protocol === 'syn' ? 'https' : dsn.protocol;
  return `${protocol}://${dsn.host}/api/v1/telemetry`;
}

/**
 * Validate DSN format without throwing
 */
export function isValidDSN(dsn: string): boolean {
  try {
    parseDSN(dsn);
    return true;
  } catch {
    return false;
  }
}
