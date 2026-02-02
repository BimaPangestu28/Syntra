'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BarChart3, Loader2 } from 'lucide-react';

interface MetricsChartsProps {
  serviceId: string;
}

interface MetricDataPoint {
  bucket: string;
  avg_value: string;
  min_value: string;
  max_value: string;
  sum_value: string;
  count: string;
}

interface MetricInfo {
  metric_name: string;
  metric_type: string;
}

interface MetricsResponse {
  success: boolean;
  data: {
    metrics: MetricInfo[];
    time_series: MetricDataPoint[];
    summary: unknown[];
  };
  meta: {
    start: string;
    end: string;
    aggregated: boolean;
    group_by: string;
  };
}

const TIME_RANGES: Record<string, { label: string; minutes: number }> = {
  '15m': { label: 'Last 15 minutes', minutes: 15 },
  '1h': { label: 'Last 1 hour', minutes: 60 },
  '6h': { label: 'Last 6 hours', minutes: 360 },
  '24h': { label: 'Last 24 hours', minutes: 1440 },
  '7d': { label: 'Last 7 days', minutes: 10080 },
};

// Known metric configurations
const METRIC_CONFIGS: Record<
  string,
  { label: string; unit: string; color: string; formatValue: (v: number) => string }
> = {
  'cpu.usage': {
    label: 'CPU Usage',
    unit: '%',
    color: '#3b82f6',
    formatValue: (v) => `${v.toFixed(2)}%`,
  },
  'memory.usage': {
    label: 'Memory Usage',
    unit: 'MB',
    color: '#10b981',
    formatValue: (v) => `${(v / 1024 / 1024).toFixed(2)} MB`,
  },
  'http.request.rate': {
    label: 'Request Rate',
    unit: 'req/s',
    color: '#8b5cf6',
    formatValue: (v) => `${v.toFixed(2)} req/s`,
  },
  'http.response.latency': {
    label: 'Response Latency',
    unit: 'ms',
    color: '#f59e0b',
    formatValue: (v) => `${v.toFixed(2)} ms`,
  },
  'http.error.rate': {
    label: 'Error Rate',
    unit: '%',
    color: '#ef4444',
    formatValue: (v) => `${v.toFixed(2)}%`,
  },
  'network.io': {
    label: 'Network I/O',
    unit: 'KB/s',
    color: '#06b6d4',
    formatValue: (v) => `${(v / 1024).toFixed(2)} KB/s`,
  },
};

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else if (diffMins < 1440) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
  }
}

export function MetricsCharts({ serviceId }: MetricsChartsProps) {
  const [timeRange, setTimeRange] = useState('1h');
  const [loading, setLoading] = useState(true);
  const [metricsData, setMetricsData] = useState<Record<string, MetricDataPoint[]>>({});
  const [availableMetrics, setAvailableMetrics] = useState<MetricInfo[]>([]);

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      try {
        const end = new Date();
        const start = new Date(end.getTime() - TIME_RANGES[timeRange].minutes * 60 * 1000);

        const params = new URLSearchParams({
          service_id: serviceId,
          start: start.toISOString(),
          end: end.toISOString(),
          aggregated: 'true',
        });

        const response = await fetch(`/api/v1/metrics?${params}`);
        const data: MetricsResponse = await response.json();

        if (!data.success) {
          throw new Error('Failed to fetch metrics');
        }

        setAvailableMetrics(data.data.metrics);

        // Fetch time series for each known metric
        const metricsMap: Record<string, MetricDataPoint[]> = {};

        for (const metric of data.data.metrics) {
          if (METRIC_CONFIGS[metric.metric_name]) {
            const metricParams = new URLSearchParams({
              service_id: serviceId,
              start: start.toISOString(),
              end: end.toISOString(),
              metric_name: metric.metric_name,
              aggregated: 'true',
              group_by: timeRange === '7d' ? '1h' : timeRange === '24h' ? '15m' : '1m',
            });

            const metricResponse = await fetch(`/api/v1/metrics?${metricParams}`);
            const metricData: MetricsResponse = await metricResponse.json();

            if (metricData.success && metricData.data.time_series) {
              metricsMap[metric.metric_name] = metricData.data.time_series;
            }
          }
        }

        setMetricsData(metricsMap);
      } catch (error) {
        console.error('Error fetching metrics:', error);
        setMetricsData({});
        setAvailableMetrics([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [serviceId, timeRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasMetrics = Object.keys(metricsData).length > 0;

  if (!hasMetrics) {
    return (
      <Card className="flex flex-col items-center justify-center py-16">
        <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No metrics available</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Metrics will appear here once your service starts reporting data
        </p>
      </Card>
    );
  }

  const renderChart = (metricName: string) => {
    const config = METRIC_CONFIGS[metricName];
    const data = metricsData[metricName];

    if (!config || !data || data.length === 0) return null;

    const chartData = data.map((point) => ({
      timestamp: new Date(point.bucket).getTime(),
      value: parseFloat(point.avg_value),
      displayTime: formatTimestamp(point.bucket),
    }));

    return (
      <Card key={metricName}>
        <CardHeader>
          <CardTitle className="text-base font-medium">{config.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`gradient-${metricName}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={config.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={config.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="displayTime"
                tick={{ fontSize: 12 }}
                tickLine={{ stroke: 'hsl(var(--muted))' }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={{ stroke: 'hsl(var(--muted))' }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(value) => {
                  if (metricName === 'memory.usage') {
                    return `${(value / 1024 / 1024).toFixed(0)}M`;
                  }
                  return value.toFixed(0);
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [config.formatValue(value), config.label]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={config.color}
                fillOpacity={1}
                fill={`url(#gradient-${metricName})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Service Metrics</h2>
          <p className="text-sm text-muted-foreground">
            Real-time performance metrics for this service
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TIME_RANGES).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.keys(METRIC_CONFIGS).map((metricName) => renderChart(metricName))}
      </div>
    </div>
  );
}
