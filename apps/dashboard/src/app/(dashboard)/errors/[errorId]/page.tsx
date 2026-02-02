'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Bug,
  Calendar,
  Users,
  Activity,
  Brain,
  AlertCircle,
  CheckCircle,
  Clock,
  FileCode,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface AIAnalysis {
  rootCause: string;
  whyNow: string;
  suggestedFix: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedScope: string;
  relatedIssues?: string[];
}

interface ErrorDetail {
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

interface ErrorDetailResponse {
  success: boolean;
  data: ErrorDetail;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function getSeverityBadgeVariant(
  severity: string
): 'destructive' | 'warning' | 'default' | 'secondary' {
  switch (severity) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'warning';
    case 'medium':
      return 'default';
    case 'low':
      return 'secondary';
    default:
      return 'secondary';
  }
}

export default function ErrorDetailPage({ params }: { params: { errorId: string } }) {
  const router = useRouter();
  const [error, setError] = useState<ErrorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function fetchError() {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/errors/${params.errorId}`);
        if (res.ok) {
          const data: ErrorDetailResponse = await res.json();
          if (data.success) {
            setError(data.data);
          }
        } else if (res.status === 404) {
          router.push('/errors');
        }
      } catch (err) {
        console.error('Failed to fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchError();
  }, [params.errorId, router]);

  const handleStatusChange = async (newStatus: string) => {
    if (!error) return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/v1/errors/${params.errorId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setError({ ...error, status: newStatus });
        }
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading error details...</div>
      </div>
    );
  }

  if (!error) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/errors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl font-bold">{error.type}</h1>
              <Badge variant={getStatusBadgeVariant(error.status)}>{error.status}</Badge>
              {error.ai_analysis && (
                <Badge variant="outline" className="gap-1">
                  <Brain className="h-3 w-3" />
                  AI Analyzed
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">{error.message}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span>Service: {error.service_name}</span>
              <span>•</span>
              <span>Fingerprint: {error.fingerprint.slice(0, 8)}</span>
            </div>
          </div>
        </div>

        <Select value={error.status} onValueChange={handleStatusChange} disabled={updating}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unresolved">Unresolved</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Event Count</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{error.event_count.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Total occurrences</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Affected Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{error.user_count.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Unique users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">First Seen</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{formatDate(error.first_seen_at)}</div>
            <p className="text-xs text-muted-foreground mt-1">{timeAgo(error.first_seen_at)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Last Seen</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{formatDate(error.last_seen_at)}</div>
            <p className="text-xs text-muted-foreground mt-1">{timeAgo(error.last_seen_at)}</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Analysis */}
      {error.ai_analysis && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-500" />
                <CardTitle>AI Analysis</CardTitle>
              </div>
              <Badge variant={getSeverityBadgeVariant(error.ai_analysis.severity)}>
                {error.ai_analysis.severity.toUpperCase()}
              </Badge>
            </div>
            {error.ai_analyzed_at && (
              <p className="text-xs text-muted-foreground mt-1">
                Analyzed {timeAgo(error.ai_analyzed_at)}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4" />
                Root Cause
              </h4>
              <p className="text-sm text-muted-foreground">{error.ai_analysis.rootCause}</p>
            </div>

            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4" />
                Why Now
              </h4>
              <p className="text-sm text-muted-foreground">{error.ai_analysis.whyNow}</p>
            </div>

            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4" />
                Suggested Fix
              </h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {error.ai_analysis.suggestedFix}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Users className="h-4 w-4" />
                Affected Scope
              </h4>
              <p className="text-sm text-muted-foreground">{error.ai_analysis.affectedScope}</p>
            </div>

            {error.ai_analysis.relatedIssues && error.ai_analysis.relatedIssues.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Related Issues</h4>
                <ul className="list-disc list-inside space-y-1">
                  {error.ai_analysis.relatedIssues.map((issue, index) => (
                    <li key={index} className="text-sm text-muted-foreground">
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stack Trace */}
      {error.stack_trace && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              <CardTitle>Stack Trace</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs font-mono max-h-[400px] overflow-y-auto">
                {error.stack_trace}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Bug className="h-4 w-4 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">First occurrence</p>
                <p className="text-xs text-muted-foreground">{formatDate(error.first_seen_at)}</p>
              </div>
            </div>

            {error.event_count > 1 && (
              <div className="flex items-start gap-4">
                <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                  <Activity className="h-4 w-4 text-orange-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {error.event_count - 1} more occurrence{error.event_count > 2 ? 's' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Between {formatDate(error.first_seen_at)} and{' '}
                    {formatDate(error.last_seen_at)}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0',
                  error.status === 'resolved'
                    ? 'bg-green-500/10'
                    : error.status === 'ignored'
                      ? 'bg-gray-500/10'
                      : 'bg-orange-500/10'
                )}
              >
                {error.status === 'resolved' ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : error.status === 'ignored' ? (
                  <AlertCircle className="h-4 w-4 text-gray-500" />
                ) : (
                  <Clock className="h-4 w-4 text-orange-500" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {error.status === 'resolved'
                    ? 'Marked as resolved'
                    : error.status === 'ignored'
                      ? 'Marked as ignored'
                      : 'Currently unresolved'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last updated {timeAgo(error.last_seen_at)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
