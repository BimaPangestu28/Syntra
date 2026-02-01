import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, deployments, previewDeployments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { agentHub } from '@/lib/agent/hub';
import { queueBuild } from '@/lib/queue';

// --- Type Definitions ---

export interface GitHubPushPayload {
  ref: string;
  before: string;
  after: string;
  repository: {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    clone_url: string;
    ssh_url: string;
    default_branch: string;
  };
  pusher: {
    name: string;
    email: string;
  };
  sender: {
    login: string;
    avatar_url: string;
  };
  commits: Array<{
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
    url: string;
  }>;
  head_commit: {
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
  } | null;
}

export interface GitHubPingPayload {
  zen: string;
  hook_id: number;
  hook: {
    type: string;
    id: number;
    events: string[];
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
  };
}

export interface GitHubPullRequestPayload {
  action: 'opened' | 'synchronize' | 'closed' | 'reopened';
  number: number;
  pull_request: {
    id: number;
    number: number;
    title: string;
    state: 'open' | 'closed';
    head: {
      ref: string;
      sha: string;
      repo: {
        full_name: string;
        clone_url: string;
      };
    };
    base: {
      ref: string;
      sha: string;
    };
    user: {
      login: string;
      avatar_url: string;
    };
    merged: boolean;
    merged_at: string | null;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    clone_url: string;
  };
  sender: {
    login: string;
    avatar_url: string;
  };
}

// --- Utility Functions ---

/** Extract branch name from ref (refs/heads/main -> main) */
export function extractBranch(ref: string): string {
  return ref.replace('refs/heads/', '');
}

// --- Event Handlers ---

export async function handlePingEvent(
  payload: GitHubPingPayload,
  requestId: string
): Promise<NextResponse> {
  console.log(`[GitHub Webhook] Ping received: ${payload.zen}`);
  return NextResponse.json({
    success: true,
    message: 'Pong!',
    zen: payload.zen,
    request_id: requestId,
  });
}

export async function handlePushEvent(
  payload: GitHubPushPayload,
  requestId: string
): Promise<NextResponse> {
  const branch = extractBranch(payload.ref);
  const repoUrl = payload.repository.html_url;
  const commitSha = payload.after;
  const commitMessage = payload.head_commit?.message || 'No commit message';
  const commitAuthor = payload.head_commit?.author.name || payload.pusher.name;

  console.log(`[GitHub Webhook] Push to ${repoUrl} branch ${branch}, commit ${commitSha.substring(0, 7)}`);

  // Skip if this is a branch deletion (after is all zeros)
  if (commitSha === '0000000000000000000000000000000000000000') {
    console.log('[GitHub Webhook] Branch deletion, skipping');
    return NextResponse.json({
      success: true,
      message: 'Branch deletion ignored',
      request_id: requestId,
    });
  }

  // Find projects matching this repository
  const matchingProjects = await db.query.projects.findMany({
    where: (projects, { or, like }) =>
      or(
        like(projects.gitRepoUrl, `%${payload.repository.full_name}%`),
        eq(projects.gitRepoUrl, repoUrl),
        eq(projects.gitRepoUrl, payload.repository.clone_url),
        eq(projects.gitRepoUrl, payload.repository.ssh_url)
      ),
    with: {
      services: {
        where: eq(services.autoDeploy, true),
        with: {
          server: true,
        },
      },
    },
  });

  if (matchingProjects.length === 0) {
    console.log('[GitHub Webhook] No matching projects found');
    return NextResponse.json({
      success: true,
      message: 'No matching projects',
      request_id: requestId,
    });
  }

  const triggeredDeployments: string[] = [];
  const errors: string[] = [];

  for (const project of matchingProjects) {
    const projectBranch = project.gitBranch || 'main';

    if (branch !== projectBranch) {
      console.log(`[GitHub Webhook] Branch ${branch} doesn't match project branch ${projectBranch}, skipping`);
      continue;
    }

    for (const service of project.services) {
      if (!service.serverId || !service.server) {
        console.log(`[GitHub Webhook] Service ${service.name} has no server, skipping`);
        continue;
      }

      if (service.server.status !== 'online' && !agentHub.isAgentConnected(service.serverId)) {
        console.log(`[GitHub Webhook] Server ${service.server.name} is offline, skipping`);
        errors.push(`Server ${service.server.name} is offline`);
        continue;
      }

      try {
        const [deployment] = await db
          .insert(deployments)
          .values({
            serviceId: service.id,
            serverId: service.serverId,
            status: 'pending',
            gitCommitSha: commitSha,
            gitCommitMessage: commitMessage.split('\n')[0].substring(0, 255),
            gitCommitAuthor: commitAuthor,
            gitBranch: branch,
            triggerType: 'git_push',
          })
          .returning();

        console.log(`[GitHub Webhook] Created deployment ${deployment.id} for service ${service.name}`);

        const deployPayload = {
          deployment_id: deployment.id,
          service: {
            id: service.id,
            name: service.name,
            type: service.type,
            source_type: service.sourceType,
            docker_image: service.dockerImage,
            dockerfile_path: service.dockerfilePath,
            port: service.port,
            replicas: service.replicas,
            health_check: {
              path: service.healthCheckPath,
              interval_seconds: service.healthCheckInterval,
            },
            env_vars: { ...project.envVars, ...service.envVars },
            resources: service.resources,
          },
          git: {
            repo_url: project.gitRepoUrl,
            branch: branch,
            commit_sha: commitSha,
          },
        };

        const sent = agentHub.sendToAgent(service.serverId, {
          id: crypto.randomUUID(),
          type: 'deploy',
          timestamp: new Date().toISOString(),
          payload: deployPayload,
        });

        if (sent) {
          await db
            .update(deployments)
            .set({ status: 'building', buildStartedAt: new Date() })
            .where(eq(deployments.id, deployment.id));

          triggeredDeployments.push(deployment.id);
        } else {
          await db
            .update(deployments)
            .set({
              status: 'failed',
              errorMessage: 'Failed to send deploy command to agent'
            })
            .where(eq(deployments.id, deployment.id));

          errors.push(`Failed to send deploy command for service ${service.name}`);
        }
      } catch (error) {
        console.error(`[GitHub Webhook] Error deploying service ${service.name}:`, error);
        errors.push(`Error deploying service ${service.name}: ${error}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Triggered ${triggeredDeployments.length} deployment(s)`,
    deployments: triggeredDeployments,
    errors: errors.length > 0 ? errors : undefined,
    request_id: requestId,
  });
}

export async function handlePullRequestEvent(
  payload: GitHubPullRequestPayload,
  requestId: string
): Promise<NextResponse> {
  const pr = payload.pull_request;
  const repoUrl = payload.repository.html_url;

  console.log(`[GitHub Webhook] PR #${pr.number} ${payload.action}: ${pr.title}`);

  const matchingProjects = await db.query.projects.findMany({
    where: (projects, { or, like }) =>
      or(
        like(projects.gitRepoUrl, `%${payload.repository.full_name}%`),
        eq(projects.gitRepoUrl, repoUrl),
        eq(projects.gitRepoUrl, payload.repository.clone_url)
      ),
    with: {
      services: {
        where: eq(services.autoDeploy, true),
        with: {
          server: true,
        },
      },
    },
  });

  if (matchingProjects.length === 0) {
    console.log('[GitHub Webhook] No matching projects for PR preview');
    return NextResponse.json({
      success: true,
      message: 'No matching projects for PR preview',
      request_id: requestId,
    });
  }

  const results: { serviceId: string; previewId?: string; action: string }[] = [];

  for (const project of matchingProjects) {
    for (const service of project.services) {
      if (!service.serverId || !service.server) {
        continue;
      }

      try {
        if (payload.action === 'opened' || payload.action === 'synchronize' || payload.action === 'reopened') {
          const previewSubdomain = `pr-${pr.number}-${service.name}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          const previewUrl = `https://${previewSubdomain}.preview.${process.env.PREVIEW_DOMAIN || 'syntra.catalystlabs.id'}`;

          const existingPreview = await db.query.previewDeployments.findFirst({
            where: and(
              eq(previewDeployments.serviceId, service.id),
              eq(previewDeployments.prNumber, pr.number)
            ),
          });

          let previewId: string;

          if (existingPreview) {
            await db
              .update(previewDeployments)
              .set({
                gitCommitSha: pr.head.sha,
                prTitle: pr.title,
                status: 'pending',
                errorMessage: null,
                updatedAt: new Date(),
              })
              .where(eq(previewDeployments.id, existingPreview.id));

            previewId = existingPreview.id;
            console.log(`[GitHub Webhook] Updated preview ${previewId} for PR #${pr.number}`);
          } else {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            const [preview] = await db
              .insert(previewDeployments)
              .values({
                serviceId: service.id,
                serverId: service.serverId,
                prNumber: pr.number,
                prTitle: pr.title,
                prAuthor: pr.user.login,
                prBranch: pr.head.ref,
                baseBranch: pr.base.ref,
                gitCommitSha: pr.head.sha,
                status: 'pending',
                previewUrl,
                previewSubdomain,
                port: 3000 + (pr.number % 1000),
                expiresAt,
              })
              .returning();

            previewId = preview.id;
            console.log(`[GitHub Webhook] Created preview ${previewId} for PR #${pr.number}`);
          }

          if (service.sourceType === 'git' && service.dockerfilePath) {
            await queueBuild({
              deploymentId: previewId,
              serviceId: service.id,
              git: {
                repoUrl: project.gitRepoUrl!,
                branch: pr.head.ref,
                commitSha: pr.head.sha,
              },
              dockerfile: service.dockerfilePath || 'Dockerfile',
              buildArgs: service.buildArgs as Record<string, string> | undefined,
            });

            await db
              .update(previewDeployments)
              .set({ status: 'building', buildStartedAt: new Date() })
              .where(eq(previewDeployments.id, previewId));
          }

          results.push({ serviceId: service.id, previewId, action: 'created' });
        } else if (payload.action === 'closed') {
          const existingPreview = await db.query.previewDeployments.findFirst({
            where: and(
              eq(previewDeployments.serviceId, service.id),
              eq(previewDeployments.prNumber, pr.number)
            ),
          });

          if (existingPreview) {
            if (existingPreview.containerId && agentHub.isAgentConnected(service.serverId)) {
              agentHub.sendToAgent(service.serverId, {
                id: crypto.randomUUID(),
                type: 'container_stop',
                timestamp: new Date().toISOString(),
                payload: {
                  container_id: existingPreview.containerId,
                  remove: true,
                },
              });
            }

            await db
              .update(previewDeployments)
              .set({
                status: 'stopped',
                updatedAt: new Date(),
              })
              .where(eq(previewDeployments.id, existingPreview.id));

            console.log(`[GitHub Webhook] Stopped preview ${existingPreview.id} for PR #${pr.number}`);
            results.push({ serviceId: service.id, previewId: existingPreview.id, action: 'stopped' });
          }
        }
      } catch (error) {
        console.error(`[GitHub Webhook] Error handling PR preview for service ${service.name}:`, error);
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Processed PR #${pr.number} ${payload.action}`,
    results,
    request_id: requestId,
  });
}
