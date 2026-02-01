'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Trash2, HardDrive, Plus, Server } from 'lucide-react';

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

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  provisioning: 'secondary',
  available: 'outline',
  in_use: 'default',
  error: 'destructive',
  deleting: 'secondary',
};

interface VolumeTableProps {
  attachedVolumes: AttachedVolume[];
  loading: boolean;
  canEdit: boolean;
  saving: boolean;
  onDetach: (volumeId: string, volumeName: string) => void;
  onCreateClick: () => void;
}

export function VolumeTable({
  attachedVolumes,
  loading,
  canEdit,
  saving,
  onDetach,
  onCreateClick,
}: VolumeTableProps) {
  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  if (attachedVolumes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <HardDrive className="h-10 w-10 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No volumes attached</p>
        <p className="text-sm text-muted-foreground mt-1">
          Attach persistent storage to preserve data across deployments
        </p>
        {canEdit && (
          <Button className="mt-4" onClick={onCreateClick}>
            <Plus className="mr-2 h-4 w-4" />
            Create Volume
          </Button>
        )}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Volume</TableHead>
          <TableHead>Mount Path</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {attachedVolumes.map((av) => (
          <TableRow key={av.id}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{av.volume.name}</span>
                {av.volume.server && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Server className="h-3 w-3" />
                    {av.volume.server.name}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell>
              <code className="text-sm bg-muted px-2 py-1 rounded">{av.mount_path}</code>
              {av.sub_path && (
                <span className="text-xs text-muted-foreground ml-2">/{av.sub_path}</span>
              )}
              {av.read_only && (
                <Badge variant="outline" className="ml-2 text-xs">RO</Badge>
              )}
            </TableCell>
            <TableCell>{av.volume.size_gb}GB</TableCell>
            <TableCell>
              <Badge variant={statusColors[av.volume.status] || 'secondary'}>
                {av.volume.status}
              </Badge>
            </TableCell>
            <TableCell>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDetach(av.volume_id, av.volume.name)}
                  disabled={saving}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
