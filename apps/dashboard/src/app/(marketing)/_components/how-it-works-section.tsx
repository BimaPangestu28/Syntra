'use client';

import { Terminal, GitBranch, Zap } from 'lucide-react';

export function HowItWorksSection() {
  const steps = [
    {
      step: '01',
      title: 'Connect Your Server',
      description: 'Run our one-liner to install the agent. Works on any Linux machine.',
      icon: Terminal,
    },
    {
      step: '02',
      title: 'Push Your Code',
      description: 'Connect your git repo. We auto-detect your framework and build.',
      icon: GitBranch,
    },
    {
      step: '03',
      title: 'Go Live',
      description: 'Your app is deployed with SSL, monitoring, and AI-powered insights.',
      icon: Zap,
    },
  ];

  return (
    <section className="relative py-32 px-6 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4">
            Deploy in{' '}
            <span className="text-white">60 seconds</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            From zero to production in three steps
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((item, i) => (
            <div key={item.step} className="relative">
              {i < 2 && (
                <div className="hidden md:block absolute top-12 left-full w-full h-px bg-white/30 -translate-x-1/2" />
              )}
              <div className="text-6xl font-bold text-white/5 mb-4">{item.step}</div>
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-4">
                <item.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
              <p className="text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
