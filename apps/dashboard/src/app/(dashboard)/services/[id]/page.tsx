'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Rocket,
  Settings,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EnvEditor } from '@/components/service/env-editor';
import { ResourceEditor } from '@/components/service/resource-editor';
import { BuildArgsEditor } from '@/components/service/build-args-editor';
import { VolumeManager } from '@/components/service/volume-manager';
import { ProxyConfigEditor } from '@/components/service/proxy-config-editor';
import { ErrorList } from '@/components/errors/error-list';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  type ServiceDetail,
  type AvailableServer,
  type EnvVar,
  statusColors,
  typeColors,
} from './_components/service-types';
import { DeploymentsTab } from './_components/deployments-tab';
import { ConfigurationTab } from './_components/configuration-tab';

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [servers, setServers] = useState<AvailableServer[]>([]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [envCanEdit, setEnvCanEdit] = useState(false);
  const [envCanViewSecrets, setEnvCanViewSecrets] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const { confirm } = useConfirm();

  useEffect(() => {
    fetchService();
    fetchServers();
    fetchEnvVars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function fetchService() {
    try {
      const res = await fetch(`/api/v1/services/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setService(data.data);
        if (data.data.project?.org_id) {
          setOrgId(data.data.project.org_id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch service:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchServers() {
    try {
      const res = await fetch('/api/v1/servers');
      const data = await res.json();
      if (data.success) {
        setServers(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    }
  }

  async function fetchEnvVars() {
    try {
      const res = await fetch(`/api/v1/services/${params.id}/env`);
      const data = await res.json();
      if (data.success) {
        setEnvVars(data.data.env_vars);
        setEnvCanEdit(data.data.can_edit);
        setEnvCanViewSecrets(data.data.can_view_secrets);
      }
    } catch (error) {
      console.error('Failed to fetch env vars:', error);
    }
  }

  async function handleDeploy() {
    setDeploying(true);
    try {
      const res = await fetch('/api/v1/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: params.id,
          trigger_type: 'manual',
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/deployments/${data.data.id}`);
      } else {
        toast.error(data.error?.message || 'Failed to trigger deployment');
      }
    } catch (error) {
      console.error('Failed to trigger deployment:', error);
    } finally {
      setDeploying(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({ title: 'Delete Service', description: 'Are you sure you want to delete this service? This action cannot be undone.', confirmLabel: 'Delete', variant: 'destructive' });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/services/${params.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Service deleted');
        router.push('/services');
      } else {
        const data = await res.json();
        toast.error(data.error?.message || 'Failed to delete service');
      }
    } catch (error) {
      console.error('Failed to delete service:', error);
    }
  }

  async function handleServerChange(serverId: string) {
    try {
      const res = await fetch(`/api/v1/services/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_id: serverId || null }),
      });
      if (res.ok) {
        fetchService();
      }
    } catch (error) {
      console.error('Failed to update server:', error);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-xl font-semibold">Service not found</h2>
        <Button asChild className="mt-4">
          <Link href="/services">Back to Services</Link>
        </Button>
      </div>
    );
  }

  const latestDeployment = service.deployments[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/services">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">{service.name}</h1>
              <Badge variant={typeColors[service.type] || 'secondary'}>
                {service.type}
              </Badge>
              {service.is_active ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Project: <Link href={`/projects/${service.project.id}`} className="hover:underline">{service.project.name}</Link>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleDeploy}
            disabled={!service.server_id || deploying}
          >
            <Rocket className="mr-2 h-4 w-4" />
            {deploying ? 'Deploying...' : 'Deploy'}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/services/${service.id}/settings`}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </Button>
          <Button variant="destructive" size="icon" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quick Info */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Server</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={service.server_id || ''}
              onValueChange={handleServerChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select server" />
              </SelectTrigger>
              <SelectContent>
                {servers.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.name} ({server.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Port</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{service.port || '-'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Replicas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{service.replicas || 1}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Latest Deploy</CardTitle>
          </CardHeader>
          <CardContent>
            {latestDeployment ? (
              <Badge variant={statusColors[latestDeployment.status] || 'secondary'}>
                {latestDeployment.status}
              </Badge>
            ) : (
              <span className="text-muted-foreground">Never</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="deployments">
        <TabsList className="flex-wrap">
          <TabsTrigger value="deployments">Deployments ({service.deployments.length})</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="env">Environment</TabsTrigger>
          <TabsTrigger value="build-args">Build Args</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="volumes">Volumes</TabsTrigger>
          <TabsTrigger value="proxy">Proxy</TabsTrigger>
        </TabsList>

        <TabsContent value="deployments" className="space-y-4">
          <DeploymentsTab
            deployments={service.deployments}
            serverId={service.server_id}
            deploying={deploying}
            onDeploy={handleDeploy}
          />
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <ErrorList serviceId={service.id} />
        </TabsContent>

        <TabsContent value="configuration" className="space-y-4">
          <ConfigurationTab service={service} />
        </TabsContent>

        <TabsContent value="env" className="space-y-4">
          <EnvEditor
            serviceId={service.id}
            initialEnvVars={envVars}
            canEdit={envCanEdit}
            canViewSecrets={envCanViewSecrets}
            onSave={fetchEnvVars}
          />
        </TabsContent>

        <TabsContent value="build-args" className="space-y-4">
          <BuildArgsEditor
            serviceId={service.id}
            initialBuildArgs={service.build_args || {}}
            canEdit={envCanEdit}
            onSave={fetchService}
          />
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <ResourceEditor
            serviceId={service.id}
            initialResources={service.resources || null}
            canEdit={envCanEdit}
            onSave={fetchService}
          />
        </TabsContent>

        <TabsContent value="volumes" className="space-y-4">
          {orgId ? (
            <VolumeManager
              serviceId={service.id}
              orgId={orgId}
              canEdit={envCanEdit}
              onSave={fetchService}
            />
          ) : (
            <Card className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">Loading organization data...</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="proxy" className="space-y-4">
          <ProxyConfigEditor
            serviceId={service.id}
            canEdit={envCanEdit}
            onSave={fetchService}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
