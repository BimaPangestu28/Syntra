'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export function CtaSection() {
  return (
    <section className="relative py-32 px-6 border-t border-white/5">
      <div className="max-w-4xl mx-auto text-center">
        {/* Glow */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[500px] h-[300px] bg-white/20 rounded-full blur-[100px]" />
        </div>

        <div className="relative">
          <h2 className="text-4xl sm:text-5xl font-bold mb-6">
            Ready to deploy{' '}
            <span className="text-white">smarter</span>?
          </h2>
          <p className="text-xl text-muted-foreground mb-10">
            Join thousands of developers shipping faster with Syntra
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg" className="bg-white hover:bg-white/90 border-0 h-12 px-8 text-base">
                Start Building Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <a href="https://cal.com/syntra/demo">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base glass border-white/10 hover:bg-white/10">
                Book a Demo
              </Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
