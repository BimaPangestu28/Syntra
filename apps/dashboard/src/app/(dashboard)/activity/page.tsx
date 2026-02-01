'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Rocket,
  AlertTriangle,
  Users,
  Layers,
  Server,
  Activity,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

// ---- Types ----

interface ActivityUser {
  id: string;
  name: string | null;
  image: string | null;
}

interface ActivityResource {
  type: string;
  id: string;
  name: string;
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  user: ActivityUser | null;
  resource: ActivityResource | null;
  created_at: string;
}

// ---- Helpers ----

function getTypeCategory(type: string): string {
  const prefix = type.split('.')[0];
  return prefix;
}

function getTypeConfig(type: string): {
  icon: React.ElementType;
  color: string;
  dotColor: string;
} {
  const category = getTypeCategory(type);

  switch (category) {
    case 'deployment':
      return {
        icon: Rocket,
        color: 'text-blue-600',
        dotColor: 'bg-blue-500',
      };
    case 'alert':
      return {
        icon: AlertTriangle,
        color: type.includes('critical') || type.includes('error')
          ? 'text-red-600'
          : 'text-orange-500',
        dotColor: type.includes('critical') || type.includes('error')
          ? 'bg-red-500'
          : 'bg-orange-500',
      };
    case 'member':
      return {
        icon: Users,
        color: 'text-purple-600',
        dotColor: 'bg-purple-500',
      };
    case 'service':
      return {
        icon: Layers,
        color: 'text-green-600',
        dotColor: 'bg-green-500',
      };
    case 'server':
      return {
        icon: Server,
        color: 'text-cyan-600',
        dotColor: 'bg-cyan-500',
      };
    default:
      return {
        icon: Activity,
        color: 'text-gray-500',
        dotColor: 'bg-gray-400',
      };
  }
}

function getRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function UserAvatar({ user }: { user: ActivityUser | null }) {
  if (!user) {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
        ?
      </div>
    );
  }

  if (user.image) {
    return (
      <img
        src={user.image}
        alt={user.name || 'User'}
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
    );
  }

  const initial = (user.name || '?').charAt(0).toUpperCase();
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
      {initial}
    </div>
  );
}

// ---- Skeleton ----

function ActivitySkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 py-4">
          <div className="flex flex-col items-center">
            <Skeleton className="h-8 w-8 rounded-full" />
            {i < 4 && <Skeleton className="mt-2 h-full w-px" />}
          </div>
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3 w-12 mt-1.5" />
        </div>
      ))}
    </div>
  );
}

// ---- Main Component ----

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchActivity = useCallback(async (pageNum: number, append: boolean) => {
    try {
      const res = await fetch(`/api/v1/activity?page=${pageNum}&per_page=30`);
      const data = await res.json();

      if (data.success) {
        const newItems: ActivityItem[] = data.data.items;
        if (append) {
          setItems((prev) => [...prev, ...newItems]);
        } else {
          setItems(newItems);
        }
        setHasMore(data.data.meta.has_more);
      }
    } catch (error) {
      console.error('Failed to fetch activity:', error);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchActivity(1, false).finally(() => setLoading(false));
  }, [fetchActivity]);

  async function handleLoadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    await fetchActivity(nextPage, true);
    setPage(nextPage);
    setLoadingMore(false);
  }

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Recent activity across your organization
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <Card className="p-6">
          <ActivitySkeleton />
        </Card>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <Activity className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No activity yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Activity from deployments, alerts, and team actions will appear here.
          </p>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="relative">
            {items.map((item, index) => {
              const config = getTypeConfig(item.type);
              const Icon = config.icon;
              const isLast = index === items.length - 1;

              return (
                <div key={item.id} className="flex gap-4 relative">
                  {/* Timeline line */}
                  {!isLast && (
                    <div
                      className="absolute left-[15px] top-10 bottom-0 w-px bg-border"
                      aria-hidden="true"
                    />
                  )}

                  {/* Timeline dot / icon */}
                  <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background">
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserAvatar user={item.user} />
                        <div className="min-w-0">
                          <p className="text-sm leading-snug">
                            {item.user?.name && (
                              <span className="font-medium">{item.user.name}</span>
                            )}
                            {item.user?.name ? ' ' : ''}
                            <span className="text-muted-foreground">
                              {item.title.toLowerCase()}
                            </span>
                            {item.resource && (
                              <>
                                {' '}
                                <span className="font-medium">{item.resource.name}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
                        {getRelativeTime(item.created_at)}
                      </span>
                    </div>

                    {item.message && (
                      <p className="mt-1 ml-8 text-xs text-muted-foreground truncate">
                        {item.message}
                      </p>
                    )}

                    {item.resource && (
                      <div className="mt-1.5 ml-8">
                        <Badge variant="outline" className="text-xs font-normal">
                          {item.resource.type}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {hasMore && (
            <>
              <Separator className="my-2" />
              <div className="flex justify-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-2 h-4 w-4" />
                      Load more
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
