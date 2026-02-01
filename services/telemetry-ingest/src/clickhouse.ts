/**
 * ClickHouse Client Wrapper
 *
 * Provides a simplified interface for writing telemetry data to ClickHouse.
 */

import { createClient, ClickHouseClient } from '@clickhouse/client';

export interface ClickHouseOptions {
  url: string;
  database: string;
  username: string;
  password: string;
  debug?: boolean;
}

export class ClickHouseWriter {
  private client: ClickHouseClient | null = null;
  private options: ClickHouseOptions;

  constructor(options: ClickHouseOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    this.client = createClient({
      host: this.options.url,
      database: this.options.database,
      username: this.options.username,
      password: this.options.password,
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 0,
      },
    });

    // Test connection
    const result = await this.client.ping();
    if (!result.success) {
      throw new Error('Failed to connect to ClickHouse');
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  /**
   * Insert rows into a table
   */
  async insert(
    table: string,
    rows: readonly Record<string, unknown>[]
  ): Promise<void> {
    if (!this.client || rows.length === 0) return;

    await this.client.insert({
      table,
      values: rows,
      format: 'JSONEachRow',
    });

    if (this.options.debug) {
      console.log(`[ClickHouse] Inserted ${rows.length} rows into ${table}`);
    }
  }

  /**
   * Execute a query
   */
  async query<T>(sql: string): Promise<T[]> {
    if (!this.client) {
      throw new Error('Not connected to ClickHouse');
    }

    const result = await this.client.query({
      query: sql,
      format: 'JSONEachRow',
    });

    return result.json();
  }

  /**
   * Execute a command (DDL, etc.)
   */
  async exec(sql: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to ClickHouse');
    }

    await this.client.exec({ query: sql });
  }
}
