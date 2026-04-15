/**
 * WsEvent — union dos eventos do protocolo WebSocket estendido (§3.3 do Plano Mestre).
 *
 * Cada evento carrega:
 *  - `type`  — discriminante da union
 *  - `v: 1`  — versão do protocolo (facilita migração futura)
 *  - `seq`   — número de sequência monotônico por scope/canal (para Last-Event-ID)
 *  - `at`    — timestamp ISO do servidor
 *
 * Scopes de reconexão: canvas | conversation | agent | pty
 * Usado por: WsClient.ts, useRealtime.ts
 */

import type { AgentCatalogEntry } from '@/lib/types';
import type {
  AgentCardData,
  AgentStatus,
  ConnectionData,
} from '../store/canvasStore';
import type { Message } from '../store/conversationsStore';

// ---------------------------------------------------------------------------
// Tipo base — campos comuns a todos os eventos
// ---------------------------------------------------------------------------

interface WsEventBase {
  v: 1;
  seq: number;
  at: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Scope de reconexão (Last-Event-ID é prefixado por scope)
// ---------------------------------------------------------------------------

export type WsScope = 'canvas' | 'conversation' | 'agent' | 'pty';

// ---------------------------------------------------------------------------
// Eventos de canvas / agentes
// ---------------------------------------------------------------------------

/** Agente mudou de status (idle, thinking, speaking, waiting, offline, error) */
export interface EvAgentStatus extends WsEventBase {
  type: 'agent.status';
  cardId: string;
  status: AgentStatus;
}

/** Novo card adicionado ao canvas */
export interface EvAgentAdded extends WsEventBase {
  type: 'agent.added';
  card: AgentCardData & { nodeId: string };
}

/** Card removido do canvas */
export interface EvAgentRemoved extends WsEventBase {
  type: 'agent.removed';
  cardId: string;
}

// ---------------------------------------------------------------------------
// Eventos de conexões (arestas)
// ---------------------------------------------------------------------------

/** Nova conexão criada entre dois cards */
export interface EvConnectionAdded extends WsEventBase {
  type: 'connection.added';
  connection: ConnectionData & { edgeId: string; source: string; target: string };
}

/** Conexão removida */
export interface EvConnectionRemoved extends WsEventBase {
  type: 'connection.removed';
  id: string; // edgeId
}

// ---------------------------------------------------------------------------
// Eventos de conversas e mensagens
// ---------------------------------------------------------------------------

/** Metadados de conversa atualizados (ex: lastMessageAt) */
export interface EvConversationUpdated extends WsEventBase {
  type: 'conversation.updated';
  conversationId: string;
  lastMessageAt: string;
}

/**
 * Mensagem nova e completa entregue.
 * Pode chegar após o fim de um stream (chat.chunk) ou como mensagem instantânea.
 */
export interface EvMessageNew extends WsEventBase {
  type: 'message.new';
  conversationId: string;
  message: Message;
}

/**
 * Chunk de streaming de uma mensagem.
 * Múltiplos chunks com o mesmo `messageId` formam a mensagem completa.
 */
export interface EvChatChunk extends WsEventBase {
  type: 'chat.chunk';
  messageId: string;
  conversationId: string;
  delta: string;
  /** ID do card remetente (opcional — presente quando o agente é conhecido) */
  senderId?: string;
}

// ---------------------------------------------------------------------------
// Eventos de layout
// ---------------------------------------------------------------------------

/** Patch incremental de posições/viewport do canvas */
export interface EvLayoutPatch extends WsEventBase {
  type: 'layout.patch';
  patches: Array<{
    nodeId: string;
    x?: number;
    y?: number;
    viewport?: { x: number; y: number; zoom: number };
  }>;
}

// ---------------------------------------------------------------------------
// Eventos de lifecycle de projeto
// ---------------------------------------------------------------------------

/** Projeto aberto — scan inicial completo, watcher ativo */
export interface EvProjectOpened extends WsEventBase {
  type: 'project.opened';
  projectPath: string;
}

/** Projeto fechado — watcher parado, recursos liberados */
export interface EvProjectClosed extends WsEventBase {
  type: 'project.closed';
  projectPath: string;
}

// ---------------------------------------------------------------------------
// Eventos de catálogo de agentes
// ---------------------------------------------------------------------------

/** Catálogo atualizado incrementalmente (fs.watch detectou mudança) */
export interface EvCatalogUpdated extends WsEventBase {
  type: 'catalog.updated';
  projectPath: string;
  added: AgentCatalogEntry[];
  removed: string[]; // skill_paths removidos
}

/** Catálogo recarregado por completo (troca de projeto ou rescan) */
export interface EvCatalogReloaded extends WsEventBase {
  type: 'catalog.reloaded';
  projectPath: string;
  full: AgentCatalogEntry[];
}

// ---------------------------------------------------------------------------
// Evento de heartbeat
// ---------------------------------------------------------------------------

/** Heartbeat do servidor — enviado a cada 25s */
export interface EvHeartbeat extends WsEventBase {
  type: 'heartbeat';
}

// ---------------------------------------------------------------------------
// Evento PTY (reuso do /pty existente — incluído aqui para tipagem completa)
// ---------------------------------------------------------------------------

/** Frame PTY bruto (base64 ou texto) */
export interface EvPtyFrame extends WsEventBase {
  type: 'pty.frame';
  terminalId: string;
  data: string;
}

// ---------------------------------------------------------------------------
// Union principal — WsEvent
// ---------------------------------------------------------------------------

export type WsEvent =
  | EvAgentStatus
  | EvAgentAdded
  | EvAgentRemoved
  | EvConnectionAdded
  | EvConnectionRemoved
  | EvConversationUpdated
  | EvMessageNew
  | EvChatChunk
  | EvLayoutPatch
  | EvCatalogUpdated
  | EvCatalogReloaded
  | EvProjectOpened
  | EvProjectClosed
  | EvHeartbeat
  | EvPtyFrame;

/** Extrai o discriminante `type` de qualquer evento */
export type WsEventType = WsEvent['type'];
