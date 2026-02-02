'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import { Cpu, HardDrive } from 'lucide-react';
import { RESOURCE_PRESETS } from './types';

interface CreateServiceResourcesTabProps {
  resourcePreset: 'none' | 'small' | 'medium' | 'large';
  setResourcePreset: (preset: 'none' | 'small' | 'medium' | 'large') => void;
  customResources: {
    cpu_request: string;
    cpu_limit: string;
    memory_request: string;
    memory_limit: string;
  };
  setCustomResources: (resources: CreateServiceResourcesTabProps['customResources']) => void;
}

export function CreateServiceResourcesTab({
  resourcePreset,
  setResourcePreset,
  customResources,
  setCustomResources,
}: CreateServiceResourcesTabProps) {
  return (
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
  );
}
