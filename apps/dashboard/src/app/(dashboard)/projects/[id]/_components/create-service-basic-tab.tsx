'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TabsContent } from '@/components/ui/tabs';
import type { ServerOption } from './types';

interface CreateServiceBasicTabProps {
  serviceForm: {
    name: string;
    type: string;
    source_type: string;
    docker_image: string;
    dockerfile_path: string;
    port: number;
    expose_enabled: boolean;
    expose_port: string;
    replicas: number;
    server_id: string;
    health_check_path: string;
  };
  setServiceForm: (form: CreateServiceBasicTabProps['serviceForm']) => void;
  servers: ServerOption[];
}

export function CreateServiceBasicTab({
  serviceForm,
  setServiceForm,
  servers,
}: CreateServiceBasicTabProps) {
  return (
    <TabsContent value="basic" className="mt-0 space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="service-name">Service Name *</Label>
        <Input
          id="service-name"
          value={serviceForm.name}
          onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
          placeholder="api-server"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Type</Label>
          <Select
            value={serviceForm.type}
            onValueChange={(v) => setServiceForm({ ...serviceForm, type: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="web">Web</SelectItem>
              <SelectItem value="api">API</SelectItem>
              <SelectItem value="worker">Worker</SelectItem>
              <SelectItem value="cron">Cron</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Source</Label>
          <Select
            value={serviceForm.source_type}
            onValueChange={(v) => setServiceForm({ ...serviceForm, source_type: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="git">Git (Dockerfile)</SelectItem>
              <SelectItem value="docker_image">Docker Image</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {serviceForm.source_type === 'docker_image' && (
        <div className="grid gap-2">
          <Label htmlFor="docker-image">Docker Image</Label>
          <Input
            id="docker-image"
            value={serviceForm.docker_image}
            onChange={(e) => setServiceForm({ ...serviceForm, docker_image: e.target.value })}
            placeholder="nginx:latest"
          />
        </div>
      )}
      {serviceForm.source_type === 'git' && (
        <div className="grid gap-2">
          <Label htmlFor="dockerfile-path">Dockerfile Path</Label>
          <Input
            id="dockerfile-path"
            value={serviceForm.dockerfile_path}
            onChange={(e) => setServiceForm({ ...serviceForm, dockerfile_path: e.target.value })}
            placeholder="Dockerfile"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="port">Port</Label>
          <Input
            id="port"
            type="number"
            value={serviceForm.port}
            onChange={(e) => setServiceForm({ ...serviceForm, port: parseInt(e.target.value) || 3000 })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="replicas">Replicas</Label>
          <Input
            id="replicas"
            type="number"
            min={1}
            max={10}
            value={serviceForm.replicas}
            onChange={(e) => setServiceForm({ ...serviceForm, replicas: parseInt(e.target.value) || 1 })}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="health-check">Health Check Path</Label>
        <Input
          id="health-check"
          value={serviceForm.health_check_path}
          onChange={(e) => setServiceForm({ ...serviceForm, health_check_path: e.target.value })}
          placeholder="/"
        />
      </div>
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Expose Port</Label>
            <p className="text-xs text-muted-foreground">Access via server IP without domain</p>
          </div>
          <Button
            type="button"
            variant={serviceForm.expose_enabled ? 'default' : 'outline'}
            size="sm"
            onClick={() => setServiceForm({
              ...serviceForm,
              expose_enabled: !serviceForm.expose_enabled,
              expose_port: !serviceForm.expose_enabled ? String(serviceForm.port) : ''
            })}
          >
            {serviceForm.expose_enabled ? 'Enabled' : 'Disabled'}
          </Button>
        </div>
        {serviceForm.expose_enabled && (
          <div className="flex items-center gap-2">
            <Label htmlFor="expose-port" className="shrink-0 text-sm">External Port:</Label>
            <Input
              id="expose-port"
              type="number"
              min={1}
              max={65535}
              value={serviceForm.expose_port}
              onChange={(e) => setServiceForm({ ...serviceForm, expose_port: e.target.value })}
              placeholder="8080"
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">
              → container:{serviceForm.port}
            </span>
          </div>
        )}
      </div>
      <div className="grid gap-2">
        <Label>Deploy Server</Label>
        <Select
          value={serviceForm.server_id}
          onValueChange={(v) => setServiceForm({ ...serviceForm, server_id: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a server (optional)" />
          </SelectTrigger>
          <SelectContent>
            {servers.map((server) => (
              <SelectItem key={server.id} value={server.id}>
                {server.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </TabsContent>
  );
}
