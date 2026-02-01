'use client';

import { Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface GeneralSettingsProps {
  formData: {
    name: string;
    description: string;
  };
  projectSlug: string;
  onFormChange: (updates: Partial<{ name: string; description: string }>) => void;
}

export function GeneralSettings({ formData, projectSlug, onFormChange }: GeneralSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          General
        </CardTitle>
        <CardDescription>Basic project information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => onFormChange({ name: e.target.value })}
              placeholder="my-project"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={projectSlug}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">Slug cannot be changed</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => onFormChange({ description: e.target.value })}
            placeholder="A brief description of your project..."
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
