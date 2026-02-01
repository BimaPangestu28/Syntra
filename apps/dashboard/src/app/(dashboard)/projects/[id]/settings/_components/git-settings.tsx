'use client';

import { GitBranch, Github, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface GitSettingsProps {
  formData: {
    git_repo_url: string;
    git_branch: string;
    git_provider: string;
  };
  onFormChange: (updates: Partial<{ git_repo_url: string; git_branch: string; git_provider: string }>) => void;
}

export function GitSettings({ formData, onFormChange }: GitSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Git Repository
        </CardTitle>
        <CardDescription>Connect your project to a Git repository</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="git_provider">Git Provider</Label>
            <Select
              value={formData.git_provider}
              onValueChange={(value) => onFormChange({ git_provider: value })}
            >
              <SelectTrigger id="git_provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="github">
                  <div className="flex items-center gap-2">
                    <Github className="h-4 w-4" />
                    GitHub
                  </div>
                </SelectItem>
                <SelectItem value="gitlab">GitLab</SelectItem>
                <SelectItem value="bitbucket">Bitbucket</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="git_branch">Default Branch</Label>
            <Input
              id="git_branch"
              value={formData.git_branch}
              onChange={(e) => onFormChange({ git_branch: e.target.value })}
              placeholder="main"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="git_repo_url">Repository URL</Label>
          <div className="flex gap-2">
            <Input
              id="git_repo_url"
              value={formData.git_repo_url}
              onChange={(e) => onFormChange({ git_repo_url: e.target.value })}
              placeholder="https://github.com/username/repo"
              className="flex-1"
            />
            {formData.git_repo_url && (
              <Button variant="outline" size="icon" asChild>
                <a href={formData.git_repo_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
