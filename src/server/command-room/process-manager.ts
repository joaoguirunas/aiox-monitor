import * as pty from 'node-pty';
import { existsSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  PtyProcess,
  PtyStatus,
  PtyListEntry,
  SpawnOptions,
  ProcessEvent,
} from './types';
import {
  MAX_SCROLLBACK,
  MAX_PROCESSES,
  MAX_PROCESSES_PER_PROJECT,
  IDLE_TIMEOUT_MS,
  CLOSED_RETENTION_MS,
  KILL_GRACE_MS,
} from './types';

// ─── ProcessManager ──────────────────────────────────────────────────────────

// Use global to share singleton across module bundles (server.mjs + Next.js API routes)
declare global {
  // eslint-disable-next-line no-var
  var __aiox_process_manager__: ProcessManager | undefined;
}

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, PtyProcess>();

  private constructor() {
    super();
  }

  static getInstance(): ProcessManager {
    if (!global.__aiox_process_manager__) {
      global.__aiox_process_manager__ = new ProcessManager();
      // Startup reconciliation: Map is empty — mark any 'active' DB terminals as 'crashed'
      void (async () => {
        try {
          const { markCrashedTerminals } = await import('@/lib/command-room-repository');
          await markCrashedTerminals([]);
        } catch {
          // DB table may not exist yet — safe to ignore
        }
      })();
    }
    return global.__aiox_process_manager__;
  }

  /** Reset singleton — for testing only */
  static resetInstance(): void {
    if (global.__aiox_process_manager__) {
      global.__aiox_process_manager__.killAll();
      global.__aiox_process_manager__ = undefined;
    }
  }

  // ─── Spawn ───────────────────────────────────────────────────────────────

  spawn(options: SpawnOptions): PtyProcess {
    const { agentName, projectPath, cols = 120, rows = 30 } = options;

    // Validate projectPath
    if (!existsSync(projectPath)) {
      throw new Error(`projectPath does not exist: ${projectPath}`);
    }
    const stat = statSync(projectPath);
    if (!stat.isDirectory()) {
      throw new Error(`projectPath is not a directory: ${projectPath}`);
    }

    // Check global process limit
    const activeCount = this.getActiveCount();
    if (activeCount >= MAX_PROCESSES) {
      throw new Error(`Global process limit reached (${MAX_PROCESSES}).`);
    }

    // Check per-project process limit
    const projectCount = this.getActiveCountForProject(projectPath);
    if (projectCount >= MAX_PROCESSES_PER_PROJECT) {
      throw new Error(
        `Project limit reached (${MAX_PROCESSES_PER_PROJECT} terminals per project). Close some terminals first.`,
      );
    }

    // Determine shell and args based on platform
    const { shell, args } = this.getShellCommand(agentName);

    const id = randomUUID();

    console.log('[ProcessManager] Spawning PTY:', {
      shell,
      args,
      cwd: projectPath,
      platform: process.platform,
      shellExists: existsSync(shell),
      cwdExists: existsSync(projectPath),
    });

    // Additional validation before spawn
    if (!existsSync(shell)) {
      throw new Error(`Shell not found: ${shell}`);
    }

    let ptyProcess: pty.IPty;

    // Log full spawn configuration
    const spawnConfig = {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: projectPath,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...options.env,
      } as Record<string, string>,
    };

    console.log('[ProcessManager] About to spawn with config:', {
      shell,
      args,
      cols,
      rows,
      cwd: projectPath,
      hasEnv: !!spawnConfig.env,
      envKeys: Object.keys(spawnConfig.env || {}).length,
    });

    try {
      ptyProcess = pty.spawn(shell, args, spawnConfig);
      console.log('[ProcessManager] ✓ PTY spawn SUCCESS - PID:', ptyProcess.pid);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      console.error('[ProcessManager] ✗ PTY spawn FAILED:', {
        error: errMsg,
        stack: errStack,
        shell,
        args,
        cwd: projectPath,
        shellExists: existsSync(shell),
        cwdExists: existsSync(projectPath),
        cwdIsDir: existsSync(projectPath) && statSync(projectPath).isDirectory(),
      });
      throw new Error(`Failed to spawn terminal: ${errMsg}. Shell: ${shell}, CWD: ${projectPath}`);
    }

    const proc: PtyProcess = {
      id,
      agentName,
      projectPath,
      pid: ptyProcess.pid,
      status: 'spawning',
      cols,
      rows,
      createdAt: new Date().toISOString(),
      scrollback: [],
      pty: ptyProcess,
      idleTimer: null,
      cleanupTimer: null,
    };

    this.processes.set(id, proc);

    // ─── onData handler ─────────────────────────────────────────────────
    ptyProcess.onData((data: string) => {
      // Transition spawning → active on first data
      if (proc.status === 'spawning') {
        this.setStatus(proc, 'active');
      }
      // If was idle, back to active
      if (proc.status === 'idle') {
        this.setStatus(proc, 'active');
      }

      // Scrollback buffer
      proc.scrollback.push(data);
      if (proc.scrollback.length > MAX_SCROLLBACK) {
        proc.scrollback.shift();
      }

      // Reset idle timer
      this.resetIdleTimer(proc);

      // Emit data event for WS bridge
      this.emit('process-event', {
        type: 'data',
        id: proc.id,
        data,
      } satisfies ProcessEvent);
    });

    // ─── onExit handler ─────────────────────────────────────────────────
    ptyProcess.onExit(({ exitCode, signal }) => {
      this.clearIdleTimer(proc);
      this.setStatus(proc, 'closed');

      this.emit('process-event', {
        type: 'exit',
        id: proc.id,
        exitCode,
        signal: signal !== undefined ? String(signal) : undefined,
      } satisfies ProcessEvent);

      // Keep in memory for reconnection, then remove
      proc.cleanupTimer = setTimeout(() => {
        this.processes.delete(proc.id);
      }, CLOSED_RETENTION_MS);
    });

    // Send initial prompt after a short delay (let shell fully boot)
    if (options.initialPrompt) {
      // Split multi-line prompts and send each line with proper timing
      const lines = options.initialPrompt.split('\n').filter((line) => line.trim());

      if (lines.length === 1) {
        // Single command: send after 1.5s
        setTimeout(() => {
          this.write(id, lines[0] + '\n');
        }, 1500);
      } else {
        // Multiple commands: send first, wait for it to complete, then send subsequent commands
        setTimeout(() => {
          this.write(id, lines[0] + '\n');

          // Send subsequent commands with delays
          lines.slice(1).forEach((line, index) => {
            setTimeout(() => {
              this.write(id, line + '\n');
            }, 3000 + (index * 1000)); // First subsequent: 3s, next: 4s, etc.
          });
        }, 1500);
      }
    }

    console.log(
      `[ProcessManager] Spawned ${agentName} (pid=${ptyProcess.pid}, id=${id})`,
    );

    return proc;
  }

  // ─── Kill ────────────────────────────────────────────────────────────────

  kill(id: string): boolean {
    const proc = this.processes.get(id);
    if (!proc) return false;
    if (proc.status === 'closed') {
      // Already closed, just clean up
      this.cleanup(proc);
      return true;
    }

    this.clearIdleTimer(proc);

    try {
      // Try graceful SIGTERM first
      proc.pty.kill('SIGTERM');
    } catch {
      // Process may already be dead
    }

    // Force kill after grace period
    const forceKillTimer = setTimeout(() => {
      try {
        proc.pty.kill('SIGKILL');
      } catch {
        // Already dead
      }
    }, KILL_GRACE_MS);

    // Wait for onExit, but ensure cleanup happens
    const originalCleanupTimer = proc.cleanupTimer;
    if (originalCleanupTimer) clearTimeout(originalCleanupTimer);

    proc.cleanupTimer = setTimeout(() => {
      clearTimeout(forceKillTimer);
      this.processes.delete(id);
    }, KILL_GRACE_MS + 1000);

    console.log(`[ProcessManager] Killed ${proc.agentName} (id=${id})`);
    return true;
  }

  // ─── Kill All ────────────────────────────────────────────────────────────

  killAll(): void {
    const ids = Array.from(this.processes.keys());
    for (const id of ids) {
      this.kill(id);
    }
    console.log('[ProcessManager] All processes killed');
  }

  // ─── Resize ──────────────────────────────────────────────────────────────

  resize(id: string, cols: number, rows: number): boolean {
    const proc = this.processes.get(id);
    if (!proc || proc.status === 'closed') return false;

    try {
      proc.pty.resize(cols, rows);
      proc.cols = cols;
      proc.rows = rows;
      return true;
    } catch {
      return false;
    }
  }

  // ─── Write (stdin) ───────────────────────────────────────────────────────

  write(id: string, data: string): boolean {
    const proc = this.processes.get(id);
    if (!proc || proc.status === 'closed') return false;

    try {
      proc.pty.write(data);
      return true;
    } catch {
      return false;
    }
  }

  // ─── List ────────────────────────────────────────────────────────────────

  list(): PtyListEntry[] {
    const entries: PtyListEntry[] = [];
    const procs = Array.from(this.processes.values());
    for (const proc of procs) {
      entries.push({
        id: proc.id,
        agentName: proc.agentName,
        projectPath: proc.projectPath,
        pid: proc.pid,
        status: proc.status,
        cols: proc.cols,
        rows: proc.rows,
        createdAt: proc.createdAt,
      });
    }
    return entries;
  }

  // ─── Get ─────────────────────────────────────────────────────────────────

  get(id: string): PtyProcess | undefined {
    return this.processes.get(id);
  }

  // ─── Find Chief for a project ─────────────────────────────────────────────

  findChiefForProject(projectPath: string): PtyListEntry | undefined {
    for (const proc of this.processes.values()) {
      if (proc.projectPath === projectPath && proc.status !== 'closed' && proc.agentName === 'CHIEF') {
        return { id: proc.id, agentName: proc.agentName, projectPath: proc.projectPath, pid: proc.pid, status: proc.status, cols: proc.cols, rows: proc.rows, createdAt: proc.createdAt };
      }
    }
    return undefined;
  }

  // ─── Check if a PID is a child of any managed process ───────────────────

  isCommandRoomProject(projectPath: string): boolean {
    for (const proc of this.processes.values()) {
      if (proc.projectPath === projectPath && proc.status !== 'closed') return true;
    }
    return false;
  }

  // ─── Kill By Project ─────────────────────────────────────────────────────

  killByProject(projectPath: string): number {
    const ids = Array.from(this.processes.values())
      .filter((p) => p.projectPath === projectPath)
      .map((p) => p.id);
    for (const id of ids) this.kill(id);
    console.log(`[ProcessManager] Killed ${ids.length} processes for ${projectPath}`);
    return ids.length;
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private getActiveCount(): number {
    let count = 0;
    const procs = Array.from(this.processes.values());
    for (const proc of procs) {
      if (proc.status !== 'closed') count++;
    }
    return count;
  }

  private getActiveCountForProject(projectPath: string): number {
    let count = 0;
    const procs = Array.from(this.processes.values());
    for (const proc of procs) {
      if (proc.projectPath === projectPath && proc.status !== 'closed') count++;
    }
    return count;
  }

  private setStatus(proc: PtyProcess, status: PtyStatus): void {
    proc.status = status;
    this.emit('process-event', {
      type: 'status',
      id: proc.id,
      status,
    } satisfies ProcessEvent);
  }

  private resetIdleTimer(proc: PtyProcess): void {
    this.clearIdleTimer(proc);
    proc.idleTimer = setTimeout(() => {
      if (proc.status === 'active') {
        this.setStatus(proc, 'idle');
      }
    }, IDLE_TIMEOUT_MS);
  }

  private clearIdleTimer(proc: PtyProcess): void {
    if (proc.idleTimer) {
      clearTimeout(proc.idleTimer);
      proc.idleTimer = null;
    }
  }

  private cleanup(proc: PtyProcess): void {
    this.clearIdleTimer(proc);
    if (proc.cleanupTimer) {
      clearTimeout(proc.cleanupTimer);
      proc.cleanupTimer = null;
    }
    this.processes.delete(proc.id);
  }

  private getShellCommand(_agentName: string): {
    shell: string;
    args: string[];
  } {
    if (process.platform === 'win32') {
      return {
        shell: 'powershell.exe',
        args: ['-NoLogo'],
      };
    }

    // For macOS/Linux, try to find a valid shell in order of preference
    const shellCandidates = [
      process.env.SHELL,
      '/bin/zsh',
      '/bin/bash',
      '/bin/sh',
    ].filter((s): s is string => !!s);

    for (const shellPath of shellCandidates) {
      if (existsSync(shellPath)) {
        try {
          const stat = statSync(shellPath);
          // Check if executable (at least one execute bit set)
          if (stat.mode & 0o111) {
            console.log(`[ProcessManager] Using shell: ${shellPath}`);
            // Use empty args array - let shell initialize naturally
            return { shell: shellPath, args: [] };
          }
        } catch (err) {
          console.warn(`[ProcessManager] Failed to stat shell ${shellPath}:`, err);
          continue;
        }
      }
    }

    throw new Error(
      `No valid executable shell found. Tried: ${shellCandidates.join(', ')}`,
    );
  }
}
