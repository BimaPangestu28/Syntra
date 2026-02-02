'use client';

import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const METRIC_OPTIONS = [
  { value: 'error_count', label: 'Error Count' },
  { value: 'error_rate', label: 'Error Rate' },
  { value: 'new_error', label: 'New Error Types' },
  { value: 'latency_p99', label: 'Latency P99' },
];

const OPERATOR_OPTIONS = [
  { value: 'gt', label: '> (greater than)' },
  { value: 'gte', label: '>= (greater or equal)' },
  { value: 'lt', label: '< (less than)' },
  { value: 'lte', label: '<= (less or equal)' },
  { value: 'eq', label: '= (equal)' },
];

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
  { value: 'critical', label: 'Critical' },
];

const WINDOW_OPTIONS = [
  { value: '1', label: '1 minute' },
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
];

const COOLDOWN_OPTIONS = [
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '240', label: '4 hours' },
  { value: '1440', label: '24 hours' },
];

interface CreateRuleDialogProps {
  orgId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const INITIAL_FORM = {
  name: '',
  metric: 'error_count',
  operator: 'gt',
  threshold: '10',
  window_minutes: '5',
  severity: 'warning',
  cooldown_minutes: '30',
};

export function CreateRuleDialog({ orgId, open, onOpenChange, onCreated }: CreateRuleDialogProps) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!orgId) {
      toast.error('Organization not found');
      return;
    }
    if (!form.name.trim()) {
      toast.error('Rule name is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/v1/alert-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          name: form.name.trim(),
          metric: form.metric,
          operator: form.operator,
          threshold: Number(form.threshold),
          window_minutes: Number(form.window_minutes),
          severity: form.severity,
          cooldown_minutes: Number(form.cooldown_minutes),
        }),
      });

      const data = await res.json();
      if (!data.success) {
        toast.error(data.error?.message || 'Failed to create rule');
        return;
      }

      toast.success('Alert rule created');
      setForm(INITIAL_FORM);
      onCreated();
    } catch {
      toast.error('Failed to create rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Rule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Alert Rule</DialogTitle>
          <DialogDescription>
            Configure a threshold-based alert for error monitoring
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="rule-name">Rule Name</Label>
            <Input
              id="rule-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., High error rate on auth service"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Metric</Label>
              <Select value={form.metric} onValueChange={(v) => setForm({ ...form, metric: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Time Window</Label>
              <Select
                value={form.window_minutes}
                onValueChange={(v) => setForm({ ...form, window_minutes: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOW_OPTIONS.map((w) => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Operator</Label>
              <Select
                value={form.operator}
                onValueChange={(v) => setForm({ ...form, operator: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATOR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="threshold">Threshold</Label>
              <Input
                id="threshold"
                type="number"
                min={0}
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select
                value={form.severity}
                onValueChange={(v) => setForm({ ...form, severity: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cooldown</Label>
              <Select
                value={form.cooldown_minutes}
                onValueChange={(v) => setForm({ ...form, cooldown_minutes: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COOLDOWN_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
