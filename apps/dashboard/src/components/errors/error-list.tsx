'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorAnalysis } from '@/components/ai/error-analysis';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle,
  CheckCircle,
  EyeOff,
  Sparkles,
  Clock,
  Users,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIAnalysis {
  rootCause: string;
  whyNow: string;
  suggestedFix: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedScope: string;
  relatedIssues?: string[];
}

interface ErrorGroup {
  id: string;
  service_id: string;
  fingerprint: string;
  type: string;
  message: string;
  status: 'unresolved' | 'resolved' | 'ignored';
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
  user_count: number;
  assigned_to: { id: string; name: string; email: string; image: string } | null;
  has_ai_analysis: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface DetailedError {
  id: string;
  service_id: string;
  service_name: string;
  fingerprint: string;
  type: string;
  message: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
  user_count: number;
  stack_trace: string | null;
  ai_analysis: AIAnalysis | null;
  ai_analyzed_at: string | null;
}

interface ErrorListProps {
  serviceId: string;
}

const statusColors = {
  unresolved: 'destructive',
  resolved: 'success',
  ignored: 'secondary',
} as const;

const statusIcons = {
  unresolved: AlertCircle,
  resolved: CheckCircle,
  ignored: EyeOff,
};

export function ErrorList({ serviceId }: ErrorListProps) {
  const [errors, setErrors] = useState<ErrorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedError, setSelectedError] = useState<ErrorGroup | null>(null);
  const [detailedError, setDetailedError] = useState<DetailedError | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchErrors = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ service_id: serviceId });
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      const res = await fetch(`/api/v1/errors?${params}`, { signal });
      if (signal?.aborted) return;
      const data = await res.json();
      if (data.success) {
        setErrors(data.data);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Failed to fetch errors:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchErrors(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, statusFilter]);

  const fetchErrorDetail = async (errorId: string, signal?: AbortSignal) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/v1/errors/${errorId}`, { signal });
      if (signal?.aborted) return;
      const data = await res.json();
      if (data.success) {
        setDetailedError(data.data);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Failed to fetch error detail:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleErrorClick = (error: ErrorGroup) => {
    setSelectedError(error);
    fetchErrorDetail(error.id);
  };

  const handleStatusChange = async (errorId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/v1/errors/${errorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchErrors();
        if (selectedError?.id === errorId) {
          setSelectedError((prev) => prev ? { ...prev, status: newStatus as 'unresolved' | 'resolved' | 'ignored' } : null);
        }
      }
    } catch (error) {
      console.error('Failed to update error status:', error);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Errors</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Errors</SelectItem>
                <SelectItem value="unresolved">Unresolved</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => fetchErrors()} aria-label="Refresh errors">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {errors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500 opacity-50" />
              <p>No errors found</p>
              <p className="text-sm mt-1">Your service is running smoothly</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-[100px]">Events</TableHead>
                  <TableHead className="w-[100px]">Last Seen</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[50px]">AI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((error) => {
                  const StatusIcon = statusIcons[error.status];
                  return (
                    <TableRow
                      key={error.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleErrorClick(error)}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-sm truncate max-w-[400px]">
                            {error.type}
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-[400px]">
                            {error.message}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <span className="font-medium">{error.event_count}</span>
                          {error.user_count > 0 && (
                            <span className="text-muted-foreground flex items-center gap-0.5">
                              <Users className="w-3 h-3" />
                              {error.user_count}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(error.last_seen_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusColors[error.status]}
                          className="gap-1"
                        >
                          <StatusIcon className="w-3 h-3" />
                          {error.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {error.has_ai_analysis && (
                          <Sparkles className="w-4 h-4 text-blue-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Error Detail Dialog */}
      <Dialog open={!!selectedError} onOpenChange={() => setSelectedError(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              {selectedError?.type}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedError?.message}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status and Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  {selectedError?.event_count} events
                </span>
                <span className="text-muted-foreground">
                  {selectedError?.user_count} users affected
                </span>
              </div>
              {selectedError && (
                <Select
                  value={selectedError.status}
                  onValueChange={(value) => handleStatusChange(selectedError.id, value)}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unresolved">Unresolved</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="ignored">Ignored</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Stack Trace */}
            {detailedError?.stack_trace && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Stack Trace</h4>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
                  {detailedError.stack_trace}
                </pre>
              </div>
            )}

            {/* AI Analysis */}
            {loadingDetail ? (
              <Skeleton className="h-48" />
            ) : selectedError && detailedError && (
              <ErrorAnalysis
                errorGroupId={selectedError.id}
                errorMessage={selectedError.message}
                stackTrace={detailedError.stack_trace || undefined}
                existingAnalysis={detailedError.ai_analysis}
                analyzedAt={detailedError.ai_analyzed_at}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
