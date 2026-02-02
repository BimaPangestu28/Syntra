'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface UsageItem {
  type: string;
  current: number;
  limit: number | null;
}

interface UsageCardProps {
  usage: UsageItem[];
}

const USAGE_LABELS: Record<string, string> = {
  compute_minutes: 'Compute Minutes',
  build_minutes: 'Build Minutes',
  storage_gb: 'Storage (GB)',
  bandwidth_gb: 'Bandwidth (GB)',
  deployments: 'Deployments',
  previews: 'Preview Environments',
  team_members: 'Team Members',
  servers: 'Servers',
};

export function UsageCard({ usage }: UsageCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage This Period</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {usage.map((item) => {
          const percentage = item.limit ? Math.min((item.current / item.limit) * 100, 100) : 0;
          const isNearLimit = percentage > 80;
          const isOverLimit = percentage >= 100;

          return (
            <div key={item.type} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{USAGE_LABELS[item.type] || item.type}</span>
                <span className={isOverLimit ? 'text-destructive font-medium' : isNearLimit ? 'text-yellow-600 font-medium' : 'text-muted-foreground'}>
                  {item.current.toLocaleString()}
                  {item.limit !== null ? ` / ${item.limit.toLocaleString()}` : ' (unlimited)'}
                </span>
              </div>
              {item.limit !== null && (
                <Progress
                  value={percentage}
                  className={isOverLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-yellow-500' : ''}
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
