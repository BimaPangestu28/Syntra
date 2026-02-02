'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Lightbulb,
  AlertTriangle,
  Info,
  AlertCircle,
  X,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface Suggestion {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  created_at: string;
}

interface SuggestionsPanelProps {
  serviceId: string;
  maxItems?: number;
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: 'text-destructive', badge: 'destructive' as const },
  warning: { icon: AlertTriangle, color: 'text-yellow-600', badge: 'secondary' as const },
  info: { icon: Info, color: 'text-blue-500', badge: 'secondary' as const },
};

export function SuggestionsPanel({ serviceId, maxItems = 3 }: SuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/ai/suggestions?service_id=${serviceId}`);
      const data = await res.json();
      if (data.success) {
        setSuggestions(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  async function handleDismiss(suggestionId: string) {
    try {
      const res = await fetch('/api/v1/ai/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_id: suggestionId }),
      });
      const data = await res.json();
      if (data.success) {
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
        toast.success('Suggestion dismissed');
      }
    } catch (error) {
      toast.error('Failed to dismiss suggestion');
    }
  }

  if (loading || suggestions.length === 0) return null;

  const displaySuggestions = suggestions.slice(0, maxItems);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            <CardTitle className="text-sm">AI Suggestions</CardTitle>
          </div>
          {suggestions.length > maxItems && (
            <Badge variant="secondary" className="text-xs">
              +{suggestions.length - maxItems} more
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {displaySuggestions.map((suggestion) => {
          const config = SEVERITY_CONFIG[suggestion.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.info;
          const Icon = config.icon;
          const isExpanded = expanded === suggestion.id;

          return (
            <div
              key={suggestion.id}
              className="border rounded-md p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className="flex items-start gap-2 flex-1 cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : suggestion.id)}
                >
                  <Icon className={`h-4 w-4 mt-0.5 ${config.color}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{suggestion.title}</span>
                      <Badge variant={config.badge} className="text-xs">
                        {suggestion.severity}
                      </Badge>
                    </div>
                    {isExpanded && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {suggestion.description}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => handleDismiss(suggestion.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
