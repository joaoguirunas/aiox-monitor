/**
 * stdin-writer.ts — JOB-046
 *
 * Writes a command to a PTY via `maestri ask {terminalName} "{prompt}"`.
 *
 * v1: uses child_process.spawn (streaming). Real node-pty write() integration
 * comes in Story 9.7 when ProcessManager is wired in.
 *
 * Interface is designed for substitution: `PtyWriter` type can be swapped for
 * a node-pty `IPty.write()` wrapper in Story 9.7 without changing the dispatcher.
 */

import { spawn } from 'node:child_process';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PtyWriteResult {
  ok: boolean;
  error?: string;
}

/**
 * Abstraction over PTY write.
 * v1 implementation: spawns `maestri ask`.
 * v2 (story 9.7): replaces with node-pty handle.
 */
export type PtyWriter = (terminalName: string, prompt: string, onChunk: (chunk: string) => void) => Promise<PtyWriteResult>;

// ─── v1: maestri ask via spawn ────────────────────────────────────────────────

/**
 * Invoke `maestri ask {terminalName} "{prompt}"` as a streaming subprocess.
 * Calls `onChunk` for each stdout chunk (for WS `chat.chunk` broadcasting).
 *
 * Security: prompt is passed as a separate argument (no shell injection).
 */
export async function maestriAsk(
  terminalName: string,
  prompt: string,
  onChunk: (chunk: string) => void,
): Promise<PtyWriteResult> {
  return new Promise((resolve) => {
    let stderr = '';

    const child = spawn('maestri', ['ask', terminalName, prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // No shell: false to avoid injection. Args are passed directly.
      shell: false,
    });

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      onChunk(chunk);
    });

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true });
      } else {
        resolve({
          ok: false,
          error: stderr.trim() || `maestri ask exited with code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

/**
 * Default PtyWriter used by the dispatcher.
 * Can be replaced in tests via dispatcher's `options.ptyWriter`.
 */
export const defaultPtyWriter: PtyWriter = maestriAsk;
