import { db } from '@/lib/db';
import { previewDeployments } from '@/lib/db/schema';
import { lt, eq, and, or } from 'drizzle-orm';
import { agentHub } from '@/lib/agent/hub';
import crypto from 'crypto';

/**
 * Clean up expired preview deployments
 * Stops containers and removes records for previews that have passed their expiration date
 */
export async function cleanupExpiredPreviews(): Promise<{
  cleaned: number;
  errors: string[];
}> {
  const now = new Date();
  let cleaned = 0;
  const errors: string[] = [];

  try {
    // Find all expired previews that are still running or have a container
    const expiredPreviews = await db.query.previewDeployments.findMany({
      where: and(
        lt(previewDeployments.expiresAt, now),
        or(
          eq(previewDeployments.status, 'running'),
          eq(previewDeployments.status, 'building'),
          eq(previewDeployments.status, 'pending')
        )
      ),
    });

    console.log(`[Preview Cleanup] Found ${expiredPreviews.length} expired previews`);

    for (const preview of expiredPreviews) {
      try {
        // Stop container if running
        if (preview.containerId && preview.serverId) {
          if (agentHub.isAgentConnected(preview.serverId)) {
            agentHub.sendToAgent(preview.serverId, {
              id: crypto.randomUUID(),
              type: 'container_stop',
              timestamp: new Date().toISOString(),
              payload: {
                container_id: preview.containerId,
                remove: true,
              },
            });
            console.log(`[Preview Cleanup] Sent stop command for container ${preview.containerId}`);
          } else {
            console.log(`[Preview Cleanup] Server ${preview.serverId} offline, marking preview as expired`);
          }
        }

        // Update status to stopped (expired previews are stopped)
        await db
          .update(previewDeployments)
          .set({
            status: 'stopped',
            updatedAt: new Date(),
          })
          .where(eq(previewDeployments.id, preview.id));

        cleaned++;
        console.log(`[Preview Cleanup] Stopped expired preview ${preview.id} (PR #${preview.prNumber})`);
      } catch (error) {
        const errorMsg = `Failed to cleanup preview ${preview.id}: ${error}`;
        console.error(`[Preview Cleanup] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    return { cleaned, errors };
  } catch (error) {
    console.error('[Preview Cleanup] Error:', error);
    throw error;
  }
}

/**
 * Delete old expired previews (older than retention period)
 * Default retention: 7 days after expiration
 */
export async function purgeOldPreviews(retentionDays: number = 7): Promise<{
  purged: number;
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  try {
    // Find stopped previews that expired more than retentionDays ago
    const oldPreviews = await db.query.previewDeployments.findMany({
      where: and(
        eq(previewDeployments.status, 'stopped'),
        lt(previewDeployments.expiresAt, cutoffDate)
      ),
    });

    if (oldPreviews.length === 0) {
      console.log('[Preview Purge] No old previews to purge');
      return { purged: 0 };
    }

    // Delete old records
    const ids = oldPreviews.map(p => p.id);
    for (const id of ids) {
      await db.delete(previewDeployments).where(eq(previewDeployments.id, id));
    }

    console.log(`[Preview Purge] Purged ${ids.length} old preview records`);
    return { purged: ids.length };
  } catch (error) {
    console.error('[Preview Purge] Error:', error);
    throw error;
  }
}

/**
 * Extend preview expiration
 */
export async function extendPreviewExpiration(
  previewId: string,
  extensionDays: number = 7
): Promise<Date> {
  const preview = await db.query.previewDeployments.findFirst({
    where: eq(previewDeployments.id, previewId),
  });

  if (!preview) {
    throw new Error(`Preview ${previewId} not found`);
  }

  const newExpiration = new Date(preview.expiresAt || new Date());
  newExpiration.setDate(newExpiration.getDate() + extensionDays);

  await db
    .update(previewDeployments)
    .set({
      expiresAt: newExpiration,
      updatedAt: new Date(),
    })
    .where(eq(previewDeployments.id, previewId));

  console.log(`[Preview] Extended expiration for ${previewId} to ${newExpiration.toISOString()}`);

  return newExpiration;
}

/**
 * Get preview statistics for an organization
 */
export async function getPreviewStats(orgId: string): Promise<{
  total: number;
  running: number;
  building: number;
  expired: number;
  stopped: number;
  failed: number;
}> {
  // This would need a join with services/projects to filter by org
  // For now, return a placeholder implementation

  const allPreviews = await db.query.previewDeployments.findMany({
    with: {
      service: {
        with: {
          project: true,
        },
      },
    },
  });

  const orgPreviews = allPreviews.filter(p => p.service.project.orgId === orgId);

  const now = new Date();
  return {
    total: orgPreviews.length,
    running: orgPreviews.filter(p => p.status === 'running').length,
    building: orgPreviews.filter(p => p.status === 'building' || p.status === 'pending').length,
    expired: orgPreviews.filter(p => p.status === 'stopped' && p.expiresAt && p.expiresAt < now).length,
    stopped: orgPreviews.filter(p => p.status === 'stopped' && (!p.expiresAt || p.expiresAt >= now)).length,
    failed: orgPreviews.filter(p => p.status === 'failed').length,
  };
}
