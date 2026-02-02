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

// ---------------------------------------------------------------------------
// Scope ID storage abstraction (mirrors context.ts ContextStorage pattern)
// ---------------------------------------------------------------------------

interface ScopeIdStorage {
  get(): string | null;
  set(id: string | null): void;
  run<T>(id: string, fn: () => T): T;
  runAsync<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

class SimpleScopeIdStorage implements ScopeIdStorage {
  private current: string | null = null;

  get(): string | null {
    return this.current;
  }

  set(id: string | null): void {
    this.current = id;
  }

  run<T>(id: string, fn: () => T): T {
    const prev = this.current;
    this.current = id;
    try {
      return fn();
    } finally {
      this.current = prev;
    }
  }

  async runAsync<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.current;
    this.current = id;
    try {
      return await fn();
    } finally {
      this.current = prev;
    }
  }
}

class AsyncLocalScopeIdStorage implements ScopeIdStorage {
  private als: import('node:async_hooks').AsyncLocalStorage<string | null>;

  constructor(als: import('node:async_hooks').AsyncLocalStorage<string | null>) {
    this.als = als;
  }

  get(): string | null {
    return this.als.getStore() ?? null;
  }

  set(id: string | null): void {
    this.als.enterWith(id);
  }

  run<T>(id: string, fn: () => T): T {
    return this.als.run(id, fn);
  }

  runAsync<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return this.als.run(id, fn);
  }
}

function createScopeIdStorage(): ScopeIdStorage {
  if (
    typeof process !== 'undefined' &&
    typeof process.versions?.node !== 'undefined'
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AsyncLocalStorage } = require('node:async_hooks');
      return new AsyncLocalScopeIdStorage(new AsyncLocalStorage());
    } catch {
      // Fallback
    }
  }
  return new SimpleScopeIdStorage();
}

/**
 * Scope manager with AsyncLocalStorage support for context propagation
 */
export class ScopeManager {
  private globalScope: Scope;
  private isolationScopes: Map<string, Scope> = new Map();
  private scopeIdStorage: ScopeIdStorage = createScopeIdStorage();

  constructor(maxBreadcrumbs: number = 100) {
    this.globalScope = new Scope(maxBreadcrumbs);
  }

  /**
   * Get the current active scope
   */
  getCurrentScope(): Scope {
    const currentScopeId = this.scopeIdStorage.get();
    if (currentScopeId) {
      return this.isolationScopes.get(currentScopeId) ?? this.globalScope;
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

    try {
      return this.scopeIdStorage.run(scopeId, () => callback(scope));
    } finally {
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

    try {
      return await this.scopeIdStorage.runAsync(scopeId, () => callback(scope));
    } finally {
      this.isolationScopes.delete(scopeId);
    }
  }
}
