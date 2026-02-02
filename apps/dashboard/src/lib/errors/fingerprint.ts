import crypto from 'crypto';

/**
 * Normalize a stack trace by stripping volatile parts:
 * - Line/column numbers
 * - Absolute file paths (keep only filename)
 * - UUIDs, hex addresses, timestamps
 */
function normalizeStackTrace(trace: string): string {
  return trace
    // Strip line:col numbers (e.g., :42:10)
    .replace(/:\d+:\d+/g, ':0:0')
    // Strip standalone line numbers (e.g., :42)
    .replace(/:(\d+)(?=\)|\s|$)/g, ':0')
    // Normalize absolute file paths to just filename
    .replace(/(?:\/[\w.-]+)+\/([\w.-]+)/g, '$1')
    // Normalize Windows paths
    .replace(/(?:[A-Z]:\\[\w.-]+\\)+?([\w.-]+)/gi, '$1')
    // Strip UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    // Strip hex addresses (0x7fff...)
    .replace(/0x[0-9a-f]{4,}/gi, '<ADDR>')
    // Strip timestamps (ISO format)
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/g, '<TIMESTAMP>')
    // Strip large numbers that look like IDs
    .replace(/\b\d{10,}\b/g, '<ID>')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract a signature from error components:
 * error type + first line of message + top 3 stack frames
 */
function extractSignature(
  type: string,
  message: string,
  stackTrace?: string
): string {
  const parts: string[] = [];

  // Error type
  parts.push(type.trim());

  // First line of message, normalized
  const firstLine = message.split('\n')[0].trim();
  const normalizedMessage = firstLine
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/0x[0-9a-f]{4,}/gi, '<ADDR>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/g, '<TIMESTAMP>')
    .replace(/\b\d{10,}\b/g, '<ID>');
  parts.push(normalizedMessage);

  // Top 3 stack frames
  if (stackTrace) {
    const normalized = normalizeStackTrace(stackTrace);
    const frames = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('at ') || line.includes('('))
      .slice(0, 3);

    if (frames.length > 0) {
      parts.push(frames.join(' | '));
    }
  }

  return parts.join(' :: ');
}

/**
 * Generate a SHA-256 fingerprint from a signature string.
 * Returns the first 64 hex characters.
 */
function generateFingerprint(signature: string): string {
  return crypto.createHash('sha256').update(signature).digest('hex').slice(0, 64);
}

/**
 * Fingerprint an error event into a stable group identifier.
 */
export function fingerprintError(error: {
  type: string;
  message: string;
  stackTrace?: string;
}): string {
  const signature = extractSignature(error.type, error.message, error.stackTrace);
  return generateFingerprint(signature);
}
