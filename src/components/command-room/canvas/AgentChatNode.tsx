'use client';

/**
 * AgentChatNode — Story 9.5 (AgentChatNode completo)
 *
 * React Flow custom node para chat com agente na Sala de Comando v2.
 * Consome canvasStore (status, displayName, aioxAgent) e
 * conversationsStore (mensagens normalizadas).
 *
 * 5 pitfalls endereçados (§6.1 plano mestre):
 *  1. nodrag no container de mensagens — seleção de texto não dispara pan
 *  2. nowheel no input e mensagens — scroll do chat não dá zoom no canvas
 *  3. dragHandle ".chat-drag-handle" no header — único ponto de drag
 *  4. stopPropagation Backspace/Delete no input — não deleta o node
 *  5. Input/colapso em useState LOCAL — nunca em data.* (evita re-render bug)
 *
 * Story 9.7: SlashMenuInline integrado — aparece quando input começa com '/'.
 * TODO(JOB-027): integração useRealtime (Leia) para streaming chat.chunk.
 */

import { memo, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Handle,
  Position,
  useStore,
  type NodeProps,
} from '@xyflow/react';
import { ChevronDown, ChevronUp, MoreHorizontal, Send, Terminal } from 'lucide-react';

import { useAgentPromotion } from './useAgentPromotion';
import { useCardRealtime } from './realtime/useCardRealtime';

import {
  useConversationsStore,
  type Message,
} from './store/conversationsStore';
import type { AgentCardNode } from './store/canvasStore';
import { SlashMenuInline, useSlashMenu, type SlashMenuHandle } from './palette/SlashMenuInline';
import styles from './AgentChatNode.module.css';

// ─── Agent color table ────────────────────────────────────────────────────────
// Espelha packages/ui/tokens.css §4. Mantido em sincronia manualmente.

const AGENT_COLORS: Record<string, { color: string; glow: string; bubble: string }> = {
  chief:           { color: '#84CC16', glow: 'rgba(132,204,22,0.25)',  bubble: 'rgba(132,204,22,0.12)' },
  architect:       { color: '#38BDF8', glow: 'rgba(56,189,248,0.25)',  bubble: 'rgba(56,189,248,0.12)' },
  'ux-alpha':      { color: '#E879F9', glow: 'rgba(232,121,249,0.25)', bubble: 'rgba(232,121,249,0.12)' },
  'ux-beta':       { color: '#FB923C', glow: 'rgba(251,146,60,0.25)',  bubble: 'rgba(251,146,60,0.12)' },
  'dev-alpha':     { color: '#FACC15', glow: 'rgba(250,204,21,0.25)',  bubble: 'rgba(250,204,21,0.12)' },
  'dev-beta':      { color: '#F472B6', glow: 'rgba(244,114,182,0.25)', bubble: 'rgba(244,114,182,0.12)' },
  'dev-gamma':     { color: '#D97706', glow: 'rgba(217,119,6,0.25)',   bubble: 'rgba(217,119,6,0.12)' },
  'dev-delta':     { color: '#A16207', glow: 'rgba(161,98,7,0.25)',    bubble: 'rgba(161,98,7,0.12)' },
  qa:              { color: '#8B5CF6', glow: 'rgba(139,92,246,0.25)',  bubble: 'rgba(139,92,246,0.12)' },
  devops:          { color: '#06B6D4', glow: 'rgba(6,182,212,0.25)',   bubble: 'rgba(6,182,212,0.12)' },
  analyst:         { color: '#EAB308', glow: 'rgba(234,179,8,0.25)',   bubble: 'rgba(234,179,8,0.12)' },
  'data-engineer': { color: '#6366F1', glow: 'rgba(99,102,241,0.25)',  bubble: 'rgba(99,102,241,0.12)' },
};

const DEFAULT_COLORS = {
  color:  '#6366F1',
  glow:   'rgba(99,102,241,0.25)',
  bubble: 'rgba(99,102,241,0.12)',
};

function getAgentColors(slug?: string): { color: string; glow: string; bubble: string } {
  if (!slug) return DEFAULT_COLORS;
  return AGENT_COLORS[slug] ?? DEFAULT_COLORS;
}

// ─── Visual state ─────────────────────────────────────────────────────────────

type VisualState = 'online' | 'thinking' | 'speaking' | 'idle' | 'error';

/** Mapeia AgentStatus do canvasStore → VisualState de UI */
function toVisualState(status: string): VisualState {
  switch (status) {
    case 'thinking':
    case 'waiting':  return 'thinking';
    case 'speaking': return 'speaking';
    case 'error':    return 'error';
    case 'offline':  return 'idle';
    default:         return 'online'; // 'idle' do store → agente online sem atividade
  }
}

// ─── Initials fallback ────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.split(/[\s\-–—]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase() || '?';
}

// ─── useAgentChatRealtime — wrapper sobre useCardRealtime (JOB-048) ──────────
// Liga o streaming realtime ao AgentChatNode:
//  • RealtimeProvider (em CommandRoomCanvas) mantém 1 WsClient compartilhado
//  • chat.chunk → appendChunk → store → lastStreamingId → cursor piscante
//  • message.new → markDelivered + appendMessage → streaming=false → cursor some
//  • agent.status → patchNodeStatus → data.status → toVisualState → UI atualiza
// O callback onChunk dispara scroll-to-bottom por chunk (UX de streaming suave).
function useAgentChatRealtime(
  conversationId: string,
  onChunkCallback?: () => void,
) {
  return useCardRealtime(conversationId, {
    onChunk: onChunkCallback ? () => onChunkCallback() : undefined,
  });
}

// ─── Dot class helper ─────────────────────────────────────────────────────────

const DOT_CLASS: Record<VisualState, string> = {
  online:   styles.dotOnline,
  thinking: styles.dotThinking,
  speaking: styles.dotSpeaking,
  idle:     styles.dotIdle,
  error:    styles.dotError,
};

const RING_CLASS: Record<VisualState, string> = {
  online:   '',
  thinking: styles.ringThinking,
  speaking: styles.ringSpeaking,
  idle:     styles.ringIdle,
  error:    styles.ringError,
};

// ─── Component ────────────────────────────────────────────────────────────────

export const AgentChatNode = memo(function AgentChatNode({
  data,
  selected,
  dragging,
}: NodeProps<AgentCardNode>) {
  // Suporte a ambos os formatos: novo (AgentCardData) e spike (AgentChatNodeData)
  const cardId      = (data.cardId ?? data.id ?? 'unknown') as string;
  const displayName = (data.displayName ?? (data as Record<string, unknown>).agentName ?? 'Agente') as string;
  const aioxAgent   = (data.aioxAgent ?? (data as Record<string, unknown>).agentRole) as string | undefined;
  const isChief     = (data.isChief ?? false) as boolean;
  const status      = (data.status ?? 'idle') as string;

  const { color, glow, bubble } = getAgentColors(aioxAgent);
  const visualState = toVisualState(status);

  // Pitfall 5: estado local, NUNCA em data.*
  const [collapsed, setCollapsed]   = useState(false);
  const [collapsing, setCollapsing] = useState(false); // crossfade flag
  const [input, setInput]           = useState('');
  const [glowActive, setGlowActive] = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);
  const messagesEndRef              = useRef<HTMLDivElement>(null);
  const slashMenuRef                = useRef<SlashMenuHandle>(null);

  // Story 9.7: slash menu state (isOpen quando input começa com '/')
  const { isOpen: slashOpen, query: slashQuery } = useSlashMenu(input);

  // ─── Promoção chat → PTY (Story 9.6) ──────────────────────────────────────
  const { promote, promoting } = useAgentPromotion(cardId);
  const isHybrid = status === 'hybrid' || data.kind === 'hybrid';

  // ─── Conversações do store ─────────────────────────────────────────────────
  const upsertConversation     = useConversationsStore((s) => s.upsertConversation);
  const appendMessage          = useConversationsStore((s) => s.appendMessage);
  const allMessages            = useConversationsStore((s) => s.messages);
  const messagesByConversation = useConversationsStore((s) => s.messagesByConversation);

  const messageIds = messagesByConversation[cardId] ?? [];

  // useMemo: recalcula apenas quando a lista de ids ou os dados mudam
  const messages = useMemo(
    () => messageIds.map((id) => allMessages[id]).filter((m): m is Message => !!m),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messageIds.join(','), allMessages],
  );

  // Cria conversa inicial se não existir (idempotente via upsert)
  useEffect(() => {
    upsertConversation({
      id: cardId,
      kind: isChief ? 'chief-thread' : 'peer',
      title: displayName,
      userId: 'local',
      createdAt: new Date().toISOString(),
      participantIds: [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  // ─── Realtime: liga WsClient → store → UI (JOB-048) ──────────────────────
  // onChunk: scroll a cada token de streaming (não só quando mensagem nova chega)
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  const { lastStreamingId, isStreaming } = useAgentChatRealtime(cardId, scrollToBottom);

  // LOD a zoom < 0.4 §6
  const zoom = useStore((s) => s.transform[2]);

  // ─── Scroll to bottom (novas mensagens completas) ─────────────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    scrollToBottom();
    setGlowActive(true);
    const t = setTimeout(() => setGlowActive(false), 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // ─── Send ──────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    appendMessage({
      id: `u-${Date.now()}`,
      conversationId: cardId,
      senderRole: 'user',
      content: text,
      userId: 'local',
      createdAt: new Date().toISOString(),
    });
    setInput('');
  }, [input, cardId, appendMessage]);

  // Pitfall 4: Backspace/Delete não propaga para o ReactFlow (não deleta o node)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' || e.key === 'Delete') e.stopPropagation();
      // Story 9.7: delega ↑↓/Enter/Esc/Tab ao slash menu quando aberto
      if (slashOpen && slashMenuRef.current) {
        if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
          slashMenuRef.current.handleKeyDown(e);
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage, slashOpen],
  );

  // ─── Collapse toggle com crossfade ─────────────────────────────────────────
  const toggleCollapse = useCallback(() => {
    if (!collapsed) {
      // Vai colapsar: crossfade primeiro, depois recolhe
      setCollapsing(true);
      const t = setTimeout(() => {
        setCollapsed(true);
        setCollapsing(false);
      }, 180);
      return () => clearTimeout(t);
    }
    setCollapsed(false);
  }, [collapsed]);

  // ─── Dimensões §1 ──────────────────────────────────────────────────────────
  const cardW = collapsed ? 360 : 420;
  const cardH = collapsed ? 88  : 520;

  // ─── Border / shadow por estado visual §4 ──────────────────────────────────
  let cardBorder     = '1px solid var(--sc-surface-300,#262B36)';
  let cardBoxShadow  = '0 4px 24px rgba(0,0,0,0.45)';
  let cardOpacity    = 1;

  if (selected) {
    cardBorder    = `1px solid ${color}`;
    cardBoxShadow = `0 0 0 1px ${color}`;
  } else if (visualState === 'speaking') {
    cardBorder    = `1px solid ${color}`;
    cardBoxShadow = `0 0 0 1px ${color}, 0 0 16px ${glow}`;
  } else if (visualState === 'error') {
    cardBorder    = '1px solid rgba(239,68,68,0.6)';
    cardBoxShadow = 'inset 0 0 12px rgba(239,68,68,0.1)';
  } else if (visualState === 'idle') {
    cardOpacity = 0.92;
  }

  // Glow pós-mensagem §5
  if (glowActive && visualState !== 'speaking' && !selected) {
    cardBoxShadow = `0 0 16px ${glow}`;
  }

  // lastStreamingId vem de useCardRealtime (via useAgentChatRealtime acima §4.3)
  // isStreaming controla o typing indicator: mostra quando agente está respondendo
  // em streaming (complementa o estado visual 'thinking' do canvasStore)

  // ─── LOD: card degradado para zoom < 0.4 §6 ───────────────────────────────
  if (zoom < 0.4) {
    return (
      <LodCard
        displayName={displayName}
        color={color}
        glow={glow}
        bubble={bubble}
        visualState={visualState}
        border={cardBorder}
        shadow={cardBoxShadow}
        opacity={cardOpacity}
        lastMessages={messages.slice(-3)}
      />
    );
  }

  // ─── Render completo ───────────────────────────────────────────────────────
  return (
    <div
      className={`${styles.card} ${dragging ? styles.cardDragging : ''} ${visualState === 'error' ? styles.shakeOnce : ''}`}
      style={{
        '--sc-agent-color':  color,
        '--sc-agent-glow':   glow,
        '--sc-agent-bubble': bubble,
        width:      cardW,
        height:     cardH,
        opacity:    cardOpacity,
        border:     cardBorder,
        boxShadow:  cardBoxShadow,
      } as React.CSSProperties}
    >
      {/* ── Handles §2.4 ──────────────────────────────────────────── */}
      {/* Entrada: círculo esquerda */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className={styles.handleCircle}
        title="Receber de…"
      />
      {/* Saída: círculo direita */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className={styles.handleCircle}
        title="Enviar para…"
      />
      {/* Broadcast: diamante topo */}
      <Handle
        type="source"
        position={Position.Top}
        id="broadcast"
        className={styles.handleDiamond}
        title="Broadcast"
      />

      {/* ── Header — único drag handle §2.1 ───────────────────────── */}
      {/* Pitfall 3: só o header tem a classe chat-drag-handle */}
      <div className={`chat-drag-handle ${styles.header}`}>
        {/* Avatar + status dot */}
        <div className={styles.avatarWrapper}>
          <div
            className={`${styles.avatar} ${RING_CLASS[visualState]}`}
            style={{ border: `2px solid ${color}` }}
          >
            {getInitials(displayName)}
          </div>
          <span className={`${styles.statusDot} ${DOT_CLASS[visualState]}`} />
        </div>

        {/* Nome + role */}
        <div className={styles.nameStack}>
          <span className={styles.nameText}>
            {displayName}
            {isChief && <span className={styles.chiefBadge}>Chief</span>}
          </span>
          {aioxAgent && (
            <span className={styles.roleText}>{aioxAgent}</span>
          )}
        </div>

        {/* Botões de controle — nodrag nopan para não conflitar com drag */}
        <div className={styles.headerActions}>
          <button
            className={`nodrag nopan ${styles.iconBtn}`}
            onClick={(e) => { e.stopPropagation(); toggleCollapse(); }}
            title={collapsed ? 'Expandir' : 'Colapsar'}
          >
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
          <div className={styles.menuWrap}>
            <button
              className={`nodrag nopan ${styles.iconBtn} ${styles.menuBtn}`}
              title="Mais opções"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            >
              <MoreHorizontal size={13} />
            </button>
            {menuOpen && (
              <div
                className={`nodrag nopan nowheel ${styles.menuDropdown}`}
                onMouseLeave={() => setMenuOpen(false)}
              >
                {!isHybrid && (
                  <button
                    className={styles.menuItem}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      void promote();
                    }}
                    disabled={promoting}
                  >
                    <Terminal size={12} />
                    {promoting ? 'Promovendo…' : 'Promover para PTY'}
                  </button>
                )}
                {isHybrid && (
                  <span className={styles.menuItemDisabled}>
                    <Terminal size={12} /> Já é PTY
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body: mensagens + input (oculto quando colapsado) ─────── */}
      {!collapsed && (
        <div
          className={`${styles.body} ${collapsing ? styles.bodyCollapsing : ''}`}
          style={{ position: 'relative' }}
        >
          {/* Pitfall 1+2: nodrag (seleção) + nowheel (scroll ≠ zoom canvas) */}
          <div className={`nodrag nopan nowheel ${styles.messages}`}>
            {/* Gradient fade §2.2 */}
            <div className={styles.gradientFade} />

            {messages.length === 0 && (
              <div className={styles.emptyHint}>
                Fale com {displayName}…
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.bubbleRow} ${msg.senderRole === 'user' ? styles.bubbleRowUser : ''}`}
              >
                <div
                  className={`${styles.bubble} ${styles.bubbleEnter} ${
                    msg.senderRole === 'user' ? styles.bubbleUser : styles.bubbleAgent
                  }`}
                  style={
                    msg.senderRole === 'user'
                      ? { background: bubble, border: `1px solid ${color}40` }
                      : undefined
                  }
                >
                  {msg.content}
                  {/* Cursor blinking na última msg em streaming §4.3 */}
                  {msg.streaming && msg.id === lastStreamingId && (
                    <span className={styles.streamCursor} />
                  )}
                  <time className={styles.bubbleTimestamp}>
                    {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </div>
            ))}

            {/* Typing indicator §4.2 — thinking (aguardando) OU pré-primeiro-chunk */}
            {(visualState === 'thinking' && !isStreaming) && (
              <div className={styles.bubbleRow}>
                <div className={`${styles.bubble} ${styles.bubbleAgent} ${styles.typingBubble}`}>
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error toast §4.5 */}
          {visualState === 'error' && (
            <div className={styles.errorToast}>
              Conexão perdida
              <button className={styles.retryBtn}>· retry</button>
            </div>
          )}

          {/* Story 9.7: slash menu inline — aparece acima do input quando começa com '/' */}
          {slashOpen && (
            <div
              className="nodrag nopan nowheel"
              style={{
                position: 'absolute',
                bottom: 48,
                left: 8,
                right: 8,
                zIndex: 10,
              }}
            >
              <SlashMenuInline
                ref={slashMenuRef}
                query={slashQuery}
                onSelect={(cmd) => setInput(cmd)}
                onClose={() => setInput('')}
              />
            </div>
          )}

          {/* Pitfall 2: nowheel no input (scroll não dá zoom no canvas) */}
          {/* Pitfall 1: nodrag nopan no input wrapper */}
          <div className={`nodrag nopan nowheel ${styles.inputBar}`}>
            <input
              className={styles.inputField}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Fale com ${displayName}… ou / para comandos`}
              style={{ caretColor: color }}
              role="combobox"
              aria-expanded={slashOpen}
              aria-autocomplete="list"
              aria-controls={slashOpen ? 'slash-menu-list' : undefined}
            />
            <button
              className={`nodrag nopan ${styles.sendBtn}`}
              style={
                input.trim()
                  ? { background: color, borderColor: color, color: '#0c0e14' }
                  : undefined
              }
              onClick={sendMessage}
              disabled={!input.trim()}
            >
              <Send size={12} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── LOD Card §6 — card degradado para zoom < 0.4 ─────────────────────────────

interface LodCardProps {
  displayName: string;
  color: string;
  glow: string;
  bubble: string;
  visualState: VisualState;
  border: string;
  shadow: string;
  opacity: number;
  lastMessages: Message[];
}

const LodCard = memo(function LodCard({
  displayName,
  color,
  glow,
  bubble,
  visualState,
  border,
  shadow,
  opacity,
  lastMessages,
}: LodCardProps) {
  return (
    <div
      className={styles.card}
      style={{
        '--sc-agent-color':  color,
        '--sc-agent-glow':   glow,
        '--sc-agent-bubble': bubble,
        width:     360,
        height:    88,
        opacity,
        border,
        boxShadow: shadow,
      } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Left}  id="in"        className={styles.handleCircle} />
      <Handle type="source" position={Position.Right} id="out"       className={styles.handleCircle} />
      <Handle type="source" position={Position.Top}   id="broadcast" className={styles.handleDiamond} />

      <div className={`chat-drag-handle ${styles.header}`} style={{ borderBottom: 'none' }}>
        <span className={`${styles.statusDot} ${DOT_CLASS[visualState]}`} style={{ position: 'static', flexShrink: 0 }} />
        <span className={styles.nameText}>{displayName}</span>
      </div>

      {lastMessages.length > 0 && (
        <div className={styles.lodMessages}>
          {lastMessages.map((m) => (
            <div key={m.id} className={styles.lodMsg}>
              <span className={styles.lodMsgRole}>
                {m.senderRole === 'user' ? 'Eu' : '⟩'}
              </span>
              {m.content.slice(0, 44)}{m.content.length > 44 ? '…' : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─── Re-exports de compatibilidade (spike canvases em /command-room/spike) ──────
// Os arquivos SpikeCanvas.tsx e SpikeStatesCanvas.tsx usam o formato antigo
// agentName/accentColor — mantemos as exportações para não quebrar TypeScript.
// O componente suporta ambos os formatos em runtime via fallback.

/** @deprecated Spike format. Novo código deve usar AgentCardData do canvasStore. */
export interface AgentChatNodeData extends Record<string, unknown> {
  agentName?: string;
  agentRole?: string;
  accentColor?: string;
  avatarIcon?: string;
  status?: string;
  // Campos do AgentCardData (story 9.5)
  cardId?: string;
  displayName?: string;
  aioxAgent?: string;
  isChief?: boolean;
}

export type { AgentCardNode as AgentChatNodeType };
