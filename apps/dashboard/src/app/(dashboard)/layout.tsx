import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Bot } from 'lucide-react';
import { AIChatTrigger } from '@/components/ai';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { NotificationBell } from '@/components/layout/notification-bell';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { Toaster } from 'sonner';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">Syntra</span>
          </Link>
        </div>

        {/* Navigation */}
        <SidebarNav />

        {/* Notifications */}
        <div className="px-4 pb-2">
          <NotificationBell />
        </div>

        {/* User section */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center space-x-3">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || 'User'}
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <span className="text-sm font-medium text-muted-foreground">
                  {session.user.name?.[0] || session.user.email?.[0] || 'U'}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {session.user.name || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {session.user.email}
              </p>
            </div>
            <form
              action={async () => {
                'use server';
                const { signOut } = await import('@/lib/auth');
                await signOut({ redirectTo: '/login' });
              }}
            >
              <button
                type="submit"
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <ConfirmProvider>
          <div className="p-8">{children}</div>
        </ConfirmProvider>
      </main>

      {/* AI Chat Trigger */}
      <AIChatTrigger />
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </div>
  );
}
