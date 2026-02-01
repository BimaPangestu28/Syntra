import type { TelemetryError, TelemetrySpan, TelemetryLog, Transport } from '../types';

/**
 * Base transport options
 */
export interface TransportOptions {
  /** Endpoint URL */
  url: string;
  /** Public key for authentication */
  publicKey: string;
  /** Project ID */
  projectId: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Maximum items per batch */
  maxBatchSize?: number;
  /** Flush interval in ms */
  flushInterval?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Debug mode */
  debug?: boolean;
}

/**
 * Base transport implementation with batching and retry logic
 */
export abstract class BaseTransport implements Transport {
  protected options: Required<TransportOptions>;
  protected errorQueue: TelemetryError[] = [];
  protected spanQueue: TelemetrySpan[] = [];
  protected logQueue: TelemetryLog[] = [];
  protected flushTimer: ReturnType<typeof setInterval> | null = null;
  protected isFlushing = false;

  constructor(options: TransportOptions) {
    this.options = {
      url: options.url,
      publicKey: options.publicKey,
      projectId: options.projectId,
      timeout: options.timeout ?? 30000,
      maxBatchSize: options.maxBatchSize ?? 100,
      flushInterval: options.flushInterval ?? 5000,
      maxRetries: options.maxRetries ?? 3,
      debug: options.debug ?? false,
    };

    this.startFlushTimer();
  }

  /**
   * Send an error event
   */
  async sendError(error: TelemetryError): Promise<void> {
    this.errorQueue.push(error);

    if (this.errorQueue.length >= this.options.maxBatchSize) {
      await this.flushErrors();
    }
  }

  /**
   * Send spans
   */
  async sendSpans(spans: TelemetrySpan[]): Promise<void> {
    this.spanQueue.push(...spans);

    if (this.spanQueue.length >= this.options.maxBatchSize) {
      await this.flushSpans();
    }
  }

  /**
   * Send logs
   */
  async sendLogs(logs: TelemetryLog[]): Promise<void> {
    this.logQueue.push(...logs);

    if (this.logQueue.length >= this.options.maxBatchSize) {
      await this.flushLogs();
    }
  }

  /**
   * Flush all pending data
   */
  async flush(timeout?: number): Promise<void> {
    if (this.isFlushing) {
      return;
    }

    this.isFlushing = true;

    try {
      const flushPromise = Promise.all([
        this.flushErrors(),
        this.flushSpans(),
        this.flushLogs(),
      ]);

      if (timeout) {
        await Promise.race([
          flushPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Flush timeout')), timeout)
          ),
        ]);
      } else {
        await flushPromise;
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Stop the transport (clear timer)
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Abstract method to send payload - implemented by specific transports
   */
  protected abstract sendPayload(
    type: 'errors' | 'spans' | 'logs',
    payload: unknown
  ): Promise<void>;

  /**
   * Start the automatic flush timer
   */
  private startFlushTimer(): void {
    if (this.options.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch((err) => {
          if (this.options.debug) {
            console.error('[Syntra] Auto-flush error:', err);
          }
        });
      }, this.options.flushInterval);
    }
  }

  /**
   * Flush error queue
   */
  private async flushErrors(): Promise<void> {
    if (this.errorQueue.length === 0) return;

    const errors = this.errorQueue.splice(0, this.options.maxBatchSize);
    await this.sendWithRetry('errors', errors);
  }

  /**
   * Flush span queue
   */
  private async flushSpans(): Promise<void> {
    if (this.spanQueue.length === 0) return;

    const spans = this.spanQueue.splice(0, this.options.maxBatchSize);
    await this.sendWithRetry('spans', spans);
  }

  /**
   * Flush log queue
   */
  private async flushLogs(): Promise<void> {
    if (this.logQueue.length === 0) return;

    const logs = this.logQueue.splice(0, this.options.maxBatchSize);
    await this.sendWithRetry('logs', logs);
  }

  /**
   * Send with exponential backoff retry
   */
  private async sendWithRetry(
    type: 'errors' | 'spans' | 'logs',
    payload: unknown
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        await this.sendPayload(type, payload);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (this.options.debug) {
          console.warn(`[Syntra] Send attempt ${attempt + 1} failed:`, lastError.message);
        }

        // Exponential backoff
        if (attempt < this.options.maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (this.options.debug && lastError) {
      console.error('[Syntra] All send attempts failed:', lastError);
    }
  }
}
