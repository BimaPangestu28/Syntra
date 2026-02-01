'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ServiceStatus {
  id: string;
  name: string;
  service_name: string | null;
  service_type: string | null;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  uptime_percentage: number;
  avg_response_time: number | null;
  last_check_at: string | null;
}

interface Incident {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  status: 'active' | 'acknowledged' | 'resolved';
  started_at: string;
  resolved_at: string | null;
}

interface StatusData {
  organization: {
    name: string;
    slug: string;
  };
  overall_status: 'operational' | 'degraded' | 'partial_outage' | 'major_outage';
  services: ServiceStatus[];
  incidents: Incident[];
  generated_at: string;
}

const statusConfig = {
  operational: {
    label: 'All Systems Operational',
    color: 'bg-green-500',
    textColor: 'text-green-700 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    icon: CheckCircle2,
  },
  degraded: {
    label: 'Degraded Performance',
    color: 'bg-yellow-500',
    textColor: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    icon: AlertCircle,
  },
  partial_outage: {
    label: 'Partial Outage',
    color: 'bg-orange-500',
    textColor: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    icon: AlertTriangle,
  },
  major_outage: {
    label: 'Major Outage',
    color: 'bg-red-500',
    textColor: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    icon: XCircle,
  },
};

const serviceStatusConfig = {
  up: { label: 'Operational', color: 'text-green-600', icon: CheckCircle2 },
  down: { label: 'Down', color: 'text-red-600', icon: XCircle },
  degraded: { label: 'Degraded', color: 'text-yellow-600', icon: AlertCircle },
  unknown: { label: 'Unknown', color: 'text-gray-400', icon: AlertCircle },
};

const severityColors = {
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  error: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function PublicStatusPage() {
  const params = useParams();
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/v1/status/${params.orgSlug}`);
      const data = await res.json();
      if (data.success) {
        setStatusData(data.data);
        setLastUpdated(new Date());
        setError(null);
      } else {
        setError(data.error?.message || 'Failed to load status');
      }
    } catch {
      setError('Failed to load status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Refresh every 60 seconds
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.orgSlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12 px-4">
        <div className="max-w-4xl mx-auto space-y-8">
          <Skeleton className="h-12 w-64 mx-auto" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !statusData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <XCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Status Page Not Found</h2>
            <p className="text-muted-foreground">{error || 'This status page does not exist.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const StatusIcon = statusConfig[statusData.overall_status].icon;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="border-b bg-white dark:bg-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">{statusData.organization.name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4" />
              {lastUpdated && (
                <span>Updated {lastUpdated.toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Overall Status Banner */}
        <Card className={cn('border-2', statusConfig[statusData.overall_status].bgColor)}>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-4">
              <div className={cn('w-4 h-4 rounded-full', statusConfig[statusData.overall_status].color)} />
              <StatusIcon className={cn('w-8 h-8', statusConfig[statusData.overall_status].textColor)} />
              <span className={cn('text-lg font-semibold', statusConfig[statusData.overall_status].textColor)}>
                {statusConfig[statusData.overall_status].label}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Active Incidents */}
        {statusData.incidents.some((i) => i.status === 'active') && (
          <Card className="border-red-200 dark:border-red-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                Active Incidents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {statusData.incidents
                .filter((i) => i.status === 'active')
                .map((incident) => (
                  <div key={incident.id} className="border-l-4 border-red-500 pl-4 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={severityColors[incident.severity]}>
                        {incident.severity}
                      </Badge>
                      <span className="font-semibold">{incident.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{incident.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Started {new Date(incident.started_at).toLocaleString()}
                    </p>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

        {/* Services */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Services
            </CardTitle>
            <CardDescription>Current status of all monitored services</CardDescription>
          </CardHeader>
          <CardContent>
            {statusData.services.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No services are being monitored.
              </p>
            ) : (
              <div className="space-y-3">
                {statusData.services.map((service) => {
                  const config = serviceStatusConfig[service.status];
                  const ServiceStatusIcon = config.icon;
                  return (
                    <div
                      key={service.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-white dark:bg-slate-800"
                    >
                      <div className="flex items-center gap-3">
                        <ServiceStatusIcon className={cn('w-5 h-5', config.color)} />
                        <div>
                          <p className="font-medium">{service.name}</p>
                          {service.service_type && (
                            <p className="text-xs text-muted-foreground capitalize">
                              {service.service_type}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-right">
                          <p className="font-medium">{service.uptime_percentage}%</p>
                          <p className="text-xs text-muted-foreground">Uptime (24h)</p>
                        </div>
                        {service.avg_response_time && (
                          <div className="text-right">
                            <p className="font-medium">{service.avg_response_time}ms</p>
                            <p className="text-xs text-muted-foreground">Avg Response</p>
                          </div>
                        )}
                        <Badge
                          variant={service.status === 'up' ? 'success' : service.status === 'down' ? 'destructive' : 'secondary'}
                        >
                          {config.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Incident History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Incident History
            </CardTitle>
            <CardDescription>Past incidents from the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {statusData.incidents.filter((i) => i.status === 'resolved').length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No incidents in the past 7 days.
              </p>
            ) : (
              <div className="space-y-4">
                {statusData.incidents
                  .filter((i) => i.status === 'resolved')
                  .map((incident) => (
                    <div key={incident.id} className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Resolved</Badge>
                        <span className="font-medium">{incident.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{incident.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(incident.started_at).toLocaleDateString()} - {new Date(incident.resolved_at!).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="text-center text-sm text-muted-foreground py-8">
          <p>Powered by Syntra</p>
        </footer>
      </main>
    </div>
  );
}
