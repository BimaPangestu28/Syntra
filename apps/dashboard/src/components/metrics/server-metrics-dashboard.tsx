'use client';

import { useEffect, useState, useCallback } from 'react';
import { MetricsCard } from './metrics-card';
import { LineChart } from './line-chart';

interface ServerMetrics {
  cpu_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  disk_percent: number;
  load_avg_1m: number;
  container_count: number;
  uptime_seconds: number;
  updated_at: number;
}

interface TimeSeriesData {
  timestamp: number;
  value: number;
}

interface ServerMetricsDashboardProps {
  serverId: string;
  refreshInterval?: number;
}

export function ServerMetricsDashboard({
  serverId,
  refreshInterval = 30000,
}: ServerMetricsDashboardProps) {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [cpuHistory, setCpuHistory] = useState<TimeSeriesData[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<TimeSeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/v1/telemetry/metrics?server_id=${serverId}`, { signal });

      if (signal?.aborted) return;

      const data = await response.json();

      if (data.success && data.data) {
        const serverMetrics = data.data.server;
        if (serverMetrics) {
          // Convert string values to numbers
          const parsed: ServerMetrics = {
            cpu_percent: parseFloat(serverMetrics.cpu_percent) || 0,
            memory_used_mb: parseFloat(serverMetrics.memory_used_mb) || 0,
            memory_total_mb: parseFloat(serverMetrics.memory_total_mb) || 0,
            memory_percent: parseFloat(serverMetrics.memory_percent) || 0,
            disk_used_gb: parseFloat(serverMetrics.disk_used_gb) || 0,
            disk_total_gb: parseFloat(serverMetrics.disk_total_gb) || 0,
            disk_percent: parseFloat(serverMetrics.disk_percent) || 0,
            load_avg_1m: parseFloat(serverMetrics.load_avg_1m) || 0,
            container_count: parseInt(serverMetrics.container_count) || 0,
            uptime_seconds: parseInt(serverMetrics.uptime_seconds) || 0,
            updated_at: parseInt(serverMetrics.updated_at) || Date.now(),
          };

          setMetrics(parsed);

          // Add to history (keep last 30 points)
          const now = Date.now();
          setCpuHistory(prev => [...prev, { timestamp: now, value: parsed.cpu_percent }].slice(-30));
          setMemoryHistory(prev => [...prev, { timestamp: now, value: parsed.memory_percent }].slice(-30));
        }
      }

      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Failed to fetch metrics');
      console.error('Metrics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = () => fetchMetrics(controller.signal);
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchMetrics, refreshInterval]);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  if (loading && !metrics) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-lg h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={() => fetchMetrics()}
          className="mt-2 text-sm text-red-600 dark:text-red-400 underline"
          aria-label="Retry fetching metrics"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <p className="text-yellow-600 dark:text-yellow-400">No metrics data available for this server.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricsCard
          title="CPU Usage"
          value={metrics.cpu_percent}
          unit="%"
          color={metrics.cpu_percent > 80 ? 'red' : metrics.cpu_percent > 60 ? 'yellow' : 'green'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          }
        />

        <MetricsCard
          title="Memory Usage"
          value={metrics.memory_percent}
          unit="%"
          color={metrics.memory_percent > 80 ? 'red' : metrics.memory_percent > 60 ? 'yellow' : 'blue'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />

        <MetricsCard
          title="Disk Usage"
          value={metrics.disk_percent}
          unit="%"
          color={metrics.disk_percent > 90 ? 'red' : metrics.disk_percent > 70 ? 'yellow' : 'purple'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          }
        />

        <MetricsCard
          title="Load Average"
          value={metrics.load_avg_1m}
          unit=""
          maxValue={8}
          color={metrics.load_avg_1m > 4 ? 'red' : metrics.load_avg_1m > 2 ? 'yellow' : 'green'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>

      {/* Additional Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Memory</h3>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {(metrics.memory_used_mb / 1024).toFixed(1)} GB / {(metrics.memory_total_mb / 1024).toFixed(1)} GB
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Containers</h3>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {metrics.container_count} running
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Uptime</h3>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {formatUptime(metrics.uptime_seconds)}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cpuHistory.length > 1 && (
          <LineChart
            data={cpuHistory}
            title="CPU Usage Over Time"
            unit="%"
            color="#3b82f6"
            minValue={0}
            maxValue={100}
            width={450}
            height={200}
          />
        )}

        {memoryHistory.length > 1 && (
          <LineChart
            data={memoryHistory}
            title="Memory Usage Over Time"
            unit="%"
            color="#8b5cf6"
            minValue={0}
            maxValue={100}
            width={450}
            height={200}
          />
        )}
      </div>

      {/* Last Updated */}
      <div className="text-xs text-gray-500 text-right">
        Last updated: {new Date(metrics.updated_at).toLocaleString()}
      </div>
    </div>
  );
}
