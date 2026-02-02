'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

interface CreateMonitorDialogProps {
  orgId: string;
  onCreated: () => void;
}

export function CreateMonitorDialog({ orgId, onCreated }: CreateMonitorDialogProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [intervalSeconds, setIntervalSeconds] = useState('60');
  const [alertAfterFailures, setAlertAfterFailures] = useState('3');

  async function handleCreate() {
    if (!name.trim() || !url.trim()) {
      toast.error('Name and URL are required');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/v1/uptime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          name: name.trim(),
          url: url.trim(),
          method,
          interval_seconds: parseInt(intervalSeconds),
          alert_after_failures: parseInt(alertAfterFailures),
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Monitor created');
        setOpen(false);
        setName('');
        setUrl('');
        setMethod('GET');
        setIntervalSeconds('60');
        setAlertAfterFailures('3');
        onCreated();
      } else {
        toast.error(data.error?.message || 'Failed to create monitor');
      }
    } catch (error) {
      console.error('Failed to create monitor:', error);
      toast.error('Failed to create monitor');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Monitor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Uptime Monitor</DialogTitle>
          <DialogDescription>
            Monitor an endpoint and get alerted when it goes down.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My API Health Check"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              placeholder="https://api.example.com/health"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="HEAD">HEAD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Check Interval</Label>
              <Select value={intervalSeconds} onValueChange={setIntervalSeconds}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="60">1 minute</SelectItem>
                  <SelectItem value="300">5 minutes</SelectItem>
                  <SelectItem value="600">10 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Alert after failures</Label>
            <Select value={alertAfterFailures} onValueChange={setAlertAfterFailures}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 failure</SelectItem>
                <SelectItem value="3">3 failures</SelectItem>
                <SelectItem value="5">5 failures</SelectItem>
                <SelectItem value="10">10 failures</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Monitor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
