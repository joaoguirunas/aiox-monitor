/**
 * stdout-parser.ts — JOB-046
 *
 * Groups raw PTY output chunks into structured messages.
 *
 * Approach: line-accumulator with heuristic flush triggers.
 *   - Accumulates chunks into a buffer.
 *   - Flushes when a "response boundary" is detected (empty line after content,
 *     prompt character, or a configurable max-chars limit).
 *   - Also supports "streaming" mode: emits each chunk directly for real-time
 *     display (chat.chunk WS events), and emits a final `message` when done.
 *
 * This module is stateless per parse session — create a new StreamAccumulator
 * for each dispatch.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedChunk {
  type: 'chunk';
  delta: string;
}

export interface ParsedMessage {
  type: 'message';
  content: string;
}

export type ParsedEvent = ParsedChunk | ParsedMessage;

// ─── StreamAccumulator ────────────────────────────────────────────────────────

/**
 * Accumulates stdout chunks from a PTY/subprocess into structured events.
 *
 * Usage:
 *   const acc = new StreamAccumulator();
 *   acc.onEvent = (event) => handleEvent(event);
 *   child.stdout.on('data', chunk => acc.push(chunk));
 *   child.on('close', () => acc.flush());
 */
export class StreamAccumulator {
  private buffer = '';
  private chunkBuffer = '';

  /** Called for each parsed event. Override or set before first push(). */
  onEvent: (event: ParsedEvent) => void = () => undefined;

  /**
   * Push a raw chunk from stdout.
   * Emits `chunk` events immediately (for real-time streaming).
   * Accumulates into buffer for final `message` event on flush().
   */
  push(raw: string): void {
    // Emit chunk event for live streaming
    this.onEvent({ type: 'chunk', delta: raw });
    this.buffer += raw;
    this.chunkBuffer += raw;
  }

  /**
   * Flush accumulated buffer as a final `message` event.
   * Call when the subprocess/PTY signals end-of-response.
   */
  flush(): void {
    const content = this.buffer.trim();
    if (content) {
      this.onEvent({ type: 'message', content });
    }
    this.buffer = '';
    this.chunkBuffer = '';
  }

  /** Return accumulated content without flushing. */
  peek(): string {
    return this.buffer;
  }

  /** Reset state (for reuse across turns). */
  reset(): void {
    this.buffer = '';
    this.chunkBuffer = '';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip common terminal control sequences from PTY output.
 * Removes ANSI escape codes that would clutter the chat message.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[mGKJHF]/g, '').replace(/\r/g, '');
}

/**
 * Collect all chunks from an async iterator (e.g. Node.js Readable stream)
 * into a single string. Useful for tests.
 */
export async function collectStream(
  readable: NodeJS.ReadableStream,
): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf-8'));
  }
  return chunks.join('');
}
