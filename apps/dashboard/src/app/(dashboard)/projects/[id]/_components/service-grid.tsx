'use client';

import Link from 'next/link';
import {
  Plus,
  Rocket,
  MoreHorizontal,
  Server,
  Activity,
  Code,
  Terminal,
  Clock,
  Play,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Service } from './types';

const serviceTypeConfig: Record<string, { color: string; icon: typeof Layers }> = {
  web: { color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: Code },
  api: { color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: Terminal },
  worker: { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', icon: Activity },
  cron: { color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', icon: Clock },
};

interface ServiceGridProps {
  services: Service[];
  onCreateClick: () => void;
  onDeleteService: (serviceId: string) => void;
  onTriggerDeploy: (serviceId: string) => void;
}

export function ServiceGrid({ services, onCreateClick, onDeleteService, onTriggerDeploy }: ServiceGridProps) {
  if (services.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="p-3 rounded-full bg-muted mb-4">
            <Layers className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-1">No services yet</h3>
          <p className="text-muted-foreground text-sm mb-4">Add your first service to start deploying</p>
          <Button onClick={onCreateClick}>
            <Plus className="mr-2 h-4 w-4" />
            Add Service
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => {
        const config = serviceTypeConfig[service.type] || serviceTypeConfig.web;
        const ServiceIcon = config.icon;

        return (
          <Card key={service.id} className="group hover:border-foreground/20 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn('p-2 rounded-lg border', config.color)}>
                    <ServiceIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      <Link href={`/services/${service.id}`} className="hover:underline">
                        {service.name}
                      </Link>
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {service.type} • Port {service.port}
                    </CardDescription>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/services/${service.id}`}>View Details</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onTriggerDeploy(service.id)}
                      disabled={!service.server}
                    >
                      <Rocket className="h-4 w-4 mr-2" />
                      Deploy
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onDeleteService(service.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {service.is_active ? (
                    <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                  {service.server ? (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Server className="h-3 w-3" />
                      {service.server.name}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No server</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => onTriggerDeploy(service.id)}
                  disabled={!service.server}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Deploy
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
