'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Lock,
  Unlock,
  Settings,
  Trash2,
  GitBranch,
  Clock,
  Shield,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface Environment {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  description?: string;
  is_production: boolean;
  sort_order: number;
  requires_approval: boolean;
  approvers: string[];
  auto_promote_from?: string;
  env_vars: Record<string, string>;
  active_deployment_id?: string;
  active_deployment?: {
    id: string;
    status: string;
    git_commit_sha?: string;
    git_commit_message?: string;
    created_at: string;
  };
  is_locked: boolean;
  locked_by?: string;
  locked_at?: string;
  locked_reason?: string;
  created_at: string;
  updated_at: string;
}

export default function EnvironmentsPage() {
  const params = useParams();
  const router = useRouter();
  const { confirm } = useConfirm();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvDescription, setNewEnvDescription] = useState('');
  const [newEnvIsProduction, setNewEnvIsProduction] = useState(false);
  const [newEnvRequiresApproval, setNewEnvRequiresApproval] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchEnvironments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function fetchEnvironments() {
    try {
      const res = await fetch(`/api/v1/environments?project_id=${params.id}`);
      const data = await res.json();
      if (data.success) {
        setEnvironments(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch environments:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateEnvironment() {
    if (!newEnvName.trim()) {
      toast.error('Environment name is required');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/v1/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: params.id,
          name: newEnvName,
          description: newEnvDescription,
          is_production: newEnvIsProduction,
          requires_approval: newEnvRequiresApproval,
          sort_order: environments.length,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Environment created');
        setCreateDialogOpen(false);
        setNewEnvName('');
        setNewEnvDescription('');
        setNewEnvIsProduction(false);
        setNewEnvRequiresApproval(false);
        fetchEnvironments();
      } else {
        toast.error(data.error?.message || 'Failed to create environment');
      }
    } catch (error) {
      console.error('Failed to create environment:', error);
      toast.error('Failed to create environment');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleLock(env: Environment) {
    const newLockState = !env.is_locked;
    let lockedReason = '';

    if (newLockState) {
      const ok = await confirm({
        title: 'Lock Environment',
        description: 'Are you sure you want to lock this environment? This will prevent deployments.',
        confirmLabel: 'Lock',
      });
      if (!ok) return;
      lockedReason = 'Locked by user';
    }

    try {
      const res = await fetch(`/api/v1/environments/${env.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_locked: newLockState,
          locked_reason: newLockState ? lockedReason : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(newLockState ? 'Environment locked' : 'Environment unlocked');
        fetchEnvironments();
      } else {
        toast.error(data.error?.message || 'Failed to update environment');
      }
    } catch (error) {
      console.error('Failed to toggle lock:', error);
      toast.error('Failed to update environment');
    }
  }

  async function handleDeleteEnvironment(env: Environment) {
    const ok = await confirm({
      title: 'Delete Environment',
      description: `Are you sure you want to delete "${env.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/v1/environments/${env.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Environment deleted');
        fetchEnvironments();
      } else {
        toast.error(data.error?.message || 'Failed to delete environment');
      }
    } catch (error) {
      console.error('Failed to delete environment:', error);
      toast.error('Failed to delete environment');
    }
  }

  async function handlePromote(fromEnv: Environment, toEnv: Environment) {
    if (!fromEnv.active_deployment_id) {
      toast.error('No active deployment to promote');
      return;
    }

    if (toEnv.is_locked) {
      toast.error(`Cannot promote to locked environment: ${toEnv.locked_reason || 'Environment is locked'}`);
      return;
    }

    const ok = await confirm({
      title: 'Promote Deployment',
      description: `Promote deployment from "${fromEnv.name}" to "${toEnv.name}"?${toEnv.requires_approval ? ' This will create a promotion request requiring approval.' : ''}`,
      confirmLabel: 'Promote',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/v1/environments/${toEnv.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployment_id: fromEnv.active_deployment_id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.data.status === 'pending') {
          toast.success('Promotion request created. Waiting for approval.');
        } else {
          toast.success('Deployment promoted successfully');
          if (data.data.new_deployment_id) {
            router.push(`/deployments/${data.data.new_deployment_id}`);
          }
        }
        fetchEnvironments();
      } else {
        toast.error(data.error?.message || 'Failed to promote deployment');
      }
    } catch (error) {
      console.error('Failed to promote:', error);
      toast.error('Failed to promote deployment');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="mt-1">
            <Link href={`/projects/${params.id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Environments</h1>
            <p className="text-muted-foreground mt-1">
              Manage deployment environments for your project
            </p>
          </div>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Environment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Environment</DialogTitle>
              <DialogDescription>
                Add a new environment for this project
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., development, staging, production"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Describe this environment..."
                  value={newEnvDescription}
                  onChange={(e) => setNewEnvDescription(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="is-production">Production Environment</Label>
                  <p className="text-sm text-muted-foreground">
                    Mark this as a production environment
                  </p>
                </div>
                <Switch
                  id="is-production"
                  checked={newEnvIsProduction}
                  onCheckedChange={setNewEnvIsProduction}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="requires-approval">Requires Approval</Label>
                  <p className="text-sm text-muted-foreground">
                    Promotions to this environment need approval
                  </p>
                </div>
                <Switch
                  id="requires-approval"
                  checked={newEnvRequiresApproval}
                  onCheckedChange={setNewEnvRequiresApproval}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateEnvironment} disabled={creating}>
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Environments List */}
      {environments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No environments yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create environments to manage deployment workflows
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Environment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {environments.map((env, index) => (
              <div key={env.id} className="flex items-center gap-2">
                <Card className="flex-1">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          {env.name}
                          {env.is_production && (
                            <Badge variant="destructive" className="text-xs">
                              Production
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1 text-xs">
                          {env.description || env.slug}
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleToggleLock(env)}
                      >
                        {env.is_locked ? (
                          <Lock className="h-3 w-3 text-destructive" />
                        ) : (
                          <Unlock className="h-3 w-3 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Status */}
                    <div className="flex items-center gap-2">
                      {env.is_locked ? (
                        <Badge variant="outline" className="text-xs">
                          <Lock className="h-3 w-3 mr-1" />
                          Locked
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <Unlock className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                      {env.requires_approval && (
                        <Badge variant="secondary" className="text-xs">
                          <Shield className="h-3 w-3 mr-1" />
                          Approval
                        </Badge>
                      )}
                    </div>

                    {/* Locked reason */}
                    {env.is_locked && env.locked_reason && (
                      <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                        {env.locked_reason}
                      </div>
                    )}

                    {/* Active Deployment */}
                    {env.active_deployment ? (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Active Deployment</p>
                        <div className="flex items-center gap-2">
                          {env.active_deployment.status === 'running' ||
                          env.active_deployment.status === 'success' ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-500" />
                          )}
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {env.active_deployment.git_commit_sha?.substring(0, 7) || 'N/A'}
                          </code>
                        </div>
                        {env.active_deployment.git_commit_message && (
                          <p className="text-xs text-muted-foreground truncate">
                            {env.active_deployment.git_commit_message}
                          </p>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(env.active_deployment.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        No active deployment
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2">
                      {!env.is_production && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleDeleteEnvironment(env)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Promote Arrow */}
                {index < environments.length - 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handlePromote(env, environments[index + 1])}
                    disabled={!env.active_deployment_id || environments[index + 1].is_locked}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Environment Promotions</CardTitle>
              <CardDescription>
                Promote deployments from one environment to the next in the workflow
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Click the arrow between environments to promote a deployment
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Environments marked with "Approval" require approval before promotion
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Lock environments to prevent deployments during maintenance
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
