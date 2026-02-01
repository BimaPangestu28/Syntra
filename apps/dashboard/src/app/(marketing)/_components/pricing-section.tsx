'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

interface PlanProps {
  name: string;
  tagline: string;
  price: string;
  features: string[];
  href: string;
  buttonText: string;
  highlighted?: boolean;
}

function PlanCard({ name, tagline, price, features, href, buttonText, highlighted }: PlanProps) {
  const cardClass = highlighted
    ? 'rounded-2xl p-8 bg-white/10 border border-white/20 relative'
    : 'rounded-2xl glass p-8';

  return (
    <div className={cardClass}>
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white text-xs font-medium">
          Popular
        </div>
      )}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-1">{name}</h3>
        <p className="text-sm text-muted-foreground">{tagline}</p>
      </div>
      <div className="mb-6">
        <span className="text-4xl font-bold">{price}</span>
        <span className="text-muted-foreground">/month</span>
      </div>
      <ul className="space-y-3 mb-8">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm">
            <Check className="w-4 h-4 text-white" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link href={href} className="block">
        {highlighted ? (
          <Button className="w-full bg-white hover:bg-white/90 border-0">
            {buttonText}
          </Button>
        ) : (
          <Button variant="outline" className="w-full glass border-white/10 hover:bg-white/10">
            {buttonText}
          </Button>
        )}
      </Link>
    </div>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-32 px-6 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4">
            Simple,{' '}
            <span className="text-white">transparent</span>
            {' '}pricing
          </h2>
          <p className="text-xl text-muted-foreground">
            Start free, scale as you grow
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <PlanCard
            name="Hobby"
            tagline="For side projects"
            price="$0"
            features={['1 Server', '3 Projects', '100 Deployments/mo', 'Community Support', '7-day Log Retention']}
            href="/login"
            buttonText="Get Started"
          />
          <PlanCard
            name="Pro"
            tagline="For growing teams"
            price="$29"
            features={['5 Servers', 'Unlimited Projects', 'Unlimited Deployments', 'AI Error Analysis', 'Preview Environments', 'Custom Domains + SSL', '30-day Log Retention']}
            href="/login?plan=pro"
            buttonText="Start Free Trial"
            highlighted
          />
          <PlanCard
            name="Team"
            tagline="For scaling startups"
            price="$99"
            features={['20 Servers', 'Everything in Pro', 'Team Members (10)', 'Role-Based Access', 'Workflow Automation', 'Audit Logs', '90-day Log Retention']}
            href="/login?plan=team"
            buttonText="Start Free Trial"
          />
        </div>

        <p className="text-center text-muted-foreground mt-8">
          Need more?{' '}
          <a href="/contact" className="text-white hover:underline">
            Contact us for Enterprise pricing
          </a>
        </p>
      </div>
    </section>
  );
}
