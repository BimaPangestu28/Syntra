'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  Settings,
  Trash2,
  MoreHorizontal,
  Github,
  RefreshCw,
} from 'lucide-react';
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
import type { Project, ServerOption, VolumeOption } from './_components/types';
import { ProjectStats } from './_components/project-stats';
import { ServiceGrid } from './_components/service-grid';
import { CreateServiceDialog } from './_components/create-service-dialog';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { confirm } = useConfirm();
  const [project, setProject] = useState<Project | null>(null);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [availableVolumes, setAvailableVolumes] = useState<VolumeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [createServiceOpen, setCreateServiceOpen] = useState(false);

  useEffect(() => {
    fetchProject();
    fetchServers();
    fetchVolumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function fetchProject() {
    try {
      const res = await fetch(`/api/v1/projects/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setProject(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch project:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchServers() {
    try {
      const res = await fetch('/api/v1/servers?status=online');
      const data = await res.json();
      if (data.success) {
        setServers(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    }
  }

  async function fetchVolumes() {
    try {
      const res = await fetch('/api/v1/volumes');
      const data = await res.json();
      if (data.success) {
        setAvailableVolumes(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch volumes:', error);
    }
  }

  async function handleDeleteProject() {
    const ok = await confirm({ title: 'Delete Project', description: 'Are you sure you want to delete this project? This action cannot be undone.', confirmLabel: 'Delete', variant: 'destructive' });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/projects/${params.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Project deleted');
        router.push('/projects');
      } else {
        const data = await res.json();
        toast.error(data.error?.message || 'Failed to delete project');
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  }

  async function handleDeleteService(serviceId: string) {
    const ok = await confirm({ title: 'Delete Service', description: 'Are you sure you want to delete this service?', confirmLabel: 'Delete', variant: 'destructive' });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/services/${serviceId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Service deleted');
        fetchProject();
      }
    } catch (error) {
      console.error('Failed to delete service:', error);
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
        router.push(`/deployments/${data.data.id}`);
      } else {
        toast.error(data.error?.message || 'Failed to trigger deployment');
      }
    } catch (error) {
      console.error('Failed to trigger deployment:', error);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-xl font-semibold">Project not found</h2>
        <Button asChild className="mt-4">
          <Link href="/projects">Back to Projects</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="mt-1">
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{project.name}</h1>
            {project.description && (
              <p className="text-muted-foreground mt-1">{project.description}</p>
            )}
            {project.git_repo_url && (
              <a
                href={project.git_repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mt-2 transition-colors"
              >
                <Github className="h-4 w-4" />
                <span className="truncate max-w-[300px]">
                  {project.git_repo_url.replace('https://github.com/', '')}
                </span>
                <Badge variant="outline" className="text-xs">
                  {project.git_branch || 'main'}
                </Badge>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchProject()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${project.id}/settings`}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/projects/${project.id}/settings`}>Project Settings</Link>
              </DropdownMenuItem>
              {project.git_repo_url && (
                <DropdownMenuItem asChild>
                  <a href={project.git_repo_url} target="_blank" rel="noopener noreferrer">
                    Open Repository
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={handleDeleteProject}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats */}
      <ProjectStats project={project} />

      {/* Services Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Services</h2>
          <CreateServiceDialog
            projectId={project.id}
            orgId={project.org_id}
            servers={servers}
            availableVolumes={availableVolumes}
            onCreated={fetchProject}
            open={createServiceOpen}
            onOpenChange={setCreateServiceOpen}
          />
        </div>

        <ServiceGrid
          services={project.services}
          onCreateClick={() => setCreateServiceOpen(true)}
          onDeleteService={handleDeleteService}
          onTriggerDeploy={triggerDeploy}
        />
      </div>

      {/* Build Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Build Configuration</CardTitle>
              <CardDescription>How your project is built and deployed</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${project.id}/settings`}>
                <Settings className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Install Command</p>
              <code className="text-sm bg-muted px-2 py-1 rounded block truncate">
                {project.install_command || 'npm install'}
              </code>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Build Command</p>
              <code className="text-sm bg-muted px-2 py-1 rounded block truncate">
                {project.build_command || 'npm run build'}
              </code>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Output Directory</p>
              <code className="text-sm bg-muted px-2 py-1 rounded block truncate">
                {project.output_directory || '.next'}
              </code>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Root Directory</p>
              <code className="text-sm bg-muted px-2 py-1 rounded block truncate">
                {project.root_directory || '/'}
              </code>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
