'use client';

import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface CreateServiceEnvTabProps {
  envVarsText: string;
  setEnvVarsText: (text: string) => void;
  secretsText: string;
  setSecretsText: (text: string) => void;
}

export function CreateServiceEnvTab({
  envVarsText,
  setEnvVarsText,
  secretsText,
  setSecretsText,
}: CreateServiceEnvTabProps) {
  return (
    <TabsContent value="env" className="mt-0 space-y-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-medium">Environment Variables</h4>
            <p className="text-xs text-muted-foreground">Non-sensitive values, stored as plain text</p>
          </div>
          <Textarea
            value={envVarsText}
            onChange={(e) => setEnvVarsText(e.target.value)}
            placeholder={`NODE_ENV=production
LOG_LEVEL=info
# Lines starting with # are ignored`}
            className="font-mono text-sm min-h-[100px]"
          />
        </div>

        <div className="space-y-2 pt-4 border-t">
          <div className="flex items-start gap-2">
            <div className="p-1.5 rounded bg-yellow-500/10">
              <svg className="h-4 w-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-medium">Secrets (Encrypted)</h4>
              <p className="text-xs text-muted-foreground">Sensitive values like API keys, passwords - stored with AES-256 encryption</p>
            </div>
          </div>
          <Textarea
            value={secretsText}
            onChange={(e) => setSecretsText(e.target.value)}
            placeholder={`DATABASE_URL=postgresql://user:password@host:5432/db
API_KEY=sk-xxxxxxxxxxxx
# Secrets are encrypted at rest`}
            className="font-mono text-sm min-h-[100px]"
          />
          <p className="text-xs text-muted-foreground">
            At runtime, access via <code className="bg-muted px-1 rounded">process.env.SECRET_NAME</code>
          </p>
        </div>
      </div>
    </TabsContent>
  );
}
