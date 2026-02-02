'use client';

import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Globe } from 'lucide-react';

interface CreateServiceDomainsTabProps {
  domainsText: string;
  setDomainsText: (text: string) => void;
}

export function CreateServiceDomainsTab({
  domainsText,
  setDomainsText,
}: CreateServiceDomainsTabProps) {
  return (
    <TabsContent value="domains" className="mt-0 space-y-4">
      <div>
        <h4 className="text-sm font-medium">Custom Domains</h4>
        <p className="text-xs text-muted-foreground">One domain per line. You can verify and configure SSL after creation.</p>
      </div>
      <Textarea
        value={domainsText}
        onChange={(e) => setDomainsText(e.target.value)}
        placeholder={`api.example.com
app.example.com
# Lines starting with # are ignored`}
        className="font-mono text-sm min-h-[150px]"
      />
      <div className="p-3 bg-muted rounded-lg text-sm">
        <div className="flex items-start gap-2">
          <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="font-medium">After creation:</p>
            <ul className="text-muted-foreground text-xs mt-1 list-disc list-inside">
              <li>Add DNS records pointing to your server</li>
              <li>Verify domain ownership</li>
              <li>SSL certificates will be auto-provisioned</li>
            </ul>
          </div>
        </div>
      </div>
    </TabsContent>
  );
}
