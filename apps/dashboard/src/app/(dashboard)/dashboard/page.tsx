import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { servers, projects, services, deployments, organizationMembers, alerts, errorGroups } from '@/lib/db/schema';
import { eq, desc, and, inArray, gte, or } from 'drizzle-orm';
import Link from 'next/link';
import {
  Server, FolderKanban, Rocket, Plus,
  XCircle, AlertTriangle, Bug, Bell,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatsOverview } from './_components/stats-overview';
import { ServerListCard } from './_components/server-list-card';
import { RecentDeploymentsCard } from './_components/recent-deployments-card';
import { AlertsCard } from './_components/alerts-card';

async function getDashboardData(userId: string) {
  // Get user's organizations
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  const orgIds = memberships.map((m) => m.orgId);

  if (orgIds.length === 0) {
    return {
      stats: { servers: 0, onlineServers: 0, projects: 0, deployments: 0, failedDeployments: 0, activeAlerts: 0, openErrors: 0 },
      servers: [],
      activeAlerts: [],
      recentErrors: [],
      inProgressDeployments: [],
      recentDeployments: [],
    };
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch all data in parallel
  const [
    serverList,
    projectList,
    deploymentList,
    alertList,
    errorList,
  ] = await Promise.all([
    db.query.servers.findMany({
      where: inArray(servers.orgId, orgIds),
      columns: {
        id: true,
        name: true,
        hostname: true,
        status: true,
        publicIp: true,
        cpuCores: true,
        memoryMb: true,
        lastHeartbeatAt: true,
      },
      orderBy: [desc(servers.createdAt)],
    }),
    db.query.projects.findMany({
      where: inArray(projects.orgId, orgIds),
      columns: { id: true },
    }),
    db.query.deployments.findMany({
      orderBy: [desc(deployments.createdAt)],
      limit: 50,
      with: {
        service: {
          with: {
            project: {
              columns: { id: true, name: true, orgId: true },
            },
          },
        },
      },
    }),
    db.query.alerts.findMany({
      where: and(
        inArray(alerts.orgId, orgIds),
        or(
          eq(alerts.status, 'active'),
          eq(alerts.status, 'acknowledged')
        )
      ),
      orderBy: [desc(alerts.createdAt)],
      limit: 10,
      with: {
        server: { columns: { id: true, name: true } },
        service: { columns: { id: true, name: true } },
      },
    }),
    db.query.errorGroups.findMany({
      where: and(
        eq(errorGroups.status, 'open'),
        gte(errorGroups.lastSeenAt, oneDayAgo)
      ),
      orderBy: [desc(errorGroups.eventCount)],
      limit: 10,
      with: {
        service: {
          with: {
            project: {
              columns: { id: true, name: true, orgId: true },
            },
          },
        },
      },
    }),
  ]);

  // Filter by user's orgs
  const filteredDeployments = deploymentList.filter((d) => orgIds.includes(d.service.project.orgId));
  const filteredErrors = errorList.filter((e) => orgIds.includes(e.service.project.orgId));

  const inProgressDeployments = filteredDeployments.filter(
    (d) => d.status === 'pending' || d.status === 'building' || d.status === 'deploying'
  );

  return {
    stats: {
      servers: serverList.length,
      onlineServers: serverList.filter((s) => s.status === 'online').length,
      projects: projectList.length,
      deployments: filteredDeployments.length,
      failedDeployments: filteredDeployments.filter((d) => d.status === 'failed').length,
      activeAlerts: alertList.length,
      openErrors: filteredErrors.length,
    },
    servers: serverList,
    activeAlerts: alertList,
    recentErrors: filteredErrors.slice(0, 5),
    inProgressDeployments: inProgressDeployments.slice(0, 5),
    recentDeployments: filteredDeployments.filter(
      (d) => d.status === 'running' || d.status === 'failed'
    ).slice(0, 5),
  };
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const data = await getDashboardData(session.user.id);
  const { stats, servers: serverList, activeAlerts, recentErrors, inProgressDeployments, recentDeployments } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Welcome back, {session?.user?.name?.split(' ')[0] || 'User'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s your infrastructure overview.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/servers">
              <Plus className="mr-2 h-4 w-4" />
              Add Server
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/projects">
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Link>
          </Button>
        </div>
      </div>

      {/* Alert Banner - Show if there are critical issues */}
      {(stats.activeAlerts > 0 || stats.failedDeployments > 0 || stats.openErrors > 0) && (
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-4 text-sm">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <span className="font-medium">Attention required:</span>
              <div className="flex items-center gap-4">
                {stats.activeAlerts > 0 && (
                  <Link href="/alerts" className="flex items-center gap-1 hover:underline">
                    <Bell className="h-4 w-4" />
                    {stats.activeAlerts} active alert{stats.activeAlerts !== 1 ? 's' : ''}
                  </Link>
                )}
                {stats.failedDeployments > 0 && (
                  <Link href="/deployments?status=failed" className="flex items-center gap-1 hover:underline">
                    <XCircle className="h-4 w-4" />
                    {stats.failedDeployments} failed deployment{stats.failedDeployments !== 1 ? 's' : ''}
                  </Link>
                )}
                {stats.openErrors > 0 && (
                  <Link href="/errors" className="flex items-center gap-1 hover:underline">
                    <Bug className="h-4 w-4" />
                    {stats.openErrors} open error{stats.openErrors !== 1 ? 's' : ''}
                  </Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <StatsOverview stats={stats} inProgressCount={inProgressDeployments.length} />

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <ServerListCard servers={serverList} />
        <RecentDeploymentsCard
          inProgressDeployments={inProgressDeployments}
          recentDeployments={recentDeployments}
        />
        <AlertsCard activeAlerts={activeAlerts} recentErrors={recentErrors} />
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <Button variant="outline" className="h-auto py-3 justify-start" asChild>
              <Link href="/servers">
                <Server className="mr-2 h-4 w-4" />
                <span>Connect Server</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-3 justify-start" asChild>
              <Link href="/projects">
                <FolderKanban className="mr-2 h-4 w-4" />
                <span>New Project</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-3 justify-start" asChild>
              <Link href="/deployments">
                <Rocket className="mr-2 h-4 w-4" />
                <span>Deployments</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-3 justify-start" asChild>
              <Link href="/errors">
                <Bug className="mr-2 h-4 w-4" />
                <span>Error Tracking</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
