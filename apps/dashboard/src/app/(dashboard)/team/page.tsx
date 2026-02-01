'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { type Role, type TeamData } from './_components/member-helpers';
import { InviteDialog } from './_components/invite-dialog';
import { MemberList } from './_components/member-list';

export default function TeamPage() {
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { confirm } = useConfirm();

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/team');
      const data = await res.json();
      if (data.success) {
        setTeamData(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch team:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  async function handleChangeRole(memberId: string, newRole: Role) {
    setActionLoading(memberId);
    try {
      const res = await fetch(`/api/v1/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        fetchTeam();
        toast.success('Role updated');
      }
    } catch (error) {
      console.error('Failed to change role:', error);
      toast.error('Failed to change role');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRemoveMember(memberId: string) {
    const ok = await confirm({ title: 'Remove Member', description: 'Are you sure you want to remove this member?', confirmLabel: 'Remove', variant: 'destructive' });
    if (!ok) return;
    setActionLoading(memberId);
    try {
      const res = await fetch(`/api/v1/team/${memberId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchTeam();
        toast.success('Member removed');
      }
    } catch (error) {
      console.error('Failed to remove member:', error);
      toast.error('Failed to remove member');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLeaveOrg() {
    const ok = await confirm({ title: 'Leave Organization', description: 'Are you sure you want to leave this organization? You will lose access to all resources.', confirmLabel: 'Leave', variant: 'destructive' });
    if (!ok) return;
    const currentMember = teamData?.members.find((m) => m.user.id === teamData?.current_user_id);
    if (!currentMember) return;
    setActionLoading(currentMember.id);
    try {
      const res = await fetch(`/api/v1/team/${currentMember.id}`, { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Failed to leave organization:', error);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-36" />
        </div>
        <Card>
          <div className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!teamData) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Unable to load team</h3>
        <p className="text-muted-foreground mb-4">
          Something went wrong while loading team data.
        </p>
        <Button onClick={() => { setLoading(true); fetchTeam(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  const currentMember = teamData.members.find((m) => m.user.id === teamData.current_user_id);
  const isOwner = currentMember?.role === 'owner';
  const canManage = isOwner || currentMember?.role === 'admin';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-muted-foreground">
            {teamData.members.length} {teamData.members.length === 1 ? 'member' : 'members'}
          </p>
        </div>
        {canManage && (
          <InviteDialog
            orgId={teamData.org.id}
            orgName={teamData.org.name}
            onInvited={fetchTeam}
          />
        )}
      </div>

      <MemberList
        members={teamData.members}
        currentUserId={teamData.current_user_id}
        orgName={teamData.org.name}
        canManage={canManage}
        isOwner={isOwner}
        actionLoading={actionLoading}
        onChangeRole={handleChangeRole}
        onRemoveMember={handleRemoveMember}
        onLeaveOrg={handleLeaveOrg}
        onOpenInvite={() => {}}
      />
    </div>
  );
}
