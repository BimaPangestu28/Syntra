'use client';

import { Bell, ShieldAlert } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertsList } from './_components/alerts-list';
import { AlertRulesList } from './_components/alert-rules-list';

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
        <p className="text-muted-foreground">
          Monitor and manage alerts across your infrastructure
        </p>
      </div>

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="h-4 w-4" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <ShieldAlert className="h-4 w-4" />
            Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="mt-6">
          <AlertsList />
        </TabsContent>
        <TabsContent value="rules" className="mt-6">
          <AlertRulesList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
