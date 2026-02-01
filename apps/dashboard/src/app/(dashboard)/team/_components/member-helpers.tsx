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
  owner: { label: 'Owner', icon: Crown, color: 'bg-purple-500/10 text-purple-600 border-purple-200' },
  admin: { label: 'Admin', icon: ShieldCheck, color: '' },
  developer: { label: 'Developer', icon: Code, color: '' },
  viewer: { label: 'Viewer', icon: Eye, color: '' },
};

const roleBadgeVariant: Record<Role, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'default',
  developer: 'secondary',
  viewer: 'outline',
};

export function RoleBadge({ role }: { role: Role }) {
  const config = roleConfig[role];
  const Icon = config.icon;

  if (role === 'owner') {
    return (
      <Badge className={`${config.color} gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  }

  return (
    <Badge variant={roleBadgeVariant[role]} className="gap-1">
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
