'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Rocket,
  AlertTriangle,
  UserPlus,
  GitBranch,
  Activity,
  Check,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  resource: { type: string; id: string; name: string } | null;
  created_at: string;
}

const POLL_INTERVAL = 30_000;

function getTypeIcon(type: string) {
  if (type.startsWith('deployment')) return Rocket;
  if (type.startsWith('error') || type === 'alert') return AlertTriangle;
  if (type === 'member.joined' || type === 'member.invited') return UserPlus;
  if (type.startsWith('workflow')) return GitBranch;
  return Activity;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/activity/unread');
      if (res.ok) {
        const json = await res.json();
        setUnreadCount(json.data?.count ?? 0);
      }
    } catch {
      // silently ignore
    }
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/activity?per_page=10');
      if (res.ok) {
        const json = await res.json();
        setItems(json.data?.items ?? []);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all: true }),
      });
      if (res.ok) {
        setUnreadCount(0);
      }
    } catch {
      // silently ignore
    }
  }, []);

  // Poll unread count
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch items when popover opens
  useEffect(() => {
    if (open) {
      fetchItems();
    }
  }, [open, fetchItems]);

  function getResourceHref(item: NotificationItem): string | null {
    if (!item.resource) return null;
    const { type, id } = item.resource;
    if (type === 'service') return `/services/${id}`;
    if (type === 'deployment') return `/deployments/${id}`;
    if (type === 'server') return `/servers/${id}`;
    if (type === 'project') return `/projects/${id}`;
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-80 p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Check className="w-3 h-3" />
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            items.map((item) => {
              const Icon = getTypeIcon(item.type);
              const href = getResourceHref(item);
              const content = (
                <div className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer">
                  <div className="mt-0.5 text-muted-foreground">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-tight">
                      {item.title}
                      {item.resource?.name && (
                        <span className="text-muted-foreground">
                          {' - '}
                          {item.resource.name}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {relativeTime(item.created_at)}
                    </p>
                  </div>
                </div>
              );

              return href ? (
                <Link
                  key={item.id}
                  href={href}
                  onClick={() => setOpen(false)}
                >
                  {content}
                </Link>
              ) : (
                <div key={item.id}>{content}</div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border">
          <Link
            href="/activity"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all activity
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
