import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ChatMessage, ChatArtifact, ChatEvent } from './chat-types';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_MESSAGES_PER_TERMINAL = 500;

// ─── ChatMessageStore ───────────────────────────────────────────────────────
// In-memory store for chat messages per terminal.
// Emits 'chat-event' whenever a new message is added.

declare global {
  var __aiox_chat_store__: ChatMessageStore | undefined;
}

export class ChatMessageStore extends EventEmitter {
  private messages = new Map<string, ChatMessage[]>();

  private constructor() {
    super();
  }

  static getInstance(): ChatMessageStore {
    if (!global.__aiox_chat_store__) {
      global.__aiox_chat_store__ = new ChatMessageStore();
    }
    return global.__aiox_chat_store__;
  }

  /** Add a message from the Chief (user/orchestrator sending commands) */
  addChiefMessage(terminalId: string, content: string): ChatMessage {
    const msg: ChatMessage = {
      id: randomUUID(),
      role: 'chief',
      content,
      timestamp: new Date().toISOString(),
    };
    this.push(terminalId, msg);
    return msg;
  }

  /** Add a message from the agent (parsed from PTY output) */
  addAgentMessage(
    terminalId: string,
    content: string,
    artifacts?: ChatArtifact[],
  ): ChatMessage {
    const msg: ChatMessage = {
      id: randomUUID(),
      role: 'agent',
      content,
      timestamp: new Date().toISOString(),
      artifacts: artifacts && artifacts.length > 0 ? artifacts : undefined,
    };
    this.push(terminalId, msg);
    return msg;
  }

  /** Get all messages for a terminal */
  getMessages(terminalId: string): ChatMessage[] {
    return this.messages.get(terminalId) ?? [];
  }

  /** Clear messages for a terminal (e.g., on terminal close) */
  clear(terminalId: string): void {
    this.messages.delete(terminalId);
    this.emit('chat-event', {
      type: 'chat-clear',
      terminalId,
    } satisfies ChatEvent);
  }

  /** Check if a terminal has any messages */
  has(terminalId: string): boolean {
    const msgs = this.messages.get(terminalId);
    return !!msgs && msgs.length > 0;
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private push(terminalId: string, msg: ChatMessage): void {
    let list = this.messages.get(terminalId);
    if (!list) {
      list = [];
      this.messages.set(terminalId, list);
    }
    list.push(msg);

    // Trim oldest if over limit
    if (list.length > MAX_MESSAGES_PER_TERMINAL) {
      list.splice(0, list.length - MAX_MESSAGES_PER_TERMINAL);
    }

    this.emit('chat-event', {
      type: 'chat-message',
      terminalId,
      message: msg,
    } satisfies ChatEvent);
  }
}
