'use client';

import Link from 'next/link';
import { Rocket, GitCommit } from 'lucide-react';
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
import { type Deployment, statusColors } from './service-types';

interface DeploymentsTabProps {
  deployments: Deployment[];
  serverId?: string;
  deploying: boolean;
  onDeploy: () => void;
}

export function DeploymentsTab({ deployments, serverId, deploying, onDeploy }: DeploymentsTabProps) {
  if (deployments.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-12">
        <Rocket className="h-10 w-10 text-muted-foreground mb-4" />
        <h3 className="font-semibold">No deployments yet</h3>
        <p className="text-muted-foreground text-sm mb-4">
          {serverId
            ? 'Trigger your first deployment'
            : 'Assign a server first, then deploy'}
        </p>
        {serverId && (
          <Button onClick={onDeploy} disabled={deploying}>
            <Rocket className="mr-2 h-4 w-4" />
            Deploy Now
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Commit</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deployments.map((deployment) => (
            <TableRow key={deployment.id}>
              <TableCell>
                <Link href={`/deployments/${deployment.id}`}>
                  <Badge variant={statusColors[deployment.status] || 'secondary'}>
                    {deployment.status}
                  </Badge>
                </Link>
              </TableCell>
              <TableCell>
                {deployment.git_commit_sha ? (
                  <div className="flex items-center gap-2">
                    <GitCommit className="h-4 w-4 text-muted-foreground" />
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {deployment.git_commit_sha.substring(0, 7)}
                    </code>
                  </div>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell className="capitalize">{deployment.trigger_type || '-'}</TableCell>
              <TableCell>
                {new Date(deployment.created_at).toLocaleString()}
              </TableCell>
              <TableCell>
                {deployment.deploy_finished_at
                  ? `${Math.round((new Date(deployment.deploy_finished_at).getTime() - new Date(deployment.created_at).getTime()) / 1000)}s`
                  : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
