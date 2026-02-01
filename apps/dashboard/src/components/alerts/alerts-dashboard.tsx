'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  AlertTriangle,
  XCircle,
  Info,
  AlertOctagon,
  Filter,
  RefreshCw,
} from 'lucide-react';

interface Alert {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  server: { id: string; name: string } | null;
  service: { id: string; name: string } | null;
  acknowledged_at: string | null;
  acknowledged_by: { id: string; name: string } | null;
  resolved_at: string | null;
  resolved_by: { id: string; name: string } | null;
  created_at: string;
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertOctagon, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AlertsDashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [severityFilter, setSeverityFilter] = useState<string>('');

  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (severityFilter) params.set('severity', severityFilter);
      params.set('per_page', '50');

      const res = await fetch(`/api/v1/alerts?${params}`);
      const data = await res.json();
      if (data.success) {
        setAlerts(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleAcknowledge = async (alertId: string) => {
    try {
      await fetch(`/api/v1/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'acknowledged' }),
      });
      fetchAlerts();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const handleResolve = async (alertId: string) => {
    try {
      await fetch(`/api/v1/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      fetchAlerts();
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    }
  };

  // Stats
  const activeCount = alerts.filter((a) => a.status === 'active').length;
  const criticalCount = alerts.filter((a) => a.severity === 'critical' && a.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Bell className="w-4 h-4" />
            Total Alerts
          </div>
          <p className="text-2xl font-semibold">{alerts.length}</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            Active
          </div>
          <p className="text-2xl font-semibold">{activeCount}</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <AlertOctagon className="w-4 h-4 text-red-400" />
            Critical
          </div>
          <p className="text-2xl font-semibold">{criticalCount}</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <CheckCheck className="w-4 h-4 text-green-400" />
            Resolved
          </div>
          <p className="text-2xl font-semibold">
            {alerts.filter((a) => a.status === 'resolved').length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {['active', 'acknowledged', 'resolved', ''].map((status) => (
            <button
              key={status || 'all'}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                statusFilter === status
                  ? 'bg-background text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {status || 'All'}
            </button>
          ))}
        </div>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-1.5 bg-muted border-0 rounded-lg text-sm"
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>

        <button
          onClick={() => { setLoading(true); fetchAlerts(); }}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <BellOff className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No alerts found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const config =
              SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ??
              SEVERITY_CONFIG.info;
            const Icon = config.icon;

            return (
              <div
                key={alert.id}
                className={`border rounded-lg p-4 ${config.bg}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 mt-0.5 ${config.color}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{alert.title}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                          {alert.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {alert.message}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{timeAgo(alert.created_at)}</span>
                        {alert.service && <span>{alert.service.name}</span>}
                        {alert.server && <span>{alert.server.name}</span>}
                        {alert.acknowledged_by && (
                          <span>Acked by {alert.acknowledged_by.name}</span>
                        )}
                        {alert.resolved_by && (
                          <span>Resolved by {alert.resolved_by.name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {alert.status === 'active' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Acknowledge"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleResolve(alert.id)}
                        className="p-1.5 rounded-md hover:bg-green-500/10 text-muted-foreground hover:text-green-400 transition-colors"
                        title="Resolve"
                      >
                        <CheckCheck className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {alert.status === 'acknowledged' && (
                    <button
                      onClick={() => handleResolve(alert.id)}
                      className="p-1.5 rounded-md hover:bg-green-500/10 text-muted-foreground hover:text-green-400 transition-colors"
                      title="Resolve"
                    >
                      <CheckCheck className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
