'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  AlertTriangle,
  Loader2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { parseKeyValueText } from '@/lib/utils/format';

import { GeneralSettings } from './_components/general-settings';
import { GitSettings } from './_components/git-settings';
import { BuildSettings } from './_components/build-settings';
import { EnvVarsSettings } from './_components/env-vars-settings';
import { DangerZone } from './_components/danger-zone';

interface Project {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description?: string;
  git_repo_url?: string;
  git_branch?: string;
  git_provider?: string;
  build_command?: string;
  install_command?: string;
  output_directory?: string;
  root_directory?: string;
  env_vars?: Record<string, string>;
  services: Array<{ id: string; name: string; is_active: boolean }>;
  created_at: string;
  updated_at?: string;
}

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    git_repo_url: '',
    git_branch: '',
    git_provider: '',
    install_command: '',
    build_command: '',
    output_directory: '',
    root_directory: '',
  });

  const [envVarsText, setEnvVarsText] = useState('');

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  async function fetchProject() {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}`);
      const data = await res.json();
      if (data.success) {
        setProject(data.data);
        setFormData({
          name: data.data.name || '',
          description: data.data.description || '',
          git_repo_url: data.data.git_repo_url || '',
          git_branch: data.data.git_branch || '',
          git_provider: data.data.git_provider || '',
          install_command: data.data.install_command || '',
          build_command: data.data.build_command || '',
          output_directory: data.data.output_directory || '',
          root_directory: data.data.root_directory || '',
        });
        if (data.data.env_vars) {
          const envText = Object.entries(data.data.env_vars)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
          setEnvVarsText(envText);
        }
      }
    } catch (err) {
      console.error('Failed to fetch project:', err);
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const envVars = parseKeyValueText(envVarsText);

      const res = await fetch(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          git_repo_url: formData.git_repo_url || null,
          git_provider: formData.git_provider || null,
          build_command: formData.build_command || null,
          install_command: formData.install_command || null,
          output_directory: formData.output_directory || null,
          env_vars: envVars,
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (project) setProject({ ...project, ...data.data });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(data.error?.message || 'Failed to save');
      }
    } catch (err) {
      console.error('Failed to save project:', err);
      setError('Failed to save project');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (res.ok || res.status === 204) {
        router.push('/projects');
      } else {
        const data = await res.json();
        setError(data.error?.message || 'Failed to delete project');
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
      setError('Failed to delete project');
    }
  }

  function updateFormData(updates: Partial<typeof formData>) {
    setFormData(prev => ({ ...prev, ...updates }));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-xl font-semibold">Project not found</h2>
        <p className="text-muted-foreground mt-2">The project you&apos;re looking for doesn&apos;t exist.</p>
        <Button className="mt-4" asChild>
          <Link href="/projects">Back to Projects</Link>
        </Button>
      </div>
    );
  }

  const activeServices = project.services.filter(s => s.is_active);
  const canDelete = activeServices.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/projects/${projectId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Project Settings</h1>
            <p className="text-sm text-muted-foreground">{project.name}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        <GeneralSettings
          formData={formData}
          projectSlug={project.slug}
          onFormChange={updateFormData}
        />
        <GitSettings formData={formData} onFormChange={updateFormData} />
        <BuildSettings formData={formData} onFormChange={updateFormData} />
        <EnvVarsSettings envVarsText={envVarsText} onEnvVarsChange={setEnvVarsText} />
        <DangerZone
          projectName={project.name}
          canDelete={canDelete}
          activeServicesCount={activeServices.length}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
