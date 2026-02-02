'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2 } from 'lucide-react';
import type { VolumeOption } from './types';

interface CreateServiceVolumesTabProps {
  volumeMounts: Array<{ volume_id: string; mount_path: string }>;
  addVolumeMount: () => void;
  removeVolumeMount: (index: number) => void;
  updateVolumeMount: (index: number, field: 'volume_id' | 'mount_path', value: string) => void;
  availableVolumes: VolumeOption[];
}

export function CreateServiceVolumesTab({
  volumeMounts,
  addVolumeMount,
  removeVolumeMount,
  updateVolumeMount,
  availableVolumes,
}: CreateServiceVolumesTabProps) {
  return (
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
  );
}
