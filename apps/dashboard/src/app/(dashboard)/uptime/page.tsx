'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Activity, ArrowUpRight, CircleCheck, CircleX, Pause } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateMonitorDialog } from '@/components/uptime/create-monitor-dialog';

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
  service: { id: string; name: string } | null;
  created_at: string;
}

interface OrgInfo {
  id: string;
  name: string;
}

function StatusBadge({ status, isEnabled }: { status: string | null; isEnabled: boolean }) {
  if (!isEnabled) {
    return <Badge variant="secondary"><Pause className="mr-1 h-3 w-3" />Paused</Badge>;
  }
  if (status === 'up') {
    return <Badge className="bg-green-500/10 text-green-600 border-green-200"><CircleCheck className="mr-1 h-3 w-3" />Up</Badge>;
  }
  if (status === 'down') {
    return <Badge variant="destructive"><CircleX className="mr-1 h-3 w-3" />Down</Badge>;
  }
  return <Badge variant="secondary">Pending</Badge>;
}

export default function UptimePage() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  const fetchMonitors = useCallback(async () => {
    try {
      // Get org from team endpoint
      const teamRes = await fetch('/api/v1/team');
      const teamData = await teamRes.json();
      if (teamData.success && teamData.data.org) {
        setOrgId(teamData.data.org.id);
      }

      const res = await fetch('/api/v1/uptime');
      const data = await res.json();
      if (data.success) {
        setMonitors(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch monitors:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonitors();
  }, [fetchMonitors]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const upCount = monitors.filter(m => m.last_status === 'up' && m.is_enabled).length;
  const downCount = monitors.filter(m => m.last_status === 'down' && m.is_enabled).length;
  const enabledCount = monitors.filter(m => m.is_enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Uptime Monitoring</h1>
          <p className="text-muted-foreground">
            {enabledCount} active {enabledCount === 1 ? 'monitor' : 'monitors'}
            {downCount > 0 && <span className="text-destructive ml-2">({downCount} down)</span>}
          </p>
        </div>
        {orgId && <CreateMonitorDialog orgId={orgId} onCreated={fetchMonitors} />}
      </div>

      {/* Summary cards */}
      {monitors.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{upCount}</div>
              <p className="text-xs text-muted-foreground">Up</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-destructive">{downCount}</div>
              <p className="text-xs text-muted-foreground">Down</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{monitors.length - enabledCount}</div>
              <p className="text-xs text-muted-foreground">Paused</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Monitor list */}
      {monitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Activity className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No monitors yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first uptime monitor to start tracking availability.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {monitors.map((monitor) => (
            <Link key={monitor.id} href={`/uptime/${monitor.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <StatusBadge status={monitor.last_status} isEnabled={monitor.is_enabled} />
                    <div>
                      <div className="font-medium">{monitor.name}</div>
                      <div className="text-sm text-muted-foreground">{monitor.url}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {monitor.last_response_time !== null && (
                      <div className="text-right">
                        <div className="text-sm font-medium">{monitor.last_response_time}ms</div>
                        <div className="text-xs text-muted-foreground">Response time</div>
                      </div>
                    )}
                    {monitor.service && (
                      <Badge variant="outline">{monitor.service.name}</Badge>
                    )}
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
