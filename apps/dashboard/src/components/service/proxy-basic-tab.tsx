'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProxyTabProps } from './proxy-config-types';

export function ProxyBasicTab({ formData, updateField }: ProxyTabProps) {
  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Rule Name</Label>
          <Input
            id="name"
            value={formData.name || ''}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="api-route"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">Priority (higher = first)</Label>
          <Input
            id="priority"
            type="number"
            value={formData.priority || 0}
            onChange={(e) => updateField('priority', parseInt(e.target.value) || 0)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="path_pattern">Path Pattern</Label>
          <Input
            id="path_pattern"
            value={formData.path_pattern || '/'}
            onChange={(e) => updateField('path_pattern', e.target.value)}
            placeholder="/api/*"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="path_match_type">Match Type</Label>
          <Select
            value={formData.path_match_type || 'prefix'}
            onValueChange={(v) => updateField('path_match_type', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="prefix">Prefix</SelectItem>
              <SelectItem value="exact">Exact</SelectItem>
              <SelectItem value="regex">Regex</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_enabled"
          checked={formData.is_enabled ?? true}
          onChange={(e) => updateField('is_enabled', e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="is_enabled">Enable this rule</Label>
      </div>
    </div>
  );
}
