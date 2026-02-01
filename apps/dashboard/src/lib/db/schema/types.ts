import { users } from './auth';
import { organizations, organizationMembers, servers, projects, services } from './core';
import { deployments, domains, previewDeployments, proxyConfigs } from './deployments';
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
import { workflows, autoScalingRules, scalingEvents, cronJobs, cronJobRuns } from './automation';
import { usageRecords, billingPlans, subscriptions, invoices, costRecords } from './billing';
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
  rateLimitLogs,
  userNotificationPreferences,
  apiKeys,
} from './security';

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
export type ErrorGroup = typeof errorGroups.$inferSelect;
export type NewErrorGroup = typeof errorGroups.$inferInsert;
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type NewNotificationChannel = typeof notificationChannels.$inferInsert;
export type PreviewDeployment = typeof previewDeployments.$inferSelect;
export type NewPreviewDeployment = typeof previewDeployments.$inferInsert;
export type ContainerLog = typeof containerLogs.$inferSelect;
export type NewContainerLog = typeof containerLogs.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type BillingPlan = typeof billingPlans.$inferSelect;
export type NewBillingPlan = typeof billingPlans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type AutoScalingRule = typeof autoScalingRules.$inferSelect;
export type NewAutoScalingRule = typeof autoScalingRules.$inferInsert;
export type ScalingEvent = typeof scalingEvents.$inferSelect;
export type NewScalingEvent = typeof scalingEvents.$inferInsert;
export type Secret = typeof secrets.$inferSelect;
export type NewSecret = typeof secrets.$inferInsert;
export type SecretVersion = typeof secretVersions.$inferSelect;
export type NewSecretVersion = typeof secretVersions.$inferInsert;
export type SecretAccessLog = typeof secretAccessLogs.$inferSelect;
export type NewSecretAccessLog = typeof secretAccessLogs.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type ManagedDatabase = typeof managedDatabases.$inferSelect;
export type NewManagedDatabase = typeof managedDatabases.$inferInsert;
export type Backup = typeof backups.$inferSelect;
export type NewBackup = typeof backups.$inferInsert;
export type BackupSchedule = typeof backupSchedules.$inferSelect;
export type NewBackupSchedule = typeof backupSchedules.$inferInsert;
export type ServiceTemplate = typeof serviceTemplates.$inferSelect;
export type NewServiceTemplate = typeof serviceTemplates.$inferInsert;
export type CronJob = typeof cronJobs.$inferSelect;
export type NewCronJob = typeof cronJobs.$inferInsert;
export type CronJobRun = typeof cronJobRuns.$inferSelect;
export type NewCronJobRun = typeof cronJobRuns.$inferInsert;
export type ServiceDependency = typeof serviceDependencies.$inferSelect;
export type NewServiceDependency = typeof serviceDependencies.$inferInsert;
export type UptimeMonitor = typeof uptimeMonitors.$inferSelect;
export type NewUptimeMonitor = typeof uptimeMonitors.$inferInsert;
export type UptimeCheck = typeof uptimeChecks.$inferSelect;
export type NewUptimeCheck = typeof uptimeChecks.$inferInsert;
export type ActivityFeedItem = typeof activityFeed.$inferSelect;
export type NewActivityFeedItem = typeof activityFeed.$inferInsert;
export type GitConnection = typeof gitConnections.$inferSelect;
export type NewGitConnection = typeof gitConnections.$inferInsert;
export type Region = typeof regions.$inferSelect;
export type NewRegion = typeof regions.$inferInsert;
export type ServiceRegion = typeof serviceRegions.$inferSelect;
export type NewServiceRegion = typeof serviceRegions.$inferInsert;
export type RateLimitRule = typeof rateLimitRules.$inferSelect;
export type NewRateLimitRule = typeof rateLimitRules.$inferInsert;
export type RateLimitLog = typeof rateLimitLogs.$inferSelect;
export type NewRateLimitLog = typeof rateLimitLogs.$inferInsert;
export type CostRecord = typeof costRecords.$inferSelect;
export type NewCostRecord = typeof costRecords.$inferInsert;
export type Volume = typeof volumes.$inferSelect;
export type NewVolume = typeof volumes.$inferInsert;
export type ServiceVolume = typeof serviceVolumes.$inferSelect;
export type NewServiceVolume = typeof serviceVolumes.$inferInsert;
export type ProxyConfig = typeof proxyConfigs.$inferSelect;
export type NewProxyConfig = typeof proxyConfigs.$inferInsert;
export type UserNotificationPreference = typeof userNotificationPreferences.$inferSelect;
export type NewUserNotificationPreference = typeof userNotificationPreferences.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;
