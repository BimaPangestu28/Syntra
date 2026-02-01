import { Terminal } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ServerLogs() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Logs</CardTitle>
        <CardDescription>Real-time logs from the agent on this server</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-slate-900 p-4 h-96 overflow-auto">
          <div className="flex items-center justify-center h-full text-slate-400">
            <Terminal className="h-8 w-8 mr-2" />
            <span>Log streaming coming soon...</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
