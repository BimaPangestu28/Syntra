'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  GitBranch,
  Play,
  Pause,
  Trash2,
  Settings,
  Clock,
  AlertCircle,
} from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  trigger_type: string;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

const triggerLabels: Record<string, string> = {
  error_spike: 'Error Spike',
  deployment_failed: 'Deployment Failed',
  high_latency: 'High Latency',
  cpu_threshold: 'CPU Threshold',
  memory_threshold: 'Memory Threshold',
  schedule: 'Schedule',
};

export default function WorkflowsPage() {
  const { confirm } = useConfirm();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  async function fetchWorkflows() {
    try {
      const res = await fetch('/api/v1/workflows');
      const data = await res.json();
      if (data.success) {
        setWorkflows(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleWorkflow(id: string, enabled: boolean) {
    try {
      await fetch(`/api/v1/workflows/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: enabled }),
      });
      fetchWorkflows();
      toast.success(enabled ? 'Workflow enabled' : 'Workflow disabled');
    } catch (error) {
      console.error('Failed to toggle workflow:', error);
      toast.error('Failed to toggle workflow');
    }
  }

  async function deleteWorkflow(id: string) {
    const ok = await confirm({ title: 'Delete Workflow', description: 'Are you sure you want to delete this workflow?', confirmLabel: 'Delete', variant: 'destructive' });
    if (!ok) return;
    try {
      await fetch(`/api/v1/workflows/${id}`, { method: 'DELETE' });
      fetchWorkflows();
      toast.success('Workflow deleted');
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      toast.error('Failed to delete workflow');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Workflows</h1>
          <p className="text-muted-foreground">
            Automate responses to events with AI-powered workflows
          </p>
        </div>
        <Button asChild>
          <Link href="/workflows/new">
            <Plus className="w-4 h-4 mr-2" />
            Create Workflow
          </Link>
        </Button>
      </div>

      {/* Workflows List */}
      {workflows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <GitBranch className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No workflows yet</h2>
          <p className="text-muted-foreground text-center mb-6 max-w-sm">
            Create your first workflow to automate responses to deployments, errors, and more.
          </p>
          <Button asChild>
            <Link href="/workflows/new">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Workflow
            </Link>
          </Button>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Workflows</CardTitle>
            <CardDescription>
              {workflows.length} workflow{workflows.length !== 1 ? 's' : ''} configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflows.map((workflow) => (
                  <TableRow key={workflow.id}>
                    <TableCell>
                      <div>
                        <Link
                          href={`/workflows/${workflow.id}`}
                          className="font-medium hover:underline"
                        >
                          {workflow.name}
                        </Link>
                        {workflow.description && (
                          <p className="text-sm text-muted-foreground truncate max-w-xs">
                            {workflow.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {triggerLabels[workflow.trigger_type] || workflow.trigger_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={workflow.is_enabled ? 'success' : 'secondary'}>
                        {workflow.is_enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {workflow.last_triggered_at ? (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(workflow.last_triggered_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleWorkflow(workflow.id, !workflow.is_enabled)}
                          title={workflow.is_enabled ? 'Disable' : 'Enable'}
                        >
                          {workflow.is_enabled ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/workflows/${workflow.id}`}>
                            <Settings className="w-4 h-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteWorkflow(workflow.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
