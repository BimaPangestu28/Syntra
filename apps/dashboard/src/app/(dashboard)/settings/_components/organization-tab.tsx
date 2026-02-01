'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  plan: string;
  role: string;
}

export function OrganizationTab() {
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logo, setLogo] = useState('');

  useEffect(() => {
    fetchOrg();
  }, []);

  async function fetchOrg() {
    try {
      const res = await fetch('/api/v1/settings/organization');
      const data = await res.json();
      if (data.success) {
        setOrg(data.data);
        setName(data.data.name);
        setSlug(data.data.slug);
        setLogo(data.data.logo || '');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/v1/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || undefined,
          slug: slug || undefined,
          logo: logo || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOrg(data.data);
        toast.success('Organization settings saved');
      } else {
        toast.error(data.error?.message || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save organization settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!org) {
    return <p className="text-muted-foreground">No organization found.</p>;
  }

  const isAdmin = ['owner', 'admin'].includes(org.role);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Manage your organization settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              Used in URLs. Lowercase letters, numbers, and hyphens only.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-logo">Logo URL</Label>
            <Input
              id="org-logo"
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              placeholder="https://example.com/logo.png"
              disabled={!isAdmin}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label>Plan</Label>
            <Badge variant="secondary">{org.plan}</Badge>
          </div>
          {isAdmin && (
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
