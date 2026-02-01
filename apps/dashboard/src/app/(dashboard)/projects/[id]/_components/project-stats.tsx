'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  Layers,
  Activity,
  FolderCode,
  GitBranch,
} from 'lucide-react';
import type { Project } from './types';

interface ProjectStatsProps {
  project: Project;
}

export function ProjectStats({ project }: ProjectStatsProps) {
  const activeServices = project.services.filter((s) => s.is_active).length;
  const envVarsCount = project.env_vars ? Object.keys(project.env_vars).length : 0;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Layers className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold">{project.services.length}</p>
              <p className="text-xs text-muted-foreground">Services</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Activity className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold">{activeServices}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <FolderCode className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold">{envVarsCount}</p>
              <p className="text-xs text-muted-foreground">Env Vars</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <GitBranch className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold truncate max-w-[100px]">{project.git_branch || 'main'}</p>
              <p className="text-xs text-muted-foreground">Branch</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
