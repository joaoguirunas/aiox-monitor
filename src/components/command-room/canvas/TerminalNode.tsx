'use client';

import { memo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { TerminalPanel, type LinkedTerminalEntry } from '../TerminalPanel';

export type TerminalSize = 'sm' | 'md' | 'lg';

export interface TerminalNodeData extends Record<string, unknown> {
  terminalId: string;
  agentName: string;
  projectPath?: string;
  aiox_agent?: string;
  linkedTerminalIds: string[];
  otherTerminals: LinkedTerminalEntry[];
  autopilot: boolean;
  isCrashed: boolean;
  isRestored: boolean;
  description?: string;
  size: TerminalSize;
  onClose: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onLink?: (id: string, targetId: string) => void;
  onAutopilotToggle?: (id: string) => void;
  onTaskDone?: (id: string) => void;
}

export type TerminalNodeType = Node<TerminalNodeData, 'terminalNode'>;

export const TerminalNode = memo(function TerminalNode({
  data,
}: NodeProps<TerminalNodeType>) {
  const {
    terminalId,
    agentName,
    projectPath,
    aiox_agent,
    linkedTerminalIds,
    otherTerminals,
    autopilot,
    isCrashed,
    isRestored,
    description,
    onClose,
    onRename,
    onLink,
    onAutopilotToggle,
    onTaskDone,
  } = data;

  return (
    <div className="flex flex-col w-full h-full">
      {/* Drag strip — ReactFlow drags via this */}
      <div
        className="terminal-drag-handle shrink-0 flex items-center justify-center rounded-t-md cursor-grab active:cursor-grabbing"
        style={{ height: 8, background: 'rgba(255,68,0,0.08)', borderBottom: '1px solid rgba(255,68,0,0.15)' }}
      >
        <svg width="16" height="4" viewBox="0 0 16 4" fill="rgba(255,255,255,0.2)">
          <circle cx="2" cy="2" r="1" /><circle cx="6" cy="2" r="1" />
          <circle cx="10" cy="2" r="1" /><circle cx="14" cy="2" r="1" />
        </svg>
      </div>

      {/* Terminal content — block drag/pan passthrough to canvas */}
      <div className="nodrag nopan flex-1 min-h-0 overflow-hidden rounded-b-md">
        <TerminalPanel
          terminalId={terminalId}
          agentName={agentName}
          projectPath={projectPath}
          aiox_agent={aiox_agent}
          linkedTerminalIds={linkedTerminalIds}
          otherTerminals={otherTerminals}
          autopilot={autopilot}
          isCrashed={isCrashed}
          isRestored={isRestored}
          description={description}
          onClose={onClose}
          onRename={onRename}
          onLink={onLink}
          onAutopilotToggle={onAutopilotToggle}
          onTaskDone={onTaskDone}
          dragHandleProps={{}}
        />
      </div>
    </div>
  );
});
