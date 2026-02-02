'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CircleCheck, CircleX, Clock, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UptimeChart } from '@/components/uptime/uptime-chart';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import Link from 'next/link';

interface Monitor {
  id: string;
  name: string;
  url: string;
  method: string;
  is_enabled: boolean;
  last_check_at: string | null;
  last_status: string | null;
  last_response_time: number | null;
  consecutive_failures: number;
  interval_seconds: number;
  alert_after_failures: number;
  service: { id: string; name: string } | null;
}

interface Stats {
  period: string;
  total_checks: number;
  uptime_percentage: number;
  response_times: {
    avg: number | null;
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
  incidents: Array<{
    started_at: string;
    ended_at: string | null;
    duration_ms: number;
    checks_count: number;
  }>;
  chart_data: Array<{
    timestamp: string;
    response_time: number | null;
    status: string;
  }>;
}

export default function MonitorDetailPage() {
  const { monitorId } = useParams<{ monitorId: string }>();
  const router = useRouter();
  const { confirm } = useConfirm();

  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('24h');

  const fetchData = useCallback(async () => {
    try {
      const [monitorRes, statsRes] = await Promise.all([
        fetch(`/api/v1/uptime/${monitorId}`),
        fetch(`/api/v1/uptime/${monitorId}/stats?period=${period}`),
      ]);

      const monitorData = await monitorRes.json();
      const statsData = await statsRes.json();

      if (monitorData.success) setMonitor(monitorData.data);
      if (statsData.success) setStats(statsData.data);
    } catch (error) {
      console.error('Failed to fetch monitor data:', error);
    } finally {
      setLoading(false);
    }
  }, [monitorId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleToggleEnabled() {
    if (!monitor) return;
    try {
      const res = await fetch(`/api/v1/uptime/${monitorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !monitor.is_enabled }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(monitor.is_enabled ? 'Monitor paused' : 'Monitor resumed');
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to update monitor');
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete Monitor',
      description: 'Are you sure you want to delete this monitor? All check history will be lost.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/v1/uptime/${monitorId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Monitor deleted');
        router.push('/uptime');
      }
    } catch (error) {
      toast.error('Failed to delete monitor');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (!monitor) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h3 className="text-lg font-semibold">Monitor not found</h3>
        <Link href="/uptime">
          <Button variant="outline" className="mt-4">Back to monitors</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/uptime">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{monitor.name}</h1>
              {monitor.last_status === 'up' ? (
                <Badge className="bg-green-500/10 text-green-600 border-green-200"><CircleCheck className="mr-1 h-3 w-3" />Up</Badge>
              ) : monitor.last_status === 'down' ? (
                <Badge variant="destructive"><CircleX className="mr-1 h-3 w-3" />Down</Badge>
              ) : (
                <Badge variant="secondary">Pending</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{monitor.method} {monitor.url}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleToggleEnabled}>
            {monitor.is_enabled ? 'Pause' : 'Resume'}
          </Button>
          <Button variant="destructive" size="icon" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {stats.uptime_percentage}%
              </div>
              <p className="text-xs text-muted-foreground">Uptime ({stats.period})</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {stats.response_times.avg !== null ? `${stats.response_times.avg}ms` : '-'}
              </div>
              <p className="text-xs text-muted-foreground">Avg Response Time</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {stats.response_times.p95 !== null ? `${stats.response_times.p95}ms` : '-'}
              </div>
              <p className="text-xs text-muted-foreground">P95 Response Time</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.incidents.length}</div>
              <p className="text-xs text-muted-foreground">Incidents ({stats.period})</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Response Time</CardTitle>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {stats && stats.chart_data.length > 0 ? (
            <UptimeChart data={stats.chart_data} />
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              No data available for this period
            </div>
          )}
        </CardContent>
      </Card>

      {/* Incidents */}
      {stats && stats.incidents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Incidents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.incidents.map((incident, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <CircleX className="h-4 w-4 text-destructive" />
                    <div>
                      <div className="text-sm font-medium">
                        {new Date(incident.started_at).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {incident.checks_count} failed {incident.checks_count === 1 ? 'check' : 'checks'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">
                      {incident.ended_at
                        ? formatDuration(incident.duration_ms)
                        : 'Ongoing'}
                    </div>
                    {incident.ended_at === null && (
                      <Badge variant="destructive" className="text-xs">Active</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Checks */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Check Interval:</span>{' '}
              {monitor.interval_seconds}s
            </div>
            <div>
              <span className="text-muted-foreground">Alert After:</span>{' '}
              {monitor.alert_after_failures} failures
            </div>
            <div>
              <span className="text-muted-foreground">Consecutive Failures:</span>{' '}
              {monitor.consecutive_failures}
            </div>
            <div>
              <span className="text-muted-foreground">Last Checked:</span>{' '}
              {monitor.last_check_at
                ? new Date(monitor.last_check_at).toLocaleString()
                : 'Never'}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}
