'use client';

import { FolderCode } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface EnvVarsSettingsProps {
  envVarsText: string;
  onEnvVarsChange: (value: string) => void;
}

export function EnvVarsSettings({ envVarsText, onEnvVarsChange }: EnvVarsSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderCode className="h-5 w-5" />
          Environment Variables
        </CardTitle>
        <CardDescription>
          Project-level environment variables. These are inherited by all services.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="env_vars">Variables (KEY=value format, one per line)</Label>
          <Textarea
            id="env_vars"
            value={envVarsText}
            onChange={(e) => onEnvVarsChange(e.target.value)}
            placeholder="NODE_ENV=production&#10;API_URL=https://api.example.com&#10;# Comments start with #"
            rows={8}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Lines starting with # are treated as comments. Service-level variables override these.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
