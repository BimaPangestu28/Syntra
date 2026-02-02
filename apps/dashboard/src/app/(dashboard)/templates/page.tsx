'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Search, Star, ExternalLink, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

type Template = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  icon_url: string | null;
  docker_image: string;
  default_port: number;
  default_env_vars: Record<string, string>;
  default_resources: Record<string, any>;
  health_check_path: string | null;
  documentation_url: string | null;
  tags: string[];
  is_official: boolean;
  usage_count: number;
  created_at: string;
};

type Project = {
  id: string;
  name: string;
};

type Server = {
  id: string;
  name: string;
  status: string;
};

const CATEGORIES = ['All', 'Web', 'API', 'Database', 'Queue', 'Cache', 'Monitoring'];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [deployLoading, setDeployLoading] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedServerId, setSelectedServerId] = useState('');

  useEffect(() => {
    loadTemplates();
    loadProjects();
    loadServers();
  }, [selectedCategory, searchQuery]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'All') {
        params.append('category', selectedCategory);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(`/api/v1/templates?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setTemplates(result.data.templates);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/v1/projects');
      const result = await response.json();

      if (result.success) {
        setProjects(result.data.projects || []);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadServers = async () => {
    try {
      const response = await fetch('/api/v1/servers');
      const result = await response.json();

      if (result.success) {
        setServers(result.data.servers || []);
      }
    } catch (error) {
      console.error('Failed to load servers:', error);
    }
  };

  const handleDeploy = (template: Template) => {
    setSelectedTemplate(template);
    setDeployDialogOpen(true);
  };

  const handleConfirmDeploy = async () => {
    if (!selectedTemplate || !selectedProjectId || !selectedServerId) {
      return;
    }

    setDeployLoading(true);
    try {
      const response = await fetch(`/api/v1/projects/${selectedProjectId}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedTemplate.slug,
          template_id: selectedTemplate.id,
          server_id: selectedServerId,
          docker_image: selectedTemplate.docker_image,
          port: selectedTemplate.default_port,
          env_vars: selectedTemplate.default_env_vars,
          resources: selectedTemplate.default_resources,
          health_check_path: selectedTemplate.health_check_path,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setDeployDialogOpen(false);
        setSelectedTemplate(null);
        setSelectedProjectId('');
        setSelectedServerId('');
        window.location.href = `/projects/${selectedProjectId}`;
      } else {
        alert(`Deployment failed: ${result.error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to deploy template:', error);
      alert('Failed to deploy template');
    } finally {
      setDeployLoading(false);
    }
  };

  const filteredTemplates = templates;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
        <p className="text-muted-foreground mt-2">
          Deploy pre-configured applications with one click
        </p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <TabsList>
            {CATEGORIES.map((category) => (
              <TabsTrigger key={category} value={category}>
                {category}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading templates...</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No templates found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="flex flex-col p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  {template.icon_url ? (
                    <img
                      src={template.icon_url}
                      alt={template.name}
                      className="h-8 w-8"
                    />
                  ) : (
                    <Package className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{template.name}</h3>
                    {template.is_official && (
                      <Badge variant="secondary" className="shrink-0">
                        Official
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {template.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                <Star className="h-4 w-4" />
                <span>{template.usage_count.toLocaleString()} deployments</span>
              </div>

              <div className="flex items-center gap-2 mt-auto">
                <Button
                  onClick={() => handleDeploy(template)}
                  className="flex-1"
                >
                  <Rocket className="h-4 w-4 mr-2" />
                  Deploy
                </Button>
                {template.documentation_url && (
                  <Button
                    variant="outline"
                    size="icon"
                    asChild
                  >
                    <a
                      href={template.documentation_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deploy {selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              Select a project and server to deploy this template.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project</label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Server</label>
              <Select value={selectedServerId} onValueChange={setSelectedServerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a server" />
                </SelectTrigger>
                <SelectContent>
                  {servers
                    .filter((s) => s.status === 'online')
                    .map((server) => (
                      <SelectItem key={server.id} value={server.id}>
                        {server.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeployDialogOpen(false)}
              disabled={deployLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDeploy}
              disabled={!selectedProjectId || !selectedServerId || deployLoading}
            >
              {deployLoading ? 'Deploying...' : 'Deploy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
