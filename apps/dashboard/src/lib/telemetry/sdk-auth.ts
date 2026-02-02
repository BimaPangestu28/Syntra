import crypto from 'crypto';
import { db } from '@/lib/db';
import { apiKeys, projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface SdkAuthResult {
  orgId: string;
  keyId: string;
}

/**
 * Verify an SDK API key and project ownership.
 * Hashes the raw key with SHA-256, looks it up in apiKeys,
 * checks expiry, and verifies the project belongs to the same org.
 */
export async function verifySdkKey(
  key: string,
  projectId: string
): Promise<SdkAuthResult | null> {
  try {
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    const apiKey = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyHash, keyHash),
    });

    if (!apiKey) return null;

    // Check expiry
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null;
    }

    // Verify project belongs to the same org
    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.orgId, apiKey.orgId),
      ),
    });

    if (!project) return null;

    // Update lastUsedAt (fire-and-forget)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, apiKey.id))
      .execute()
      .catch(() => {});

    return {
      orgId: apiKey.orgId,
      keyId: apiKey.id,
    };
  } catch (error) {
    console.error('[SDK Auth] Verification error:', error);
    return null;
  }
}
