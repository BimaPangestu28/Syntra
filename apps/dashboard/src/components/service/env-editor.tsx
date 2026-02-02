'use client';

import { useState, useCallback } from 'react';
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
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Key,
  Lock,
  Save,
  AlertCircle,
  Upload,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface EnvVar {
  key: string;
  value: string;
  masked_value: string;
  is_secret: boolean;
}

interface EnvEditorProps {
  serviceId: string;
  initialEnvVars: EnvVar[];
  canEdit: boolean;
  canViewSecrets: boolean;
  onSave?: () => void;
}

export function EnvEditor({
  serviceId,
  initialEnvVars,
  canEdit,
  canViewSecrets,
  onSave,
}: EnvEditorProps) {
  const { confirm } = useConfirm();
  const [envVars, setEnvVars] = useState<EnvVar[]>(initialEnvVars);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editValue, setEditValue] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleSecretVisibility = useCallback((key: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleAddEnvVar = async (signal?: AbortSignal) => {
    if (!newKey.trim()) {
      setError('Key is required');
      return;
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newKey)) {
      setError('Invalid key format. Must start with letter or underscore, followed by letters, numbers, or underscores.');
      return;
    }

    if (envVars.some((e) => e.key === newKey)) {
      setError('Key already exists');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/services/${serviceId}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env_vars: [{ key: newKey, value: newValue }] }),
        signal,
      });

      if (signal?.aborted) return;

      const data = await res.json();
      if (data.success) {
        setEnvVars(data.data.env_vars);
        setIsAddDialogOpen(false);
        setNewKey('');
        setNewValue('');
        onSave?.();
        toast.success('Variable added');
      } else {
        setError(data.error?.message || 'Failed to add environment variable');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('Failed to add environment variable');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEnvVar = async (key: string, signal?: AbortSignal) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/services/${serviceId}/env`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env_vars: [{ key, value: editValue }] }),
        signal,
      });

      if (signal?.aborted) return;

      const data = await res.json();
      if (data.success) {
        setEnvVars(data.data.env_vars);
        setEditingKey(null);
        setEditValue('');
        onSave?.();
        toast.success('Variable updated');
      } else {
        setError(data.error?.message || 'Failed to update environment variable');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('Failed to update environment variable');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEnvVar = async (key: string, signal?: AbortSignal) => {
    const ok = await confirm({ title: 'Delete Variable', description: `Are you sure you want to delete ${key}?`, confirmLabel: 'Delete', variant: 'destructive' });
    if (!ok) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/services/${serviceId}/env?keys=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        signal,
      });

      if (signal?.aborted) return;

      const data = await res.json();
      if (data.success) {
        setEnvVars((prev) => prev.filter((e) => e.key !== key));
        onSave?.();
        toast.success('Variable deleted');
      } else {
        setError(data.error?.message || 'Failed to delete environment variable');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('Failed to delete environment variable');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkImport = async (signal?: AbortSignal) => {
    const lines = bulkInput.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
    const newVars: Array<{ key: string; value: string }> = [];

    for (const line of lines) {
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();

        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          newVars.push({ key, value });
        }
      }
    }

    if (newVars.length === 0) {
      setError('No valid environment variables found');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/services/${serviceId}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env_vars: newVars }),
        signal,
      });

      if (signal?.aborted) return;

      const data = await res.json();
      if (data.success) {
        setEnvVars(data.data.env_vars);
        setIsBulkDialogOpen(false);
        setBulkInput('');
        onSave?.();
        toast.success('Variables imported');
      } else {
        setError(data.error?.message || 'Failed to import environment variables');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('Failed to import environment variables');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const content = envVars
      .map((env) => {
        const value = env.is_secret ? env.masked_value : env.value;
        return `${env.key}=${value}`;
      })
      .join('\n');

    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Environment Variables
          </CardTitle>
          <CardDescription>
            Configure environment variables for this service
          </CardDescription>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              Copy
            </Button>
            <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Upload className="mr-2 h-4 w-4" />
                  Bulk Import
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk Import Environment Variables</DialogTitle>
                  <DialogDescription>
                    Paste your .env file content below. Format: KEY=value (one per line)
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Textarea
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    placeholder={`DATABASE_URL=postgresql://...\nAPI_KEY=your-api-key\nNODE_ENV=production`}
                    rows={10}
                    className="font-mono text-sm"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsBulkDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => handleBulkImport()} disabled={saving || !bulkInput.trim()}>
                    {saving ? 'Importing...' : 'Import'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Variable
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Environment Variable</DialogTitle>
                  <DialogDescription>
                    Add a new environment variable to this service
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="key">Key</Label>
                    <Input
                      id="key"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                      placeholder="DATABASE_URL"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="value">Value</Label>
                    <Input
                      id="value"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="postgresql://..."
                      type="password"
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
                  <Button onClick={() => handleAddEnvVar()} disabled={saving}>
                    {saving ? 'Adding...' : 'Add'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {error && !isAddDialogOpen && !isBulkDialogOpen && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-destructive/10 rounded-md text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {envVars.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Key className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No environment variables configured</p>
            {canEdit && (
              <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Variable
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {envVars.map((env) => (
                <TableRow key={env.key}>
                  <TableCell className="font-mono font-medium">
                    <div className="flex items-center gap-2">
                      {env.key}
                      {env.is_secret && (
                        <Badge variant="secondary" className="text-xs">
                          <Lock className="h-3 w-3 mr-1" />
                          Secret
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">
                    {editingKey === env.key ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="font-mono"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={() => handleUpdateEnvVar(env.key)}
                          disabled={saving}
                          aria-label={`Save ${env.key}`}
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
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {env.is_secret
                            ? visibleSecrets.has(env.key) && canViewSecrets
                              ? env.value
                              : env.masked_value
                            : env.value}
                        </span>
                        {env.is_secret && canViewSecrets && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSecretVisibility(env.key)}
                            aria-label={visibleSecrets.has(env.key) ? "Hide secret value" : "Show secret value"}
                          >
                            {visibleSecrets.has(env.key) ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {canEdit && editingKey !== env.key && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingKey(env.key);
                            setEditValue(env.value);
                          }}
                          aria-label={`Edit ${env.key}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${env.key}`}
                          onClick={() => handleDeleteEnvVar(env.key)}
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
      </CardContent>
    </Card>
  );
}
