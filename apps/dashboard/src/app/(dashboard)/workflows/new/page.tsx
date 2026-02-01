'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkflowBuilder } from '@/components/workflows';
import type { Node, Edge } from '@xyflow/react';
import type { WorkflowNodeData } from '@/components/workflows';

export default function NewWorkflowPage() {
  const router = useRouter();

  const handleSave = async (
    nodes: Node<WorkflowNodeData>[],
    edges: Edge[],
    name: string
  ) => {
    // Find the trigger node
    const triggerNode = nodes.find((n) => n.data.type === 'trigger');
    if (!triggerNode) {
      toast.error('Please add a trigger to your workflow');
      return;
    }

    // Build actions array from nodes and edges
    const actions = nodes
      .filter((n) => n.data.type === 'action')
      .map((n) => ({
        type: n.data.actionType,
        config: n.data.config || {},
      }));

    try {
      const res = await fetch('/api/v1/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          trigger: {
            type: triggerNode.data.triggerType,
            conditions: triggerNode.data.config || {},
          },
          actions,
          metadata: {
            nodes: nodes.map((n) => ({
              id: n.id,
              position: n.position,
              data: n.data,
            })),
            edges: edges.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
            })),
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push('/workflows');
      } else {
        toast.error(data.error?.message || 'Failed to create workflow');
      }
    } catch {
      toast.error('Failed to create workflow');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/workflows">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Create Workflow</h1>
          <p className="text-muted-foreground">
            Design your workflow using the visual editor
          </p>
        </div>
      </div>

      {/* Workflow Builder */}
      <WorkflowBuilder onSave={handleSave} />
    </div>
  );
}
