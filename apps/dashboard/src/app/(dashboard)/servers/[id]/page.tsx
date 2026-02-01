'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { ServerOverview } from './_components/server-overview';
import { ServerServices } from './_components/server-services';
import { ServerLogs } from './_components/server-logs';

interface ServerDetail {
  id: string;
  org_id: string;
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
  is_connected: boolean;
  agent_id?: string;
  created_at: string;
  updated_at: string;
}

interface ServiceItem {
  id: string;
  name: string;
  type: string;
  project: {
    id: string;
    name: string;
  };
  is_active: boolean;
}

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  online: 'success',
  offline: 'secondary',
  maintenance: 'warning',
  error: 'destructive',
};

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [installCommand, setInstallCommand] = useState<string | null>(null);
  const { confirm } = useConfirm();

  useEffect(() => {
    fetchServer();
    fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function fetchServer() {
    try {
      const res = await fetch(`/api/v1/servers/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setServer(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch server:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchServices() {
    try {
      const res = await fetch(`/api/v1/services?server_id=${params.id}`);
      const data = await res.json();
      if (data.success) {
        setServices(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
    }
  }

  async function handleDelete() {
    const ok = await confirm({ title: 'Delete Server', description: 'Are you sure you want to delete this server? This action cannot be undone.', confirmLabel: 'Delete', variant: 'destructive' });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/servers/${params.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Server deleted');
        router.push('/servers');
      } else {
        const data = await res.json();
        toast.error(data.error?.message || 'Failed to delete server');
      }
    } catch (error) {
      console.error('Failed to delete server:', error);
    }
  }

  async function handleRegenerateToken() {
    const ok = await confirm({ title: 'Regenerate Token', description: 'Are you sure you want to regenerate the token? The current token will be invalidated and the agent will need to be reinstalled.', confirmLabel: 'Regenerate', variant: 'destructive' });
    if (!ok) return;

    setRegenerating(true);
    try {
      const res = await fetch(`/api/v1/servers/${params.id}/regenerate-token`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Token regenerated');
        setInstallCommand(data.data.install_command);
      } else {
        toast.error(data.error?.message || 'Failed to regenerate token');
      }
    } catch (error) {
      console.error('Failed to regenerate token:', error);
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-xl font-semibold">Server not found</h2>
        <Button asChild className="mt-4">
          <Link href="/servers">Back to Servers</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/servers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">{server.name}</h1>
              <Badge variant={statusColors[server.status] || 'secondary'}>
                {server.status}
              </Badge>
              {server.is_connected && (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  Connected
                </Badge>
              )}
            </div>
            {server.hostname && (
              <p className="text-muted-foreground">{server.hostname}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => fetchServer()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="destructive" size="icon" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">CPU</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{server.cpu_cores || '-'}</div>
            <p className="text-xs text-muted-foreground">cores</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Memory</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {server.memory_mb ? `${Math.round(server.memory_mb / 1024)} GB` : '-'}
            </div>
            <p className="text-xs text-muted-foreground">total RAM</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Disk</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{server.disk_gb ? `${server.disk_gb} GB` : '-'}</div>
            <p className="text-xs text-muted-foreground">total storage</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Services</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{services.length}</div>
            <p className="text-xs text-muted-foreground">deployed</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="services">Services ({services.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <ServerOverview
            server={server}
            installCommand={installCommand}
            regenerating={regenerating}
            onRegenerateToken={handleRegenerateToken}
          />
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <ServerServices services={services} />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <ServerLogs />
        </TabsContent>
      </Tabs>
    </div>
  );
}
