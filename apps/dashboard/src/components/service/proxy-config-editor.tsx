'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  Trash2,
  Edit2,
  Save,
  AlertCircle,
  Network,
  Shield,
  Clock,
  Globe,
  Lock,
  Zap,
  Settings,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import type { ProxyConfig } from './proxy-config-types';
import { defaultConfig } from './proxy-config-types';
import { ProxyBasicTab } from './proxy-basic-tab';
import { ProxyUpstreamTab } from './proxy-upstream-tab';
import { ProxyRatelimitTab } from './proxy-ratelimit-tab';
import { ProxyCorsTab } from './proxy-cors-tab';
import { ProxySecurityTab } from './proxy-security-tab';
import { ProxyAdvancedTab } from './proxy-advanced-tab';

interface ProxyConfigEditorProps {
  serviceId: string;
  canEdit: boolean;
  onSave?: () => void;
}

export function ProxyConfigEditor({
  serviceId,
  canEdit,
  onSave,
}: ProxyConfigEditorProps) {
  const { confirm } = useConfirm();
  const [configs, setConfigs] = useState<ProxyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ProxyConfig | null>(null);
  const [formData, setFormData] = useState<Partial<ProxyConfig>>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CORS arrays as comma-separated strings for easy editing
  const [corsOrigins, setCorsOrigins] = useState('*');
  const [corsMethods, setCorsMethods] = useState('GET, POST, PUT, DELETE, OPTIONS');
  const [corsHeaders, setCorsHeaders] = useState('*');
  const [corsExposeHeaders, setCorsExposeHeaders] = useState('');
  const [ipWhitelist, setIpWhitelist] = useState('');
  const [ipBlacklist, setIpBlacklist] = useState('');

  useEffect(() => {
    fetchConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  async function fetchConfigs() {
    try {
      const res = await fetch(`/api/v1/services/${serviceId}/proxy`);
      const data = await res.json();
      if (data.success) {
        setConfigs(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch proxy configs:', error);
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingConfig(null);
    setFormData(defaultConfig);
    setCorsOrigins('*');
    setCorsMethods('GET, POST, PUT, DELETE, OPTIONS');
    setCorsHeaders('*');
    setCorsExposeHeaders('');
    setIpWhitelist('');
    setIpBlacklist('');
    setError(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(config: ProxyConfig) {
    setEditingConfig(config);
    setFormData(config);
    setCorsOrigins(config.cors_allow_origins?.join(', ') || '*');
    setCorsMethods(config.cors_allow_methods?.join(', ') || '');
    setCorsHeaders(config.cors_allow_headers?.join(', ') || '*');
    setCorsExposeHeaders(config.cors_expose_headers?.join(', ') || '');
    setIpWhitelist(config.ip_whitelist?.join(', ') || '');
    setIpBlacklist(config.ip_blacklist?.join(', ') || '');
    setError(null);
    setIsDialogOpen(true);
  }

  async function handleSave() {
    if (!formData.name?.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    setError(null);

    // Convert comma-separated strings to arrays
    const payload = {
      ...formData,
      cors_allow_origins: corsOrigins.split(',').map((s) => s.trim()).filter(Boolean),
      cors_allow_methods: corsMethods.split(',').map((s) => s.trim()).filter(Boolean),
      cors_allow_headers: corsHeaders.split(',').map((s) => s.trim()).filter(Boolean),
      cors_expose_headers: corsExposeHeaders.split(',').map((s) => s.trim()).filter(Boolean),
      ip_whitelist: ipWhitelist ? ipWhitelist.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      ip_blacklist: ipBlacklist ? ipBlacklist.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    };

    try {
      const url = editingConfig
        ? `/api/v1/services/${serviceId}/proxy/${editingConfig.id}`
        : `/api/v1/services/${serviceId}/proxy`;

      const res = await fetch(url, {
        method: editingConfig ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setIsDialogOpen(false);
        fetchConfigs();
        onSave?.();
        toast.success(editingConfig ? 'Proxy rule updated' : 'Proxy rule created');
      } else {
        setError(data.error?.message || 'Failed to save proxy configuration');
      }
    } catch (e) {
      setError('Failed to save proxy configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(configId: string, configName: string) {
    const ok = await confirm({ title: 'Delete Proxy Rule', description: `Are you sure you want to delete ${configName}?`, confirmLabel: 'Delete', variant: 'destructive' });
    if (!ok) return;

    try {
      const res = await fetch(`/api/v1/services/${serviceId}/proxy/${configId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchConfigs();
        onSave?.();
        toast.success('Proxy rule deleted');
      } else {
        const data = await res.json();
        setError(data.error?.message || 'Failed to delete proxy configuration');
      }
    } catch (e) {
      setError('Failed to delete proxy configuration');
    }
  }

  async function handleToggleEnabled(config: ProxyConfig) {
    try {
      const res = await fetch(`/api/v1/services/${serviceId}/proxy/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !config.is_enabled }),
      });

      if (res.ok) {
        fetchConfigs();
        onSave?.();
        toast.success(config.is_enabled ? 'Rule disabled' : 'Rule enabled');
      }
    } catch (e) {
      console.error('Failed to toggle proxy config:', e);
    }
  }

  const updateField = (field: keyof ProxyConfig, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Proxy Configuration
          </CardTitle>
          <CardDescription>
            Configure reverse proxy rules, CORS, rate limiting, and security
          </CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Rule
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-destructive/10 rounded-md text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : configs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Network className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No proxy rules configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add rules to customize routing, CORS, rate limiting, and more
            </p>
            {canEdit && (
              <Button className="mt-4" onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Rule
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Features</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="font-medium">{config.name}</TableCell>
                  <TableCell>
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {config.path_pattern}
                    </code>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({config.path_match_type})
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {config.rate_limit_enabled && (
                        <Badge variant="outline" className="text-xs">Rate Limit</Badge>
                      )}
                      {config.cors_enabled && (
                        <Badge variant="outline" className="text-xs">CORS</Badge>
                      )}
                      {config.basic_auth_enabled && (
                        <Badge variant="outline" className="text-xs">Auth</Badge>
                      )}
                      {config.websocket_enabled && (
                        <Badge variant="outline" className="text-xs">WS</Badge>
                      )}
                      {(config.ip_whitelist?.length ?? 0) > 0 && (
                        <Badge variant="outline" className="text-xs">IP Filter</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleEnabled(config)}
                      disabled={!canEdit}
                    >
                      {config.is_enabled ? (
                        <ToggleRight className="h-5 w-5 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(config)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(config.id, config.name)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingConfig ? 'Edit Proxy Rule' : 'Create Proxy Rule'}
              </DialogTitle>
              <DialogDescription>
                Configure routing, headers, rate limiting, CORS, and security settings
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="basic">
                  <Settings className="h-4 w-4 mr-1" />
                  Basic
                </TabsTrigger>
                <TabsTrigger value="upstream">
                  <Zap className="h-4 w-4 mr-1" />
                  Upstream
                </TabsTrigger>
                <TabsTrigger value="ratelimit">
                  <Clock className="h-4 w-4 mr-1" />
                  Rate Limit
                </TabsTrigger>
                <TabsTrigger value="cors">
                  <Globe className="h-4 w-4 mr-1" />
                  CORS
                </TabsTrigger>
                <TabsTrigger value="security">
                  <Shield className="h-4 w-4 mr-1" />
                  Security
                </TabsTrigger>
                <TabsTrigger value="advanced">
                  <Lock className="h-4 w-4 mr-1" />
                  Advanced
                </TabsTrigger>
              </TabsList>

              <TabsContent value="basic">
                <ProxyBasicTab formData={formData} updateField={updateField} />
              </TabsContent>

              <TabsContent value="upstream">
                <ProxyUpstreamTab formData={formData} updateField={updateField} />
              </TabsContent>

              <TabsContent value="ratelimit">
                <ProxyRatelimitTab formData={formData} updateField={updateField} />
              </TabsContent>

              <TabsContent value="cors">
                <ProxyCorsTab
                  formData={formData}
                  updateField={updateField}
                  corsOrigins={corsOrigins}
                  setCorsOrigins={setCorsOrigins}
                  corsMethods={corsMethods}
                  setCorsMethods={setCorsMethods}
                  corsHeaders={corsHeaders}
                  setCorsHeaders={setCorsHeaders}
                />
              </TabsContent>

              <TabsContent value="security">
                <ProxySecurityTab
                  formData={formData}
                  updateField={updateField}
                  editingConfig={editingConfig}
                  ipWhitelist={ipWhitelist}
                  setIpWhitelist={setIpWhitelist}
                  ipBlacklist={ipBlacklist}
                  setIpBlacklist={setIpBlacklist}
                />
              </TabsContent>

              <TabsContent value="advanced">
                <ProxyAdvancedTab formData={formData} updateField={updateField} />
              </TabsContent>
            </Tabs>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-md text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
