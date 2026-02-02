'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

interface Plan {
  id: string;
  name: string;
  display_name: string;
  description: string;
  price_monthly: number;
  features: string[];
}

interface PlanSelectorDialogProps {
  orgId: string;
  currentPlan: string;
  plans: Plan[];
  onUpgraded: () => void;
}

export function PlanSelectorDialog({ orgId, currentPlan, plans, onUpgraded }: PlanSelectorDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSelectPlan(planId: string) {
    setLoading(planId);
    try {
      const res = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, plan_id: planId }),
      });

      const data = await res.json();
      if (data.success && data.data.checkout_url) {
        window.location.href = data.data.checkout_url;
      } else {
        toast.error(data.error?.message || 'Failed to create checkout session');
      }
    } catch (error) {
      toast.error('Failed to initiate checkout');
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Upgrade Plan</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Choose a Plan</DialogTitle>
          <DialogDescription>
            Select the plan that best fits your needs.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          {plans
            .filter((p) => p.name !== 'enterprise' && p.price_monthly > 0)
            .map((plan) => (
              <Card
                key={plan.id}
                className={plan.name === currentPlan ? 'border-primary' : ''}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.display_name}</CardTitle>
                    {plan.name === currentPlan && (
                      <Badge variant="secondary">Current</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold mb-4">
                    ${(plan.price_monthly / 100).toFixed(0)}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </div>
                  <ul className="space-y-1 mb-4">
                    {plan.features.slice(0, 4).map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="h-3 w-3 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.name === currentPlan ? 'secondary' : 'default'}
                    disabled={plan.name === currentPlan || loading !== null}
                    onClick={() => handleSelectPlan(plan.id)}
                  >
                    {loading === plan.id ? 'Redirecting...' : plan.name === currentPlan ? 'Current Plan' : 'Select'}
                  </Button>
                </CardContent>
              </Card>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
