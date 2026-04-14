/**
 * conversationsStore — Zustand slice para conversas e mensagens da Sala de Comando v2.
 *
 * State shape normalizado: conversations por id, messages por id,
 * índice secundário messagesByConversation para acesso O(1) por conversa.
 *
 * Sem persistência ainda — state é in-memory.
 * Persistência em SQLite (messages, conversations §3.1) será adicionada em story posterior.
 *
 * Depende de: zustand
 * Usado por: ChatNode, WsClient (via useRealtime), MessageDispatcher results
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Tipos de domínio (§3.1)
// ---------------------------------------------------------------------------

/** Tipo de conversa */
export type ConversationKind = 'peer' | 'group' | 'broadcast' | 'chief-thread';

/** Papel do remetente na mensagem */
export type SenderRole = 'chief' | 'agent' | 'system' | 'tool' | 'user';

/** Papel do participante na conversa */
export type ParticipantRole = 'member' | 'owner' | 'observer';

/** Anexo ou artifact embutido em uma mensagem */
export interface MessageArtifact {
  type: string;
  content: unknown;
}

// ---------------------------------------------------------------------------
// Entidades normalizadas
// ---------------------------------------------------------------------------

/** Conversa (conversations §3.1) */
export interface Conversation {
  id: string;
  kind: ConversationKind;
  title?: string;
  userId: string;
  createdAt: string;
  lastMessageAt?: string;
  /** IDs dos participantes — derivado de conversation_participants */
  participantIds: string[];
}

/** Mensagem individual (messages §3.1) */
export interface Message {
  id: string;
  conversationId: string;
  /** ID do AgentCard remetente */
  senderId?: string;
  senderRole: SenderRole;
  content: string;
  artifacts?: MessageArtifact[];
  inReplyTo?: string;
  userId: string;
  createdAt: string;
  /** Flag interna: mensagem ainda recebendo chunks de streaming */
  streaming?: boolean;
}

// ---------------------------------------------------------------------------
// Estado do slice
// ---------------------------------------------------------------------------

export interface ConversationsState {
  /** Mapa normalizado: conversationId → Conversation */
  conversations: Record<string, Conversation>;
  /** Mapa normalizado: messageId → Message */
  messages: Record<string, Message>;
  /** Índice secundário: conversationId → messageId[] (ordem cronológica) */
  messagesByConversation: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Ações do slice
// ---------------------------------------------------------------------------

export interface ConversationsActions {
  /**
   * Adiciona uma conversa ao store.
   * Idempotente: ignora se já existir (usa merge parcial via upsert).
   */
  upsertConversation: (conversation: Conversation) => void;

  /**
   * Adiciona uma mensagem completa ao store.
   * Atualiza também o índice messagesByConversation e lastMessageAt da conversa.
   */
  appendMessage: (message: Message) => void;

  /**
   * Aplica um delta de streaming a uma mensagem existente.
   * Se a mensagem não existir, cria com content = delta (primeiro chunk).
   * Marca streaming=true enquanto chunks chegam.
   *
   * Mapeado ao evento WS: chat.chunk { messageId, delta } (§3.4)
   */
  appendChunk: (messageId: string, conversationId: string, delta: string, senderId?: string) => void;

  /**
   * Finaliza o streaming de uma mensagem: streaming=false, atualiza lastMessageAt.
   * Mapeado ao evento WS: message.new (chegada após fim de stream) (§3.4)
   */
  markDelivered: (messageId: string) => void;

  /**
   * Remove todas as mensagens de uma conversa do store in-memory.
   * NÃO deleta do banco — apenas limpa a view local.
   */
  clearConversation: (conversationId: string) => void;

  /**
   * Remove uma conversa e todas as suas mensagens do store.
   */
  removeConversation: (conversationId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Adiciona messageId ao índice se ainda não presente */
function appendToIndex(
  index: Record<string, string[]>,
  conversationId: string,
  messageId: string,
): Record<string, string[]> {
  const existing = index[conversationId] ?? [];
  if (existing.includes(messageId)) return index;
  return { ...index, [conversationId]: [...existing, messageId] };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useConversationsStore = create<ConversationsState & ConversationsActions>(
  (set) => ({
    // Estado inicial
    conversations: {},
    messages: {},
    messagesByConversation: {},

    // Ações
    upsertConversation: (conversation) =>
      set((s) => ({
        conversations: {
          ...s.conversations,
          [conversation.id]: {
            ...s.conversations[conversation.id],
            ...conversation,
          },
        },
      })),

    appendMessage: (message) =>
      set((s) => {
        const now = message.createdAt ?? new Date().toISOString();
        const conversation = s.conversations[message.conversationId];
        return {
          messages: { ...s.messages, [message.id]: message },
          messagesByConversation: appendToIndex(
            s.messagesByConversation,
            message.conversationId,
            message.id,
          ),
          conversations: conversation
            ? {
                ...s.conversations,
                [message.conversationId]: {
                  ...conversation,
                  lastMessageAt: now,
                },
              }
            : s.conversations,
        };
      }),

    appendChunk: (messageId, conversationId, delta, senderId) =>
      set((s) => {
        const existing = s.messages[messageId];
        const updated: Message = existing
          ? { ...existing, content: existing.content + delta, streaming: true }
          : {
              id: messageId,
              conversationId,
              senderId,
              senderRole: 'agent',
              content: delta,
              userId: 'local',
              createdAt: new Date().toISOString(),
              streaming: true,
            };
        return {
          messages: { ...s.messages, [messageId]: updated },
          messagesByConversation: appendToIndex(
            s.messagesByConversation,
            conversationId,
            messageId,
          ),
        };
      }),

    markDelivered: (messageId) =>
      set((s) => {
        const msg = s.messages[messageId];
        if (!msg) return s;
        const now = new Date().toISOString();
        const conversation = s.conversations[msg.conversationId];
        return {
          messages: {
            ...s.messages,
            [messageId]: { ...msg, streaming: false },
          },
          conversations: conversation
            ? {
                ...s.conversations,
                [msg.conversationId]: {
                  ...conversation,
                  lastMessageAt: now,
                },
              }
            : s.conversations,
        };
      }),

    clearConversation: (conversationId) =>
      set((s) => {
        const messageIds = s.messagesByConversation[conversationId] ?? [];
        const messages = { ...s.messages };
        for (const id of messageIds) {
          delete messages[id];
        }
        return {
          messages,
          messagesByConversation: {
            ...s.messagesByConversation,
            [conversationId]: [],
          },
        };
      }),

    removeConversation: (conversationId) =>
      set((s) => {
        const messageIds = s.messagesByConversation[conversationId] ?? [];
        const messages = { ...s.messages };
        for (const id of messageIds) {
          delete messages[id];
        }
        const conversations = { ...s.conversations };
        delete conversations[conversationId];
        const messagesByConversation = { ...s.messagesByConversation };
        delete messagesByConversation[conversationId];
        return { messages, conversations, messagesByConversation };
      }),
  }),
);
