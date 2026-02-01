'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowDown, ArrowUp, Copy, Check, Loader2, Terminal, Pause, Play } from 'lucide-react';

interface LogLine {
  timestamp?: string;
  type: 'build' | 'deploy' | 'info' | 'error' | 'success';
  content: string;
}

interface LogViewerProps {
  deploymentId: string;
  initialLogs?: { type: string; content: string; timestamp?: string }[];
  initialStatus?: string;
  isComplete?: boolean;
}

export function LogViewer({
  deploymentId,
  initialLogs = [],
  initialStatus,
  isComplete: initialIsComplete = false,
}: LogViewerProps) {
  const [logs, setLogs] = useState<LogLine[]>(() => {
    return initialLogs.flatMap((log) =>
      log.content.split('\n').map((line) => ({
        timestamp: log.timestamp,
        type: log.type as LogLine['type'],
        content: line,
      }))
    );
  });
  const [status, setStatus] = useState(initialStatus || 'pending');
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isComplete, setIsComplete] = useState(initialIsComplete);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Connect to SSE stream
  useEffect(() => {
    if (isComplete || isPaused) return;

    const eventSource = new EventSource(`/api/v1/deployments/${deploymentId}/logs/stream`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', () => {
      setIsConnected(true);
    });

    eventSource.addEventListener('log', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.content) {
          const newLines = data.content.split('\n').map((line: string) => ({
            timestamp: data.timestamp,
            type: data.type as LogLine['type'],
            content: line,
          }));

          if (data.incremental) {
            setLogs((prev) => [...prev, ...newLines]);
          } else {
            setLogs(newLines);
          }
        }
      } catch (error) {
        console.error('Error parsing log event:', error);
      }
    });

    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data.status);

        if (data.error_message) {
          setLogs((prev) => [
            ...prev,
            { type: 'error', content: `Error: ${data.error_message}` },
          ]);
        }
      } catch (error) {
        console.error('Error parsing status event:', error);
      }
    });

    eventSource.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data.status);
        setIsComplete(true);
        setLogs((prev) => [
          ...prev,
          {
            type: data.status === 'running' ? 'success' : 'error',
            content: `Deployment ${data.status}`,
          },
        ]);
      } catch (error) {
        console.error('Error parsing complete event:', error);
      }
      eventSource.close();
    });

    eventSource.addEventListener('error', (event) => {
      console.error('SSE error:', event);
      setIsConnected(false);
    });

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [deploymentId, isComplete, isPaused]);

  const handleScroll = useCallback(() => {
    if (!logContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }, []);

  const scrollToTop = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
      setAutoScroll(false);
    }
  }, []);

  const copyLogs = useCallback(async () => {
    const logText = logs.map((l) => l.content).join('\n');
    await navigator.clipboard.writeText(logText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [logs]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const getLineColor = (type: LogLine['type']) => {
    switch (type) {
      case 'error':
        return 'text-red-400';
      case 'success':
        return 'text-green-400';
      case 'build':
        return 'text-blue-400';
      case 'deploy':
        return 'text-purple-400';
      default:
        return 'text-slate-300';
    }
  };

  const statusVariant = {
    pending: 'secondary',
    building: 'warning',
    deploying: 'warning',
    running: 'success',
    stopped: 'secondary',
    failed: 'destructive',
    cancelled: 'secondary',
  } as const;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5" />
          <CardTitle className="text-lg">Deployment Logs</CardTitle>
          <Badge variant={statusVariant[status as keyof typeof statusVariant] || 'secondary'}>
            {status}
          </Badge>
          {isConnected && !isComplete && (
            <div className="flex items-center gap-1 text-xs text-green-500">
              <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              Live
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isComplete && (
            <Button
              variant="outline"
              size="sm"
              onClick={togglePause}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={scrollToTop} title="Scroll to top">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={scrollToBottom} title="Scroll to bottom">
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={copyLogs} title="Copy logs">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          className="h-[500px] overflow-auto bg-slate-900 rounded-lg p-4 font-mono text-sm"
        >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              {isComplete ? (
                'No logs available'
              ) : (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for logs...
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {logs.map((line, index) => (
                <div
                  key={index}
                  className={`whitespace-pre-wrap break-all ${getLineColor(line.type)}`}
                >
                  {line.content || '\u00A0'}
                </div>
              ))}
              {!isComplete && !isPaused && (
                <div className="flex items-center gap-2 text-slate-500 mt-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-xs">Streaming logs...</span>
                </div>
              )}
            </div>
          )}
        </div>
        {!autoScroll && !isComplete && (
          <div className="mt-2 text-center">
            <Button variant="outline" size="sm" onClick={scrollToBottom}>
              <ArrowDown className="mr-2 h-4 w-4" />
              Scroll to follow
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
