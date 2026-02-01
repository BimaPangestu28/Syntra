'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProxyTabProps } from './proxy-config-types';

export function ProxyUpstreamTab({ formData, updateField }: ProxyTabProps) {
  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="upstream_port">Upstream Port (optional)</Label>
          <Input
            id="upstream_port"
            type="number"
            value={formData.upstream_port || ''}
            onChange={(e) => updateField('upstream_port', e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="8080"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="upstream_path">Upstream Path (optional)</Label>
          <Input
            id="upstream_path"
            value={formData.upstream_path || ''}
            onChange={(e) => updateField('upstream_path', e.target.value || undefined)}
            placeholder="/v2/api"
            className="font-mono"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="strip_path_prefix"
          checked={formData.strip_path_prefix ?? false}
          onChange={(e) => updateField('strip_path_prefix', e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="strip_path_prefix">Strip path prefix before forwarding</Label>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="connect_timeout">Connect Timeout (s)</Label>
          <Input
            id="connect_timeout"
            type="number"
            value={formData.connect_timeout || 60}
            onChange={(e) => updateField('connect_timeout', parseInt(e.target.value) || 60)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="read_timeout">Read Timeout (s)</Label>
          <Input
            id="read_timeout"
            type="number"
            value={formData.read_timeout || 60}
            onChange={(e) => updateField('read_timeout', parseInt(e.target.value) || 60)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="send_timeout">Send Timeout (s)</Label>
          <Input
            id="send_timeout"
            type="number"
            value={formData.send_timeout || 60}
            onChange={(e) => updateField('send_timeout', parseInt(e.target.value) || 60)}
          />
        </div>
      </div>
    </div>
  );
}
