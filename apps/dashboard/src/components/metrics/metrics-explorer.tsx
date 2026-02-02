'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, BarChart3 } from 'lucide-react';
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
import { LineChart } from './line-chart';

interface MetricInfo {
  metric_name: string;
  metric_type: string;
}

interface MetricSummary {
  metric_name: string;
  metric_type: string;
  min_value: string;
  max_value: string;
  avg_value: string;
  total: string;
  data_points: string;
}

interface TimeSeriesPoint {
  bucket: string;
  avg_value: string;
  min_value: string;
  max_value: string;
  sum_value: string;
  count: string;
}

interface MetricsExplorerProps {
  serviceId?: string;
  serverId?: string;
}

const TIME_RANGES: Record<string, number> = {
  '15m': 15,
  '1h': 60,
  '6h': 360,
  '24h': 1440,
  '7d': 10080,
};

const GROUP_BY_OPTIONS: Record<string, string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '1h': '1 hour',
};

function formatValue(value: number, type: string): string {
  if (type === 'counter') return value.toLocaleString();
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)}K`;
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(3);
}

const typeColors: Record<string, string> = {
  gauge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  counter: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  histogram: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
};

export function MetricsExplorer({ serviceId, serverId }: MetricsExplorerProps) {
  const [metrics, setMetrics] = useState<MetricInfo[]>([]);
  const [summary, setSummary] = useState<MetricSummary[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('1h');
  const [groupBy, setGroupBy] = useState('1m');
  const [selectedMetric, setSelectedMetric] = useState<string>('');

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (serviceId) params.set('service_id', serviceId);
      if (serverId) params.set('server_id', serverId);

      const end = new Date();
      const start = new Date(end.getTime() - TIME_RANGES[timeRange] * 60 * 1000);
      params.set('start', start.toISOString());
      params.set('end', end.toISOString());
      params.set('group_by', groupBy);

      if (selectedMetric) {
        params.set('metric_name', selectedMetric);
      }

      const res = await fetch(`/api/v1/metrics?${params}`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch metrics');
      }

      setMetrics(data.data.metrics);
      setSummary(data.data.summary);
      setTimeSeries(data.data.time_series);
    } catch {
      setMetrics([]);
      setSummary([]);
      setTimeSeries([]);
    } finally {
      setLoading(false);
    }
  }, [serviceId, serverId, timeRange, groupBy, selectedMetric]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();

        if (serviceId) params.set('service_id', serviceId);
        if (serverId) params.set('server_id', serverId);

        const end = new Date();
        const start = new Date(end.getTime() - TIME_RANGES[timeRange] * 60 * 1000);
        params.set('start', start.toISOString());
        params.set('end', end.toISOString());
        params.set('group_by', groupBy);

        if (selectedMetric) {
          params.set('metric_name', selectedMetric);
        }

        const res = await fetch(`/api/v1/metrics?${params}`, { signal: controller.signal });

        if (controller.signal.aborted) return;

        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error?.message || 'Failed to fetch metrics');
        }

        setMetrics(data.data.metrics);
        setSummary(data.data.summary);
        setTimeSeries(data.data.time_series);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setMetrics([]);
        setSummary([]);
        setTimeSeries([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => controller.abort();
  }, [serviceId, serverId, timeRange, groupBy, selectedMetric]);

  // Convert time series to chart data
  const chartData = timeSeries.map((point) => ({
    timestamp: new Date(point.bucket).getTime(),
    value: parseFloat(point.avg_value),
  }));

  const minChartData = timeSeries.map((point) => ({
    timestamp: new Date(point.bucket).getTime(),
    value: parseFloat(point.min_value),
  }));

  const maxChartData = timeSeries.map((point) => ({
    timestamp: new Date(point.bucket).getTime(),
    value: parseFloat(point.max_value),
  }));

  // Stats from summary
  const totalMetrics = metrics.length;
  const totalDataPoints = summary.reduce(
    (acc, m) => acc + parseInt(m.data_points || '0', 10),
    0
  );
  const gaugeCount = metrics.filter((m) => m.metric_type === 'gauge').length;
  const counterCount = metrics.filter((m) => m.metric_type === 'counter').length;

  if (loading && metrics.length === 0) {
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{totalMetrics}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Data Points</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">
              {totalDataPoints.toLocaleString()}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gauges</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{gaugeCount}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Counters</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{counterCount}</span>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          value={timeRange}
          onValueChange={(v) => setTimeRange(v)}
        >
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

        <Select value={groupBy} onValueChange={(v) => setGroupBy(v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(GROUP_BY_OPTIONS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedMetric || '_all'}
          onValueChange={(v) => setSelectedMetric(v === '_all' ? '' : v)}
        >
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Select metric" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All metrics</SelectItem>
            {metrics.map((m) => (
              <SelectItem key={m.metric_name} value={m.metric_name}>
                {m.metric_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" onClick={fetchMetrics}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Time series chart */}
      {selectedMetric && chartData.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LineChart
            data={chartData}
            title={`${selectedMetric} (avg)`}
            color="#3b82f6"
            width={550}
            height={250}
          />
          <div className="grid grid-rows-2 gap-4">
            <LineChart
              data={maxChartData}
              title={`${selectedMetric} (max)`}
              color="#ef4444"
              width={550}
              height={115}
            />
            <LineChart
              data={minChartData}
              title={`${selectedMetric} (min)`}
              color="#22c55e"
              width={550}
              height={115}
            />
          </div>
        </div>
      )}

      {/* Metrics table */}
      {summary.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No metrics found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Try adjusting your time range or filters
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Min</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead className="text-right">Max</TableHead>
                <TableHead className="text-right">Data Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.map((metric) => {
                const minVal = parseFloat(metric.min_value);
                const avgVal = parseFloat(metric.avg_value);
                const maxVal = parseFloat(metric.max_value);
                const points = parseInt(metric.data_points, 10);

                return (
                  <TableRow
                    key={metric.metric_name}
                    className="cursor-pointer"
                    onClick={() => setSelectedMetric(metric.metric_name)}
                  >
                    <TableCell>
                      <span
                        className={cn(
                          'font-medium',
                          selectedMetric === metric.metric_name && 'text-primary'
                        )}
                      >
                        {metric.metric_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          typeColors[metric.metric_type] || 'bg-gray-100 text-gray-800'
                        )}
                      >
                        {metric.metric_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatValue(minVal, metric.metric_type)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatValue(avgVal, metric.metric_type)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatValue(maxVal, metric.metric_type)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {points.toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
