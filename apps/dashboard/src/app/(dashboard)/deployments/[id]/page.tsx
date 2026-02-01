'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  GitCommit,
  GitBranch,
  Clock,
  User,
  XCircle,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  RotateCcw,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { LogViewer } from '@/components/deployment/log-viewer';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

interface DeploymentDetail {
  id: string;
  service_id: string;
  server_id?: string;
  status: 'pending' | 'building' | 'deploying' | 'running' | 'stopped' | 'failed' | 'cancelled';
  git_commit_sha?: string;
  git_commit_message?: string;
  git_commit_author?: string;
  git_branch?: string;
  docker_image_tag?: string;
  container_id?: string;
  build_logs?: string;
  deploy_logs?: string;
  error_message?: string;
  build_started_at?: string;
  build_finished_at?: string;
  deploy_started_at?: string;
  deploy_finished_at?: string;
  trigger_type?: string;
  rollback_from_id?: string;
  triggered_by?: {
    id: string;
    name?: string;
    email?: string;
  };
  service: {
    id: string;
    name: string;
    type: string;
    project: {
      id: string;
      name: string;
      slug: string;
    };
  };
  server?: {
    id: string;
    name: string;
    hostname?: string;
    status: string;
  };
  created_at: string;
  updated_at: string;
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

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4" />,
  building: <Loader2 className="h-4 w-4 animate-spin" />,
  deploying: <Loader2 className="h-4 w-4 animate-spin" />,
  running: <CheckCircle className="h-4 w-4" />,
  stopped: <Square className="h-4 w-4" />,
  failed: <XCircle className="h-4 w-4" />,
  cancelled: <XCircle className="h-4 w-4" />,
};

export default function DeploymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [deployment, setDeployment] = useState<DeploymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { confirm } = useConfirm();

  useEffect(() => {
    fetchDeployment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    // Auto-refresh for in-progress deployments
    if (deployment && ['pending', 'building', 'deploying'].includes(deployment.status)) {
      const interval = setInterval(fetchDeployment, 5000);
      return () => clearInterval(interval);
    }
  }, [deployment?.status]);

  async function fetchDeployment() {
    try {
      const res = await fetch(`/api/v1/deployments/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setDeployment(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch deployment:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    try {
      const res = await fetch(`/api/v1/deployments/${params.id}?action=cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Deployment cancelled');
        fetchDeployment();
      } else {
        toast.error(data.error?.message || 'Failed to cancel deployment');
      }
    } catch (error) {
      console.error('Failed to cancel deployment:', error);
    }
  }

  async function handleStop() {
    try {
      const res = await fetch(`/api/v1/deployments/${params.id}?action=stop`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Deployment stopped');
        fetchDeployment();
      } else {
        toast.error(data.error?.message || 'Failed to stop deployment');
      }
    } catch (error) {
      console.error('Failed to stop deployment:', error);
    }
  }

  async function handleRollback() {
    const ok = await confirm({ title: 'Rollback Deployment', description: 'Are you sure you want to rollback to this deployment?', confirmLabel: 'Rollback', variant: 'destructive' });
    if (!ok) return;
    try {
      const res = await fetch('/api/v1/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: deployment?.service_id,
          trigger_type: 'rollback',
          rollback_from_id: deployment?.id,
          git_commit_sha: deployment?.git_commit_sha,
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/deployments/${data.data.id}`);
      } else {
        toast.error(data.error?.message || 'Failed to trigger rollback');
      }
    } catch (error) {
      console.error('Failed to trigger rollback:', error);
    }
  }

  function formatDuration(start?: string, end?: string): string {
    if (!start) return '-';
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!deployment) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-xl font-semibold">Deployment not found</h2>
        <Button asChild className="mt-4">
          <Link href="/deployments">Back to Deployments</Link>
        </Button>
      </div>
    );
  }

  const isInProgress = ['pending', 'building', 'deploying'].includes(deployment.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/deployments">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">
                Deployment to {deployment.service.name}
              </h1>
              <Badge variant={statusColors[deployment.status]} className="flex items-center gap-1">
                {statusIcons[deployment.status]}
                {deployment.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              <Link href={`/projects/${deployment.service.project.id}`} className="hover:underline">
                {deployment.service.project.name}
              </Link>
              {' / '}
              <Link href={`/services/${deployment.service.id}`} className="hover:underline">
                {deployment.service.name}
              </Link>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isInProgress && (
            <Button variant="destructive" onClick={handleCancel}>
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
          {deployment.status === 'running' && (
            <Button variant="outline" onClick={handleStop}>
              <Square className="mr-2 h-4 w-4" />
              Stop
            </Button>
          )}
          {['running', 'stopped', 'failed'].includes(deployment.status) && (
            <Button variant="outline" onClick={handleRollback}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Rollback
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={fetchDeployment}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {deployment.error_message && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Deployment Failed</p>
              <p className="text-sm text-destructive/80">{deployment.error_message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GitCommit className="h-4 w-4" />
              Commit
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deployment.git_commit_sha ? (
              <div>
                <code className="text-sm bg-muted px-1 py-0.5 rounded">
                  {deployment.git_commit_sha.substring(0, 7)}
                </code>
                {deployment.git_commit_message && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {deployment.git_commit_message}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Branch
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{deployment.git_branch || 'main'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {formatDuration(deployment.build_started_at, deployment.deploy_finished_at)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Triggered By
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {deployment.triggered_by?.name || deployment.triggered_by?.email || deployment.trigger_type || '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Logs - Real-time streaming */}
      <LogViewer
        deploymentId={deployment.id}
        initialLogs={[
          ...(deployment.build_logs ? [{ type: 'build', content: deployment.build_logs, timestamp: deployment.build_started_at }] : []),
          ...(deployment.deploy_logs ? [{ type: 'deploy', content: deployment.deploy_logs, timestamp: deployment.deploy_started_at }] : []),
        ]}
        initialStatus={deployment.status}
        isComplete={['running', 'stopped', 'failed', 'cancelled'].includes(deployment.status)}
      />

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm text-muted-foreground">Created</div>
              <div className="font-medium">{new Date(deployment.created_at).toLocaleString()}</div>
            </div>
            {deployment.build_started_at && (
              <div className="flex items-center gap-4">
                <div className="w-32 text-sm text-muted-foreground">Build Started</div>
                <div className="font-medium">{new Date(deployment.build_started_at).toLocaleString()}</div>
              </div>
            )}
            {deployment.build_finished_at && (
              <div className="flex items-center gap-4">
                <div className="w-32 text-sm text-muted-foreground">Build Finished</div>
                <div className="font-medium">
                  {new Date(deployment.build_finished_at).toLocaleString()}
                  <span className="ml-2 text-muted-foreground">
                    ({formatDuration(deployment.build_started_at, deployment.build_finished_at)})
                  </span>
                </div>
              </div>
            )}
            {deployment.deploy_started_at && (
              <div className="flex items-center gap-4">
                <div className="w-32 text-sm text-muted-foreground">Deploy Started</div>
                <div className="font-medium">{new Date(deployment.deploy_started_at).toLocaleString()}</div>
              </div>
            )}
            {deployment.deploy_finished_at && (
              <div className="flex items-center gap-4">
                <div className="w-32 text-sm text-muted-foreground">Deploy Finished</div>
                <div className="font-medium">
                  {new Date(deployment.deploy_finished_at).toLocaleString()}
                  <span className="ml-2 text-muted-foreground">
                    ({formatDuration(deployment.deploy_started_at, deployment.deploy_finished_at)})
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
