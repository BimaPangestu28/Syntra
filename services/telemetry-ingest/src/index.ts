/**
 * Syntra Telemetry Ingest Service
 *
 * Consumes telemetry data from Redis streams and writes to ClickHouse
 * for long-term storage and analytics.
 */

import { RedisConsumer } from './consumer';
import { ClickHouseWriter } from './clickhouse';
import { TracesWriter } from './writers/traces';
import { LogsWriter } from './writers/logs';
import { MetricsWriter } from './writers/metrics';
import { ErrorsWriter } from './writers/errors';

// Configuration from environment
const config = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    consumerGroup: process.env.REDIS_CONSUMER_GROUP || 'telemetry-ingest',
    consumerName: process.env.REDIS_CONSUMER_NAME || `ingest-${process.pid}`,
  },
  clickhouse: {
    url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DATABASE || 'syntra_telemetry',
    username: process.env.CLICKHOUSE_USERNAME || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  },
  batchSize: parseInt(process.env.BATCH_SIZE || '1000', 10),
  flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS || '5000', 10),
  debug: process.env.DEBUG === 'true',
};

async function main() {
  console.log('[Telemetry Ingest] Starting service...');
  console.log('[Telemetry Ingest] Config:', {
    redis: config.redis.url.replace(/\/\/.*@/, '//<credentials>@'),
    clickhouse: config.clickhouse.url,
    database: config.clickhouse.database,
    batchSize: config.batchSize,
    flushIntervalMs: config.flushIntervalMs,
  });

  // Initialize ClickHouse writer
  const clickhouse = new ClickHouseWriter({
    url: config.clickhouse.url,
    database: config.clickhouse.database,
    username: config.clickhouse.username,
    password: config.clickhouse.password,
    debug: config.debug,
  });

  await clickhouse.connect();
  console.log('[Telemetry Ingest] Connected to ClickHouse');

  // Initialize specialized writers
  const tracesWriter = new TracesWriter(clickhouse, config.batchSize);
  const logsWriter = new LogsWriter(clickhouse, config.batchSize);
  const metricsWriter = new MetricsWriter(clickhouse, config.batchSize);
  const errorsWriter = new ErrorsWriter(clickhouse, config.batchSize);

  // Initialize Redis consumer
  const consumer = new RedisConsumer({
    url: config.redis.url,
    consumerGroup: config.redis.consumerGroup,
    consumerName: config.redis.consumerName,
    debug: config.debug,
  });

  await consumer.connect();
  console.log('[Telemetry Ingest] Connected to Redis');

  // Register handlers for different telemetry types
  consumer.on('traces', async (data) => {
    await tracesWriter.write(data);
  });

  consumer.on('logs', async (data) => {
    await logsWriter.write(data);
  });

  consumer.on('metrics', async (data) => {
    await metricsWriter.write(data);
  });

  consumer.on('errors', async (data) => {
    await errorsWriter.write(data);
  });

  // Start periodic flush
  const flushInterval = setInterval(async () => {
    try {
      await Promise.all([
        tracesWriter.flush(),
        logsWriter.flush(),
        metricsWriter.flush(),
        errorsWriter.flush(),
      ]);
    } catch (error) {
      console.error('[Telemetry Ingest] Flush error:', error);
    }
  }, config.flushIntervalMs);

  // Start consuming
  await consumer.start();
  console.log('[Telemetry Ingest] Started consuming telemetry');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[Telemetry Ingest] Received ${signal}, shutting down...`);

    clearInterval(flushInterval);

    // Stop consumer
    await consumer.stop();

    // Flush remaining data
    await Promise.all([
      tracesWriter.flush(),
      logsWriter.flush(),
      metricsWriter.flush(),
      errorsWriter.flush(),
    ]);

    // Close connections
    await consumer.disconnect();
    await clickhouse.close();

    console.log('[Telemetry Ingest] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[Telemetry Ingest] Fatal error:', error);
  process.exit(1);
});
