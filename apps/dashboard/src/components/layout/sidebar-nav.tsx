'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Server,
  FolderKanban,
  Layers,
  Rocket,
  Activity,
  Users,
  Settings,
  GitBranch,
  Network,
  ScrollText,
  BarChart3,
  Bell,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

const sidebarItems: SidebarItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'Services', href: '/services', icon: Layers },
  { name: 'Servers', href: '/servers', icon: Server },
  { name: 'Deployments', href: '/deployments', icon: Rocket },
  { name: 'Traces', href: '/traces', icon: Network },
  { name: 'Logs', href: '/logs', icon: ScrollText },
  { name: 'Metrics', href: '/metrics', icon: BarChart3 },
  { name: 'Alerts', href: '/alerts', icon: Bell },
  { name: 'Workflows', href: '/workflows', icon: GitBranch },
  { name: 'Activity', href: '/activity', icon: Activity },
  { name: 'Team', href: '/team', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-4 py-6 space-y-2">
      {sidebarItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors',
              isActive
                ? 'bg-white text-black'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <item.icon className="w-5 h-5 mr-3" />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
