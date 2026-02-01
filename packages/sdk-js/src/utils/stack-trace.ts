import type { TelemetryStackFrame } from '../types';

/**
 * Parse an Error stack trace into structured frames
 */
export function parseStackTrace(error: Error): TelemetryStackFrame[] {
  const stack = error.stack;
  if (!stack) {
    return [];
  }

  const lines = stack.split('\n');
  const frames: TelemetryStackFrame[] = [];

  for (const line of lines) {
    const frame = parseStackLine(line);
    if (frame) {
      frames.push(frame);
    }
  }

  return frames;
}

/**
 * Parse a single stack trace line
 * Handles various formats:
 * - Chrome/Node: "    at functionName (filename:line:col)"
 * - Firefox: "functionName@filename:line:col"
 * - Safari: "functionName@filename:line:col"
 */
function parseStackLine(line: string): TelemetryStackFrame | null {
  const trimmed = line.trim();

  // Skip the error message line
  if (!trimmed || trimmed.startsWith('Error:') || !trimmed.includes(':')) {
    return null;
  }

  // Chrome/Node format: "at functionName (filename:line:col)"
  const chromeMatch = trimmed.match(
    /^at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+)|(.+))?\)?$/
  );
  if (chromeMatch) {
    const [, func, filename, lineno, colno, evalOrigin] = chromeMatch;

    if (evalOrigin) {
      // Handle eval() cases
      return {
        filename: '<eval>',
        function: func || '<anonymous>',
        lineno: 0,
        in_app: false,
      };
    }

    return {
      filename: filename || '<unknown>',
      function: func || '<anonymous>',
      lineno: lineno ? parseInt(lineno, 10) : 0,
      colno: colno ? parseInt(colno, 10) : undefined,
      in_app: isInApp(filename || ''),
    };
  }

  // Firefox/Safari format: "functionName@filename:line:col"
  const firefoxMatch = trimmed.match(/^(.+?)@(.+?):(\d+):(\d+)$/);
  if (firefoxMatch) {
    const [, func, filename, lineno, colno] = firefoxMatch;
    return {
      filename: filename || '<unknown>',
      function: func || '<anonymous>',
      lineno: parseInt(lineno, 10),
      colno: parseInt(colno, 10),
      in_app: isInApp(filename),
    };
  }

  // Simple format: "filename:line:col"
  const simpleMatch = trimmed.match(/^(.+?):(\d+):(\d+)$/);
  if (simpleMatch) {
    const [, filename, lineno, colno] = simpleMatch;
    return {
      filename,
      function: '<anonymous>',
      lineno: parseInt(lineno, 10),
      colno: parseInt(colno, 10),
      in_app: isInApp(filename),
    };
  }

  return null;
}

/**
 * Determine if a frame is from application code vs library/node internals
 */
function isInApp(filename: string): boolean {
  if (!filename) return false;

  // Node internals
  if (filename.startsWith('node:') || filename.startsWith('internal/')) {
    return false;
  }

  // Common library paths
  const libraryPatterns = [
    '/node_modules/',
    '\\node_modules\\',
    'webpack/runtime',
    '__webpack_require__',
    'webpack-internal',
  ];

  for (const pattern of libraryPatterns) {
    if (filename.includes(pattern)) {
      return false;
    }
  }

  return true;
}

/**
 * Get context lines around an error (if source available)
 * This is a placeholder - in browser, would need source maps
 */
export function getContextLines(
  _filename: string,
  _lineno: number,
  _contextSize: number = 5
): { pre_context?: string[]; context_line?: string; post_context?: string[] } {
  // In a real implementation, this would:
  // 1. Load source maps
  // 2. Fetch original source
  // 3. Extract lines around the error
  return {};
}
