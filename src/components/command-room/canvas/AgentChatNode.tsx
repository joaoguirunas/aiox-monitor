'use client';

/**
 * AgentChatNode — Spike 9.0
 *
 * React Flow custom node que renderiza um card de chat com agente.
 * Esta versão é puramente in-memory (useState) — sem persistência, sem WS real.
 *
 * Pitfalls endereçados (§6.1):
 *  1. nodrag/nopan no header + dragHandle ".chat-drag-handle" dedicado no grip strip
 *  2. nodrag no container de mensagens (seleção de texto funciona)
 *  3. Estado de chat LOCAL (useState) — NÃO em data.* (evita re-render que zera input)
 *  4. onKeyDown stopPropagation de Backspace/Delete (deleteKeyCode={null} no ReactFlow)
 *  5. nowheel no body das mensagens (scroll do chat não dá zoom no canvas)
 */

import { memo, useState, useRef, useCallback } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Send } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentChatNodeData extends Record<string, unknown> {
  agentName: string;
  agentRole?: string;
  /** Cor de acento em hex, ex: "#FACC15" */
  accentColor?: string;
  avatarIcon?: string;
  status?: 'idle' | 'thinking' | 'speaking' | 'offline';
}

export type AgentChatNodeType = Node<AgentChatNodeData, 'agentChatNode'>;

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converte #RRGGBB → "R, G, B" para usar em rgba(). */
function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

const STATUS_DOT: Record<NonNullable<AgentChatNodeData['status']>, string> = {
  idle: '#6b7280',
  thinking: '#fbbf24',
  speaking: '#34d399',
  offline: '#374151',
};

// ─── Component ────────────────────────────────────────────────────────────────

export const AgentChatNode = memo(function AgentChatNode({
  data,
}: NodeProps<AgentChatNodeType>) {
  const {
    agentName,
    agentRole,
    accentColor = '#6366f1',
    avatarIcon = '🤖',
    status = 'idle',
  } = data;

  // Pitfall 3: estado do chat VIVE AQUI, nunca em data.* (evita recriar data = perder foco/mensagens)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'agent',
      content: `Olá! Sou ${agentName}. Como posso ajudar?`,
    },
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const rgb = hexToRgb(accentColor);
  const dotColor = STATUS_DOT[status];

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
  }, []);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: text },
      { id: `a-${Date.now() + 1}`, role: 'agent', content: `[mock spike] Recebi: "${text}"` },
    ]);
    setInput('');
    scrollToBottom();
  }, [input, scrollToBottom]);

  // Pitfall 4: impede que Backspace/Delete propague para o ReactFlow (deletaria o node)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.stopPropagation();
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  return (
    // Container raiz — sem nodrag para que o ReactFlow ainda consiga selecionar o node
    <div
      style={{
        width: 360,
        height: 280,
        display: 'flex',
        flexDirection: 'column',
        background: '#15181F',
        border: `1px solid #262B36`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
      }}
    >
      {/* ── Pitfall 1: grip strip = ÚNICO dragHandle dedicado ───────────── */}
      <div
        className="chat-drag-handle"
        title="Arrastar"
        style={{
          height: 8,
          flexShrink: 0,
          background: `rgba(${rgb}, 0.1)`,
          borderBottom: `1px solid rgba(${rgb}, 0.18)`,
          cursor: 'grab',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="22" height="4" viewBox="0 0 22 4" fill={`rgba(${rgb}, 0.45)`}>
          <circle cx="2" cy="2" r="1.2" />
          <circle cx="6.5" cy="2" r="1.2" />
          <circle cx="11" cy="2" r="1.2" />
          <circle cx="15.5" cy="2" r="1.2" />
          <circle cx="20" cy="2" r="1.2" />
        </svg>
      </div>

      {/* ── Header 48px ─────────────────────────────────────────────────── */}
      {/* nodrag nopan: clique no header não dispara pan/drag do canvas */}
      <div
        className="nodrag nopan"
        style={{
          height: 48,
          flexShrink: 0,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid #1C2029',
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 32,
            height: 32,
            flexShrink: 0,
            borderRadius: '50%',
            background: `rgba(${rgb}, 0.14)`,
            border: `2px solid ${accentColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            lineHeight: 1,
          }}
        >
          {avatarIcon}
        </div>

        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#E8EAED',
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {agentName}
          </div>
          {agentRole && (
            <div style={{ fontSize: 10.5, color: '#6B7280', lineHeight: 1.3 }}>{agentRole}</div>
          )}
        </div>

        {/* Status dot (8px) */}
        <div
          style={{
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: '50%',
            background: dotColor,
            boxShadow: status === 'thinking' ? `0 0 5px ${dotColor}` : undefined,
          }}
        />
      </div>

      {/* ── Pitfall 2 + 5: mensagens com nodrag (seleção de texto) + nowheel (scroll ≠ zoom) */}
      <div
        className="nodrag nopan nowheel"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          minHeight: 0,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '82%',
                padding: '5px 9px',
                borderRadius:
                  msg.role === 'user' ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
                background:
                  msg.role === 'user' ? `rgba(${rgb}, 0.18)` : '#1C2029',
                color: '#E8EAED',
                fontSize: 12,
                lineHeight: 1.55,
                wordBreak: 'break-word',
                border:
                  msg.role === 'user'
                    ? `1px solid rgba(${rgb}, 0.3)`
                    : '1px solid #262B36',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input 48px ─────────────────────────────────────────────────────── */}
      {/* nodrag nopan + onKeyDown stopPropagation para Backspace/Delete (pitfall 1 + 4) */}
      <div
        className="nodrag nopan"
        style={{
          height: 48,
          flexShrink: 0,
          padding: '0 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderTop: '1px solid #1C2029',
          background: '#1C2029',
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Fale com ${agentName}… ou / para comandos`}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#E8EAED',
            fontSize: 12,
            fontFamily: 'inherit',
            caretColor: accentColor,
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          style={{
            width: 28,
            height: 28,
            flexShrink: 0,
            borderRadius: 7,
            background: input.trim() ? accentColor : 'transparent',
            border: `1px solid ${input.trim() ? accentColor : '#262B36'}`,
            color: input.trim() ? '#0c0e14' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: input.trim() ? 'pointer' : 'default',
            transition: 'background 150ms, border-color 150ms, color 150ms',
          }}
        >
          <Send size={12} strokeWidth={2.2} />
        </button>
      </div>

      {/* ── React Flow connection handles ──────────────────────────────────── */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: accentColor,
          width: 9,
          height: 9,
          border: '2px solid #15181F',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: accentColor,
          width: 9,
          height: 9,
          border: '2px solid #15181F',
        }}
      />
    </div>
  );
});
