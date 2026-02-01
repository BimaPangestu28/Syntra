'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cpu, HardDrive, AlertCircle, Save, RotateCcw } from 'lucide-react';

interface Resources {
  cpu_limit?: string;
  memory_limit?: string;
  cpu_request?: string;
  memory_request?: string;
}

interface ResourceEditorProps {
  serviceId: string;
  initialResources: Resources | null;
  canEdit: boolean;
  onSave?: () => void;
}

const PRESETS = {
  small: {
    cpu_request: '100m',
    cpu_limit: '500m',
    memory_request: '128Mi',
    memory_limit: '256Mi',
  },
  medium: {
    cpu_request: '250m',
    cpu_limit: '1',
    memory_request: '256Mi',
    memory_limit: '512Mi',
  },
  large: {
    cpu_request: '500m',
    cpu_limit: '2',
    memory_request: '512Mi',
    memory_limit: '1Gi',
  },
};

// Validate Kubernetes CPU format (e.g., 100m, 0.5, 1, 2)
function validateCpu(value: string): boolean {
  if (!value) return true;
  return /^(\d+\.?\d*|\d*\.?\d+)(m)?$/.test(value);
}

// Validate Kubernetes memory format (e.g., 128Mi, 1Gi, 512M, 1G)
function validateMemory(value: string): boolean {
  if (!value) return true;
  return /^(\d+\.?\d*|\d*\.?\d+)(Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)?$/.test(value);
}

export function ResourceEditor({
  serviceId,
  initialResources,
  canEdit,
  onSave,
}: ResourceEditorProps) {
  const [resources, setResources] = useState<Resources>(initialResources || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleInputChange = (field: keyof Resources, value: string) => {
    setResources((prev) => ({ ...prev, [field]: value || undefined }));
    setHasChanges(true);
    setSuccess(false);
    setError(null);
  };

  const applyPreset = (preset: keyof typeof PRESETS) => {
    setResources(PRESETS[preset]);
    setHasChanges(true);
    setSuccess(false);
    setError(null);
  };

  const resetResources = () => {
    setResources({});
    setHasChanges(true);
    setSuccess(false);
    setError(null);
  };

  const handleSave = async () => {
    // Validate all fields
    if (!validateCpu(resources.cpu_request || '')) {
      setError('Invalid CPU request format. Use formats like: 100m, 0.5, 1, 2');
      return;
    }
    if (!validateCpu(resources.cpu_limit || '')) {
      setError('Invalid CPU limit format. Use formats like: 100m, 0.5, 1, 2');
      return;
    }
    if (!validateMemory(resources.memory_request || '')) {
      setError('Invalid memory request format. Use formats like: 128Mi, 256M, 1Gi, 1G');
      return;
    }
    if (!validateMemory(resources.memory_limit || '')) {
      setError('Invalid memory limit format. Use formats like: 128Mi, 256M, 1Gi, 1G');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Clean up empty values
      const cleanResources: Resources = {};
      if (resources.cpu_request) cleanResources.cpu_request = resources.cpu_request;
      if (resources.cpu_limit) cleanResources.cpu_limit = resources.cpu_limit;
      if (resources.memory_request) cleanResources.memory_request = resources.memory_request;
      if (resources.memory_limit) cleanResources.memory_limit = resources.memory_limit;

      const res = await fetch(`/api/v1/services/${serviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resources: Object.keys(cleanResources).length > 0 ? cleanResources : null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setHasChanges(false);
        setSuccess(true);
        onSave?.();
      } else {
        setError(data.error?.message || 'Failed to save resource configuration');
      }
    } catch (e) {
      setError('Failed to save resource configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              Resource Limits
            </CardTitle>
            <CardDescription>
              Configure CPU and memory limits for this service
            </CardDescription>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetResources}
                disabled={saving}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-md text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-md text-sm text-green-600">
            Resource configuration saved successfully
          </div>
        )}

        {/* Presets */}
        {canEdit && (
          <div className="space-y-2">
            <Label className="text-muted-foreground">Quick Presets</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyPreset('small')}
                disabled={saving}
              >
                Small
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyPreset('medium')}
                disabled={saving}
              >
                Medium
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyPreset('large')}
                disabled={saving}
              >
                Large
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Small: 100m-500m CPU, 128Mi-256Mi RAM | Medium: 250m-1 CPU, 256Mi-512Mi RAM | Large: 500m-2 CPU, 512Mi-1Gi RAM
            </p>
          </div>
        )}

        {/* CPU Configuration */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <Label className="font-medium">CPU</Label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpu_request" className="text-sm text-muted-foreground">
                Request (guaranteed)
              </Label>
              <Input
                id="cpu_request"
                value={resources.cpu_request || ''}
                onChange={(e) => handleInputChange('cpu_request', e.target.value)}
                placeholder="e.g., 100m or 0.5"
                disabled={!canEdit || saving}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpu_limit" className="text-sm text-muted-foreground">
                Limit (maximum)
              </Label>
              <Input
                id="cpu_limit"
                value={resources.cpu_limit || ''}
                onChange={(e) => handleInputChange('cpu_limit', e.target.value)}
                placeholder="e.g., 500m or 1"
                disabled={!canEdit || saving}
                className="font-mono"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            CPU is measured in cores. Use &quot;m&quot; suffix for millicores (1000m = 1 core)
          </p>
        </div>

        {/* Memory Configuration */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <Label className="font-medium">Memory</Label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="memory_request" className="text-sm text-muted-foreground">
                Request (guaranteed)
              </Label>
              <Input
                id="memory_request"
                value={resources.memory_request || ''}
                onChange={(e) => handleInputChange('memory_request', e.target.value)}
                placeholder="e.g., 128Mi or 256M"
                disabled={!canEdit || saving}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memory_limit" className="text-sm text-muted-foreground">
                Limit (maximum)
              </Label>
              <Input
                id="memory_limit"
                value={resources.memory_limit || ''}
                onChange={(e) => handleInputChange('memory_limit', e.target.value)}
                placeholder="e.g., 512Mi or 1Gi"
                disabled={!canEdit || saving}
                className="font-mono"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Memory units: Ki (kibibytes), Mi (mebibytes), Gi (gibibytes), or K, M, G
          </p>
        </div>

        {/* Current values summary */}
        {(resources.cpu_request || resources.cpu_limit || resources.memory_request || resources.memory_limit) && (
          <div className="pt-4 border-t">
            <Label className="text-sm text-muted-foreground">Current Configuration</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {resources.cpu_request && (
                <Badge variant="outline">CPU Request: {resources.cpu_request}</Badge>
              )}
              {resources.cpu_limit && (
                <Badge variant="outline">CPU Limit: {resources.cpu_limit}</Badge>
              )}
              {resources.memory_request && (
                <Badge variant="outline">Memory Request: {resources.memory_request}</Badge>
              )}
              {resources.memory_limit && (
                <Badge variant="outline">Memory Limit: {resources.memory_limit}</Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
