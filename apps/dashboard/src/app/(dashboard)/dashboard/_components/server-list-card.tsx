import Link from 'next/link';
import {
  Server,
  Plus,
  Wifi,
  WifiOff,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ServerItem {
  id: string;
  name: string;
  hostname: string | null;
  status: string;
  publicIp: string | null;
  lastHeartbeatAt: Date | null;
}

interface ServerListCardProps {
  servers: ServerItem[];
}

function formatTimeAgo(date: Date | null) {
  if (!date) return 'Never';
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function ServerListCard({ servers }: ServerListCardProps) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">Servers</CardTitle>
          <CardDescription>Real-time status</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/servers">
            View all
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Server className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No servers connected</p>
            <Button size="sm" className="mt-3" asChild>
              <Link href="/servers">
                <Plus className="mr-2 h-4 w-4" />
                Add Server
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {servers.slice(0, 6).map((server) => (
              <Link
                key={server.id}
                href={`/servers/${server.id}`}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-md ${server.status === 'online' ? 'bg-green-500/10' : 'bg-slate-500/10'}`}>
                    {server.status === 'online' ? (
                      <Wifi className="h-4 w-4 text-green-500" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-none">{server.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {server.publicIp || server.hostname}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={server.status === 'online' ? 'success' : 'secondary'} className="text-xs">
                    {server.status}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatTimeAgo(server.lastHeartbeatAt)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
