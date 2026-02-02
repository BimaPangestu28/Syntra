import Link from 'next/link';
import {
  CheckCircle,
  ArrowRight,
  Bug,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatTimeAgo } from '@/lib/utils/format';

interface AlertItem {
  id: string;
  title: string;
  severity: string;
  createdAt: Date;
  server?: { id: string; name: string } | null;
  service?: { id: string; name: string } | null;
}

interface ErrorItem {
  id: string;
  message: string;
  eventCount: number;
  service: {
    name: string;
  };
}

interface AlertsCardProps {
  activeAlerts: AlertItem[];
  recentErrors: ErrorItem[];
}

const alertSeverityColors: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

export function AlertsCard({ activeAlerts, recentErrors }: AlertsCardProps) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">Issues</CardTitle>
          <CardDescription>Alerts & errors</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/alerts">
            View all
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {activeAlerts.length === 0 && recentErrors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle className="h-10 w-10 text-green-500 mb-3" />
            <p className="text-sm font-medium text-green-600">All clear!</p>
            <p className="text-xs text-muted-foreground mt-1">No active issues</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Active Alerts */}
            {activeAlerts.slice(0, 3).map((alert) => (
              <Link
                key={alert.id}
                href={`/alerts/${alert.id}`}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 ${alertSeverityColors[alert.severity] || 'bg-slate-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {alert.server?.name || alert.service?.name || 'System'}
                    {' · '}
                    {formatTimeAgo(alert.createdAt)}
                  </p>
                </div>
                <Badge variant={alert.severity === 'critical' ? 'destructive' : 'warning'} className="text-xs shrink-0">
                  {alert.severity}
                </Badge>
              </Link>
            ))}

            {/* Recent Errors */}
            {recentErrors.length > 0 && activeAlerts.length > 0 && (
              <div className="border-t pt-3 mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">RECENT ERRORS</p>
              </div>
            )}
            {recentErrors.slice(0, 3).map((error) => (
              <Link
                key={error.id}
                href={`/errors/${error.id}`}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <Bug className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">{error.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {error.service.name}
                    {' · '}
                    {error.eventCount}x in 24h
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
