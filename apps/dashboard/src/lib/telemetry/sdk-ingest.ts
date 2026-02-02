import Redis from 'ioredis';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis;
}

type TelemetryStreamType = 'traces' | 'logs' | 'errors';

interface StreamMetadata {
  service_id: string;
  deployment_id?: string;
}

/**
 * Push telemetry items to the appropriate Redis stream for consumption
 * by the telemetry-ingest service.
 */
export async function pushToTelemetryStream(
  type: TelemetryStreamType,
  items: unknown[],
  metadata: StreamMetadata
): Promise<number> {
  const r = getRedis();
  const streamKey = `syntra:telemetry:${type}`;
  const pipeline = r.pipeline();

  for (const item of items) {
    pipeline.xadd(
      streamKey,
      'MAXLEN',
      '~',
      '100000',
      '*',
      'data', JSON.stringify(item),
      'timestamp', new Date().toISOString(),
      'service_id', metadata.service_id,
      'deployment_id', metadata.deployment_id || '',
    );
  }

  await pipeline.exec();
  return items.length;
}
