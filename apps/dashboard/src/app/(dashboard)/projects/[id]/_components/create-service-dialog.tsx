'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Cpu,
  HardDrive,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { RESOURCE_PRESETS } from './types';
import type { ServerOption, VolumeOption } from './types';

interface CreateServiceDialogProps {
  projectId: string;
  orgId: string;
  servers: ServerOption[];
  availableVolumes: VolumeOption[];
  onCreated: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parseKeyValueText(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  text.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (key) result[key] = value;
    }
  });
  return result;
}

function parseDomainsText(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

export function CreateServiceDialog({
  projectId,
  orgId,
  servers,
  availableVolumes,
  onCreated,
  open,
  onOpenChange,
}: CreateServiceDialogProps) {
  const [creating, setCreating] = useState(false);
  const [serviceForm, setServiceForm] = useState({
    name: '',
    type: 'web',
    source_type: 'git',
    docker_image: '',
    dockerfile_path: 'Dockerfile',
    port: 3000,
    expose_enabled: false,
    expose_port: '',
    replicas: 1,
    server_id: '',
    health_check_path: '/',
  });
  const [envVarsText, setEnvVarsText] = useState('');
  const [secretsText, setSecretsText] = useState('');
  const [buildArgsText, setBuildArgsText] = useState('');
  const [domainsText, setDomainsText] = useState('');
  const [volumeMounts, setVolumeMounts] = useState<Array<{ volume_id: string; mount_path: string }>>([]);
  const [resourcePreset, setResourcePreset] = useState<'none' | 'small' | 'medium' | 'large'>('none');
  const [customResources, setCustomResources] = useState({
    cpu_request: '',
    cpu_limit: '',
    memory_request: '',
    memory_limit: '',
  });

  function resetForm() {
    setServiceForm({
      name: '',
      type: 'web',
      source_type: 'git',
      docker_image: '',
      dockerfile_path: 'Dockerfile',
      port: 3000,
      expose_enabled: false,
      expose_port: '',
      replicas: 1,
      server_id: '',
      health_check_path: '/',
    });
    setEnvVarsText('');
    setSecretsText('');
    setBuildArgsText('');
    setDomainsText('');
    setVolumeMounts([]);
    setResourcePreset('none');
    setCustomResources({
      cpu_request: '',
      cpu_limit: '',
      memory_request: '',
      memory_limit: '',
    });
  }

  function addVolumeMount() {
    setVolumeMounts([...volumeMounts, { volume_id: '', mount_path: '' }]);
  }

  function removeVolumeMount(index: number) {
    setVolumeMounts(volumeMounts.filter((_, i) => i !== index));
  }

  function updateVolumeMount(index: number, field: 'volume_id' | 'mount_path', value: string) {
    const updated = [...volumeMounts];
    updated[index][field] = value;
    setVolumeMounts(updated);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  async function handleCreateService() {
    setCreating(true);
    try {
      const envVarsObj = parseKeyValueText(envVarsText);
      const secretsObj = parseKeyValueText(secretsText);
      const buildArgsObj = parseKeyValueText(buildArgsText);
      const domainsList = parseDomainsText(domainsText);

      let resources = undefined;
      if (resourcePreset !== 'none') {
        resources = RESOURCE_PRESETS[resourcePreset];
      } else if (customResources.cpu_limit || customResources.memory_limit) {
        resources = {
          cpu_request: customResources.cpu_request || undefined,
          cpu_limit: customResources.cpu_limit || undefined,
          memory_request: customResources.memory_request || undefined,
          memory_limit: customResources.memory_limit || undefined,
        };
      }

      const res = await fetch('/api/v1/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: serviceForm.name,
          type: serviceForm.type,
          source_type: serviceForm.source_type,
          docker_image: serviceForm.docker_image || undefined,
          dockerfile_path: serviceForm.dockerfile_path,
          port: serviceForm.port,
          expose_enabled: serviceForm.expose_enabled,
          expose_port: serviceForm.expose_port ? parseInt(serviceForm.expose_port) : undefined,
          replicas: serviceForm.replicas,
          server_id: serviceForm.server_id || undefined,
          health_check_path: serviceForm.health_check_path,
          env_vars: Object.keys(envVarsObj).length > 0 ? envVarsObj : undefined,
          build_args: Object.keys(buildArgsObj).length > 0 ? buildArgsObj : undefined,
          resources,
        }),
      });
      const data = await res.json();

      if (data.success) {
        const serviceId = data.data.id;

        // Create secrets (encrypted)
        if (orgId) {
          for (const [name, value] of Object.entries(secretsObj)) {
            try {
              await fetch('/api/v1/vault', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  org_id: orgId,
                  service_id: serviceId,
                  name,
                  value,
                }),
              });
            } catch (err) {
              console.error('Failed to create secret:', name, err);
            }
          }
        }

        // Create domains
        for (const domain of domainsList) {
          try {
            await fetch('/api/v1/domains', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                service_id: serviceId,
                domain: domain,
              }),
            });
          } catch (err) {
            console.error('Failed to create domain:', domain, err);
          }
        }

        // Attach volumes
        for (const mount of volumeMounts) {
          if (mount.volume_id && mount.mount_path) {
            try {
              await fetch(`/api/v1/services/${serviceId}/volumes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  volume_id: mount.volume_id,
                  mount_path: mount.mount_path,
                }),
              });
            } catch (err) {
              console.error('Failed to attach volume:', mount, err);
            }
          }
        }

        handleOpenChange(false);
        onCreated();
        toast.success('Service created');
      }
    } catch (error) {
      console.error('Failed to create service:', error);
      toast.error('Failed to create service');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Service
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Service</DialogTitle>
          <DialogDescription>
            Configure your new service. Only the basic settings are required.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="basic" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="env">Env</TabsTrigger>
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="resources">Resources</TabsTrigger>
            <TabsTrigger value="domains">Domains</TabsTrigger>
            <TabsTrigger value="volumes">Volumes</TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto py-4">
            {/* Basic Settings Tab */}
            <TabsContent value="basic" className="mt-0 space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="service-name">Service Name *</Label>
                <Input
                  id="service-name"
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                  placeholder="api-server"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Select
                    value={serviceForm.type}
                    onValueChange={(v) => setServiceForm({ ...serviceForm, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="web">Web</SelectItem>
                      <SelectItem value="api">API</SelectItem>
                      <SelectItem value="worker">Worker</SelectItem>
                      <SelectItem value="cron">Cron</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Source</Label>
                  <Select
                    value={serviceForm.source_type}
                    onValueChange={(v) => setServiceForm({ ...serviceForm, source_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="git">Git (Dockerfile)</SelectItem>
                      <SelectItem value="docker_image">Docker Image</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {serviceForm.source_type === 'docker_image' && (
                <div className="grid gap-2">
                  <Label htmlFor="docker-image">Docker Image</Label>
                  <Input
                    id="docker-image"
                    value={serviceForm.docker_image}
                    onChange={(e) => setServiceForm({ ...serviceForm, docker_image: e.target.value })}
                    placeholder="nginx:latest"
                  />
                </div>
              )}
              {serviceForm.source_type === 'git' && (
                <div className="grid gap-2">
                  <Label htmlFor="dockerfile-path">Dockerfile Path</Label>
                  <Input
                    id="dockerfile-path"
                    value={serviceForm.dockerfile_path}
                    onChange={(e) => setServiceForm({ ...serviceForm, dockerfile_path: e.target.value })}
                    placeholder="Dockerfile"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={serviceForm.port}
                    onChange={(e) => setServiceForm({ ...serviceForm, port: parseInt(e.target.value) || 3000 })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="replicas">Replicas</Label>
                  <Input
                    id="replicas"
                    type="number"
                    min={1}
                    max={10}
                    value={serviceForm.replicas}
                    onChange={(e) => setServiceForm({ ...serviceForm, replicas: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="health-check">Health Check Path</Label>
                <Input
                  id="health-check"
                  value={serviceForm.health_check_path}
                  onChange={(e) => setServiceForm({ ...serviceForm, health_check_path: e.target.value })}
                  placeholder="/"
                />
              </div>
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Expose Port</Label>
                    <p className="text-xs text-muted-foreground">Access via server IP without domain</p>
                  </div>
                  <Button
                    type="button"
                    variant={serviceForm.expose_enabled ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setServiceForm({
                      ...serviceForm,
                      expose_enabled: !serviceForm.expose_enabled,
                      expose_port: !serviceForm.expose_enabled ? String(serviceForm.port) : ''
                    })}
                  >
                    {serviceForm.expose_enabled ? 'Enabled' : 'Disabled'}
                  </Button>
                </div>
                {serviceForm.expose_enabled && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="expose-port" className="shrink-0 text-sm">External Port:</Label>
                    <Input
                      id="expose-port"
                      type="number"
                      min={1}
                      max={65535}
                      value={serviceForm.expose_port}
                      onChange={(e) => setServiceForm({ ...serviceForm, expose_port: e.target.value })}
                      placeholder="8080"
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">
                      → container:{serviceForm.port}
                    </span>
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <Label>Deploy Server</Label>
                <Select
                  value={serviceForm.server_id}
                  onValueChange={(v) => setServiceForm({ ...serviceForm, server_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a server (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((server) => (
                      <SelectItem key={server.id} value={server.id}>
                        {server.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* Environment Variables Tab */}
            <TabsContent value="env" className="mt-0 space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div>
                    <h4 className="text-sm font-medium">Environment Variables</h4>
                    <p className="text-xs text-muted-foreground">Non-sensitive values, stored as plain text</p>
                  </div>
                  <Textarea
                    value={envVarsText}
                    onChange={(e) => setEnvVarsText(e.target.value)}
                    placeholder={`NODE_ENV=production
LOG_LEVEL=info
# Lines starting with # are ignored`}
                    className="font-mono text-sm min-h-[100px]"
                  />
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <div className="flex items-start gap-2">
                    <div className="p-1.5 rounded bg-yellow-500/10">
                      <svg className="h-4 w-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium">Secrets (Encrypted)</h4>
                      <p className="text-xs text-muted-foreground">Sensitive values like API keys, passwords - stored with AES-256 encryption</p>
                    </div>
                  </div>
                  <Textarea
                    value={secretsText}
                    onChange={(e) => setSecretsText(e.target.value)}
                    placeholder={`DATABASE_URL=postgresql://user:password@host:5432/db
API_KEY=sk-xxxxxxxxxxxx
# Secrets are encrypted at rest`}
                    className="font-mono text-sm min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    At runtime, access via <code className="bg-muted px-1 rounded">process.env.SECRET_NAME</code>
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Build Arguments Tab */}
            <TabsContent value="build" className="mt-0 space-y-4">
              <div>
                <h4 className="text-sm font-medium">Build Arguments</h4>
                <p className="text-xs text-muted-foreground">Docker build-time arguments (ARG in Dockerfile), format: KEY=value</p>
              </div>
              <Textarea
                value={buildArgsText}
                onChange={(e) => setBuildArgsText(e.target.value)}
                placeholder={`NODE_VERSION=18
NPM_TOKEN=your-token
# Lines starting with # are ignored`}
                className="font-mono text-sm min-h-[200px]"
              />
            </TabsContent>

            {/* Resources Tab */}
            <TabsContent value="resources" className="mt-0 space-y-4">
              <div>
                <h4 className="text-sm font-medium">Resource Limits</h4>
                <p className="text-xs text-muted-foreground">CPU and memory allocation for containers</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Button
                  type="button"
                  variant={resourcePreset === 'none' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setResourcePreset('none')}
                >
                  None
                </Button>
                <Button
                  type="button"
                  variant={resourcePreset === 'small' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setResourcePreset('small')}
                >
                  Small
                </Button>
                <Button
                  type="button"
                  variant={resourcePreset === 'medium' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setResourcePreset('medium')}
                >
                  Medium
                </Button>
                <Button
                  type="button"
                  variant={resourcePreset === 'large' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setResourcePreset('large')}
                >
                  Large
                </Button>
              </div>
              {resourcePreset !== 'none' && (
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      <span>CPU: {RESOURCE_PRESETS[resourcePreset].cpu_request} - {RESOURCE_PRESETS[resourcePreset].cpu_limit}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                      <span>Memory: {RESOURCE_PRESETS[resourcePreset].memory_request} - {RESOURCE_PRESETS[resourcePreset].memory_limit}</span>
                    </div>
                  </div>
                </div>
              )}
              {resourcePreset === 'none' && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Or set custom values (Kubernetes format: 100m, 0.5, 256Mi, 1Gi)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="cpu-request">CPU Request</Label>
                      <Input
                        id="cpu-request"
                        value={customResources.cpu_request}
                        onChange={(e) => setCustomResources({ ...customResources, cpu_request: e.target.value })}
                        placeholder="100m"
                        className="font-mono"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cpu-limit">CPU Limit</Label>
                      <Input
                        id="cpu-limit"
                        value={customResources.cpu_limit}
                        onChange={(e) => setCustomResources({ ...customResources, cpu_limit: e.target.value })}
                        placeholder="500m"
                        className="font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="memory-request">Memory Request</Label>
                      <Input
                        id="memory-request"
                        value={customResources.memory_request}
                        onChange={(e) => setCustomResources({ ...customResources, memory_request: e.target.value })}
                        placeholder="128Mi"
                        className="font-mono"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="memory-limit">Memory Limit</Label>
                      <Input
                        id="memory-limit"
                        value={customResources.memory_limit}
                        onChange={(e) => setCustomResources({ ...customResources, memory_limit: e.target.value })}
                        placeholder="256Mi"
                        className="font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Domains Tab */}
            <TabsContent value="domains" className="mt-0 space-y-4">
              <div>
                <h4 className="text-sm font-medium">Custom Domains</h4>
                <p className="text-xs text-muted-foreground">One domain per line. You can verify and configure SSL after creation.</p>
              </div>
              <Textarea
                value={domainsText}
                onChange={(e) => setDomainsText(e.target.value)}
                placeholder={`api.example.com
app.example.com
# Lines starting with # are ignored`}
                className="font-mono text-sm min-h-[150px]"
              />
              <div className="p-3 bg-muted rounded-lg text-sm">
                <div className="flex items-start gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">After creation:</p>
                    <ul className="text-muted-foreground text-xs mt-1 list-disc list-inside">
                      <li>Add DNS records pointing to your server</li>
                      <li>Verify domain ownership</li>
                      <li>SSL certificates will be auto-provisioned</li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Volumes Tab */}
            <TabsContent value="volumes" className="mt-0 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Volume Mounts</h4>
                  <p className="text-xs text-muted-foreground">Attach persistent storage to your service</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addVolumeMount}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Mount
                </Button>
              </div>
              {volumeMounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
                  {availableVolumes.length === 0 ? (
                    <div>
                      <p>No volumes available.</p>
                      <p className="text-xs mt-1">Create volumes in the Volumes section first.</p>
                    </div>
                  ) : (
                    <p>No volumes attached. Click &quot;Add Mount&quot; to attach one.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {volumeMounts.map((mount, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <div className="flex-1 grid gap-2">
                        <Select
                          value={mount.volume_id}
                          onValueChange={(v) => updateVolumeMount(index, 'volume_id', v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select volume" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableVolumes.map((vol) => (
                              <SelectItem key={vol.id} value={vol.id}>
                                {vol.name} ({vol.size_gb}GB)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Input
                          placeholder="/data"
                          value={mount.mount_path}
                          onChange={(e) => updateVolumeMount(index, 'mount_path', e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeVolumeMount(index)}
                        className="shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateService} disabled={!serviceForm.name || creating}>
            {creating ? 'Creating...' : 'Create Service'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
