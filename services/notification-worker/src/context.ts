import { eq } from 'drizzle-orm';
import { db, deployments, notificationChannels } from './db';
import type { NotificationJobData, NotificationContext, NotificationChannel } from './types';

export async function getNotificationContext(
  data: NotificationJobData
): Promise<NotificationContext> {
  const context: NotificationContext = {};

  if (data.deploymentId) {
    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, data.deploymentId),
      with: {
        service: {
          with: {
            project: {
              with: {
                organization: true,
              },
            },
          },
        },
      },
    });

    if (deployment) {
      context.deployment = {
        id: deployment.id,
        status: deployment.status,
        serviceName: deployment.service.name,
        projectName: deployment.service.project.name,
        orgId: deployment.service.project.orgId,
        orgName: deployment.service.project.organization.name,
        gitBranch: deployment.gitBranch || undefined,
        gitCommitSha: deployment.gitCommitSha || undefined,
        errorMessage: deployment.errorMessage || undefined,
      };
      context.orgId = deployment.service.project.orgId;
    }
  }

  return context;
}

export async function getChannelsForOrg(orgId: string): Promise<NotificationChannel[]> {
  const channels = await db.query.notificationChannels.findMany({
    where: eq(notificationChannels.orgId, orgId),
  });

  return channels.filter((ch) => ch.isEnabled) as NotificationChannel[];
}
