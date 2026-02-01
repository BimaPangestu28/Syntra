'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Play,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-muted-foreground">Now in Public Beta</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
            Deploy on{' '}
            <span className="text-white">your infrastructure</span>
            <br />
            with AI superpowers
          </h1>

          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            The platform that turns your servers into a powerful PaaS.
            Ship faster with AI-powered deployments, monitoring, and debugging.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link href="/login">
              <Button size="lg" className="bg-white hover:bg-white/90 border-0 h-12 px-8 text-base">
                Start Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base glass border-white/10 hover:bg-white/10">
              <Play className="w-4 h-4 mr-2" />
              Watch Demo
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Free forever for small projects. No credit card required.
          </p>
        </div>

        {/* Hero Visual - Terminal */}
        <div className="mt-20 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none h-32 bottom-0 top-auto" />

          {/* Glow effect behind terminal */}
          <div className="absolute inset-0 bg-white/10 blur-3xl -z-10 scale-95" />

          <div className="rounded-2xl glass overflow-hidden border border-white/10">
            {/* Terminal Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <div className="w-3 h-3 rounded-full bg-white/20" />
                <div className="w-3 h-3 rounded-full bg-white/20" />
              </div>
              <span className="text-xs text-muted-foreground ml-3 font-mono">~/my-app</span>
            </div>

            {/* Terminal Content */}
            <div className="p-6 font-mono text-sm space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-white">$</span>
                <span>curl -sSL {process.env.NEXT_PUBLIC_INSTALL_SCRIPT_URL || 'https://get.syntra.catalystlabs.id'} | bash</span>
              </div>
              <div className="text-muted-foreground pl-4 space-y-1">
                <p>Installing Syntra Agent v2.1.0...</p>
                <p className="text-green-400">✓ Connected to your Syntra workspace</p>
              </div>
              <div className="flex items-start gap-2 pt-2">
                <span className="text-white">$</span>
                <span>syntra deploy</span>
              </div>
              <div className="text-muted-foreground pl-4 space-y-1">
                <p>Detected: Next.js 14 application</p>
                <p>Building with Docker...</p>
                <p className="text-green-400">✓ Build completed in 45s</p>
                <p className="text-green-400">✓ Deployed to production</p>
              </div>
              <div className="pt-2 pl-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-white" />
                <span className="text-white">AI:</span>
                <span className="text-muted-foreground">Found potential N+1 query in /api/users. Want me to fix it?</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
