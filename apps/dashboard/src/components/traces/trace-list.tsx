'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TraceSummary {
  trace_id: string;
  root_operation: string;
  span_count: number;
  service_count: number;
  duration_ms: number;
  status: 'ok' | 'error' | 'unset';
  start_time: string;
  http_method?: string;
  http_status_code?: number;
  http_route?: string;
}

interface TraceListProps {
  serviceId?: string;
}

function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimeAgo(iso: string): string {
  const now = new Date();
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function DurationBar({ ms, maxMs }: { ms: number; maxMs: number }) {
  const pct = maxMs > 0 ? Math.max((ms / maxMs) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full',
            pct > 75 ? 'bg-yellow-500' : 'bg-primary'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {formatDuration(ms)}
      </span>
    </div>
  );
}

const statusBadge: Record<string, 'success' | 'destructive' | 'secondary'> = {
  ok: 'success',
  error: 'destructive',
  unset: 'secondary',
};

const TIME_RANGES: Record<string, number> = {
  '15m': 15,
  '1h': 60,
  '6h': 360,
  '24h': 1440,
  '7d': 10080,
};

export function TraceList({ serviceId }: TraceListProps) {
  const router = useRouter();
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('1h');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operationFilter, setOperationFilter] = useState('');
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<{
    total_traces: number;
    avg_duration_ms: number;
    p95_duration_ms: number;
    error_rate: number;
  } | null>(null);

  const fetchTraces = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (serviceId) params.set('service_id', serviceId);

      const end = new Date();
      const start = new Date(end.getTime() - TIME_RANGES[timeRange] * 60 * 1000);
      params.set('start', start.toISOString());
      params.set('end', end.toISOString());

      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (operationFilter) params.set('operation', operationFilter);
      params.set('page', String(page));
      params.set('per_page', '50');
      params.set('include_stats', 'true');

      const res = await fetch(`/api/v1/traces?${params}`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch traces');
      }

      setTraces(data.data.traces);
      if (data.data.stats) setStats(data.data.stats);
    } catch {
      setTraces([]);
    } finally {
      setLoading(false);
    }
  }, [serviceId, timeRange, statusFilter, operationFilter, page]);

  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  const maxDuration = Math.max(...traces.map(t => t.duration_ms), 0);

  if (loading && traces.length === 0) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Traces</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{stats.total_traces.toLocaleString()}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{formatDuration(stats.avg_duration_ms)}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">P95 Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{formatDuration(stats.p95_duration_ms)}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <span className={cn(
                'text-2xl font-bold',
                stats.error_rate > 5 ? 'text-destructive' : stats.error_rate > 1 ? 'text-yellow-500' : 'text-green-500'
              )}>
                {stats.error_rate.toFixed(1)}%
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Select value={timeRange} onValueChange={(v) => { setTimeRange(v); setPage(1); }}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15m">Last 15m</SelectItem>
            <SelectItem value="1h">Last 1h</SelectItem>
            <SelectItem value="6h">Last 6h</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7d</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="unset">Unset</SelectItem>
          </SelectContent>
        </Select>

        <input
          type="text"
          placeholder="Search operation..."
          value={operationFilter}
          onChange={(e) => { setOperationFilter(e.target.value); setPage(1); }}
          className="flex h-10 w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <Button variant="outline" size="icon" onClick={fetchTraces}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Trace table */}
      {traces.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <Network className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No traces found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Try adjusting your time range or filters
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operation</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Spans</TableHead>
                <TableHead className="text-right">Services</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {traces.map(trace => (
                <TableRow
                  key={trace.trace_id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/traces/${trace.trace_id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {trace.http_method && (
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {trace.http_method}
                        </code>
                      )}
                      <span className="font-medium truncate max-w-[300px]">
                        {trace.root_operation}
                      </span>
                      {trace.http_status_code && (
                        <span className={cn(
                          'text-xs font-mono',
                          trace.http_status_code >= 400 ? 'text-destructive' : 'text-muted-foreground'
                        )}>
                          {trace.http_status_code}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatTimeAgo(trace.start_time)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {trace.span_count}
                  </TableCell>
                  <TableCell className="text-right">
                    {trace.service_count}
                  </TableCell>
                  <TableCell>
                    <DurationBar ms={trace.duration_ms} maxMs={maxDuration} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadge[trace.status] || 'secondary'}>
                      {trace.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      {traces.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={traces.length < 50}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
