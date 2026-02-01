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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link2Off, AlertCircle } from 'lucide-react';

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

interface VolumeAttachDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableVolumes: Volume[];
  selectedVolumeId: string;
  onVolumeSelect: (id: string) => void;
  mountPath: string;
  onMountPathChange: (value: string) => void;
  subPath: string;
  onSubPathChange: (value: string) => void;
  readOnly: boolean;
  onReadOnlyChange: (value: boolean) => void;
  error: string | null;
  saving: boolean;
  onSubmit: () => void;
}

export function VolumeAttachDialog({
  open,
  onOpenChange,
  availableVolumes,
  selectedVolumeId,
  onVolumeSelect,
  mountPath,
  onMountPathChange,
  subPath,
  onSubPathChange,
  readOnly,
  onReadOnlyChange,
  error,
  saving,
  onSubmit,
}: VolumeAttachDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={availableVolumes.length === 0}>
          <Link2Off className="mr-2 h-4 w-4" />
          Attach Existing
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach Volume</DialogTitle>
          <DialogDescription>
            Attach an existing volume to this service
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="volume">Volume</Label>
            <Select value={selectedVolumeId} onValueChange={onVolumeSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a volume" />
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
          <div className="space-y-2">
            <Label htmlFor="mount_path">Mount Path</Label>
            <Input
              id="mount_path"
              value={mountPath}
              onChange={(e) => onMountPathChange(e.target.value)}
              placeholder="/data"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sub_path">Sub Path (optional)</Label>
            <Input
              id="sub_path"
              value={subPath}
              onChange={(e) => onSubPathChange(e.target.value)}
              placeholder="subdirectory"
              className="font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="read_only"
              checked={readOnly}
              onChange={(e) => onReadOnlyChange(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="read_only">Read Only</Label>
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
            {saving ? 'Attaching...' : 'Attach'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
