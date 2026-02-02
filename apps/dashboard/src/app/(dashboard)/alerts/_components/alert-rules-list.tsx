'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  Activity,
  Bug,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatTimeAgo } from '@/lib/utils/format';
import { CreateRuleDialog } from './create-rule-dialog';

interface AlertRule {
  id: string;
  name: string;
  service: { id: string; name: string } | null;
  metric: string;
  operator: string;
  threshold: number;
  window_minutes: number;
  severity: string;
  channel_ids: string[];
  cooldown_minutes: number;
  is_enabled: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

const METRIC_OPTIONS = [
  { value: 'error_count', label: 'Error Count', icon: Bug },
  { value: 'error_rate', label: 'Error Rate', icon: Activity },
  { value: 'new_error', label: 'New Error Types', icon: AlertTriangle },
  { value: 'latency_p99', label: 'Latency P99', icon: Activity },
];

const OPERATOR_LABELS: Record<string, string> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: '=',
};

const SEVERITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  critical: 'destructive',
  error: 'destructive',
  warning: 'outline',
  info: 'secondary',
};

export function AlertRulesList() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchRules = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/v1/alert-rules', { signal });
      const data = await res.json();
      if (data.success) {
        setRules(data.data);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Failed to fetch alert rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOrgId = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/v1/team', { signal });
      const data = await res.json();
      if (data.success && data.data.org) {
        setOrgId(data.data.org.id);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Failed to fetch org:', err);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchRules(controller.signal);
    fetchOrgId(controller.signal);
    return () => controller.abort();
  }, [fetchRules, fetchOrgId]);

  const handleToggle = async (ruleId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/v1/alert-rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !currentEnabled }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error?.message || 'Failed to update rule');
        return;
      }
      toast.success(`Rule ${currentEnabled ? 'disabled' : 'enabled'}`);
      fetchRules();
    } catch {
      toast.error('Failed to update rule');
    }
  };

  const handleDelete = async (ruleId: string) => {
    try {
      const res = await fetch(`/api/v1/alert-rules/${ruleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error?.message || 'Failed to delete rule');
        return;
      }
      toast.success('Alert rule deleted');
      fetchRules();
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const handleRuleCreated = () => {
    setDialogOpen(false);
    fetchRules();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Alert Rules</h2>
          <p className="text-sm text-muted-foreground">
            Configure threshold-based alerts for error monitoring
          </p>
        </div>
        <CreateRuleDialog
          orgId={orgId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={handleRuleCreated}
        />
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">No alert rules configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create a rule to get notified when error thresholds are exceeded
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const metricInfo = METRIC_OPTIONS.find((m) => m.value === rule.metric);
            const MetricIcon = metricInfo?.icon ?? Activity;

            return (
              <Card
                key={rule.id}
                className={rule.is_enabled ? '' : 'opacity-60'}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 p-2 rounded-lg bg-muted">
                        <MetricIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{rule.name}</span>
                          <Badge variant={SEVERITY_VARIANT[rule.severity] ?? 'secondary'}>
                            {rule.severity}
                          </Badge>
                          {!rule.is_enabled && (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {metricInfo?.label ?? rule.metric}{' '}
                          <span className="font-mono">
                            {OPERATOR_LABELS[rule.operator] ?? rule.operator} {rule.threshold}
                          </span>{' '}
                          in {rule.window_minutes}m window
                          {rule.service && (
                            <span>
                              {' '}
                              on <span className="text-foreground">{rule.service.name}</span>
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Cooldown: {rule.cooldown_minutes}m
                          </span>
                          {rule.last_triggered_at && (
                            <span>
                              Last triggered: {formatTimeAgo(new Date(rule.last_triggered_at))}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <Switch
                        checked={rule.is_enabled}
                        onCheckedChange={() => handleToggle(rule.id, rule.is_enabled)}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-400">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete alert rule</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete &quot;{rule.name}&quot;? This action
                              cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(rule.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
