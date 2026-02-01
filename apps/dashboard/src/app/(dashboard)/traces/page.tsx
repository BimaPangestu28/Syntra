'use client';

import { TraceList } from '@/components/traces/trace-list';

export default function TracesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Traces</h1>
        <p className="text-sm text-muted-foreground">
          Distributed traces across your services
        </p>
      </div>

      <TraceList />
    </div>
  );
}
