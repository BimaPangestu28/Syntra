import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { type ServiceDetail } from './service-types';

interface ConfigurationTabProps {
  service: ServiceDetail;
}

export function ConfigurationTab({ service }: ConfigurationTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Service Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label className="text-muted-foreground">Source Type</Label>
            <p className="font-medium capitalize">{service.source_type.replace('_', ' ')}</p>
          </div>
          {service.docker_image && (
            <div>
              <Label className="text-muted-foreground">Docker Image</Label>
              <p className="font-mono text-sm">{service.docker_image}</p>
            </div>
          )}
          {service.dockerfile_path && (
            <div>
              <Label className="text-muted-foreground">Dockerfile Path</Label>
              <p className="font-mono text-sm">{service.dockerfile_path}</p>
            </div>
          )}
          <div>
            <Label className="text-muted-foreground">Health Check Path</Label>
            <p className="font-mono text-sm">{service.health_check_path || '/'}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Health Check Interval</Label>
            <p className="font-medium">{service.health_check_interval || 30}s</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Auto Deploy</Label>
            <p className="font-medium">{service.auto_deploy ? 'Enabled' : 'Disabled'}</p>
          </div>
        </div>

        {service.resources && (
          <>
            <Separator />
            <div>
              <h4 className="font-medium mb-4">Resource Limits</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">CPU Limit</Label>
                  <p className="font-medium">{service.resources.cpu_limit || 'No limit'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Memory Limit</Label>
                  <p className="font-medium">{service.resources.memory_limit || 'No limit'}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
