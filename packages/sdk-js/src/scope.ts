import type { TelemetryBreadcrumb, User, ScopeData } from './types';

/**
 * Scope manages contextual data for events
 * Includes user info, tags, extra data, and breadcrumbs
 */
export class Scope implements ScopeData {
  user?: User;
  tags: Record<string, string> = {};
  extra: Record<string, unknown> = {};
  breadcrumbs: TelemetryBreadcrumb[] = [];
  fingerprint?: string[];

  private maxBreadcrumbs: number;

  constructor(maxBreadcrumbs: number = 100) {
    this.maxBreadcrumbs = maxBreadcrumbs;
  }

  /**
   * Set user context
   */
  setUser(user: User | null): void {
    this.user = user ?? undefined;
  }

  /**
   * Set a tag
   */
  setTag(key: string, value: string): void {
    this.tags[key] = value;
  }

  /**
   * Set multiple tags
   */
  setTags(tags: Record<string, string>): void {
    Object.assign(this.tags, tags);
  }

  /**
   * Set extra context
   */
  setExtra(key: string, value: unknown): void {
    this.extra[key] = value;
  }

  /**
   * Set multiple extra values
   */
  setExtras(extras: Record<string, unknown>): void {
    Object.assign(this.extra, extras);
  }

  /**
   * Set fingerprint for grouping
   */
  setFingerprint(fingerprint: string[]): void {
    this.fingerprint = fingerprint;
  }

  /**
   * Add a breadcrumb (ring buffer - oldest removed when full)
   */
  addBreadcrumb(breadcrumb: Omit<TelemetryBreadcrumb, 'timestamp'>): void {
    const crumb: TelemetryBreadcrumb = {
      ...breadcrumb,
      timestamp: new Date().toISOString(),
    };

    this.breadcrumbs.push(crumb);

    // Maintain ring buffer size
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  /**
   * Clear breadcrumbs
   */
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  /**
   * Clear all scope data
   */
  clear(): void {
    this.user = undefined;
    this.tags = {};
    this.extra = {};
    this.breadcrumbs = [];
    this.fingerprint = undefined;
  }

  /**
   * Clone scope for isolation
   */
  clone(): Scope {
    const clone = new Scope(this.maxBreadcrumbs);
    clone.user = this.user ? { ...this.user } : undefined;
    clone.tags = { ...this.tags };
    clone.extra = { ...this.extra };
    clone.breadcrumbs = [...this.breadcrumbs];
    clone.fingerprint = this.fingerprint ? [...this.fingerprint] : undefined;
    return clone;
  }

  /**
   * Apply scope data to an error context
   */
  applyToContext(): Omit<ScopeData, 'breadcrumbs'> & { breadcrumbs: TelemetryBreadcrumb[] } {
    return {
      user: this.user,
      tags: { ...this.tags },
      extra: { ...this.extra },
      breadcrumbs: [...this.breadcrumbs],
      fingerprint: this.fingerprint,
    };
  }
}

/**
 * Scope manager using AsyncLocalStorage for context propagation
 */
export class ScopeManager {
  private globalScope: Scope;
  private isolationScopes: Map<string, Scope> = new Map();
  private currentScopeId: string | null = null;

  constructor(maxBreadcrumbs: number = 100) {
    this.globalScope = new Scope(maxBreadcrumbs);
  }

  /**
   * Get the current active scope
   */
  getCurrentScope(): Scope {
    if (this.currentScopeId) {
      return this.isolationScopes.get(this.currentScopeId) ?? this.globalScope;
    }
    return this.globalScope;
  }

  /**
   * Get the global scope
   */
  getGlobalScope(): Scope {
    return this.globalScope;
  }

  /**
   * Run a function with an isolated scope
   */
  withScope<T>(callback: (scope: Scope) => T): T {
    const scopeId = crypto.randomUUID();
    const scope = this.globalScope.clone();
    this.isolationScopes.set(scopeId, scope);

    const prevScopeId = this.currentScopeId;
    this.currentScopeId = scopeId;

    try {
      return callback(scope);
    } finally {
      this.currentScopeId = prevScopeId;
      this.isolationScopes.delete(scopeId);
    }
  }

  /**
   * Run an async function with an isolated scope
   */
  async withScopeAsync<T>(callback: (scope: Scope) => Promise<T>): Promise<T> {
    const scopeId = crypto.randomUUID();
    const scope = this.globalScope.clone();
    this.isolationScopes.set(scopeId, scope);

    const prevScopeId = this.currentScopeId;
    this.currentScopeId = scopeId;

    try {
      return await callback(scope);
    } finally {
      this.currentScopeId = prevScopeId;
      this.isolationScopes.delete(scopeId);
    }
  }
}
