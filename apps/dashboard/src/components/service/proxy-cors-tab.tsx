'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProxyTabProps } from './proxy-config-types';

interface ProxyCorsTabProps extends ProxyTabProps {
  corsOrigins: string;
  setCorsOrigins: (value: string) => void;
  corsMethods: string;
  setCorsMethods: (value: string) => void;
  corsHeaders: string;
  setCorsHeaders: (value: string) => void;
}

export function ProxyCorsTab({
  formData,
  updateField,
  corsOrigins,
  setCorsOrigins,
  corsMethods,
  setCorsMethods,
  corsHeaders,
  setCorsHeaders,
}: ProxyCorsTabProps) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="cors_enabled"
          checked={formData.cors_enabled ?? false}
          onChange={(e) => updateField('cors_enabled', e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="cors_enabled">Enable CORS</Label>
      </div>
      {formData.cors_enabled && (
        <>
          <div className="space-y-2">
            <Label htmlFor="cors_origins">Allowed Origins (comma-separated)</Label>
            <Input
              id="cors_origins"
              value={corsOrigins}
              onChange={(e) => setCorsOrigins(e.target.value)}
              placeholder="*, https://example.com"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cors_methods">Allowed Methods (comma-separated)</Label>
            <Input
              id="cors_methods"
              value={corsMethods}
              onChange={(e) => setCorsMethods(e.target.value)}
              placeholder="GET, POST, PUT, DELETE"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cors_headers">Allowed Headers (comma-separated)</Label>
            <Input
              id="cors_headers"
              value={corsHeaders}
              onChange={(e) => setCorsHeaders(e.target.value)}
              placeholder="*, Authorization, Content-Type"
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cors_max_age">Max Age (seconds)</Label>
              <Input
                id="cors_max_age"
                type="number"
                value={formData.cors_max_age || 86400}
                onChange={(e) => updateField('cors_max_age', parseInt(e.target.value) || 86400)}
              />
            </div>
            <div className="flex items-center gap-2 pt-8">
              <input
                type="checkbox"
                id="cors_allow_credentials"
                checked={formData.cors_allow_credentials ?? false}
                onChange={(e) => updateField('cors_allow_credentials', e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="cors_allow_credentials">Allow Credentials</Label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
