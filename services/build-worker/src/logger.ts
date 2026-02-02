import { eq } from 'drizzle-orm';
import { db, deployments } from './db';
import type { BuildContext } from './types';

export function createBuildLogger(ctx: BuildContext) {
  let pendingFlush: ReturnType<typeof setTimeout> | null = null;

  async function flush(): Promise<void> {
    await db
      .update(deployments)
      .set({
        buildLogs: ctx.logs.join('\n'),
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, ctx.deploymentId));
  }

  async function appendLog(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    ctx.logs.push(logLine);

    console.log(`[BuildWorker] ${ctx.deploymentId}: ${message}`);

    // Batch DB writes — flush at most every 500ms
    if (pendingFlush) {
      clearTimeout(pendingFlush);
    }
    pendingFlush = setTimeout(() => {
      flush().catch((err) => {
        console.error(`[BuildWorker] Failed to flush logs for ${ctx.deploymentId}:`, err);
      });
      pendingFlush = null;
    }, 500);
  }

  async function flushNow(): Promise<void> {
    if (pendingFlush) {
      clearTimeout(pendingFlush);
      pendingFlush = null;
    }
    await flush();
  }

  return { appendLog, flushNow };
}
