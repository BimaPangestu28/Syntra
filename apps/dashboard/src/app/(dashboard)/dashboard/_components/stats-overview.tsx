import Link from 'next/link';
import {
  Activity,
  FolderKanban,
  Rocket,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface StatsOverviewProps {
  stats: {
    servers: number;
    onlineServers: number;
    projects: number;
    deployments: number;
    failedDeployments: number;
    activeAlerts: number;
    openErrors: number;
  };
  inProgressCount: number;
}

export function StatsOverview({ stats, inProgressCount }: StatsOverviewProps) {
  const serverHealthPercent = stats.servers > 0
    ? Math.round((stats.onlineServers / stats.servers) * 100)
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Server Health</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{serverHealthPercent}%</span>
            <span className={`text-sm ${serverHealthPercent === 100 ? 'text-green-500' : 'text-orange-500'}`}>
              {stats.onlineServers}/{stats.servers} online
            </span>
          </div>
          <Progress value={serverHealthPercent} className="mt-2 h-1.5" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Projects</CardTitle>
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{stats.projects}</span>
            <span className="text-sm text-muted-foreground">active</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Across all organizations
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Deployments</CardTitle>
          <Rocket className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{stats.deployments}</span>
            <span className="text-sm text-muted-foreground">total</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {inProgressCount > 0 ? (
              <span className="text-xs text-yellow-500 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {inProgressCount} in progress
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">No active deployments</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Issues</CardTitle>
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${(stats.failedDeployments + stats.activeAlerts) > 0 ? 'text-destructive' : ''}`}>
              {stats.failedDeployments + stats.activeAlerts}
            </span>
            <span className="text-sm text-muted-foreground">need attention</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.failedDeployments} failed, {stats.activeAlerts} alerts
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
