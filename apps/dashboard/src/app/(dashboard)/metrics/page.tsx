'use client';

import { MetricsExplorer } from '@/components/metrics/metrics-explorer';

export default function MetricsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Metrics</h1>
        <p className="text-sm text-muted-foreground">
          Application and infrastructure metrics from your services
        </p>
      </div>

      <MetricsExplorer />
    </div>
  );
}
