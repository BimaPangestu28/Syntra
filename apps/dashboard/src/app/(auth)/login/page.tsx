'use client';

import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Github, Zap, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const handleGitHubSignIn = () => {
    // Use current origin to ensure correct port
    const callbackUrl = `${window.location.origin}/dashboard`;
    signIn('github', { callbackUrl });
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-3">
        <Link href="/" className="inline-flex items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-black" />
          </div>
        </Link>
        <h1 className="text-xl font-semibold">Welcome back</h1>
        <p className="text-muted-foreground">
          Sign in to continue to Syntra
        </p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <Button
          onClick={handleGitHubSignIn}
          className="w-full h-12 bg-white text-black hover:bg-white/90"
          size="lg"
        >
          <Github className="mr-2 h-5 w-5" />
          Continue with GitHub
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-transparent px-2 text-muted-foreground">
              More providers coming soon
            </span>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          By signing in, you agree to our{' '}
          <Link href="/terms" className="text-white hover:underline">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-white hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>

      <div className="text-center">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
