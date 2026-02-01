'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HardDrive, AlertCircle } from 'lucide-react';

import { VolumeAttachDialog } from './volume-attach-dialog';
import { VolumeCreateDialog } from './volume-create-dialog';
import { VolumeTable } from './volume-table';

interface Volume {
  id: string;
  name: string;
  size_gb: number;
  status: string;
  storage_class?: string;
  server?: {
    id: string;
    name: string;
  } | null;
}

interface AttachedVolume {
  id: string;
  volume_id: string;
  mount_path: string;
  sub_path?: string;
  read_only: boolean;
  volume: {
    id: string;
    name: string;
    size_gb: number;
    status: string;
    storage_class?: string;
    server?: {
      id: string;
      name: string;
    } | null;
  };
  created_at: string;
}

interface VolumeManagerProps {
  serviceId: string;
  orgId: string;
  canEdit: boolean;
  onSave?: () => void;
}

export function VolumeManager({
  serviceId,
  orgId,
  canEdit,
  onSave,
}: VolumeManagerProps) {
  const { confirm } = useConfirm();
  const [attachedVolumes, setAttachedVolumes] = useState<AttachedVolume[]>([]);
  const [availableVolumes, setAvailableVolumes] = useState<Volume[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAttachDialogOpen, setIsAttachDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attach form state
  const [selectedVolumeId, setSelectedVolumeId] = useState('');
  const [mountPath, setMountPath] = useState('');
  const [subPath, setSubPath] = useState('');
  const [readOnly, setReadOnly] = useState(false);

  // Create form state
  const [newVolumeName, setNewVolumeName] = useState('');
  const [newVolumeSize, setNewVolumeSize] = useState('10');
  const [newVolumeMountPath, setNewVolumeMountPath] = useState('');

  useEffect(() => {
    fetchAttachedVolumes();
    fetchAvailableVolumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  async function fetchAttachedVolumes() {
    try {
      const res = await fetch(`/api/v1/services/${serviceId}/volumes`);
      const data = await res.json();
      if (data.success) {
        setAttachedVolumes(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch attached volumes:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAvailableVolumes() {
    try {
      const res = await fetch(`/api/v1/volumes?org_id=${orgId}`);
      const data = await res.json();
      if (data.success) {
        const attachedIds = attachedVolumes.map((v) => v.volume_id);
        setAvailableVolumes(data.data.filter((v: Volume) => !attachedIds.includes(v.id)));
      }
    } catch (error) {
      console.error('Failed to fetch available volumes:', error);
    }
  }

  async function handleAttachVolume() {
    if (!selectedVolumeId || !mountPath) {
      setError('Please select a volume and enter a mount path');
      return;
    }
    if (!mountPath.startsWith('/')) {
      setError('Mount path must start with /');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/services/${serviceId}/volumes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volume_id: selectedVolumeId,
          mount_path: mountPath,
          sub_path: subPath || undefined,
          read_only: readOnly,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsAttachDialogOpen(false);
        setSelectedVolumeId('');
        setMountPath('');
        setSubPath('');
        setReadOnly(false);
        fetchAttachedVolumes();
        fetchAvailableVolumes();
        onSave?.();
        toast.success('Volume attached');
      } else {
        setError(data.error?.message || 'Failed to attach volume');
      }
    } catch (e) {
      setError('Failed to attach volume');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAndAttach() {
    if (!newVolumeName || !newVolumeMountPath) {
      setError('Please enter volume name and mount path');
      return;
    }
    if (!newVolumeMountPath.startsWith('/')) {
      setError('Mount path must start with /');
      return;
    }

    const sizeGb = parseInt(newVolumeSize, 10);
    if (isNaN(sizeGb) || sizeGb < 1) {
      setError('Invalid volume size');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const createRes = await fetch('/api/v1/volumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          name: newVolumeName,
          size_gb: sizeGb,
        }),
      });

      const createData = await createRes.json();
      if (!createData.success) {
        setError(createData.error?.message || 'Failed to create volume');
        setSaving(false);
        return;
      }

      const attachRes = await fetch(`/api/v1/services/${serviceId}/volumes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volume_id: createData.data.id,
          mount_path: newVolumeMountPath,
        }),
      });

      const attachData = await attachRes.json();
      if (attachData.success) {
        setIsCreateDialogOpen(false);
        setNewVolumeName('');
        setNewVolumeSize('10');
        setNewVolumeMountPath('');
        fetchAttachedVolumes();
        fetchAvailableVolumes();
        onSave?.();
        toast.success('Volume created and attached');
      } else {
        setError(attachData.error?.message || 'Failed to attach volume');
      }
    } catch (e) {
      setError('Failed to create and attach volume');
    } finally {
      setSaving(false);
    }
  }

  async function handleDetachVolume(volumeId: string, volumeName: string) {
    const ok = await confirm({ title: 'Detach Volume', description: `Are you sure you want to detach ${volumeName}?`, confirmLabel: 'Detach', variant: 'destructive' });
    if (!ok) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/services/${serviceId}/volumes?volume_id=${volumeId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchAttachedVolumes();
        fetchAvailableVolumes();
        onSave?.();
        toast.success('Volume detached');
      } else {
        const data = await res.json();
        setError(data.error?.message || 'Failed to detach volume');
      }
    } catch (e) {
      setError('Failed to detach volume');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Volumes
          </CardTitle>
          <CardDescription>
            Attach persistent storage volumes to this service
          </CardDescription>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <VolumeAttachDialog
              open={isAttachDialogOpen}
              onOpenChange={setIsAttachDialogOpen}
              availableVolumes={availableVolumes}
              selectedVolumeId={selectedVolumeId}
              onVolumeSelect={setSelectedVolumeId}
              mountPath={mountPath}
              onMountPathChange={setMountPath}
              subPath={subPath}
              onSubPathChange={setSubPath}
              readOnly={readOnly}
              onReadOnlyChange={setReadOnly}
              error={isAttachDialogOpen ? error : null}
              saving={saving}
              onSubmit={handleAttachVolume}
            />
            <VolumeCreateDialog
              open={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
              newVolumeName={newVolumeName}
              onNameChange={setNewVolumeName}
              newVolumeSize={newVolumeSize}
              onSizeChange={setNewVolumeSize}
              newVolumeMountPath={newVolumeMountPath}
              onMountPathChange={setNewVolumeMountPath}
              error={isCreateDialogOpen ? error : null}
              saving={saving}
              onSubmit={handleCreateAndAttach}
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {error && !isAttachDialogOpen && !isCreateDialogOpen && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-destructive/10 rounded-md text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <VolumeTable
          attachedVolumes={attachedVolumes}
          loading={loading}
          canEdit={canEdit}
          saving={saving}
          onDetach={handleDetachVolume}
          onCreateClick={() => setIsCreateDialogOpen(true)}
        />
      </CardContent>
    </Card>
  );
}
