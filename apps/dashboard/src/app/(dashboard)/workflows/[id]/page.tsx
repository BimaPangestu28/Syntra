'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowBuilder } from '@/components/workflows';
import type { Node, Edge } from '@xyflow/react';
import type { WorkflowNodeData } from '@/components/workflows';

interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  trigger: {
    type: string;
    conditions?: Record<string, unknown>;
  };
  actions: Array<{
    type: string;
    config: Record<string, unknown>;
  }>;
  metadata: {
    nodes?: Array<{
      id: string;
      position: { x: number; y: number };
      data: WorkflowNodeData;
    }>;
    edges?: Array<{
      id: string;
      source: string;
      target: string;
    }>;
  } | null;
}

export default function WorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function fetchWorkflow() {
    try {
      const res = await fetch(`/api/v1/workflows/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setWorkflow(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch workflow:', error);
    } finally {
      setLoading(false);
    }
  }

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
      const res = await fetch(`/api/v1/workflows/${params.id}`, {
        method: 'PATCH',
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
        toast.error(data.error?.message || 'Failed to update workflow');
      }
    } catch {
      toast.error('Failed to update workflow');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-xl font-semibold">Workflow not found</h2>
        <Button asChild className="mt-4">
          <Link href="/workflows">Back to Workflows</Link>
        </Button>
      </div>
    );
  }

  // Convert workflow data to nodes/edges for the builder
  let initialNodes: Node<WorkflowNodeData>[] = [];
  let initialEdges: Edge[] = [];

  if (workflow.metadata?.nodes && workflow.metadata?.edges) {
    // Use stored layout
    initialNodes = workflow.metadata.nodes.map((n) => ({
      id: n.id,
      type: 'workflowNode',
      position: n.position,
      data: n.data,
    }));
    initialEdges = workflow.metadata.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: true,
    }));
  } else {
    // Generate nodes from trigger and actions
    const triggerId = 'trigger-1';
    initialNodes.push({
      id: triggerId,
      type: 'workflowNode',
      position: { x: 250, y: 50 },
      data: {
        label: workflow.trigger.type.replace('_', ' '),
        type: 'trigger',
        triggerType: workflow.trigger.type,
        config: workflow.trigger.conditions,
      },
    });

    let lastNodeId = triggerId;
    workflow.actions.forEach((action, index) => {
      const actionId = `action-${index + 1}`;
      initialNodes.push({
        id: actionId,
        type: 'workflowNode',
        position: { x: 250, y: 150 + index * 120 },
        data: {
          label: action.type.replace('_', ' '),
          type: 'action',
          actionType: action.type,
          config: action.config,
        },
      });
      initialEdges.push({
        id: `edge-${lastNodeId}-${actionId}`,
        source: lastNodeId,
        target: actionId,
        animated: true,
      });
      lastNodeId = actionId;
    });
  }

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
          <h1 className="text-xl font-semibold">Edit Workflow</h1>
          <p className="text-muted-foreground">
            Modify your workflow using the visual editor
          </p>
        </div>
      </div>

      {/* Workflow Builder */}
      <WorkflowBuilder
        workflowId={workflow.id}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        onSave={handleSave}
      />
    </div>
  );
}
