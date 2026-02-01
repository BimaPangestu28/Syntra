import Link from 'next/link';
import {
  Rocket,
  CheckCircle,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface DeploymentItem {
  id: string;
  status: string;
  createdAt: Date;
  service: {
    name: string;
    project: {
      id: string;
      name: string;
      orgId: string;
    };
  };
}

interface RecentDeploymentsCardProps {
  inProgressDeployments: DeploymentItem[];
  recentDeployments: DeploymentItem[];
}

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  pending: 'secondary',
  building: 'warning',
  deploying: 'warning',
  running: 'success',
  stopped: 'secondary',
  failed: 'destructive',
  cancelled: 'secondary',
};

function formatTimeAgo(date: Date | null) {
  if (!date) return 'Never';
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getDeploymentProgress(status: string) {
  switch (status) {
    case 'pending': return 10;
    case 'building': return 40;
    case 'deploying': return 75;
    case 'running': return 100;
    default: return 0;
  }
}

export function RecentDeploymentsCard({ inProgressDeployments, recentDeployments }: RecentDeploymentsCardProps) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">Deployments</CardTitle>
          <CardDescription>Recent activity</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/deployments">
            View all
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {/* In Progress Section */}
        {inProgressDeployments.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">IN PROGRESS</p>
            <div className="space-y-2">
              {inProgressDeployments.map((deployment) => (
                <Link
                  key={deployment.id}
                  href={`/deployments/${deployment.id}`}
                  className="block p-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{deployment.service.name}</span>
                    <Badge variant="warning" className="text-xs">{deployment.status}</Badge>
                  </div>
                  <Progress value={getDeploymentProgress(deployment.status)} className="h-1" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Completed */}
        {recentDeployments.length === 0 && inProgressDeployments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Rocket className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No deployments yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {inProgressDeployments.length > 0 && recentDeployments.length > 0 && (
              <p className="text-xs font-medium text-muted-foreground mb-2">RECENT</p>
            )}
            {recentDeployments.map((deployment) => (
              <Link
                key={deployment.id}
                href={`/deployments/${deployment.id}`}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {deployment.status === 'running' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium leading-none">{deployment.service.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{deployment.service.project.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={statusColors[deployment.status]} className="text-xs">
                    {deployment.status}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatTimeAgo(deployment.createdAt)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
