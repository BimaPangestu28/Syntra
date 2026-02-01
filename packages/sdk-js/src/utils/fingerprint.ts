import type { TelemetryStackFrame } from '../types';

/**
 * Generate a fingerprint for error grouping
 * Uses type, message, and top stack frames from app code
 */
export function generateFingerprint(
  type: string,
  message: string,
  stackFrames: TelemetryStackFrame[]
): string[] {
  const fingerprint: string[] = [type];

  // Normalize the message (remove dynamic parts like IDs, timestamps)
  const normalizedMessage = normalizeMessage(message);
  if (normalizedMessage) {
    fingerprint.push(normalizedMessage);
  }

  // Add top in-app stack frames
  const inAppFrames = stackFrames.filter((f) => f.in_app).slice(0, 3);
  for (const frame of inAppFrames) {
    fingerprint.push(`${frame.filename}:${frame.function}:${frame.lineno}`);
  }

  // If no in-app frames, use first 3 frames
  if (inAppFrames.length === 0) {
    const frames = stackFrames.slice(0, 3);
    for (const frame of frames) {
      fingerprint.push(`${frame.filename}:${frame.function}:${frame.lineno}`);
    }
  }

  return fingerprint;
}

/**
 * Normalize error message for fingerprinting
 * Removes dynamic values like UUIDs, timestamps, numbers
 */
function normalizeMessage(message: string): string {
  return (
    message
      // Replace UUIDs
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '<uuid>'
      )
      // Replace hex IDs
      .replace(/\b[0-9a-f]{24,}\b/gi, '<id>')
      // Replace numbers
      .replace(/\b\d+\b/g, '<n>')
      // Replace quoted strings
      .replace(/"[^"]*"/g, '"<str>"')
      .replace(/'[^']*'/g, "'<str>'")
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Hash a fingerprint array to a single string
 */
export function hashFingerprint(fingerprint: string[]): string {
  const str = fingerprint.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
