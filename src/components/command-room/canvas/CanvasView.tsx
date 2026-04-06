'use client';

import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  applyNodeChanges,
  type NodeTypes,
  type NodeChange,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { TerminalNode, type TerminalNodeData } from './TerminalNode';
import { useCanvasLayout, type CanvasTerminal } from './useCanvasLayout';
import type { LinkedTerminalEntry } from '../TerminalPanel';

// Must be defined outside component to stay stable
const NODE_TYPES: NodeTypes = { terminalNode: TerminalNode };

interface CanvasTerminalFull extends CanvasTerminal {
  projectPath?: string;
  aiox_agent?: string;
  pty_status?: string;
  isRestored?: boolean;
  description?: string | null;
}

interface CanvasViewProps {
  terminals: CanvasTerminalFull[];
  autopilotIds: Set<string>;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onLink: (id: string, targetId: string) => void;
  onAutopilotToggle: (id: string) => void;
  onTaskDone: (id: string) => void;
}

function CanvasViewInner({
  terminals,
  autopilotIds,
  onClose,
  onRename,
  onLink,
  onAutopilotToggle,
  onTaskDone,
}: CanvasViewProps) {
  const nodeData = useCallback(
    (id: string): Omit<TerminalNodeData, 'size'> => {
      const t = terminals.find((x) => x.id === id)!;
      const others: LinkedTerminalEntry[] = terminals
        .filter((x) => x.id !== id)
        .map((x) => ({ id: x.id, agentName: x.agentName }));
      return {
        terminalId: t.id,
        agentName: t.agentName,
        projectPath: t.projectPath,
        aiox_agent: t.aiox_agent,
        linkedTerminalIds: t.linkedTerminalIds,
        otherTerminals: others,
        autopilot: autopilotIds.has(id),
        isCrashed: t.pty_status === 'crashed',
        isRestored: t.isRestored ?? false,
        description: t.description ?? undefined,
        onClose,
        onRename,
        onLink,
        onAutopilotToggle,
        onTaskDone,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [terminals, autopilotIds, onClose, onRename, onLink, onAutopilotToggle, onTaskDone],
  );

  const { nodes: initialNodes, edges: initialEdges } = useCanvasLayout(terminals, nodeData);

  const [nodes, setNodes] = useNodesState<Node<TerminalNodeData>>(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  // Add/remove nodes when terminal list changes; preserve existing positions
  useEffect(() => {
    setNodes((prev) => {
      const existingPositions = new Map(prev.map((n) => [n.id, n.position]));
      return initialNodes.map((n) => {
        const savedPos = existingPositions.get(n.id);
        return savedPos ? { ...n, position: savedPos } : n;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminals.map((t) => t.id).join(',')]);

  // Update node data when props change (status, links, autopilot, etc.)
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const t = terminals.find((x) => x.id === node.id);
        if (!t) return node;
        return { ...node, data: { ...nodeData(t.id), size: node.data.size } as TerminalNodeData };
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminals, autopilotIds, nodeData]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<TerminalNodeData>>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setNodes],
  );

  const minimapNodeColor = useCallback(
    (node: Node<TerminalNodeData>) => {
      const t = terminals.find((x) => x.id === node.id);
      if (!t) return '#1a1a1a';
      if (t.is_chief) return 'rgba(255,68,0,0.6)';
      if (t.pty_status === 'crashed') return 'rgba(239,68,68,0.5)';
      return 'rgba(52,211,153,0.4)';
    },
    [terminals],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      minZoom={0.15}
      maxZoom={1}
      fitView
      fitViewOptions={{ padding: 0.08, maxZoom: 0.75 }}
      proOptions={{ hideAttribution: true }}
      style={{ background: '#070709' }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="rgba(244,244,232,0.06)"
      />
      <MiniMap
        nodeColor={minimapNodeColor}
        maskColor="rgba(0,0,0,0.6)"
        style={{ background: '#0A0A0A', border: '1px solid rgba(156,156,156,0.15)' }}
      />
      <Controls
        style={{ background: '#0A0A0A', border: '1px solid rgba(156,156,156,0.15)' }}
      />
    </ReactFlow>
  );
}

export function CanvasView(props: CanvasViewProps) {
  return (
    <ReactFlowProvider>
      <CanvasViewInner {...props} />
    </ReactFlowProvider>
  );
}
