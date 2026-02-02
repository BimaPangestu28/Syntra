export const config = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  database: {
    url: process.env.DATABASE_URL!,
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM || 'Syntra <noreply@syntra.io>',
  },
  worker: {
    concurrency: parseInt(process.env.NOTIFICATION_CONCURRENCY || '10', 10),
    notificationsPerMinute: parseInt(process.env.NOTIFICATIONS_PER_MINUTE || '100', 10),
  },
};

export function validateConfig(): void {
  if (!config.database.url) {
    throw new Error('DATABASE_URL environment variable is required');
  }
}
