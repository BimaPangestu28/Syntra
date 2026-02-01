'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Plus, Server, Cpu, HardDrive, MemoryStick, Copy, Check, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface ServerInfo {
  id: string;
  name: string;
  hostname?: string;
  public_ip?: string;
  private_ip?: string;
  runtime?: string;
  runtime_version?: string;
  status: 'online' | 'offline' | 'maintenance' | 'error';
  agent_version?: string;
  os_name?: string;
  os_version?: string;
  arch?: string;
  cpu_cores?: number;
  memory_mb?: number;
  disk_gb?: number;
  last_heartbeat_at?: string;
  tags?: string[];
  created_at: string;
}

interface CreateServerResponse {
  server_id: string;
  install_command: string;
  token: string;
}

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  online: 'success',
  offline: 'secondary',
  maintenance: 'warning',
  error: 'destructive',
};

export default function ServersPage() {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newServer, setNewServer] = useState<CreateServerResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({ name: '' });
  const { confirm } = useConfirm();

  useEffect(() => {
    fetchServers();
  }, []);

  async function fetchServers() {
    try {
      const res = await fetch('/api/v1/servers');
      const data = await res.json();
      if (data.success) {
        setServers(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch('/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setNewServer(data.data);
        fetchServers();
        toast.success('Server created');
      }
    } catch (error) {
      console.error('Failed to create server:', error);
      toast.error('Failed to create server');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Delete Server', description: 'Are you sure you want to delete this server?', confirmLabel: 'Delete', variant: 'destructive' });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/servers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setServers(servers.filter((s) => s.id !== id));
        toast.success('Server deleted');
      }
    } catch (error) {
      console.error('Failed to delete server:', error);
      toast.error('Failed to delete server');
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function closeAndReset() {
    setCreateOpen(false);
    setNewServer(null);
    setFormData({ name: '' });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Servers</h1>
          <p className="text-muted-foreground">Manage your connected servers</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(open) => open ? setCreateOpen(true) : closeAndReset()}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Server
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            {!newServer ? (
              <>
                <DialogHeader>
                  <DialogTitle>Add Server</DialogTitle>
                  <DialogDescription>
                    Add a new server to your infrastructure. You will receive an install command to run on your server.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Server Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="production-server-1"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeAndReset}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={!formData.name || creating}>
                    {creating ? 'Creating...' : 'Generate Install Command'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Install Agent</DialogTitle>
                  <DialogDescription>
                    Run this command on your server to install and connect the Syntra agent.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* Step 1: Install command */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">1</div>
                      <span className="font-medium">Run the install command</span>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <code className="text-sm text-green-400 break-all leading-relaxed">
                          {newServer.install_command}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-slate-400 hover:text-white"
                          onClick={() => copyToClipboard(newServer.install_command)}
                        >
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Verify */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">2</div>
                      <span className="font-medium">Verify the installation</span>
                    </div>
                    <p className="text-sm text-muted-foreground ml-8">
                      Once installed, the server will appear as &quot;online&quot; in your dashboard.
                    </p>
                  </div>

                  {/* Token info */}
                  <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm">
                    <div className="flex gap-2">
                      <span className="text-yellow-500 font-medium">Token:</span>
                      <code className="text-yellow-600 break-all">{newServer.token}</code>
                    </div>
                    <p className="text-muted-foreground mt-2">
                      This token is only shown once. Save it if you need to configure the agent manually.
                    </p>
                  </div>

                  {/* Requirements */}
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium mb-1">Requirements:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Linux (Ubuntu 20.04+, Debian 11+, CentOS 8+) or macOS</li>
                      <li>Docker installed and running</li>
                      <li>Root/sudo access</li>
                    </ul>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={closeAndReset}>Done</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {servers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <Server className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No servers yet</h3>
          <p className="text-muted-foreground mb-4">
            Add your first server to start deploying
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Server
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Resources</TableHead>
                <TableHead>Runtime</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((server) => (
                <TableRow key={server.id}>
                  <TableCell>
                    <div>
                      <Link
                        href={`/servers/${server.id}`}
                        className="font-medium hover:underline"
                      >
                        {server.name}
                      </Link>
                      {server.hostname && (
                        <p className="text-sm text-muted-foreground">{server.hostname}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[server.status] || 'secondary'}>
                      {server.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {server.public_ip || server.private_ip || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {server.cpu_cores && (
                        <span className="flex items-center gap-1">
                          <Cpu className="h-3 w-3" />
                          {server.cpu_cores}
                        </span>
                      )}
                      {server.memory_mb && (
                        <span className="flex items-center gap-1">
                          <MemoryStick className="h-3 w-3" />
                          {Math.round(server.memory_mb / 1024)}GB
                        </span>
                      )}
                      {server.disk_gb && (
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          {server.disk_gb}GB
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {server.runtime ? (
                        <>
                          {server.runtime}
                          {server.runtime_version && (
                            <span className="text-muted-foreground"> {server.runtime_version}</span>
                          )}
                        </>
                      ) : (
                        '-'
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {server.last_heartbeat_at
                        ? new Date(server.last_heartbeat_at).toLocaleString()
                        : 'Never'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/servers/${server.id}`}>View Details</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(server.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
