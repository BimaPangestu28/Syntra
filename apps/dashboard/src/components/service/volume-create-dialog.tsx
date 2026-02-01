'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, AlertCircle } from 'lucide-react';

interface VolumeCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newVolumeName: string;
  onNameChange: (value: string) => void;
  newVolumeSize: string;
  onSizeChange: (value: string) => void;
  newVolumeMountPath: string;
  onMountPathChange: (value: string) => void;
  error: string | null;
  saving: boolean;
  onSubmit: () => void;
}

export function VolumeCreateDialog({
  open,
  onOpenChange,
  newVolumeName,
  onNameChange,
  newVolumeSize,
  onSizeChange,
  newVolumeMountPath,
  onMountPathChange,
  error,
  saving,
  onSubmit,
}: VolumeCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New Volume
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create & Attach Volume</DialogTitle>
          <DialogDescription>
            Create a new volume and attach it to this service
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Volume Name</Label>
            <Input
              id="name"
              value={newVolumeName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="my-data-volume"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="size">Size (GB)</Label>
            <Input
              id="size"
              type="number"
              value={newVolumeSize}
              onChange={(e) => onSizeChange(e.target.value)}
              min="1"
              max="10000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_mount_path">Mount Path</Label>
            <Input
              id="new_mount_path"
              value={newVolumeMountPath}
              onChange={(e) => onMountPathChange(e.target.value)}
              placeholder="/data"
              className="font-mono"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? 'Creating...' : 'Create & Attach'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
