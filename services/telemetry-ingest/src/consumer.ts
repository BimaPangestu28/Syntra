/**
 * Redis Stream Consumer
 *
 * Consumes telemetry data from Redis streams using consumer groups
 * for reliable, distributed processing.
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';

export interface ConsumerOptions {
  url: string;
  consumerGroup: string;
  consumerName: string;
  debug?: boolean;
}

type TelemetryHandler = (data: TelemetryMessage[]) => Promise<void>;

export interface TelemetryMessage {
  id: string;
  type: 'trace' | 'log' | 'metric' | 'error';
  data: Record<string, unknown>;
  timestamp: string;
  serviceId: string;
  deploymentId?: string;
}

// Stream names
const STREAMS = {
  traces: 'syntra:telemetry:traces',
  logs: 'syntra:telemetry:logs',
  metrics: 'syntra:telemetry:metrics',
  errors: 'syntra:telemetry:errors',
} as const;

export class RedisConsumer extends EventEmitter {
  private redis: Redis | null = null;
  private options: ConsumerOptions;
  private handlers: Map<string, TelemetryHandler> = new Map();
  private running = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(options: ConsumerOptions) {
    super();
    this.options = options;
  }

  async connect(): Promise<void> {
    this.redis = new Redis(this.options.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      this.redis!.once('ready', resolve);
      this.redis!.once('error', reject);
    });

    // Create consumer groups for each stream
    for (const [name, stream] of Object.entries(STREAMS)) {
      try {
        await this.redis.xgroup(
          'CREATE',
          stream,
          this.options.consumerGroup,
          '0',
          'MKSTREAM'
        );
        if (this.options.debug) {
          console.log(`[Consumer] Created consumer group for ${name}`);
        }
      } catch (error: any) {
        // Ignore "BUSYGROUP" error (group already exists)
        if (!error.message?.includes('BUSYGROUP')) {
          throw error;
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }

  /**
   * Register a handler for a telemetry type
   */
  on(type: 'traces' | 'logs' | 'metrics' | 'errors', handler: TelemetryHandler): this {
    this.handlers.set(type, handler);
    return this;
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    if (!this.redis) {
      throw new Error('Not connected to Redis');
    }

    this.running = true;

    // Start polling each stream
    this.pollStreams();
  }

  /**
   * Stop consuming messages
   */
  async stop(): Promise<void> {
    this.running = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async pollStreams(): Promise<void> {
    if (!this.running || !this.redis) return;

    try {
      // Read from all streams
      for (const [type, stream] of Object.entries(STREAMS)) {
        await this.readStream(type as keyof typeof STREAMS, stream);
      }
    } catch (error) {
      console.error('[Consumer] Poll error:', error);
    }

    // Schedule next poll
    if (this.running) {
      this.pollInterval = setTimeout(() => this.pollStreams(), 100);
    }
  }

  private async readStream(
    type: keyof typeof STREAMS,
    stream: string
  ): Promise<void> {
    if (!this.redis) return;

    const handler = this.handlers.get(type);
    if (!handler) return;

    try {
      // Read pending messages first (for crash recovery)
      const pendingResult = await this.redis.xreadgroup(
        'GROUP',
        this.options.consumerGroup,
        this.options.consumerName,
        'COUNT',
        100,
        'STREAMS',
        stream,
        '0'
      );

      if (pendingResult) {
        await this.processMessages(type, stream, pendingResult as [string, [string, string[]][]][], handler);
      }

      // Read new messages
      const newResult = await this.redis.xreadgroup(
        'GROUP',
        this.options.consumerGroup,
        this.options.consumerName,
        'COUNT',
        100,
        'BLOCK',
        1000,
        'STREAMS',
        stream,
        '>'
      );

      if (newResult) {
        await this.processMessages(type, stream, newResult as [string, [string, string[]][]][], handler);
      }
    } catch (error) {
      if (this.options.debug) {
        console.error(`[Consumer] Error reading ${type}:`, error);
      }
    }
  }

  private async processMessages(
    type: string,
    stream: string,
    result: [string, [string, string[]][]][],
    handler: TelemetryHandler
  ): Promise<void> {
    if (!this.redis) return;

    const messages: TelemetryMessage[] = [];
    const messageIds: string[] = [];

    for (const [, streamMessages] of result) {
      for (const [id, fields] of streamMessages) {
        // Parse fields array into object
        const data: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1];
        }

        try {
          const parsed = JSON.parse(data.data || '{}');
          messages.push({
            id,
            type: type as TelemetryMessage['type'],
            data: parsed,
            timestamp: data.timestamp || new Date().toISOString(),
            serviceId: data.service_id || '',
            deploymentId: data.deployment_id,
          });
          messageIds.push(id);
        } catch (error) {
          console.error(`[Consumer] Failed to parse message ${id}:`, error);
          // Acknowledge failed message to prevent reprocessing
          messageIds.push(id);
        }
      }
    }

    if (messages.length === 0) return;

    try {
      // Process messages
      await handler(messages);

      // Acknowledge processed messages
      if (messageIds.length > 0) {
        await this.redis.xack(stream, this.options.consumerGroup, ...messageIds);

        if (this.options.debug) {
          console.log(`[Consumer] Processed ${messages.length} ${type} messages`);
        }
      }
    } catch (error) {
      console.error(`[Consumer] Handler error for ${type}:`, error);
      // Don't acknowledge - messages will be reprocessed
    }
  }
}
