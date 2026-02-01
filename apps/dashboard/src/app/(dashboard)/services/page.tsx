'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Layers, Play, Square, MoreHorizontal, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

interface Service {
  id: string;
  project_id: string;
  server_id?: string;
  name: string;
  type: 'web' | 'api' | 'worker' | 'cron';
  source_type: 'git' | 'docker_image' | 'dockerfile';
  docker_image?: string;
  port?: number;
  replicas?: number;
  auto_deploy: boolean;
  is_active: boolean;
  project: {
    id: string;
    name: string;
  };
  server?: {
    id: string;
    name: string;
    status: string;
  };
  latest_deployment?: {
    id: string;
    status: string;
    created_at: string;
  };
  created_at: string;
}

const typeColors: Record<string, 'default' | 'secondary' | 'outline'> = {
  web: 'default',
  api: 'secondary',
  worker: 'outline',
  cron: 'outline',
};

const deploymentStatusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  pending: 'secondary',
  building: 'warning',
  deploying: 'warning',
  running: 'success',
  stopped: 'secondary',
  failed: 'destructive',
  cancelled: 'secondary',
};

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm } = useConfirm();

  useEffect(() => {
    fetchServices();
  }, []);

  async function fetchServices() {
    try {
      const res = await fetch('/api/v1/services');
      const data = await res.json();
      if (data.success) {
        setServices(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
    } finally {
      setLoading(false);
    }
  }

  async function triggerDeploy(serviceId: string) {
    try {
      const res = await fetch('/api/v1/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          trigger_type: 'manual',
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Deployment triggered');
        fetchServices(); // Refresh to show new deployment
      } else {
        toast.error(data.error?.message || 'Failed to trigger deployment');
      }
    } catch (error) {
      console.error('Failed to trigger deployment:', error);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Delete Service', description: 'Are you sure you want to delete this service?', confirmLabel: 'Delete', variant: 'destructive' });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/services/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Service deleted');
        setServices(services.filter((s) => s.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete service:', error);
    }
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
          <h1 className="text-xl font-semibold">Services</h1>
          <p className="text-muted-foreground">Manage your deployed services</p>
        </div>
        <Button asChild>
          <Link href="/projects">
            <Plus className="mr-2 h-4 w-4" />
            New Service
          </Link>
        </Button>
      </div>

      {services.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <Layers className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No services yet</h3>
          <p className="text-muted-foreground mb-4">
            Create a project first, then add services to it
          </p>
          <Button asChild>
            <Link href="/projects">
              <Plus className="mr-2 h-4 w-4" />
              Go to Projects
            </Link>
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Server</TableHead>
                <TableHead>Latest Deployment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell>
                    <div>
                      <Link
                        href={`/services/${service.id}`}
                        className="font-medium hover:underline"
                      >
                        {service.name}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        Port {service.port} / {service.replicas} replica{service.replicas !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={typeColors[service.type] || 'secondary'}>
                      {service.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/projects/${service.project.id}`}
                      className="hover:underline"
                    >
                      {service.project.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {service.server ? (
                      <Link
                        href={`/servers/${service.server.id}`}
                        className="hover:underline"
                      >
                        {service.server.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Not assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {service.latest_deployment ? (
                      <div className="text-sm">
                        <Badge variant={deploymentStatusColors[service.latest_deployment.status] || 'secondary'}>
                          {service.latest_deployment.status}
                        </Badge>
                        <p className="text-muted-foreground mt-1">
                          {new Date(service.latest_deployment.created_at).toLocaleString()}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Never deployed</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {service.is_active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => triggerDeploy(service.id)}
                        disabled={!service.server_id}
                        title={service.server_id ? 'Deploy' : 'Assign server first'}
                      >
                        <Rocket className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/services/${service.id}`}>View Details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/services/${service.id}/logs`}>View Logs</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(service.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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
