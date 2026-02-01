'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProxyTabProps } from './proxy-config-types';

export function ProxyAdvancedTab({ formData, updateField }: ProxyTabProps) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="websocket_enabled"
          checked={formData.websocket_enabled ?? false}
          onChange={(e) => updateField('websocket_enabled', e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="websocket_enabled">Enable WebSocket support</Label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="max_body_size">Max Body Size</Label>
          <Input
            id="max_body_size"
            value={formData.max_body_size || '10m'}
            onChange={(e) => updateField('max_body_size', e.target.value)}
            placeholder="10m, 100m, 1g"
            className="font-mono"
          />
        </div>
        <div className="flex items-center gap-2 pt-8">
          <input
            type="checkbox"
            id="buffering_enabled"
            checked={formData.buffering_enabled ?? true}
            onChange={(e) => updateField('buffering_enabled', e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="buffering_enabled">Enable response buffering</Label>
        </div>
      </div>
    </div>
  );
}
