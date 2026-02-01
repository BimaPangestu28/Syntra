'use client';

import { Code } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BuildSettingsProps {
  formData: {
    root_directory: string;
    output_directory: string;
    install_command: string;
    build_command: string;
  };
  onFormChange: (updates: Partial<{
    root_directory: string;
    output_directory: string;
    install_command: string;
    build_command: string;
  }>) => void;
}

export function BuildSettings({ formData, onFormChange }: BuildSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Build Configuration
        </CardTitle>
        <CardDescription>Configure how your project is built</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="root_directory">Root Directory</Label>
            <Input
              id="root_directory"
              value={formData.root_directory}
              onChange={(e) => onFormChange({ root_directory: e.target.value })}
              placeholder="./"
            />
            <p className="text-xs text-muted-foreground">Leave empty for repository root</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="output_directory">Output Directory</Label>
            <Input
              id="output_directory"
              value={formData.output_directory}
              onChange={(e) => onFormChange({ output_directory: e.target.value })}
              placeholder="dist, build, .next, etc."
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="install_command">Install Command</Label>
          <Input
            id="install_command"
            value={formData.install_command}
            onChange={(e) => onFormChange({ install_command: e.target.value })}
            placeholder="npm install, yarn, pnpm install"
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="build_command">Build Command</Label>
          <Input
            id="build_command"
            value={formData.build_command}
            onChange={(e) => onFormChange({ build_command: e.target.value })}
            placeholder="npm run build, yarn build"
            className="font-mono text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}
