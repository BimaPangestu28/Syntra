'use client';

import {
  Server,
  GitBranch,
  Bot,
  Sparkles,
  Boxes,
  Activity,
  Lock,
  Workflow,
} from 'lucide-react';

export function FeaturesSection() {
  return (
    <>
      {/* Logos */}
      <section className="relative py-16 border-y border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-sm text-muted-foreground mb-8">
            Trusted by developers building the future
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-8">
            {['Vercel', 'Supabase', 'Linear', 'Resend', 'Clerk', 'Neon'].map((company) => (
              <span key={company} className="text-xl font-semibold text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                {company}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features - Bento Grid */}
      <section id="features" className="relative py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">
              Everything you need to{' '}
              <span className="text-white">ship fast</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              A complete platform for deploying and scaling applications
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Large Feature Card */}
            <div className="md:col-span-2 lg:col-span-2 rounded-2xl glass p-8 group hover:bg-white/[0.07] transition-colors">
              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-6">
                <Bot className="w-6 h-6 text-black" />
              </div>
              <h3 className="text-2xl font-semibold mb-3">AI-Powered Operations</h3>
              <p className="text-muted-foreground mb-6 max-w-lg">
                Your AI co-pilot that understands your entire stack. Get instant root cause analysis,
                performance recommendations, and auto-fixes.
              </p>
              <div className="rounded-xl bg-black/30 p-4 font-mono text-sm">
                <div className="flex items-center gap-2 text-white">
                  <Sparkles className="w-4 h-4" />
                  <span>AI detected memory leak in worker.ts:142</span>
                </div>
                <p className="text-muted-foreground mt-2 pl-6">
                  Suggestion: Add cleanup in useEffect return. Apply fix?
                </p>
              </div>
            </div>

            {/* Small Feature Cards */}
            {[
              { icon: Server, title: 'Bring Your Servers', desc: 'One command to connect any Linux server. Keep your infrastructure, gain superpowers.' },
              { icon: GitBranch, title: 'Git Push to Deploy', desc: 'Connect GitHub, GitLab, or Bitbucket. Every push triggers a deployment.' },
              { icon: Boxes, title: 'Preview Environments', desc: 'Every PR gets its own environment. Share previews with your team instantly.' },
              { icon: Activity, title: 'Real-time Monitoring', desc: 'Metrics, logs, and traces in one place. Know exactly what\'s happening.' },
              { icon: Workflow, title: 'Visual Workflows', desc: 'Build automations with drag-and-drop. Auto-scale, alert, and self-heal.' },
              { icon: Lock, title: 'Enterprise Security', desc: 'SOC2 compliant. SSO, RBAC, audit logs, and encrypted secrets built-in.' },
            ].map((feature) => (
              <div key={feature.title} className="rounded-2xl glass p-6 group hover:bg-white/[0.07] transition-colors">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center mb-4 group-hover:bg-white/30 transition-colors">
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
