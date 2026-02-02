import { relations } from 'drizzle-orm';
import { users, accounts, sessions, invitationTokens } from './auth';
import { chatConversations, chatMessages, aiSuggestions } from './ai';
import {
  organizations,
  organizationMembers,
  servers,
  projects,
  services,
} from './core';
import { deployments, domains, previewDeployments, proxyConfigs } from './deployments';
import { deploymentStrategies } from './deployment-strategies';
import { environments, promotions } from './environments';
import {
  errorGroups,
  alerts,
  alertRules,
  notificationChannels,
  containerLogs,
  uptimeMonitors,
  uptimeChecks,
  activityFeed,
} from './monitoring';
import {
  workflows,
  workflowRuns,
  autoScalingRules,
  scalingEvents,
  cronJobs,
  cronJobRuns,
} from './automation';
import {
  usageRecords,
  billingPlans,
  subscriptions,
  invoices,
  costRecords,
} from './billing';
import {
  managedDatabases,
  backups,
  backupSchedules,
  serviceTemplates,
  serviceDependencies,
  regions,
  serviceRegions,
  gitConnections,
  volumes,
  serviceVolumes,
} from './infrastructure';
import {
  secrets,
  secretVersions,
  secretAccessLogs,
  auditLogs,
  rateLimitRules,
  userNotificationPreferences,
  apiKeys,
} from './security';

// ===========================================
// Auth Relations
// ===========================================

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  organizationMembers: many(organizationMembers),
  notificationPreferences: many(userNotificationPreferences),
  apiKeys: many(apiKeys),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const invitationTokensRelations = relations(invitationTokens, ({ one }) => ({
  membership: one(organizationMembers, {
    fields: [invitationTokens.membershipId],
    references: [organizationMembers.id],
  }),
}));

// ===========================================
// Core Relations
// ===========================================

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, {
    fields: [organizations.ownerId],
    references: [users.id],
  }),
  members: many(organizationMembers),
  servers: many(servers),
  projects: many(projects),
  workflows: many(workflows),
}));

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.orgId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [organizationMembers.userId],
      references: [users.id],
    }),
    inviter: one(users, {
      fields: [organizationMembers.invitedBy],
      references: [users.id],
    }),
  })
);

export const serversRelations = relations(servers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [servers.orgId],
    references: [organizations.id],
  }),
  services: many(services),
  deployments: many(deployments),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.orgId],
    references: [organizations.id],
  }),
  services: many(services),
  environments: many(environments),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  project: one(projects, {
    fields: [services.projectId],
    references: [projects.id],
  }),
  server: one(servers, {
    fields: [services.serverId],
    references: [servers.id],
  }),
  deployments: many(deployments),
  errorGroups: many(errorGroups),
  domains: many(domains),
  deploymentStrategy: one(deploymentStrategies, {
    fields: [services.id],
    references: [deploymentStrategies.serviceId],
  }),
}));

// ===========================================
// Deployment Relations
// ===========================================

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  service: one(services, {
    fields: [deployments.serviceId],
    references: [services.id],
  }),
  server: one(servers, {
    fields: [deployments.serverId],
    references: [servers.id],
  }),
  triggeredByUser: one(users, {
    fields: [deployments.triggeredBy],
    references: [users.id],
  }),
}));

export const domainsRelations = relations(domains, ({ one }) => ({
  service: one(services, {
    fields: [domains.serviceId],
    references: [services.id],
  }),
}));

export const previewDeploymentsRelations = relations(previewDeployments, ({ one }) => ({
  service: one(services, {
    fields: [previewDeployments.serviceId],
    references: [services.id],
  }),
  server: one(servers, {
    fields: [previewDeployments.serverId],
    references: [servers.id],
  }),
}));

export const proxyConfigsRelations = relations(proxyConfigs, ({ one }) => ({
  service: one(services, {
    fields: [proxyConfigs.serviceId],
    references: [services.id],
  }),
}));

export const deploymentStrategiesRelations = relations(deploymentStrategies, ({ one }) => ({
  service: one(services, {
    fields: [deploymentStrategies.serviceId],
    references: [services.id],
  }),
  blueDeployment: one(deployments, {
    fields: [deploymentStrategies.blueDeploymentId],
    references: [deployments.id],
  }),
  greenDeployment: one(deployments, {
    fields: [deploymentStrategies.greenDeploymentId],
    references: [deployments.id],
  }),
  canaryDeployment: one(deployments, {
    fields: [deploymentStrategies.canaryDeploymentId],
    references: [deployments.id],
  }),
}));

// ===========================================
// Monitoring Relations
// ===========================================

export const errorGroupsRelations = relations(errorGroups, ({ one }) => ({
  service: one(services, {
    fields: [errorGroups.serviceId],
    references: [services.id],
  }),
  assignee: one(users, {
    fields: [errorGroups.assignedTo],
    references: [users.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  organization: one(organizations, {
    fields: [alerts.orgId],
    references: [organizations.id],
  }),
  server: one(servers, {
    fields: [alerts.serverId],
    references: [servers.id],
  }),
  service: one(services, {
    fields: [alerts.serviceId],
    references: [services.id],
  }),
  deployment: one(deployments, {
    fields: [alerts.deploymentId],
    references: [deployments.id],
  }),
  acknowledger: one(users, {
    fields: [alerts.acknowledgedBy],
    references: [users.id],
  }),
  resolver: one(users, {
    fields: [alerts.resolvedBy],
    references: [users.id],
  }),
}));

export const alertRulesRelations = relations(alertRules, ({ one }) => ({
  organization: one(organizations, {
    fields: [alertRules.orgId],
    references: [organizations.id],
  }),
  service: one(services, {
    fields: [alertRules.serviceId],
    references: [services.id],
  }),
  creator: one(users, {
    fields: [alertRules.createdBy],
    references: [users.id],
  }),
}));

export const notificationChannelsRelations = relations(notificationChannels, ({ one }) => ({
  organization: one(organizations, {
    fields: [notificationChannels.orgId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [notificationChannels.createdBy],
    references: [users.id],
  }),
}));

export const containerLogsRelations = relations(containerLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [containerLogs.orgId],
    references: [organizations.id],
  }),
  server: one(servers, {
    fields: [containerLogs.serverId],
    references: [servers.id],
  }),
  service: one(services, {
    fields: [containerLogs.serviceId],
    references: [services.id],
  }),
  deployment: one(deployments, {
    fields: [containerLogs.deploymentId],
    references: [deployments.id],
  }),
}));

export const uptimeMonitorsRelations = relations(uptimeMonitors, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [uptimeMonitors.orgId],
    references: [organizations.id],
  }),
  service: one(services, {
    fields: [uptimeMonitors.serviceId],
    references: [services.id],
  }),
  checks: many(uptimeChecks),
}));

export const uptimeChecksRelations = relations(uptimeChecks, ({ one }) => ({
  monitor: one(uptimeMonitors, {
    fields: [uptimeChecks.monitorId],
    references: [uptimeMonitors.id],
  }),
}));

export const activityFeedRelations = relations(activityFeed, ({ one }) => ({
  organization: one(organizations, {
    fields: [activityFeed.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [activityFeed.userId],
    references: [users.id],
  }),
}));

// ===========================================
// Automation Relations
// ===========================================

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workflows.orgId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [workflows.createdBy],
    references: [users.id],
  }),
  runs: many(workflowRuns),
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowRuns.workflowId],
    references: [workflows.id],
  }),
  triggeredByUser: one(users, {
    fields: [workflowRuns.triggeredBy],
    references: [users.id],
  }),
}));

export const autoScalingRulesRelations = relations(autoScalingRules, ({ one, many }) => ({
  service: one(services, {
    fields: [autoScalingRules.serviceId],
    references: [services.id],
  }),
  events: many(scalingEvents),
}));

export const scalingEventsRelations = relations(scalingEvents, ({ one }) => ({
  service: one(services, {
    fields: [scalingEvents.serviceId],
    references: [services.id],
  }),
  rule: one(autoScalingRules, {
    fields: [scalingEvents.ruleId],
    references: [autoScalingRules.id],
  }),
}));

export const cronJobsRelations = relations(cronJobs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [cronJobs.orgId],
    references: [organizations.id],
  }),
  service: one(services, {
    fields: [cronJobs.serviceId],
    references: [services.id],
  }),
  server: one(servers, {
    fields: [cronJobs.serverId],
    references: [servers.id],
  }),
  runs: many(cronJobRuns),
}));

export const cronJobRunsRelations = relations(cronJobRuns, ({ one }) => ({
  cronJob: one(cronJobs, {
    fields: [cronJobRuns.cronJobId],
    references: [cronJobs.id],
  }),
}));

// ===========================================
// Billing Relations
// ===========================================

export const usageRecordsRelations = relations(usageRecords, ({ one }) => ({
  organization: one(organizations, {
    fields: [usageRecords.orgId],
    references: [organizations.id],
  }),
  service: one(services, {
    fields: [usageRecords.serviceId],
    references: [services.id],
  }),
  server: one(servers, {
    fields: [usageRecords.serverId],
    references: [servers.id],
  }),
  deployment: one(deployments, {
    fields: [usageRecords.deploymentId],
    references: [deployments.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.orgId],
    references: [organizations.id],
  }),
  plan: one(billingPlans, {
    fields: [subscriptions.planId],
    references: [billingPlans.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  organization: one(organizations, {
    fields: [invoices.orgId],
    references: [organizations.id],
  }),
  subscription: one(subscriptions, {
    fields: [invoices.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const costRecordsRelations = relations(costRecords, ({ one }) => ({
  organization: one(organizations, {
    fields: [costRecords.orgId],
    references: [organizations.id],
  }),
  service: one(services, {
    fields: [costRecords.serviceId],
    references: [services.id],
  }),
  server: one(servers, {
    fields: [costRecords.serverId],
    references: [servers.id],
  }),
  database: one(managedDatabases, {
    fields: [costRecords.databaseId],
    references: [managedDatabases.id],
  }),
}));

// ===========================================
// Infrastructure Relations
// ===========================================

export const managedDatabasesRelations = relations(managedDatabases, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [managedDatabases.orgId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [managedDatabases.projectId],
    references: [projects.id],
  }),
  server: one(servers, {
    fields: [managedDatabases.serverId],
    references: [servers.id],
  }),
  backups: many(backups),
}));

export const backupsRelations = relations(backups, ({ one }) => ({
  organization: one(organizations, {
    fields: [backups.orgId],
    references: [organizations.id],
  }),
  service: one(services, {
    fields: [backups.serviceId],
    references: [services.id],
  }),
  database: one(managedDatabases, {
    fields: [backups.databaseId],
    references: [managedDatabases.id],
  }),
  server: one(servers, {
    fields: [backups.serverId],
    references: [servers.id],
  }),
  creator: one(users, {
    fields: [backups.createdBy],
    references: [users.id],
  }),
}));

export const backupSchedulesRelations = relations(backupSchedules, ({ one }) => ({
  organization: one(organizations, {
    fields: [backupSchedules.orgId],
    references: [organizations.id],
  }),
  service: one(services, {
    fields: [backupSchedules.serviceId],
    references: [services.id],
  }),
  database: one(managedDatabases, {
    fields: [backupSchedules.databaseId],
    references: [managedDatabases.id],
  }),
}));

export const serviceTemplatesRelations = relations(serviceTemplates, ({ one }) => ({
  creator: one(users, {
    fields: [serviceTemplates.createdBy],
    references: [users.id],
  }),
}));

export const serviceDependenciesRelations = relations(serviceDependencies, ({ one }) => ({
  service: one(services, {
    fields: [serviceDependencies.serviceId],
    references: [services.id],
  }),
  dependsOnService: one(services, {
    fields: [serviceDependencies.dependsOnServiceId],
    references: [services.id],
  }),
  dependsOnDatabase: one(managedDatabases, {
    fields: [serviceDependencies.dependsOnDatabaseId],
    references: [managedDatabases.id],
  }),
}));

export const serviceRegionsRelations = relations(serviceRegions, ({ one }) => ({
  service: one(services, {
    fields: [serviceRegions.serviceId],
    references: [services.id],
  }),
  region: one(regions, {
    fields: [serviceRegions.regionId],
    references: [regions.id],
  }),
  server: one(servers, {
    fields: [serviceRegions.serverId],
    references: [servers.id],
  }),
}));

export const gitConnectionsRelations = relations(gitConnections, ({ one }) => ({
  organization: one(organizations, {
    fields: [gitConnections.orgId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [gitConnections.createdBy],
    references: [users.id],
  }),
}));

export const volumesRelations = relations(volumes, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [volumes.orgId],
    references: [organizations.id],
  }),
  server: one(servers, {
    fields: [volumes.serverId],
    references: [servers.id],
  }),
  serviceVolumes: many(serviceVolumes),
}));

export const serviceVolumesRelations = relations(serviceVolumes, ({ one }) => ({
  service: one(services, {
    fields: [serviceVolumes.serviceId],
    references: [services.id],
  }),
  volume: one(volumes, {
    fields: [serviceVolumes.volumeId],
    references: [volumes.id],
  }),
}));

// ===========================================
// Security Relations
// ===========================================

export const secretsRelations = relations(secrets, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [secrets.orgId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [secrets.projectId],
    references: [projects.id],
  }),
  service: one(services, {
    fields: [secrets.serviceId],
    references: [services.id],
  }),
  creator: one(users, {
    fields: [secrets.createdBy],
    references: [users.id],
  }),
  versions: many(secretVersions),
  accessLogs: many(secretAccessLogs),
}));

export const secretVersionsRelations = relations(secretVersions, ({ one }) => ({
  secret: one(secrets, {
    fields: [secretVersions.secretId],
    references: [secrets.id],
  }),
  creator: one(users, {
    fields: [secretVersions.createdBy],
    references: [users.id],
  }),
}));

export const secretAccessLogsRelations = relations(secretAccessLogs, ({ one }) => ({
  secret: one(secrets, {
    fields: [secretAccessLogs.secretId],
    references: [secrets.id],
  }),
  user: one(users, {
    fields: [secretAccessLogs.accessedBy],
    references: [users.id],
  }),
  service: one(services, {
    fields: [secretAccessLogs.serviceId],
    references: [services.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const rateLimitRulesRelations = relations(rateLimitRules, ({ one }) => ({
  organization: one(organizations, {
    fields: [rateLimitRules.orgId],
    references: [organizations.id],
  }),
}));

export const userNotificationPreferencesRelations = relations(userNotificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userNotificationPreferences.userId],
    references: [users.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [apiKeys.orgId],
    references: [organizations.id],
  }),
}));

// ===========================================
// AI Relations
// ===========================================

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [chatConversations.orgId],
    references: [organizations.id],
  }),
  service: one(services, {
    fields: [chatConversations.serviceId],
    references: [services.id],
  }),
  user: one(users, {
    fields: [chatConversations.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));

export const aiSuggestionsRelations = relations(aiSuggestions, ({ one }) => ({
  organization: one(organizations, {
    fields: [aiSuggestions.orgId],
    references: [organizations.id],
  }),
  service: one(services, {
    fields: [aiSuggestions.serviceId],
    references: [services.id],
  }),
  dismisser: one(users, {
    fields: [aiSuggestions.dismissedBy],
    references: [users.id],
  }),
}));

// ===========================================
// Environment Relations
// ===========================================

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  project: one(projects, {
    fields: [environments.projectId],
    references: [projects.id],
  }),
  activeDeployment: one(deployments, {
    fields: [environments.activeDeploymentId],
    references: [deployments.id],
  }),
  autoPromoteFromEnvironment: one(environments, {
    fields: [environments.autoPromoteFrom],
    references: [environments.id],
  }),
  lockedByUser: one(users, {
    fields: [environments.lockedBy],
    references: [users.id],
  }),
  promotionsFrom: many(promotions, {
    relationName: 'fromEnvironment',
  }),
  promotionsTo: many(promotions, {
    relationName: 'toEnvironment',
  }),
}));

export const promotionsRelations = relations(promotions, ({ one }) => ({
  project: one(projects, {
    fields: [promotions.projectId],
    references: [projects.id],
  }),
  fromEnvironment: one(environments, {
    fields: [promotions.fromEnvironmentId],
    references: [environments.id],
    relationName: 'fromEnvironment',
  }),
  toEnvironment: one(environments, {
    fields: [promotions.toEnvironmentId],
    references: [environments.id],
    relationName: 'toEnvironment',
  }),
  deployment: one(deployments, {
    fields: [promotions.deploymentId],
    references: [deployments.id],
  }),
  requester: one(users, {
    fields: [promotions.requestedBy],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [promotions.approvedBy],
    references: [users.id],
  }),
  rejecter: one(users, {
    fields: [promotions.rejectedBy],
    references: [users.id],
  }),
}));
