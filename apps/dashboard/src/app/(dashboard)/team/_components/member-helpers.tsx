import {
  Crown,
  ShieldCheck,
  Code,
  Eye,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type Role = 'owner' | 'admin' | 'developer' | 'viewer';

export interface TeamMember {
  id: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  role: Role;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface TeamData {
  current_user_id: string;
  org: Org;
  members: TeamMember[];
}

export const roleConfig: Record<Role, { label: string; icon: React.ElementType; color: string }> = {
  owner: { label: 'Owner', icon: Crown, color: 'bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-500/30' },
  admin: { label: 'Admin', icon: ShieldCheck, color: 'bg-purple-500/10 text-purple-700 border-purple-300 dark:text-purple-400 dark:border-purple-500/30' },
  developer: { label: 'Developer', icon: Code, color: 'bg-blue-500/10 text-blue-700 border-blue-300 dark:text-blue-400 dark:border-blue-500/30' },
  viewer: { label: 'Viewer', icon: Eye, color: 'bg-zinc-500/10 text-zinc-600 border-zinc-300 dark:text-zinc-400 dark:border-zinc-500/30' },
};

export function RoleBadge({ role }: { role: Role }) {
  const config = roleConfig[role];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.color} gap-1 font-medium`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export function MemberAvatar({ name, image }: { name: string | null; image: string | null }) {
  if (image) {
    return (
      <img
        src={image}
        alt={name || 'Member'}
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }

  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
      {initial}
    </div>
  );
}

export function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
