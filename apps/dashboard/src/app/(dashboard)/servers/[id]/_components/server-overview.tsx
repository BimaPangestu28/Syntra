'use client';

import { useState } from 'react';
import {
  Clock,
  KeyRound,
  RefreshCw,
  AlertTriangle,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface ServerDetail {
  id: string;
  os_name?: string;
  os_version?: string;
  arch?: string;
  runtime?: string;
  runtime_version?: string;
  agent_version?: string;
  public_ip?: string;
  private_ip?: string;
  hostname?: string;
  agent_id?: string;
  last_heartbeat_at?: string;
  created_at: string;
}

interface ServerOverviewProps {
  server: ServerDetail;
  installCommand: string | null;
  regenerating: boolean;
  onRegenerateToken: () => void;
}

export function ServerOverview({
  server,
  installCommand,
  regenerating,
  onRegenerateToken,
}: ServerOverviewProps) {
  const [copied, setCopied] = useState(false);

  function copyToClipboard() {
    if (installCommand) {
      navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Operating System</p>
                <p className="font-medium">
                  {server.os_name || '-'} {server.os_version || ''}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Architecture</p>
                <p className="font-medium">{server.arch || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Runtime</p>
                <p className="font-medium">
                  {server.runtime || '-'} {server.runtime_version || ''}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Agent Version</p>
                <p className="font-medium">{server.agent_version || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Network</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Public IP</p>
                <p className="font-mono font-medium">{server.public_ip || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Private IP</p>
                <p className="font-mono font-medium">{server.private_ip || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hostname</p>
                <p className="font-medium">{server.hostname || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Agent ID</p>
                <p className="font-mono text-sm">{server.agent_id || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Last Heartbeat:</span>
              <span className="font-medium">
                {server.last_heartbeat_at
                  ? new Date(server.last_heartbeat_at).toLocaleString()
                  : 'Never'}
              </span>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Created:</span>
              <span className="font-medium">
                {new Date(server.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent Token Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Agent Token
          </CardTitle>
          <CardDescription>
            Regenerate the agent token if you lost the install command or need to reconnect the agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {installCommand ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                <p className="text-sm text-yellow-500">
                  Copy this command now. The token will only be shown once.
                </p>
              </div>
              <div className="relative">
                <pre className="p-6 rounded-lg bg-muted font-mono text-sm leading-relaxed overflow-x-auto">
                  {installCommand}
                </pre>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute top-2 right-2"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Run this command on your server to install and connect the agent.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={onRegenerateToken}
                disabled={regenerating}
              >
                {regenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4 mr-2" />
                    Regenerate Token
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                This will invalidate the current token and generate a new install command.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
