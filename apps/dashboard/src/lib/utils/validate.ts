const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a UUID string format.
 * Returns true if valid UUID v4 format.
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}
