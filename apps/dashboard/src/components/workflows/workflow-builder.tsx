'use client';

import { useCallback, useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { WorkflowNode, WorkflowNodeData } from './workflow-node';
import {
  Plus,
  Save,
  Trash2,
  Play,
  AlertCircle,
  Bell,
  Scale,
  RefreshCw,
  RotateCcw,
  Terminal,
  Sparkles,
} from 'lucide-react';

const nodeTypes: NodeTypes = {
  // Cast needed due to React Flow typing constraints
  workflowNode: WorkflowNode as NodeTypes[string],
};

const triggerTypes = [
  { value: 'error_spike', label: 'Error Spike', description: 'When error rate increases suddenly' },
  { value: 'deployment_failed', label: 'Deployment Failed', description: 'When a deployment fails' },
  { value: 'high_latency', label: 'High Latency', description: 'When response time exceeds threshold' },
  { value: 'cpu_threshold', label: 'CPU Threshold', description: 'When CPU usage exceeds threshold' },
  { value: 'memory_threshold', label: 'Memory Threshold', description: 'When memory usage exceeds threshold' },
  { value: 'schedule', label: 'Schedule', description: 'Run on a schedule (cron)' },
];

const actionTypes = [
  { value: 'notify', label: 'Send Notification', icon: Bell },
  { value: 'scale', label: 'Scale Service', icon: Scale },
  { value: 'restart', label: 'Restart Service', icon: RefreshCw },
  { value: 'rollback', label: 'Rollback Deployment', icon: RotateCcw },
  { value: 'run_command', label: 'Run Command', icon: Terminal },
  { value: 'ai_analyze', label: 'AI Analyze', icon: Sparkles },
];

interface WorkflowBuilderProps {
  workflowId?: string;
  initialNodes?: Node<WorkflowNodeData>[];
  initialEdges?: Edge[];
  onSave?: (nodes: Node<WorkflowNodeData>[], edges: Edge[], name: string) => Promise<void>;
}

export function WorkflowBuilder({
  workflowId,
  initialNodes = [],
  initialEdges = [],
  onSave,
}: WorkflowBuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [workflowName, setWorkflowName] = useState('New Workflow');
  const [selectedNode, setSelectedNode] = useState<Node<WorkflowNodeData> | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [isAddNodeDialogOpen, setIsAddNodeDialogOpen] = useState(false);
  const [newNodeType, setNewNodeType] = useState<'trigger' | 'action'>('action');
  const [newNodeSubType, setNewNodeSubType] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<WorkflowNodeData>) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  const addNode = useCallback(async () => {
    const hasTrigger = nodes.some((n) => n.data.type === 'trigger');
    if (newNodeType === 'trigger' && hasTrigger) {
      toast.error('A workflow can only have one trigger');
      return;
    }

    const nodeLabel =
      newNodeType === 'trigger'
        ? triggerTypes.find((t) => t.value === newNodeSubType)?.label || 'Trigger'
        : actionTypes.find((a) => a.value === newNodeSubType)?.label || 'Action';

    const newNode: Node<WorkflowNodeData> = {
      id: `node-${Date.now()}`,
      type: 'workflowNode',
      position: {
        x: Math.random() * 400 + 100,
        y: nodes.length * 120 + 50,
      },
      data: {
        label: nodeLabel,
        type: newNodeType,
        ...(newNodeType === 'trigger'
          ? { triggerType: newNodeSubType }
          : { actionType: newNodeSubType }),
        config: {},
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setIsAddNodeDialogOpen(false);
    setNewNodeSubType('');
  }, [nodes, newNodeType, newNodeSubType, setNodes]);

  const deleteSelected = useCallback(() => {
    if (selectedEdge) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
      setSelectedEdge(null);
      return;
    }
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) =>
        eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id)
      );
      setSelectedNode(null);
    }
  }, [selectedNode, selectedEdge, setNodes, setEdges]);

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(nodes, edges, workflowName);
    } finally {
      setIsSaving(false);
    }
  };

  const hasTrigger = nodes.some((n) => n.data.type === 'trigger');

  return (
    <div className="h-[calc(100vh-12rem)] max-h-[800px] min-h-[400px] w-full border rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-900">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={memoizedNodeTypes}
        defaultEdgeOptions={{ style: { strokeWidth: 2 }, type: 'smoothstep' }}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as WorkflowNodeData;
            if (data.type === 'trigger') return '#3b82f6';
            if (data.type === 'action') return '#22c55e';
            return '#eab308';
          }}
        />

        {/* Top Panel */}
        <Panel position="top-left" className="space-x-2">
          <Input
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="w-64 bg-white dark:bg-slate-800"
            placeholder="Workflow name..."
          />
        </Panel>

        <Panel position="top-right" className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddNodeDialogOpen(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Node
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={deleteSelected}
            disabled={!selectedNode && !selectedEdge}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {selectedEdge ? 'Delete Edge' : 'Delete'}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !hasTrigger}
          >
            <Save className="w-4 h-4 mr-1" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </Panel>

        {/* Node Info Panel */}
        {selectedNode && (
          <Panel position="bottom-left">
            <Card className="w-64">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Node Properties</CardTitle>
              </CardHeader>
              <CardContent className="py-2 space-y-2 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <p className="capitalize">{selectedNode.data.type}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Label</Label>
                  <p>{selectedNode.data.label}</p>
                </div>
                {selectedNode.data.actionType && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Action</Label>
                    <p className="capitalize">{selectedNode.data.actionType.replace('_', ' ')}</p>
                  </div>
                )}
                {selectedNode.data.triggerType && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Trigger</Label>
                    <p className="capitalize">{selectedNode.data.triggerType.replace('_', ' ')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </Panel>
        )}

        {/* Help Panel */}
        {nodes.length === 0 && (
          <Panel position="top-center">
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
              <CardContent className="py-4 px-6 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600" />
                <div className="text-sm">
                  <p className="font-medium">Get Started</p>
                  <p className="text-muted-foreground">
                    Click &quot;Add Node&quot; to add a trigger, then add actions to create your workflow.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Panel>
        )}
      </ReactFlow>

      {/* Add Node Dialog */}
      <Dialog open={isAddNodeDialogOpen} onOpenChange={setIsAddNodeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Node</DialogTitle>
            <DialogDescription>
              Choose the type of node to add to your workflow.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Node Type</Label>
              <Select
                value={newNodeType}
                onValueChange={(v) => {
                  setNewNodeType(v as 'trigger' | 'action');
                  setNewNodeSubType('');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trigger" disabled={hasTrigger}>
                    Trigger {hasTrigger && '(Already Added)'}
                  </SelectItem>
                  <SelectItem value="action">Action</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{newNodeType === 'trigger' ? 'Trigger Type' : 'Action Type'}</Label>
              <Select value={newNodeSubType} onValueChange={setNewNodeSubType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {newNodeType === 'trigger'
                    ? triggerTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <div>
                            <span>{t.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {t.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    : actionTypes.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          <div className="flex items-center gap-2">
                            <a.icon className="w-4 h-4" />
                            <span>{a.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddNodeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addNode} disabled={!newNodeSubType}>
              Add Node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
