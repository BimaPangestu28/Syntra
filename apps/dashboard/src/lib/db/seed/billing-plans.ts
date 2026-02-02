import { db } from '@/lib/db';
import { billingPlans } from '@/lib/db/schema';

export async function seedBillingPlans() {
  const plans = [
    {
      name: 'free',
      displayName: 'Free',
      description: 'For personal projects and experiments',
      plan: 'free' as const,
      priceMonthly: 0,
      priceYearly: 0,
      limits: {
        compute_minutes: 1000,
        build_minutes: 100,
        storage_gb: 5,
        bandwidth_gb: 10,
        deployments: 50,
        previews: 3,
        team_members: 3,
        servers: 1,
      },
      features: ['1 server', 'Community support', 'Basic monitoring', 'Auto-deploy from Git'],
    },
    {
      name: 'hobby',
      displayName: 'Hobby',
      description: 'For indie hackers and side projects',
      plan: 'hobby' as const,
      priceMonthly: 900, // $9/month in cents
      priceYearly: 8400, // $84/year
      limits: {
        compute_minutes: 5000,
        build_minutes: 500,
        storage_gb: 25,
        bandwidth_gb: 100,
        deployments: 200,
        previews: 10,
        team_members: 5,
        servers: 3,
      },
      features: ['3 servers', 'Email support', 'Uptime monitoring', 'Custom domains', 'SSL certificates'],
    },
    {
      name: 'pro',
      displayName: 'Pro',
      description: 'For growing teams and production workloads',
      plan: 'pro' as const,
      priceMonthly: 2900, // $29/month
      priceYearly: 27600, // $276/year
      limits: {
        compute_minutes: 25000,
        build_minutes: 2000,
        storage_gb: 100,
        bandwidth_gb: 500,
        deployments: 1000,
        previews: 50,
        team_members: 20,
        servers: 10,
      },
      features: ['10 servers', 'Priority support', 'AI error analysis', 'Preview environments', 'Auto-scaling', 'Audit logs'],
    },
    {
      name: 'team',
      displayName: 'Team',
      description: 'For large teams with advanced needs',
      plan: 'team' as const,
      priceMonthly: 7900, // $79/month
      priceYearly: 75600, // $756/year
      limits: {
        compute_minutes: 100000,
        build_minutes: 10000,
        storage_gb: 500,
        bandwidth_gb: 2000,
        deployments: 5000,
        previews: 200,
        team_members: 50,
        servers: 50,
      },
      features: ['50 servers', 'Dedicated support', 'SSO/SAML', 'Advanced AI features', 'Custom workflows', 'SLA'],
    },
    {
      name: 'enterprise',
      displayName: 'Enterprise',
      description: 'Custom solutions for large organizations',
      plan: 'enterprise' as const,
      priceMonthly: 0, // Custom pricing
      priceYearly: 0,
      limits: {}, // No limits
      features: ['Unlimited servers', '24/7 support', 'Dedicated infrastructure', 'Custom integrations', 'On-premise option', 'Custom SLA'],
    },
  ];

  for (const plan of plans) {
    await db
      .insert(billingPlans)
      .values(plan)
      .onConflictDoUpdate({
        target: billingPlans.name,
        set: {
          displayName: plan.displayName,
          description: plan.description,
          priceMonthly: plan.priceMonthly,
          priceYearly: plan.priceYearly,
          limits: plan.limits,
          features: plan.features,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`[Seed] ${plans.length} billing plans upserted`);
}
