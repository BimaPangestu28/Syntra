'use client';

import {
  MoreHorizontal,
  Shield,
  Mail,
  Trash2,
  Loader2,
  Users,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type Role,
  type TeamMember,
  roleConfig,
  RoleBadge,
  MemberAvatar,
  formatDate,
} from './member-helpers';

interface MemberListProps {
  members: TeamMember[];
  currentUserId: string;
  orgName: string;
  canManage: boolean;
  isOwner: boolean;
  actionLoading: string | null;
  onChangeRole: (memberId: string, newRole: Role) => void;
  onRemoveMember: (memberId: string) => void;
  onLeaveOrg: () => void;
  onResendInvite?: (memberId: string) => void;
}

export function MemberList({
  members,
  currentUserId,
  orgName,
  canManage,
  isOwner,
  actionLoading,
  onChangeRole,
  onRemoveMember,
  onLeaveOrg,
  onResendInvite,
}: MemberListProps) {
  const activeMembers = members.filter((m) => m.accepted_at !== null);
  const pendingMembers = members.filter((m) => m.accepted_at === null);
  const currentMember = members.find((m) => m.user.id === currentUserId);

  if (activeMembers.length === 0 && pendingMembers.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-16">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No team members</h3>
        <p className="text-muted-foreground mb-4">
          Invite your first team member to get started.
        </p>
      </Card>
    );
  }

  return (
    <>
      {activeMembers.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeMembers.map((member) => {
                const isSelf = member.user.id === currentUserId;
                const isMemberOwner = member.role === 'owner';

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <MemberAvatar name={member.user.name} image={member.user.image} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {member.user.name || 'Unnamed'}
                            </span>
                            {isSelf && (
                              <span className="text-xs text-muted-foreground">(you)</span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{member.user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={member.role} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(member.accepted_at || member.created_at)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {canManage && !isMemberOwner && !isSelf && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              {actionLoading === member.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <Shield className="mr-2 h-4 w-4" />
                                Change Role
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {(['admin', 'developer', 'viewer'] as const).map((role) => {
                                  const config = roleConfig[role];
                                  const Icon = config.icon;
                                  return (
                                    <DropdownMenuItem
                                      key={role}
                                      disabled={member.role === role}
                                      onClick={() => onChangeRole(member.id, role)}
                                    >
                                      <Icon className="mr-2 h-4 w-4" />
                                      {config.label}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => onRemoveMember(member.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove Member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pending Invites */}
      {pendingMembers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Pending Invites ({pendingMembers.length})
          </h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{member.user.email}</span>
                          <Badge variant="outline" className="text-xs">
                            Pending
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={member.role} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(member.invited_at)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              {actionLoading === member.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {onResendInvite && (
                              <DropdownMenuItem
                                onClick={() => onResendInvite(member.id)}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Resend Invitation
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => onRemoveMember(member.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Revoke Invite
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Leave Organization */}
      {currentMember && !isOwner && (
        <>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Leave Organization</h3>
              <p className="text-sm text-muted-foreground">
                You will lose access to all resources in {orgName}.
              </p>
            </div>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={onLeaveOrg}
              disabled={actionLoading === currentMember.id}
            >
              {actionLoading === currentMember.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Leave
            </Button>
          </div>
        </>
      )}
    </>
  );
}
