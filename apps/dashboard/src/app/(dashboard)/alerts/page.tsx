'use client';

import { useState } from 'react';
import { AlertsDashboard } from '@/components/alerts/alerts-dashboard';
import { AlertRules } from '@/components/alerts/alert-rules';

export default function AlertsPage() {
  const [tab, setTab] = useState<'alerts' | 'rules'>('alerts');

  // TODO: Get orgId from session/context
  const orgId = '';

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Alerts</h1>
        <p className="text-muted-foreground mt-1">
          Monitor and manage alerts across your infrastructure
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit mb-6">
        <button
          onClick={() => setTab('alerts')}
          className={`px-4 py-2 rounded-md text-sm transition-colors ${
            tab === 'alerts'
              ? 'bg-background text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Active Alerts
        </button>
        <button
          onClick={() => setTab('rules')}
          className={`px-4 py-2 rounded-md text-sm transition-colors ${
            tab === 'rules'
              ? 'bg-background text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Alert Rules
        </button>
      </div>

      {tab === 'alerts' ? <AlertsDashboard /> : <AlertRules orgId={orgId} />}
    </div>
  );
}
