'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface NotificationPref {
  type: string;
  enabled: boolean;
}

const NOTIFICATION_LABELS: Record<string, { label: string; description: string }> = {
  deployment: {
    label: 'Deployments',
    description: 'Notifications when deployments start, succeed, or fail',
  },
  error: {
    label: 'Errors & Alerts',
    description: 'Notifications for new errors and triggered alerts',
  },
  member: {
    label: 'Team Members',
    description: 'Notifications when members join, leave, or change roles',
  },
  workflow: {
    label: 'Workflows',
    description: 'Notifications when workflows trigger or complete',
  },
};

export function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingType, setTogglingType] = useState<string | null>(null);

  useEffect(() => {
    fetchPrefs();
  }, []);

  async function fetchPrefs() {
    try {
      const res = await fetch('/api/v1/settings/notifications');
      const data = await res.json();
      if (data.success) {
        setPrefs(data.data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function togglePref(type: string, enabled: boolean) {
    setTogglingType(type);
    // Optimistic update
    setPrefs((prev) =>
      prev.map((p) => (p.type === type ? { ...p, enabled } : p))
    );

    try {
      const res = await fetch('/api/v1/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: [{ type, enabled }],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPrefs(data.data);
      } else {
        // Revert on failure
        setPrefs((prev) =>
          prev.map((p) => (p.type === type ? { ...p, enabled: !enabled } : p))
        );
        toast.error(data.error?.message || 'Failed to update');
      }
    } catch {
      setPrefs((prev) =>
        prev.map((p) => (p.type === type ? { ...p, enabled: !enabled } : p))
      );
      toast.error('Failed to update notification preference');
    } finally {
      setTogglingType(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Choose which notifications you want to receive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {prefs.map((pref) => {
            const info = NOTIFICATION_LABELS[pref.type];
            if (!info) return null;
            return (
              <div
                key={pref.type}
                className="flex items-center justify-between rounded-md border p-4"
              >
                <div>
                  <p className="text-sm font-medium">{info.label}</p>
                  <p className="text-xs text-muted-foreground">{info.description}</p>
                </div>
                <Button
                  variant={pref.enabled ? 'default' : 'outline'}
                  size="sm"
                  disabled={togglingType === pref.type}
                  onClick={() => togglePref(pref.type, !pref.enabled)}
                >
                  {togglingType === pref.type ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : pref.enabled ? (
                    'On'
                  ) : (
                    'Off'
                  )}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
