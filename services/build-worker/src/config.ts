export const config = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  database: {
    url: process.env.DATABASE_URL!,
  },
  docker: {
    registryUrl: process.env.DOCKER_REGISTRY_URL || 'localhost:5000',
    registryUsername: process.env.DOCKER_REGISTRY_USERNAME,
    registryPassword: process.env.DOCKER_REGISTRY_PASSWORD,
  },
  worker: {
    concurrency: parseInt(process.env.BUILD_CONCURRENCY || '2', 10),
    timeoutMs: parseInt(process.env.BUILD_TIMEOUT_MS || '600000', 10),
    buildsPerMinute: parseInt(process.env.BUILDS_PER_MINUTE || '5', 10),
  },
};

export function validateConfig(): void {
  if (!config.database.url) {
    throw new Error('DATABASE_URL environment variable is required');
  }
}
