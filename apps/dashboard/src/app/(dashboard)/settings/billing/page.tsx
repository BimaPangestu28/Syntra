'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, ExternalLink, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UsageCard } from '@/components/billing/usage-card';
import { PlanSelectorDialog } from '@/components/billing/plan-selector-dialog';
import { toast } from 'sonner';

interface BillingData {
  org: {
    id: string;
    name: string;
    plan: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  };
  plans: Array<{
    id: string;
    name: string;
    display_name: string;
    description: string;
    price_monthly: number;
    features: string[];
  }>;
  usage: Array<{
    type: string;
    current: number;
    limit: number | null;
  }>;
  invoices: Array<{
    id: string;
    status: string;
    total: number;
    currency: string;
    period_start: string;
    period_end: string;
    paid_at: string | null;
    pdf_url: string | null;
  }>;
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBilling = useCallback(async () => {
    try {
      // Get org info
      const teamRes = await fetch('/api/v1/team');
      const teamData = await teamRes.json();
      if (!teamData.success || !teamData.data.org) {
        setLoading(false);
        return;
      }

      const org = teamData.data.org;

      // Fetch plans, usage, and invoices in parallel
      const [plansRes, usageRes] = await Promise.all([
        fetch('/api/v1/billing/plans'),
        fetch(`/api/v1/billing/usage?org_id=${org.id}`),
      ]);

      const plansData = await plansRes.json().catch(() => ({ success: false }));
      const usageData = await usageRes.json().catch(() => ({ success: false }));

      setData({
        org: {
          id: org.id,
          name: org.name,
          plan: org.plan || 'free',
          stripe_customer_id: null,
          stripe_subscription_id: null,
        },
        plans: plansData.success ? plansData.data : [],
        usage: usageData.success
          ? usageData.data.usage.map((u: any) => ({
              type: u.type,
              current: u.quantity,
              limit: null, // Will be populated from plan limits
            }))
          : [],
        invoices: [],
      });
    } catch (error) {
      console.error('Failed to fetch billing data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  async function handleManageBilling() {
    if (!data?.org) return;
    try {
      const res = await fetch('/api/v1/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: data.org.id }),
      });
      const result = await res.json();
      if (result.success && result.data.portal_url) {
        window.location.href = result.data.portal_url;
      } else {
        toast.error(result.error?.message || 'Failed to open billing portal');
      }
    } catch (error) {
      toast.error('Failed to open billing portal');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Unable to load billing</h3>
      </div>
    );
  }

  const PLAN_LABELS: Record<string, string> = {
    free: 'Free',
    hobby: 'Hobby',
    pro: 'Pro',
    team: 'Team',
    enterprise: 'Enterprise',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and usage for {data.org.name}
        </p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Current Plan</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {data.org.stripe_subscription_id && (
              <Button variant="outline" onClick={handleManageBilling}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Manage Billing
              </Button>
            )}
            <PlanSelectorDialog
              orgId={data.org.id}
              currentPlan={data.org.plan}
              plans={data.plans}
              onUpgraded={fetchBilling}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-lg px-3 py-1">
              {PLAN_LABELS[data.org.plan] || data.org.plan}
            </Badge>
            {data.org.plan === 'free' && (
              <span className="text-sm text-muted-foreground">
                Upgrade to unlock more resources and features
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
      {data.usage.length > 0 && <UsageCard usage={data.usage} />}

      {/* Invoices */}
      {data.invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invoice History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">
                        {new Date(invoice.period_start).toLocaleDateString()} -{' '}
                        {new Date(invoice.period_end).toLocaleDateString()}
                      </div>
                      <Badge
                        variant={invoice.status === 'paid' ? 'secondary' : 'destructive'}
                        className="text-xs"
                      >
                        {invoice.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      ${(invoice.total / 100).toFixed(2)} {invoice.currency.toUpperCase()}
                    </span>
                    {invoice.pdf_url && (
                      <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
