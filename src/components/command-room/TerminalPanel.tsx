'use client';

/**
 * TerminalPanel — stub mínimo para satisfazer imports do CanvasView e TerminalNode.
 * Implementação real vem do branch feature/8.8-terminal-tests via JOB-012 (Chewbacca).
 */

export interface LinkedTerminalEntry {
  id: string;
  agentName: string;
}

interface TerminalPanelProps {
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
  onClose: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onLink?: (id: string, targetId: string) => void;
  onAutopilotToggle?: (id: string) => void;
  onTaskDone?: (id: string) => void;
  dragHandleProps?: Record<string, unknown>;
}

export function TerminalPanel({ agentName, terminalId }: TerminalPanelProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0c0e14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#4a5272',
        fontSize: 12,
        fontFamily: 'monospace',
      }}
    >
      [terminal stub: {agentName} · {terminalId}]
    </div>
  );
}
