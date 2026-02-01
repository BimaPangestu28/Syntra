'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProxyTabProps } from './proxy-config-types';

export function ProxyRatelimitTab({ formData, updateField }: ProxyTabProps) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="rate_limit_enabled"
          checked={formData.rate_limit_enabled ?? false}
          onChange={(e) => updateField('rate_limit_enabled', e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="rate_limit_enabled">Enable rate limiting</Label>
      </div>
      {formData.rate_limit_enabled && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="rate_limit_requests">Max Requests</Label>
            <Input
              id="rate_limit_requests"
              type="number"
              value={formData.rate_limit_requests || 100}
              onChange={(e) => updateField('rate_limit_requests', parseInt(e.target.value) || 100)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rate_limit_window">Time Window (seconds)</Label>
            <Input
              id="rate_limit_window"
              type="number"
              value={formData.rate_limit_window || 60}
              onChange={(e) => updateField('rate_limit_window', parseInt(e.target.value) || 60)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
