'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Rocket, GitCommit, Clock, User, XCircle, MoreHorizontal, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface Deployment {
  id: string;
  service_id: string;
  server_id?: string;
  status: 'pending' | 'building' | 'deploying' | 'running' | 'stopped' | 'failed' | 'cancelled';
  git_commit_sha?: string;
  git_commit_message?: string;
  git_branch?: string;
  trigger_type?: string;
  error_message?: string;
  build_started_at?: string;
  deploy_finished_at?: string;
  service: {
    id: string;
    name: string;
    project: {
      id: string;
      name: string;
    };
  };
  server?: {
    id: string;
    name: string;
  };
  created_at: string;
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

const triggerLabels: Record<string, string> = {
  manual: 'Manual',
  git_push: 'Git Push',
  api: 'API',
  rollback: 'Rollback',
};

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchDeployments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function fetchDeployments() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      const res = await fetch(`/api/v1/deployments?${params}`);
      const data = await res.json();
      if (data.success) {
        setDeployments(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch deployments:', error);
    } finally {
      setLoading(false);
    }
  }

  async function cancelDeployment(id: string) {
    try {
      const res = await fetch(`/api/v1/deployments/${id}?action=cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Deployment cancelled');
        fetchDeployments();
      } else {
        toast.error(data.error?.message || 'Failed to cancel deployment');
      }
    } catch (error) {
      console.error('Failed to cancel deployment:', error);
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

  if (loading && deployments.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Deployments</h1>
          <p className="text-muted-foreground">View and manage your deployments</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="building">Building</SelectItem>
              <SelectItem value="deploying">Deploying</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="stopped">Stopped</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => fetchDeployments()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {deployments.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <Rocket className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No deployments yet</h3>
          <p className="text-muted-foreground mb-4">
            Deploy a service to see your deployment history
          </p>
          <Button asChild>
            <Link href="/services">Go to Services</Link>
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Commit</TableHead>
                <TableHead>Server</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment) => (
                <TableRow key={deployment.id}>
                  <TableCell>
                    <Badge variant={statusColors[deployment.status] || 'secondary'}>
                      {deployment.status}
                    </Badge>
                    {deployment.error_message && (
                      <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={deployment.error_message}>
                        {deployment.error_message}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <Link
                        href={`/services/${deployment.service.id}`}
                        className="font-medium hover:underline"
                      >
                        {deployment.service.name}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {deployment.service.project.name}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {deployment.git_commit_sha ? (
                      <div className="flex items-start gap-2">
                        <GitCommit className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {deployment.git_commit_sha.substring(0, 7)}
                          </code>
                          {deployment.git_commit_message && (
                            <p className="text-sm text-muted-foreground max-w-[200px] truncate" title={deployment.git_commit_message}>
                              {deployment.git_commit_message}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {deployment.server ? (
                      <Link
                        href={`/servers/${deployment.server.id}`}
                        className="hover:underline"
                      >
                        {deployment.server.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {triggerLabels[deployment.trigger_type || ''] || deployment.trigger_type || '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDuration(deployment.build_started_at, deployment.deploy_finished_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {new Date(deployment.created_at).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/deployments/${deployment.id}`}>View Details</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/deployments/${deployment.id}/logs`}>View Logs</Link>
                        </DropdownMenuItem>
                        {['pending', 'building', 'deploying'].includes(deployment.status) && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => cancelDeployment(deployment.id)}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancel
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
