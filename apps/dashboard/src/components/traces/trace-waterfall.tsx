'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface TraceWaterfallProps {
  traceId: string;
  spans: WaterfallSpan[];
  summary: {
    span_count: number;
    service_count: number;
    services: string[];
    total_duration_ms: number;
    start_time: string;
    has_errors: boolean;
    root_span?: WaterfallSpan | null;
  };
}

function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}μs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(1)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function getSpanKindColor(kind: string): string {
  switch (kind.toLowerCase()) {
    case 'server':
      return 'bg-blue-500/10 text-blue-700 border-blue-300';
    case 'client':
      return 'bg-green-500/10 text-green-700 border-green-300';
    case 'internal':
      return 'bg-gray-500/10 text-gray-700 border-gray-300';
    case 'producer':
      return 'bg-purple-500/10 text-purple-700 border-purple-300';
    case 'consumer':
      return 'bg-orange-500/10 text-orange-700 border-orange-300';
    default:
      return 'bg-slate-500/10 text-slate-700 border-slate-300';
  }
}

function getHttpMethodColor(method?: string): string {
  if (!method) return 'bg-gray-500/10 text-gray-700 border-gray-300';

  switch (method.toLowerCase()) {
    case 'get':
      return 'bg-green-500/10 text-green-700 border-green-300';
    case 'post':
      return 'bg-blue-500/10 text-blue-700 border-blue-300';
    case 'put':
    case 'patch':
      return 'bg-yellow-500/10 text-yellow-700 border-yellow-300';
    case 'delete':
      return 'bg-red-500/10 text-red-700 border-red-300';
    default:
      return 'bg-gray-500/10 text-gray-700 border-gray-300';
  }
}

function SpanDetailPanel({
  span,
  onClose,
}: {
  span: WaterfallSpan;
  onClose: () => void;
}) {
  const hasError = span.status_code === 'ERROR';

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="flex-1">
          <CardTitle className="text-lg font-semibold">
            {span.operation_name}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Span ID: {span.span_id.slice(0, 16)}...
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto space-y-6">
        {/* Status */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Status</h3>
          <div className="flex items-center gap-2">
            {hasError ? (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                ERROR
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700 border-green-300">
                <CheckCircle2 className="h-3 w-3" />
                OK
              </Badge>
            )}
            {span.status_message && (
              <span className="text-sm text-muted-foreground">
                {span.status_message}
              </span>
            )}
          </div>
        </div>

        {/* Timing */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Timing</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-mono">{formatDuration(span.duration_ms)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start Time:</span>
              <span className="font-mono text-xs">
                {new Date(span.start_time).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Offset:</span>
              <span className="font-mono">{formatDuration(span.offset_ms)}</span>
            </div>
          </div>
        </div>

        {/* HTTP Info */}
        {(span.http_method || span.http_status_code || span.http_route) && (
          <div>
            <h3 className="text-sm font-semibold mb-2">HTTP</h3>
            <div className="space-y-2 text-sm">
              {span.http_method && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method:</span>
                  <Badge variant="outline" className={cn('text-xs', getHttpMethodColor(span.http_method))}>
                    {span.http_method}
                  </Badge>
                </div>
              )}
              {span.http_status_code && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status Code:</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      span.http_status_code >= 400
                        ? 'bg-red-500/10 text-red-700 border-red-300'
                        : 'bg-green-500/10 text-green-700 border-green-300'
                    )}
                  >
                    {span.http_status_code}
                  </Badge>
                </div>
              )}
              {span.http_route && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Route:</span>
                  <span className="font-mono text-xs">{span.http_route}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Attributes */}
        {Object.keys(span.attributes).length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Attributes</h3>
            <div className="space-y-1.5">
              {Object.entries(span.attributes).map(([key, value]) => (
                <div
                  key={key}
                  className="flex justify-between gap-4 text-sm py-1 border-b border-border/50 last:border-0"
                >
                  <span className="text-muted-foreground font-medium truncate">
                    {key}:
                  </span>
                  <span className="font-mono text-xs text-right break-all">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Events */}
        {span.events.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">
              Events ({span.events.length})
            </h3>
            <div className="space-y-3">
              {span.events.map((event, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-border/50 bg-muted/30"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{event.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {formatDuration(event.timestamp_ns / 1000000)}
                    </span>
                  </div>
                  {Object.keys(event.attributes).length > 0 && (
                    <div className="space-y-1 mt-2">
                      {Object.entries(event.attributes).map(([key, value]) => (
                        <div key={key} className="text-xs flex gap-2">
                          <span className="text-muted-foreground">{key}:</span>
                          <span className="font-mono">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* IDs */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Identifiers</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Service ID:</span>
              <p className="font-mono text-xs mt-1 break-all">{span.service_id}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Deployment ID:</span>
              <p className="font-mono text-xs mt-1 break-all">{span.deployment_id}</p>
            </div>
            {span.parent_span_id && (
              <div>
                <span className="text-muted-foreground">Parent Span ID:</span>
                <p className="font-mono text-xs mt-1 break-all">{span.parent_span_id}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SpanRow({
  span,
  totalDuration,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
}: {
  span: WaterfallSpan;
  totalDuration: number;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const hasError = span.status_code === 'ERROR';
  const hasChildren = span.children.length > 0;
  const leftPercent = (span.offset_ms / totalDuration) * 100;
  const widthPercent = Math.max((span.duration_ms / totalDuration) * 100, 0.1);

  return (
    <div
      className={cn(
        'flex items-center border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer',
        isSelected && 'bg-muted/70'
      )}
      onClick={onSelect}
    >
      {/* Left column - Operation name and metadata */}
      <div className="w-80 flex-shrink-0 p-3 border-r border-border/50">
        <div className="flex items-start gap-2">
          {/* Expand/collapse button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="mt-0.5 flex-shrink-0 hover:bg-muted rounded p-0.5"
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <div className="w-4 h-4" />
            )}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div
              className="flex items-center gap-2 mb-1"
              style={{ paddingLeft: `${span.depth * 16}px` }}
            >
              <span className="text-sm font-medium truncate">
                {span.operation_name}
              </span>
            </div>
            <div
              className="flex items-center gap-1.5 flex-wrap"
              style={{ paddingLeft: `${span.depth * 16}px` }}
            >
              <Badge
                variant="outline"
                className={cn('text-xs', getSpanKindColor(span.span_kind))}
              >
                {span.span_kind}
              </Badge>
              {span.http_method && (
                <Badge
                  variant="outline"
                  className={cn('text-xs', getHttpMethodColor(span.http_method))}
                >
                  {span.http_method}
                </Badge>
              )}
              {hasError && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertCircle className="h-3 w-3" />
                  ERROR
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right column - Timeline */}
      <div className="flex-1 p-3 relative">
        <div className="flex items-center gap-2">
          {/* Span bar */}
          <div className="relative h-8 flex-1">
            <div
              className={cn(
                'absolute h-full rounded transition-all',
                hasError ? 'bg-destructive/70' : 'bg-primary/60',
                'hover:opacity-80'
              )}
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                minWidth: '2px',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-medium text-white px-1 truncate">
                  {formatDuration(span.duration_ms)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TraceWaterfall({ traceId, spans, summary }: TraceWaterfallProps) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(
    new Set(spans.map((s) => s.span_id))
  );

  const selectedSpan = spans.find((s) => s.span_id === selectedSpanId);

  const toggleExpand = (spanId: string) => {
    setExpandedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  };

  const getVisibleSpans = () => {
    const visible: WaterfallSpan[] = [];
    const traverse = (spanId: string) => {
      const span = spans.find((s) => s.span_id === spanId);
      if (!span) return;

      visible.push(span);

      if (expandedSpans.has(spanId)) {
        span.children.forEach(traverse);
      }
    };

    if (summary.root_span) {
      traverse(summary.root_span.span_id);
    } else {
      spans.filter((s) => !s.parent_span_id).forEach((s) => traverse(s.span_id));
    }

    return visible;
  };

  const visibleSpans = getVisibleSpans();

  const timeMarkers = [
    { label: '0ms', percent: 0 },
    { label: formatDuration(summary.total_duration_ms * 0.25), percent: 25 },
    { label: formatDuration(summary.total_duration_ms * 0.5), percent: 50 },
    { label: formatDuration(summary.total_duration_ms * 0.75), percent: 75 },
    { label: formatDuration(summary.total_duration_ms), percent: 100 },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spans</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.span_count}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Services</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.service_count}</div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {summary.services.join(', ')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(summary.total_duration_ms)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            {summary.has_errors ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
          </CardHeader>
          <CardContent>
            {summary.has_errors ? (
              <Badge variant="destructive">ERROR</Badge>
            ) : (
              <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-300">
                OK
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Waterfall */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Card>
            <CardHeader>
              <CardTitle>Trace Timeline</CardTitle>
              <p className="text-sm text-muted-foreground">
                Trace ID: {traceId}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {/* Timeline header */}
                <div className="flex border-b border-border sticky top-0 bg-background z-10">
                  <div className="w-80 flex-shrink-0 p-3 border-r border-border/50 font-semibold text-sm">
                    Operation
                  </div>
                  <div className="flex-1 p-3 relative">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      {timeMarkers.map((marker) => (
                        <div
                          key={marker.percent}
                          className="absolute"
                          style={{ left: `${marker.percent}%` }}
                        >
                          <div className="relative -translate-x-1/2">
                            {marker.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Span rows */}
                {visibleSpans.length > 0 ? (
                  visibleSpans.map((span) => (
                    <SpanRow
                      key={span.span_id}
                      span={span}
                      totalDuration={summary.total_duration_ms}
                      isSelected={selectedSpanId === span.span_id}
                      isExpanded={expandedSpans.has(span.span_id)}
                      onSelect={() => setSelectedSpanId(span.span_id)}
                      onToggle={() => toggleExpand(span.span_id)}
                    />
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    No spans to display
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Detail panel */}
        {selectedSpan && (
          <div className="w-96 flex-shrink-0">
            <SpanDetailPanel
              span={selectedSpan}
              onClose={() => setSelectedSpanId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
