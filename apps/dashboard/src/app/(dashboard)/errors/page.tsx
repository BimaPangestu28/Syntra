'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bug,
  AlertTriangle,
  CheckCircle,
  Filter,
  Brain,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface ErrorGroup {
  id: string;
  service_id: string;
  service_name?: string;
  fingerprint: string;
  type: string;
  message: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
  user_count: number;
  assigned_to: {
    id: string;
    name: string;
    email: string;
  } | null;
  has_ai_analysis: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface Service {
  id: string;
  name: string;
  project_id: string;
  project_name?: string;
}

interface ErrorsResponse {
  success: boolean;
  data: {
    errors: ErrorGroup[];
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

interface StatsResponse {
  success: boolean;
  data: {
    total: number;
    unresolved: number;
    resolved_today: number;
    error_rate_trend: number;
  };
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getStatusBadgeVariant(status: string): 'destructive' | 'success' | 'secondary' {
  switch (status) {
    case 'unresolved':
    case 'open':
      return 'destructive';
    case 'resolved':
      return 'success';
    case 'ignored':
      return 'secondary';
    default:
      return 'secondary';
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ErrorsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errors, setErrors] = useState<ErrorGroup[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    unresolved: 0,
    resolved_today: 0,
    error_rate_trend: 0,
  });
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const limit = 50;
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const serviceFilter = searchParams.get('service_id') || 'all';
  const statusFilter = searchParams.get('status') || 'all';

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch stats
        const statsRes = await fetch('/api/v1/errors/stats');
        if (statsRes.ok) {
          const statsData: StatsResponse = await statsRes.json();
          if (statsData.success) {
            setStats(statsData.data);
          }
        }

        // Fetch services
        const servicesRes = await fetch('/api/v1/services');
        if (servicesRes.ok) {
          const servicesData = await servicesRes.json();
          if (servicesData.success) {
            setServices(servicesData.data || []);
          }
        }

        // Fetch errors
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
        });
        if (serviceFilter !== 'all') {
          params.append('service_id', serviceFilter);
        }
        if (statusFilter !== 'all') {
          params.append('status', statusFilter);
        }

        const errorsRes = await fetch(`/api/v1/errors?${params}`);
        if (errorsRes.ok) {
          const errorsData: ErrorsResponse = await errorsRes.json();
          if (errorsData.success) {
            setErrors(errorsData.data.errors);
            setTotal(errorsData.data.total);
            setHasMore(errorsData.data.has_more);
          }
        }
      } catch (error) {
        console.error('Failed to fetch errors:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [offset, serviceFilter, statusFilter]);

  const handleServiceChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete('service_id');
    } else {
      params.set('service_id', value);
    }
    params.delete('offset');
    router.push(`/errors?${params}`);
  };

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete('status');
    } else {
      params.set('status', value);
    }
    params.delete('offset');
    router.push(`/errors?${params}`);
  };

  const handlePrevPage = () => {
    const newOffset = Math.max(0, offset - limit);
    const params = new URLSearchParams(searchParams.toString());
    params.set('offset', newOffset.toString());
    router.push(`/errors?${params}`);
  };

  const handleNextPage = () => {
    const newOffset = offset + limit;
    const params = new URLSearchParams(searchParams.toString());
    params.set('offset', newOffset.toString());
    router.push(`/errors?${params}`);
  };

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Errors</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track and manage error groups across all services
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
            <Bug className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unresolved</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats.unresolved.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Need attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Resolved Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {stats.resolved_today.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            {stats.error_rate_trend >= 0 ? (
              <TrendingUp className="h-4 w-4 text-destructive" />
            ) : (
              <TrendingDown className="h-4 w-4 text-green-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'text-2xl font-bold',
                stats.error_rate_trend >= 0 ? 'text-destructive' : 'text-green-500'
              )}
            >
              {stats.error_rate_trend >= 0 ? '+' : ''}
              {stats.error_rate_trend.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">vs. yesterday</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              {/* Service Filter */}
              <Select value={serviceFilter} onValueChange={handleServiceChange}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Services" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                      {service.project_name && (
                        <span className="text-muted-foreground ml-1">
                          ({service.project_name})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Tabs value={statusFilter} onValueChange={handleStatusChange}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="unresolved">Unresolved</TabsTrigger>
                  <TabsTrigger value="resolved">Resolved</TabsTrigger>
                  <TabsTrigger value="ignored">Ignored</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Groups Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">Loading errors...</div>
            </div>
          ) : errors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Bug className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No errors found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {statusFilter !== 'all' || serviceFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Your services are running smoothly'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Error</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead>First Seen</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Assigned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((error) => (
                    <TableRow
                      key={error.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/errors/${error.id}`)}
                    >
                      <TableCell className="max-w-md">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono text-muted-foreground">
                                {error.type}
                              </code>
                              {error.has_ai_analysis && (
                                <Badge variant="outline" className="gap-1">
                                  <Brain className="h-3 w-3" />
                                  AI
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm mt-0.5 truncate" title={error.message}>
                              {error.message}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{error.service_name || 'Unknown'}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(error.status)}>
                          {error.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-sm">
                          {error.event_count.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-sm">
                          {error.user_count.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {timeAgo(error.first_seen_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {timeAgo(error.last_seen_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {error.assigned_to ? (
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                              {getInitials(error.assigned_to.name)}
                            </div>
                            <span className="text-sm hidden xl:inline">
                              {error.assigned_to.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} errors
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={offset === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={!hasMore}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
