'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import Link from 'next/link';
import { Plus, FolderKanban, GitBranch, ExternalLink, MoreHorizontal, Github, Lock, Search, Loader2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  updated_at: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  git_repo_url?: string;
  git_branch?: string;
  git_provider?: string;
  services_count: number;
  created_at: string;
  updated_at: string;
}

export default function ProjectsPage() {
  const { confirm } = useConfirm();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    git_repo_url: '',
    git_branch: 'main',
  });

  // GitHub repos state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [createMode, setCreateMode] = useState<'github' | 'manual'>('github');

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (createOpen && createMode === 'github' && repos.length === 0) {
      fetchRepos();
    }
  }, [createOpen, createMode]);

  async function fetchRepos() {
    setLoadingRepos(true);
    try {
      const res = await fetch('/api/v1/github/repositories?per_page=100&sort=pushed');
      const data = await res.json();
      if (data.success) {
        setRepos(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch repositories:', error);
    } finally {
      setLoadingRepos(false);
    }
  }

  function selectRepo(repo: GitHubRepo) {
    setSelectedRepo(repo);
    setFormData({
      name: repo.name,
      description: repo.description || '',
      git_repo_url: repo.url,
      git_branch: repo.default_branch,
    });
  }

  function resetForm() {
    setFormData({ name: '', description: '', git_repo_url: '', git_branch: 'main' });
    setSelectedRepo(null);
    setRepoSearch('');
    setCreateMode('github');
  }

  const filteredRepos = repos.filter((repo) =>
    repo.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  );

  async function fetchProjects() {
    try {
      const res = await fetch('/api/v1/projects');
      const data = await res.json();
      if (data.success) {
        setProjects(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          git_provider: selectedRepo ? 'github' : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProjects([data.data, ...projects]);
        setCreateOpen(false);
        resetForm();
        toast.success('Project created');
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      toast.error('Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Delete Project', description: 'Are you sure you want to delete this project?', confirmLabel: 'Delete', variant: 'destructive' });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects(projects.filter((p) => p.id !== id));
        toast.success('Project deleted');
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
      toast.error('Failed to delete project');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-muted-foreground">Manage your application projects</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>
                Import from GitHub or create a new project manually.
              </DialogDescription>
            </DialogHeader>

            <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as 'github' | 'manual')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="github" className="flex items-center gap-2">
                  <Github className="h-4 w-4" />
                  Import from GitHub
                </TabsTrigger>
                <TabsTrigger value="manual">
                  Manual Setup
                </TabsTrigger>
              </TabsList>

              <TabsContent value="github" className="space-y-4 mt-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search repositories..."
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Repository list */}
                <div className="h-[300px] rounded-md border overflow-auto">
                  {loadingRepos ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredRepos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <Github className="h-8 w-8 mb-2" />
                      <p>No repositories found</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {filteredRepos.map((repo) => (
                        <button
                          key={repo.id}
                          onClick={() => selectRepo(repo)}
                          className={cn(
                            'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors',
                            selectedRepo?.id === repo.id
                              ? 'bg-white text-black'
                              : 'hover:bg-muted'
                          )}
                        >
                          <Github className="h-5 w-5 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{repo.full_name}</span>
                              {repo.private && (
                                <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              )}
                            </div>
                            {repo.description && (
                              <p className={cn(
                                'text-sm line-clamp-2 mt-1',
                                selectedRepo?.id === repo.id ? 'text-black/70' : 'text-muted-foreground'
                              )}>
                                {repo.description}
                              </p>
                            )}
                            <div className={cn(
                              'flex items-center gap-3 text-xs mt-1',
                              selectedRepo?.id === repo.id ? 'text-black/60' : 'text-muted-foreground'
                            )}>
                              {repo.language && <span>{repo.language}</span>}
                              <span>{repo.default_branch}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedRepo && (
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-center justify-between text-sm gap-2">
                      <span className="text-muted-foreground flex-shrink-0">Selected:</span>
                      <span className="font-medium truncate">{selectedRepo.full_name}</span>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="name-github">Project Name</Label>
                      <Input
                        id="name-github"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="branch-github">Branch</Label>
                      <Input
                        id="branch-github"
                        value={formData.git_branch}
                        onChange={(e) => setFormData({ ...formData, git_branch: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="manual" className="space-y-4 mt-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Project Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="my-awesome-app"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="A brief description of your project"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="git_repo_url">Git Repository URL (optional)</Label>
                  <Input
                    id="git_repo_url"
                    value={formData.git_repo_url}
                    onChange={(e) => setFormData({ ...formData, git_repo_url: e.target.value })}
                    placeholder="https://github.com/user/repo"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="git_branch">Default Branch</Label>
                  <Input
                    id="git_branch"
                    value={formData.git_branch}
                    onChange={(e) => setFormData({ ...formData, git_branch: e.target.value })}
                    placeholder="main"
                  />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!formData.name || creating}>
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Project'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No projects yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first project to get started
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg">
                    <Link
                      href={`/projects/${project.id}`}
                      className="hover:underline"
                    >
                      {project.name}
                    </Link>
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {project.description || 'No description'}
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/projects/${project.id}`}>View Details</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/projects/${project.id}/settings`}>Settings</Link>
                    </DropdownMenuItem>
                    {project.git_repo_url && (
                      <DropdownMenuItem asChild>
                        <a href={project.git_repo_url} target="_blank" rel="noopener noreferrer">
                          Open Repository <ExternalLink className="ml-2 h-3 w-3" />
                        </a>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(project.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {project.git_repo_url && (
                    <div className="flex items-center gap-1">
                      <GitBranch className="h-4 w-4" />
                      <span>{project.git_branch || 'main'}</span>
                    </div>
                  )}
                  <Badge variant="secondary">
                    {project.services_count} service{project.services_count !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
