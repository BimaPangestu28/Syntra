'use client';

import { NavSection } from './_components/nav-section';
import { HeroSection } from './_components/hero-section';
import { FeaturesSection } from './_components/features-section';
import { HowItWorksSection } from './_components/how-it-works-section';
import { PricingSection } from './_components/pricing-section';
import { CtaSection } from './_components/cta-section';
import { FooterSection } from './_components/footer-section';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 bg-grid opacity-50" />
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-white/10 rounded-full blur-[120px]" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-white/10 rounded-full blur-[120px]" />

      <NavSection />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <CtaSection />
      <FooterSection />
    </div>
  );
}
