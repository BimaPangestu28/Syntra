'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseKeyValueText } from '@/lib/utils/format';
import { RESOURCE_PRESETS } from './types';
import type { ServerOption, VolumeOption } from './types';
import { CreateServiceBasicTab } from './create-service-basic-tab';
import { CreateServiceEnvTab } from './create-service-env-tab';
import { CreateServiceBuildTab } from './create-service-build-tab';
import { CreateServiceResourcesTab } from './create-service-resources-tab';
import { CreateServiceDomainsTab } from './create-service-domains-tab';
import { CreateServiceVolumesTab } from './create-service-volumes-tab';

interface CreateServiceDialogProps {
  projectId: string;
  orgId: string;
  servers: ServerOption[];
  availableVolumes: VolumeOption[];
  onCreated: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
            <CreateServiceBasicTab
              serviceForm={serviceForm}
              setServiceForm={setServiceForm}
              servers={servers}
            />
            <CreateServiceEnvTab
              envVarsText={envVarsText}
              setEnvVarsText={setEnvVarsText}
              secretsText={secretsText}
              setSecretsText={setSecretsText}
            />
            <CreateServiceBuildTab
              buildArgsText={buildArgsText}
              setBuildArgsText={setBuildArgsText}
            />
            <CreateServiceResourcesTab
              resourcePreset={resourcePreset}
              setResourcePreset={setResourcePreset}
              customResources={customResources}
              setCustomResources={setCustomResources}
            />
            <CreateServiceDomainsTab
              domainsText={domainsText}
              setDomainsText={setDomainsText}
            />
            <CreateServiceVolumesTab
              volumeMounts={volumeMounts}
              addVolumeMount={addVolumeMount}
              removeVolumeMount={removeVolumeMount}
              updateVolumeMount={updateVolumeMount}
              availableVolumes={availableVolumes}
            />
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
