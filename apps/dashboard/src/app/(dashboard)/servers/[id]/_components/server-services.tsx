import Link from 'next/link';
import { Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ServiceItem {
  id: string;
  name: string;
  type: string;
  project: {
    id: string;
    name: string;
  };
  is_active: boolean;
}

interface ServerServicesProps {
  services: ServiceItem[];
}

export function ServerServices({ services }: ServerServicesProps) {
  if (services.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-12">
        <Server className="h-10 w-10 text-muted-foreground mb-4" />
        <h3 className="font-semibold">No services deployed</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Assign this server to a service to deploy
        </p>
        <Button asChild>
          <Link href="/services">Go to Services</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((service) => (
            <TableRow key={service.id}>
              <TableCell>
                <Link href={`/services/${service.id}`} className="font-medium hover:underline">
                  {service.name}
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/projects/${service.project.id}`} className="hover:underline">
                  {service.project.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{service.type}</Badge>
              </TableCell>
              <TableCell>
                {service.is_active ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
