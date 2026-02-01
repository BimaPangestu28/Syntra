import { BaseTransport, type TransportOptions } from './base';

/**
 * HTTP transport - sends telemetry directly to control plane API
 */
export class HttpTransport extends BaseTransport {
  constructor(options: TransportOptions) {
    super(options);
  }

  /**
   * Send payload via HTTP POST
   */
  protected async sendPayload(
    type: 'errors' | 'spans' | 'logs',
    payload: unknown
  ): Promise<void> {
    const url = this.buildUrl(type);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Syntra-Key': this.options.publicKey,
        'X-Syntra-Project': this.options.projectId,
      },
      body: JSON.stringify({
        batch_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        [type]: payload,
      }),
      signal: AbortSignal.timeout(this.options.timeout),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
  }

  /**
   * Build endpoint URL for specific telemetry type
   */
  private buildUrl(type: 'errors' | 'spans' | 'logs'): string {
    const base = this.options.url.endsWith('/')
      ? this.options.url.slice(0, -1)
      : this.options.url;
    return `${base}/${type}`;
  }
}

/**
 * Create HTTP transport from DSN
 */
export function createHttpTransport(
  host: string,
  publicKey: string,
  projectId: string,
  options?: Partial<TransportOptions>
): HttpTransport {
  const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
  const url = `${protocol}://${host}/api/v1/telemetry`;

  return new HttpTransport({
    url,
    publicKey,
    projectId,
    ...options,
  });
}
