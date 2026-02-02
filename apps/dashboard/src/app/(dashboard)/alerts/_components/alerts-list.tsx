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
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatTimeAgo } from '@/lib/utils/format';

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
  critical: {
    icon: AlertOctagon,
    color: 'text-red-400',
    border: 'border-l-red-500',
    badge: 'destructive' as const,
  },
  error: {
    icon: XCircle,
    color: 'text-red-400',
    border: 'border-l-red-500',
    badge: 'destructive' as const,
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-400',
    border: 'border-l-yellow-500',
    badge: 'outline' as const,
  },
  info: {
    icon: Info,
    color: 'text-blue-400',
    border: 'border-l-blue-500',
    badge: 'secondary' as const,
  },
};

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  acknowledged: 'outline',
  resolved: 'secondary',
};

export function AlertsList() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [severityFilter, setSeverityFilter] = useState('all');

  const fetchAlerts = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (severityFilter && severityFilter !== 'all') params.set('severity', severityFilter);
        params.set('per_page', '50');

        const res = await fetch(`/api/v1/alerts?${params}`, { signal });
        const data = await res.json();
        if (data.success) {
          setAlerts(data.data);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Failed to fetch alerts:', err);
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, severityFilter],
  );

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    fetchAlerts(controller.signal);
    return () => controller.abort();
  }, [fetchAlerts]);

  const handleAction = async (alertId: string, action: 'acknowledge' | 'resolve') => {
    try {
      const res = await fetch(`/api/v1/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error?.message || `Failed to ${action} alert`);
        return;
      }
      toast.success(`Alert ${action === 'acknowledge' ? 'acknowledged' : 'resolved'}`);
      fetchAlerts();
    } catch {
      toast.error(`Failed to ${action} alert`);
    }
  };

  // Stats
  const activeCount = alerts.filter((a) => a.status === 'active').length;
  const criticalCount = alerts.filter(
    (a) => a.severity === 'critical' && a.status === 'active',
  ).length;
  const resolvedCount = alerts.filter((a) => a.status === 'resolved').length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Alerts', value: alerts.length, icon: Bell },
          { label: 'Active', value: activeCount, icon: AlertTriangle, iconClass: 'text-yellow-400' },
          { label: 'Critical', value: criticalCount, icon: AlertOctagon, iconClass: 'text-red-400' },
          { label: 'Resolved', value: resolvedCount, icon: CheckCheck, iconClass: 'text-green-400' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <stat.icon className={`h-4 w-4 ${stat.iconClass ?? ''}`} />
                {stat.label}
              </div>
              <p className="text-2xl font-semibold">
                {loading ? <Skeleton className="h-8 w-12" /> : stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="acknowledged">Acknowledged</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setLoading(true);
            fetchAlerts();
          }}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-5 w-5 rounded" />
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
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BellOff className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">No alerts found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Alerts will appear here when thresholds are exceeded
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const config =
              SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ??
              SEVERITY_CONFIG.info;
            const Icon = config.icon;

            return (
              <Card key={alert.id} className={`border-l-4 ${config.border}`}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Icon className={`h-5 w-5 mt-0.5 ${config.color}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{alert.title}</span>
                          <Badge variant={STATUS_BADGE_VARIANT[alert.status] ?? 'secondary'}>
                            {alert.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{formatTimeAgo(new Date(alert.created_at))}</span>
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

                    <div className="flex items-center gap-1 shrink-0">
                      {alert.status === 'active' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAction(alert.id, 'acknowledge')}
                            title="Acknowledge"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAction(alert.id, 'resolve')}
                            title="Resolve"
                          >
                            <CheckCheck className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {alert.status === 'acknowledged' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleAction(alert.id, 'resolve')}
                          title="Resolve"
                        >
                          <CheckCheck className="h-4 w-4" />
                        </Button>
                      )}
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
