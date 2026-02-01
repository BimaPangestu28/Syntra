'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Zap, Github } from 'lucide-react';

export function NavSection() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-background/50 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
              <Zap className="w-5 h-5 text-black" />
            </div>
            <span className="text-xl font-bold">Syntra</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-white transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-white transition-colors">
              Pricing
            </a>
            <a href="https://docs.syntra.catalystlabs.id" className="text-sm text-muted-foreground hover:text-white transition-colors">
              Docs
            </a>
            <a href="https://github.com/syntra" className="text-sm text-muted-foreground hover:text-white transition-colors">
              <Github className="w-5 h-5" />
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white">
                Log in
              </Button>
            </Link>
            <Link href="/login">
              <Button size="sm" className="bg-white hover:bg-white/90 border-0">
                Start Building
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
