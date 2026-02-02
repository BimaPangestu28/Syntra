'use client';

import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface CreateServiceBuildTabProps {
  buildArgsText: string;
  setBuildArgsText: (text: string) => void;
}

export function CreateServiceBuildTab({
  buildArgsText,
  setBuildArgsText,
}: CreateServiceBuildTabProps) {
  return (
    <TabsContent value="build" className="mt-0 space-y-4">
      <div>
        <h4 className="text-sm font-medium">Build Arguments</h4>
        <p className="text-xs text-muted-foreground">Docker build-time arguments (ARG in Dockerfile), format: KEY=value</p>
      </div>
      <Textarea
        value={buildArgsText}
        onChange={(e) => setBuildArgsText(e.target.value)}
        placeholder={`NODE_VERSION=18
NPM_TOKEN=your-token
# Lines starting with # are ignored`}
        className="font-mono text-sm min-h-[200px]"
      />
    </TabsContent>
  );
}
