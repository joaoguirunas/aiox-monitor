import { ProcessManager } from './process-manager';
import { ChatMessageStore } from './chat-store';
import { ClaudeOutputParser } from './claude-output-parser';
import type { ProcessEvent } from './types';

// ─── ChatCollector ──────────────────────────────────────────────────────────
// Listens to ProcessManager events and collects agent output into chat messages.
// When a terminal goes idle (no output for FLUSH_DELAY_MS), flushes the
// accumulated output through the parser and stores the result as an agent message.

const FLUSH_DELAY_MS = 2_500; // Wait 2.5s of silence before treating output as complete

declare global {
  var __aiox_chat_collector__: ChatCollector | undefined;
}

export class ChatCollector {
  private parsers = new Map<string, ClaudeOutputParser>();
  private flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pm: ProcessManager;
  private store: ChatMessageStore;

  private constructor() {
    this.pm = ProcessManager.getInstance();
    this.store = ChatMessageStore.getInstance();

    this.pm.on('process-event', (event: ProcessEvent) => {
      this.handleEvent(event);
    });
  }

  static getInstance(): ChatCollector {
    if (!global.__aiox_chat_collector__) {
      global.__aiox_chat_collector__ = new ChatCollector();
    }
    return global.__aiox_chat_collector__;
  }

  private handleEvent(event: ProcessEvent): void {
    switch (event.type) {
      case 'data':
        this.onData(event.id, event.data ?? '');
        break;
      case 'exit':
        // Flush any remaining output on exit
        this.flush(event.id);
        break;
      case 'status':
        // On idle, flush accumulated output
        if (event.status === 'idle') {
          this.flush(event.id);
        }
        break;
    }
  }

  private onData(terminalId: string, data: string): void {
    if (!data || data.length === 0) return;

    // Get or create parser for this terminal
    let parser = this.parsers.get(terminalId);
    if (!parser) {
      parser = new ClaudeOutputParser();
      this.parsers.set(terminalId, parser);
    }

    parser.feed(data);

    // Reset flush timer — we wait for silence before parsing
    this.resetFlushTimer(terminalId);
  }

  private resetFlushTimer(terminalId: string): void {
    const existing = this.flushTimers.get(terminalId);
    if (existing) clearTimeout(existing);

    this.flushTimers.set(
      terminalId,
      setTimeout(() => {
        this.flush(terminalId);
      }, FLUSH_DELAY_MS),
    );
  }

  private flush(terminalId: string): void {
    // Clear timer
    const timer = this.flushTimers.get(terminalId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(terminalId);
    }

    const parser = this.parsers.get(terminalId);
    if (!parser) return;

    const result = parser.flush();
    if (!result) return;

    // Only store if there's meaningful content
    if (result.text.length > 0 || result.artifacts.length > 0) {
      this.store.addAgentMessage(terminalId, result.text, result.artifacts);
    }
  }

  /** Clean up resources for a terminal */
  cleanup(terminalId: string): void {
    const timer = this.flushTimers.get(terminalId);
    if (timer) clearTimeout(timer);
    this.flushTimers.delete(terminalId);

    const parser = this.parsers.get(terminalId);
    if (parser) parser.reset();
    this.parsers.delete(terminalId);
  }
}
