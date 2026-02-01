'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TraceWaterfall, WaterfallSpan } from '@/components/traces/trace-waterfall';

interface TraceDetailData {
  trace_id: string;
  spans: WaterfallSpan[];
  summary: {
    span_count: number;
    service_count: number;
    services: string[];
    total_duration_ms: number;
    start_time: string;
    has_errors: boolean;
  };
}

export default function TraceDetailPage() {
  const { traceId } = useParams<{ traceId: string }>();
  const router = useRouter();
  const [data, setData] = useState<TraceDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTrace() {
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/traces/${traceId}`);
        const json = await res.json();

        if (!json.success) {
          throw new Error(json.error?.message || 'Failed to fetch trace');
        }

        setData(json.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch trace');
      } finally {
        setLoading(false);
      }
    }

    if (traceId) {
      fetchTrace();
    }
  }, [traceId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/traces')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Trace Detail</h1>
          <p className="text-sm text-muted-foreground font-mono">{traceId}</p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-96" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-64 text-destructive">
          {error}
        </div>
      ) : data ? (
        <TraceWaterfall
          traceId={data.trace_id}
          spans={data.spans}
          summary={data.summary}
        />
      ) : null}
    </div>
  );
}
