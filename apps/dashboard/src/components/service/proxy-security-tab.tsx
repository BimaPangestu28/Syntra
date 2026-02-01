'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProxyConfig, ProxyTabProps } from './proxy-config-types';

interface ProxySecurityTabProps extends ProxyTabProps {
  editingConfig: ProxyConfig | null;
  ipWhitelist: string;
  setIpWhitelist: (value: string) => void;
  ipBlacklist: string;
  setIpBlacklist: (value: string) => void;
}

export function ProxySecurityTab({
  formData,
  updateField,
  editingConfig,
  ipWhitelist,
  setIpWhitelist,
  ipBlacklist,
  setIpBlacklist,
}: ProxySecurityTabProps) {
  return (
    <div className="space-y-4 pt-4">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="basic_auth_enabled"
            checked={formData.basic_auth_enabled ?? false}
            onChange={(e) => updateField('basic_auth_enabled', e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="basic_auth_enabled">Enable Basic Authentication</Label>
        </div>
        {formData.basic_auth_enabled && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="basic_auth_username">Username</Label>
              <Input
                id="basic_auth_username"
                value={formData.basic_auth_username || ''}
                onChange={(e) => updateField('basic_auth_username', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="basic_auth_password">Password</Label>
              <Input
                id="basic_auth_password"
                type="password"
                placeholder={editingConfig ? '(unchanged)' : ''}
                onChange={(e) => updateField('basic_auth_password' as any, e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="ip_whitelist">IP Whitelist (comma-separated, leave empty to allow all)</Label>
        <Input
          id="ip_whitelist"
          value={ipWhitelist}
          onChange={(e) => setIpWhitelist(e.target.value)}
          placeholder="10.0.0.0/8, 192.168.1.1"
          className="font-mono"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ip_blacklist">IP Blacklist (comma-separated)</Label>
        <Input
          id="ip_blacklist"
          value={ipBlacklist}
          onChange={(e) => setIpBlacklist(e.target.value)}
          placeholder="1.2.3.4, 5.6.7.0/24"
          className="font-mono"
        />
      </div>
    </div>
  );
}
