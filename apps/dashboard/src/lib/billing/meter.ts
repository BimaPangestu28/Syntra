import { db } from '@/lib/db';
import { usageRecords } from '@/lib/db/schema';

interface MeterOptions {
  orgId: string;
  serviceId?: string;
  serverId?: string;
  deploymentId?: string;
}

function getCurrentPeriod(): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { periodStart, periodEnd };
}

export async function recordComputeMinutes(options: MeterOptions, minutes: number) {
  const { periodStart, periodEnd } = getCurrentPeriod();
  await db.insert(usageRecords).values({
    orgId: options.orgId,
    serviceId: options.serviceId,
    serverId: options.serverId,
    usageType: 'compute_minutes',
    quantity: minutes,
    periodStart,
    periodEnd,
  });
}

export async function recordBuildMinutes(options: MeterOptions, minutes: number) {
  const { periodStart, periodEnd } = getCurrentPeriod();
  await db.insert(usageRecords).values({
    orgId: options.orgId,
    serviceId: options.serviceId,
    deploymentId: options.deploymentId,
    usageType: 'build_minutes',
    quantity: minutes,
    periodStart,
    periodEnd,
  });
}

export async function recordDeployment(options: MeterOptions) {
  const { periodStart, periodEnd } = getCurrentPeriod();
  await db.insert(usageRecords).values({
    orgId: options.orgId,
    serviceId: options.serviceId,
    deploymentId: options.deploymentId,
    usageType: 'deployments',
    quantity: 1,
    periodStart,
    periodEnd,
  });
}

export async function recordStorageGb(options: MeterOptions, gb: number) {
  const { periodStart, periodEnd } = getCurrentPeriod();
  await db.insert(usageRecords).values({
    orgId: options.orgId,
    serviceId: options.serviceId,
    serverId: options.serverId,
    usageType: 'storage_gb',
    quantity: gb,
    periodStart,
    periodEnd,
  });
}

export async function recordBandwidthGb(options: MeterOptions, gb: number) {
  const { periodStart, periodEnd } = getCurrentPeriod();
  await db.insert(usageRecords).values({
    orgId: options.orgId,
    serviceId: options.serviceId,
    serverId: options.serverId,
    usageType: 'bandwidth_gb',
    quantity: gb,
    periodStart,
    periodEnd,
  });
}
