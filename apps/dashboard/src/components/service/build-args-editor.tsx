'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, Save, AlertCircle, Wrench } from 'lucide-react';

interface BuildArgsEditorProps {
  serviceId: string;
  initialBuildArgs: Record<string, string>;
  canEdit: boolean;
  onSave?: () => void;
}

export function BuildArgsEditor({
  serviceId,
  initialBuildArgs,
  canEdit,
  onSave,
}: BuildArgsEditorProps) {
  const { confirm } = useConfirm();
  const [buildArgs, setBuildArgs] = useState<Record<string, string>>(initialBuildArgs || {});
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveAll = async (updatedArgs: Record<string, string>) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/services/${serviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ build_args: updatedArgs }),
      });

      const data = await res.json();
      if (data.success) {
        setBuildArgs(updatedArgs);
        onSave?.();
        toast.success('Build arguments saved');
        return true;
      } else {
        setError(data.error?.message || 'Failed to save build arguments');
        return false;
      }
    } catch (e) {
      setError('Failed to save build arguments');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAddBuildArg = async () => {
    if (!newKey.trim()) {
      setError('Key is required');
      return;
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newKey)) {
      setError('Invalid key format. Must start with letter or underscore, followed by letters, numbers, or underscores.');
      return;
    }

    if (buildArgs[newKey] !== undefined) {
      setError('Key already exists');
      return;
    }

    const updatedArgs = { ...buildArgs, [newKey]: newValue };
    const success = await handleSaveAll(updatedArgs);
    if (success) {
      setIsAddDialogOpen(false);
      setNewKey('');
      setNewValue('');
    }
  };

  const handleUpdateBuildArg = async (key: string) => {
    const updatedArgs = { ...buildArgs, [key]: editValue };
    const success = await handleSaveAll(updatedArgs);
    if (success) {
      setEditingKey(null);
      setEditValue('');
    }
  };

  const handleDeleteBuildArg = async (key: string) => {
    const ok = await confirm({ title: 'Delete Build Argument', description: `Are you sure you want to delete ${key}?`, confirmLabel: 'Delete', variant: 'destructive' });
    if (!ok) return;

    const updatedArgs = { ...buildArgs };
    delete updatedArgs[key];
    await handleSaveAll(updatedArgs);
  };

  const buildArgsList = Object.entries(buildArgs);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Build Arguments
          </CardTitle>
          <CardDescription>
            Configure build-time arguments passed to Docker build
          </CardDescription>
        </div>
        {canEdit && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Argument
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Build Argument</DialogTitle>
                <DialogDescription>
                  Add a new build-time argument for Docker build
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="key">Name</Label>
                  <Input
                    id="key"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                    placeholder="BUILD_VERSION"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="value">Value</Label>
                  <Input
                    id="value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="1.0.0"
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
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddBuildArg} disabled={saving}>
                  {saving ? 'Adding...' : 'Add'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {error && !isAddDialogOpen && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-destructive/10 rounded-md text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {buildArgsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Wrench className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No build arguments configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              Build arguments are passed to Docker during image build
            </p>
            {canEdit && (
              <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Argument
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Name</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buildArgsList.map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell className="font-mono font-medium">{key}</TableCell>
                  <TableCell className="font-mono">
                    {editingKey === key ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="font-mono"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={() => handleUpdateBuildArg(key)}
                          disabled={saving}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingKey(null);
                            setEditValue('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{value || '(empty)'}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {canEdit && editingKey !== key && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingKey(key);
                            setEditValue(value);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteBuildArg(key)}
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

        <div className="mt-4 p-3 bg-muted rounded-md text-sm text-muted-foreground">
          <p>
            <strong>Usage in Dockerfile:</strong> Use <code className="bg-background px-1 py-0.5 rounded">ARG BUILD_VERSION</code> to declare and <code className="bg-background px-1 py-0.5 rounded">$BUILD_VERSION</code> to use.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
