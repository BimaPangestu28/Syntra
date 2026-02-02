'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, AlertCircle, CheckCircle, LightbulbIcon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIAnalysis {
  rootCause: string;
  whyNow: string;
  suggestedFix: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedScope: string;
  relatedIssues?: string[];
}

interface ErrorAnalysisProps {
  errorGroupId: string;
  errorMessage: string;
  stackTrace?: string;
  existingAnalysis?: AIAnalysis | null;
  analyzedAt?: string | null;
  onAnalysisComplete?: (analysis: AIAnalysis) => void;
}

const severityColors = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export function ErrorAnalysis({
  errorGroupId,
  errorMessage,
  stackTrace,
  existingAnalysis,
  analyzedAt,
  onAnalysisComplete,
}: ErrorAnalysisProps) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(existingAnalysis || null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(analyzedAt || null);

  const runAnalysis = async (signal?: AbortSignal) => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/ai/analyze-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error_group_id: errorGroupId,
        }),
        signal,
      });

      if (signal?.aborted) return;

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to analyze error');
      }

      setAnalysis(data.data.analysis);
      setLastAnalyzedAt(data.data.analyzed_at);
      onAnalysisComplete?.(data.data.analysis);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to analyze error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!analysis) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8">
          <div className="text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-white flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-black" />
            </div>
            <div>
              <h3 className="font-semibold">AI Error Analysis</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Let AI analyze this error to understand the root cause and get fix suggestions
              </p>
            </div>
            {error && (
              <div className="text-sm text-red-500 flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            <Button
              onClick={() => runAnalysis()}
              disabled={isAnalyzing}
              className="bg-white text-black hover:bg-white/90"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Analyze with AI
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-white" />
            <CardTitle className="text-base">AI Analysis</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn('text-xs', severityColors[analysis.severity])}>
              {analysis.severity.toUpperCase()}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => runAnalysis()}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Re-analyze'
              )}
            </Button>
          </div>
        </div>
        {lastAnalyzedAt && (
          <CardDescription className="flex items-center gap-1 text-xs">
            <Clock className="w-3 h-3" />
            Analyzed {new Date(lastAnalyzedAt).toLocaleString()}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Root Cause */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="w-4 h-4 text-red-500" />
            Root Cause
          </div>
          <p className="text-sm text-muted-foreground pl-6">
            {analysis.rootCause}
          </p>
        </div>

        {/* Why Now */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="w-4 h-4 text-yellow-500" />
            Why Now?
          </div>
          <p className="text-sm text-muted-foreground pl-6">
            {analysis.whyNow}
          </p>
        </div>

        {/* Suggested Fix */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <LightbulbIcon className="w-4 h-4 text-green-500" />
            Suggested Fix
          </div>
          <div className="text-sm text-muted-foreground pl-6 whitespace-pre-wrap bg-muted/50 p-3 rounded-md font-mono">
            {analysis.suggestedFix}
          </div>
        </div>

        {/* Affected Scope */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle className="w-4 h-4 text-blue-500" />
            Affected Scope
          </div>
          <p className="text-sm text-muted-foreground pl-6">
            {analysis.affectedScope}
          </p>
        </div>

        {/* Related Issues */}
        {analysis.relatedIssues && analysis.relatedIssues.length > 0 && (
          <div className="space-y-1">
            <div className="text-sm font-medium">Related Issues</div>
            <ul className="text-sm text-muted-foreground pl-6 list-disc list-inside">
              {analysis.relatedIssues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
