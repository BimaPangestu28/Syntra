'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export interface WaterfallSpan {
  span_id: string;
  parent_span_id: string | null;
  operation_name: string;
  service_id: string;
  deployment_id: string;
  span_kind: string;
  start_time: string;
  duration_ms: number;
  status_code: string;
  status_message: string;
  attributes: Record<string, string>;
  events: Array<{
    name: string;
    timestamp_ns: number;
    attributes: Record<string, string | number | boolean>;
  }>;
  http_method?: string;
  http_status_code?: number;
  http_route?: string;
  depth: number;
  offset_ms: number;
  children: string[];
}

interface TraceSummary {
  span_count: number;
  service_count: number;
  services: string[];
  total_duration_ms: number;
  start_time: string;
  has_errors: boolean;
}

interface TraceWaterfallProps {
  traceId: string;
  spans: WaterfallSpan[];
  summary: TraceSummary;
}

const SERVICE_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-orange-500',
];

const SERVICE_COLORS_LIGHT = [
  'bg-blue-500/20',
  'bg-emerald-500/20',
  'bg-purple-500/20',
  'bg-amber-500/20',
  'bg-rose-500/20',
  'bg-cyan-500/20',
  'bg-indigo-500/20',
  'bg-orange-500/20',
];

function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const spanKindVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  server: 'default',
  client: 'secondary',
  producer: 'secondary',
  consumer: 'secondary',
  internal: 'outline',
};

export function TraceWaterfall({ traceId, spans, summary }: TraceWaterfallProps) {
  const [selectedSpan, setSelectedSpan] = useState<string | null>(null);

  const serviceColorMap = useMemo(() => {
    const map = new Map<string, number>();
    summary.services.forEach((svc, i) => {
      map.set(svc, i % SERVICE_COLORS.length);
    });
    return map;
  }, [summary.services]);

  const totalDuration = summary.total_duration_ms;
  const selectedSpanData = selectedSpan ? spans.find(s => s.span_id === selectedSpan) : null;

  // Time axis markers
  const timeMarkers = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) => ({
      ms: (totalDuration / count) * i,
      pct: (i / count) * 100,
    }));
  }, [totalDuration]);

  return (
    <div className="space-y-4 flex flex-col h-full">
      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Trace Waterfall</CardTitle>
              <CardDescription className="font-mono">{traceId.slice(0, 16)}...</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{summary.span_count} spans</span>
              <span className="text-sm text-muted-foreground">{summary.service_count} services</span>
              <span className="text-sm font-medium">{formatDuration(totalDuration)}</span>
              {summary.has_errors && (
                <Badge variant="destructive">Has errors</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Service legend */}
          <div className="flex items-center gap-4 flex-wrap">
            {summary.services.map(svc => {
              const colorIdx = serviceColorMap.get(svc) ?? 0;
              return (
                <div key={svc} className="flex items-center gap-1.5">
                  <div className={cn('w-2.5 h-2.5 rounded-sm', SERVICE_COLORS[colorIdx])} />
                  <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={svc}>
                    {svc.length > 20 ? svc.slice(0, 8) + '...' : svc}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Waterfall */}
      <Card className="flex-1 overflow-hidden flex flex-col">
        {/* Time axis */}
        <div className="relative h-8 border-b flex items-center px-0">
          <div className="w-[280px] min-w-[280px] border-r px-4">
            <span className="text-xs text-muted-foreground font-medium">Operation</span>
          </div>
          <div className="flex-1 relative h-full px-4">
            {timeMarkers.map(({ ms, pct }) => (
              <div
                key={ms}
                className="absolute top-0 h-full flex items-center"
                style={{ left: `${pct}%` }}
              >
                <span className="text-[10px] text-muted-foreground">{formatDuration(ms)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Span rows */}
        <div className="flex-1 overflow-auto">
          {spans.map(span => {
            const colorIdx = serviceColorMap.get(span.service_id) ?? 0;
            const barLeft = totalDuration > 0 ? (span.offset_ms / totalDuration) * 100 : 0;
            const barWidth = totalDuration > 0 ? Math.max((span.duration_ms / totalDuration) * 100, 0.5) : 100;
            const isSelected = selectedSpan === span.span_id;
            const isError = span.status_code === 'error';

            return (
              <div
                key={span.span_id}
                className={cn(
                  'flex items-center h-8 border-b cursor-pointer transition-colors',
                  isSelected ? 'bg-muted' : 'hover:bg-muted/50',
                  isError && 'bg-destructive/5'
                )}
                onClick={() => setSelectedSpan(isSelected ? null : span.span_id)}
              >
                {/* Span info (left panel) */}
                <div
                  className="flex items-center gap-1.5 w-[280px] min-w-[280px] px-3 border-r"
                  style={{ paddingLeft: `${12 + span.depth * 16}px` }}
                >
                  {span.children.length > 0 && (
                    <span className="text-muted-foreground text-[10px]">
                      {isSelected ? '\u25BC' : '\u25B6'}
                    </span>
                  )}
                  <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', SERVICE_COLORS[colorIdx])} />
                  <span className={cn(
                    'text-xs truncate',
                    isError ? 'text-destructive' : ''
                  )} title={span.operation_name}>
                    {span.http_method && (
                      <span className="text-muted-foreground mr-1">{span.http_method}</span>
                    )}
                    {span.operation_name}
                  </span>
                </div>

                {/* Duration bar (right panel) */}
                <div className="flex-1 relative h-full px-4">
                  {/* Grid lines */}
                  {timeMarkers.map(({ pct }) => (
                    <div
                      key={pct}
                      className="absolute top-0 h-full border-l border-border/30"
                      style={{ left: `${pct}%` }}
                    />
                  ))}
                  {/* The bar */}
                  <div
                    className={cn(
                      'absolute top-1.5 h-5 rounded-sm flex items-center',
                      isError
                        ? 'bg-destructive/30 border border-destructive/50'
                        : SERVICE_COLORS_LIGHT[colorIdx]
                    )}
                    style={{
                      left: `${barLeft}%`,
                      width: `${barWidth}%`,
                      minWidth: '2px',
                    }}
                  >
                    {barWidth > 5 && (
                      <span className="text-[10px] px-1 truncate">
                        {formatDuration(span.duration_ms)}
                      </span>
                    )}
                  </div>
                  {/* Duration label outside bar if too small */}
                  {barWidth <= 5 && (
                    <span
                      className="absolute top-1.5 text-[10px] text-muted-foreground h-5 flex items-center"
                      style={{ left: `${barLeft + barWidth + 0.5}%` }}
                    >
                      {formatDuration(span.duration_ms)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Span detail panel */}
      {selectedSpanData && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{selectedSpanData.operation_name}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={spanKindVariant[selectedSpanData.span_kind] || 'outline'}>
                  {selectedSpanData.span_kind}
                </Badge>
                {selectedSpanData.status_code === 'error' && (
                  <Badge variant="destructive">error</Badge>
                )}
                {selectedSpanData.status_code === 'ok' && (
                  <Badge variant="success">ok</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Key metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Duration</p>
                <p className="text-sm font-medium">{formatDuration(selectedSpanData.duration_ms)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Start Offset</p>
                <p className="text-sm font-medium">{formatDuration(selectedSpanData.offset_ms)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Span ID</p>
                <p className="text-sm font-mono">{selectedSpanData.span_id.slice(0, 16)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Service</p>
                <p className="text-sm truncate">{selectedSpanData.service_id.slice(0, 16)}...</p>
              </div>
            </div>

            {/* HTTP info */}
            {selectedSpanData.http_method && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">HTTP</p>
                  <div className="flex items-center gap-2 text-sm">
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                      {selectedSpanData.http_method} {selectedSpanData.http_route}
                    </code>
                    {selectedSpanData.http_status_code && (
                      <Badge variant={selectedSpanData.http_status_code >= 400 ? 'destructive' : 'success'}>
                        {selectedSpanData.http_status_code}
                      </Badge>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Status message */}
            {selectedSpanData.status_message && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Status Message</p>
                  <p className="text-sm text-destructive font-mono">{selectedSpanData.status_message}</p>
                </div>
              </>
            )}

            {/* Attributes */}
            {Object.keys(selectedSpanData.attributes).length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-2">Attributes</p>
                  <div className="bg-muted rounded-md p-3 font-mono text-xs space-y-1">
                    {Object.entries(selectedSpanData.attributes).map(([key, value]) => (
                      <div key={key} className="flex">
                        <span className="text-primary mr-2">{key}:</span>
                        <span className="text-muted-foreground break-all">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Events */}
            {selectedSpanData.events.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-2">
                    Events ({selectedSpanData.events.length})
                  </p>
                  <div className="space-y-2">
                    {selectedSpanData.events.map((event, i) => (
                      <div key={i} className="bg-muted rounded-md p-3 text-xs">
                        <span className="font-medium">{event.name}</span>
                        {Object.keys(event.attributes).length > 0 && (
                          <div className="mt-1 font-mono text-muted-foreground">
                            {JSON.stringify(event.attributes)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
