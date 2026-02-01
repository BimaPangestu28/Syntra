'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Activity,
  Bug,
  Clock,
  ChevronDown,
} from 'lucide-react';

interface AlertRule {
  id: string;
  name: string;
  service: { id: string; name: string } | null;
  metric: string;
  operator: string;
  threshold: number;
  window_minutes: number;
  severity: string;
  channel_ids: string[];
  cooldown_minutes: number;
  is_enabled: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

interface Service {
  id: string;
  name: string;
}

const METRIC_OPTIONS = [
  { value: 'error_count', label: 'Error Count', description: 'Total error events in time window', icon: Bug },
  { value: 'error_rate', label: 'Error Rate', description: 'Errors per minute', icon: Activity },
  { value: 'new_error', label: 'New Error Types', description: 'New unique error groups', icon: AlertTriangle },
];

const OPERATOR_OPTIONS = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
];

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'warning', label: 'Warning', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'error', label: 'Error', color: 'bg-red-500/20 text-red-400' },
  { value: 'critical', label: 'Critical', color: 'bg-red-600/20 text-red-300' },
];

const WINDOW_OPTIONS = [
  { value: 1, label: '1 min' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
];

function operatorLabel(op: string): string {
  return OPERATOR_OPTIONS.find((o) => o.value === op)?.label ?? op;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AlertRules({ orgId }: { orgId: string }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    service_id: '',
    metric: 'error_count',
    operator: 'gt',
    threshold: 10,
    window_minutes: 5,
    severity: 'warning',
    cooldown_minutes: 30,
  });
  const [saving, setSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/alert-rules');
      const data = await res.json();
      if (data.success) {
        setRules(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch alert rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/v1/alert-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          ...formData,
          service_id: formData.service_id || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setFormData({
          name: '',
          service_id: '',
          metric: 'error_count',
          operator: 'gt',
          threshold: 10,
          window_minutes: 5,
          severity: 'warning',
          cooldown_minutes: 30,
        });
        fetchRules();
      }
    } catch (err) {
      console.error('Failed to create alert rule:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (ruleId: string, currentEnabled: boolean) => {
    try {
      await fetch(`/api/v1/alert-rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !currentEnabled }),
      });
      fetchRules();
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Delete this alert rule?')) return;

    try {
      await fetch(`/api/v1/alert-rules/${ruleId}`, { method: 'DELETE' });
      fetchRules();
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Alert Rules</h2>
          <p className="text-sm text-muted-foreground">
            Configure threshold-based alerts for error monitoring
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Rule
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="border border-border rounded-lg p-6 space-y-4 bg-card"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Rule Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., High error rate on auth service"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Metric</label>
              <select
                value={formData.metric}
                onChange={(e) => setFormData({ ...formData, metric: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                {METRIC_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label} - {m.description}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Time Window</label>
              <select
                value={formData.window_minutes}
                onChange={(e) => setFormData({ ...formData, window_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                {WINDOW_OPTIONS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Condition</label>
                <select
                  value={formData.operator}
                  onChange={(e) => setFormData({ ...formData, operator: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                >
                  {OPERATOR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Threshold</label>
                <input
                  type="number"
                  min={0}
                  value={formData.threshold}
                  onChange={(e) => setFormData({ ...formData, threshold: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Severity</label>
              <select
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Cooldown</label>
              <select
                value={formData.cooldown_minutes}
                onChange={(e) => setFormData({ ...formData, cooldown_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={240}>4 hours</option>
                <option value={1440}>24 hours</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || !formData.name}
              className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Rule'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Bell className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No alert rules configured</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create a rule to get notified when error thresholds are exceeded
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const metricInfo = METRIC_OPTIONS.find((m) => m.value === rule.metric);
            const severityInfo = SEVERITY_OPTIONS.find((s) => s.value === rule.severity);
            const MetricIcon = metricInfo?.icon ?? Activity;

            return (
              <div
                key={rule.id}
                className={`border border-border rounded-lg p-4 transition-colors ${
                  rule.is_enabled ? 'bg-card' : 'bg-muted/30 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-2 rounded-lg bg-muted">
                      <MetricIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rule.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityInfo?.color ?? 'bg-muted text-muted-foreground'}`}
                        >
                          {rule.severity}
                        </span>
                        {!rule.is_enabled && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {metricInfo?.label ?? rule.metric}{' '}
                        <span className="font-mono">
                          {operatorLabel(rule.operator)} {rule.threshold}
                        </span>{' '}
                        in {rule.window_minutes}m window
                        {rule.service && (
                          <span>
                            {' '}
                            on <span className="text-foreground">{rule.service.name}</span>
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Cooldown: {rule.cooldown_minutes}m
                        </span>
                        {rule.last_triggered_at && (
                          <span>Last triggered: {timeAgo(rule.last_triggered_at)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(rule.id, rule.is_enabled)}
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                      title={rule.is_enabled ? 'Disable rule' : 'Enable rule'}
                    >
                      {rule.is_enabled ? (
                        <ToggleRight className="w-5 h-5 text-green-400" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                      title="Delete rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
