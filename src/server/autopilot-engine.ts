/**
 * Autopilot Engine — monitors terminals with autopilot=1 and waiting_permission=1,
 * sends approval keystrokes to the corresponding iTerm2 session, and logs actions.
 *
 * Cycle: every 3s, check → approve → log → broadcast.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  getAutopilotTerminals,
  insertAutopilotLog,
} from '../lib/queries';
import { db } from '../lib/db';
import { broadcast } from './ws-broadcaster';
import type { Terminal } from '../lib/types';

const execFileAsync = promisify(execFile);
const SHELL_ENV = { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin' };

// Track recently approved terminals to avoid double-tapping
const recentlyApproved = new Map<number, number>(); // terminal.id → timestamp
const COOLDOWN_MS = 8_000; // 8s cooldown per terminal

let running = false;

/**
 * Send "y" + Enter to an iTerm2 session identified by TTY.
 * Uses JXA (JavaScript for Automation) via osascript.
 */
async function sendApprovalToSession(tty: string): Promise<boolean> {
  // The `script` command allocates a new pty, so the claude process
  // is on a different tty than the iTerm2 session. We need to find
  // the iTerm2 session that is the ancestor. Try the parent TTY first.
  const script = `
    var app = Application('iTerm2');
    var wins = app.windows();
    var found = false;
    for (var w = 0; w < wins.length && !found; w++) {
      var tabs = wins[w].tabs();
      for (var t = 0; t < tabs.length && !found; t++) {
        var sessions = tabs[t].sessions();
        for (var s = 0; s < sessions.length && !found; s++) {
          var sess = sessions[s];
          if ('' + sess.tty() === '${tty}') {
            sess.write({text: 'y'});
            found = true;
          }
        }
      }
    }
    found;
  `;

  try {
    const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf-8',
      timeout: 5000,
      env: SHELL_ENV,
    });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * For PIDs running under `script` (which allocates a new pty),
 * walk up the process tree to find the parent's TTY (the iTerm2 session TTY).
 */
async function findSessionTty(pid: number): Promise<string | null> {
  try {
    // Get PID's own TTY and parent PID
    const { stdout } = await execFileAsync(
      'ps', ['-o', 'tty=,ppid=', '-p', String(pid)],
      { encoding: 'utf-8', timeout: 2000, env: SHELL_ENV },
    );
    const parts = stdout.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const ownTty = parts[0];
    const ppid = parseInt(parts[1], 10);
    if (!ppid || ppid <= 1) return ownTty !== '??' ? `/dev/${ownTty}` : null;

    // Get parent's TTY
    const { stdout: parentOut } = await execFileAsync(
      'ps', ['-o', 'tty=,ppid=', '-p', String(ppid)],
      { encoding: 'utf-8', timeout: 2000, env: SHELL_ENV },
    );
    const parentParts = parentOut.trim().split(/\s+/);
    const parentTty = parentParts[0];
    const gppid = parseInt(parentParts[1], 10);

    // If parent TTY differs from own TTY, parent is likely `script` on the iTerm2 session
    if (parentTty && parentTty !== '??' && parentTty !== ownTty) {
      return `/dev/${parentTty}`;
    }

    // Try grandparent (zsh → script → claude)
    if (gppid && gppid > 1) {
      const { stdout: gpOut } = await execFileAsync(
        'ps', ['-o', 'tty=', '-p', String(gppid)],
        { encoding: 'utf-8', timeout: 2000, env: SHELL_ENV },
      );
      const gpTty = gpOut.trim();
      if (gpTty && gpTty !== '??' && gpTty !== ownTty) {
        return `/dev/${gpTty}`;
      }
    }

    // Fallback to own TTY
    return ownTty !== '??' ? `/dev/${ownTty}` : null;
  } catch {
    return null;
  }
}

async function processTerminal(terminal: Terminal): Promise<void> {
  // Cooldown check
  const lastApproval = recentlyApproved.get(terminal.id);
  if (lastApproval && Date.now() - lastApproval < COOLDOWN_MS) return;

  const tty = await findSessionTty(terminal.pid);
  if (!tty) {
    insertAutopilotLog({
      terminal_id: terminal.id,
      project_id: terminal.project_id,
      window_title: terminal.window_title ?? null,
      agent_name: terminal.agent_name ?? null,
      action: 'error',
      detail: `TTY not found for PID ${terminal.pid}`,
    });
    return;
  }

  const sent = await sendApprovalToSession(tty);
  if (sent) {
    recentlyApproved.set(terminal.id, Date.now());

    // Clear waiting_permission in DB
    db.prepare(`UPDATE terminals SET waiting_permission = 0 WHERE id = ?`).run(terminal.id);

    insertAutopilotLog({
      terminal_id: terminal.id,
      project_id: terminal.project_id,
      window_title: terminal.window_title ?? null,
      agent_name: terminal.agent_name ?? null,
      action: 'permission_approve',
      detail: `Sent approval to ${tty} (PID ${terminal.pid})`,
    });

    // Broadcast updated terminal
    const updated = db.prepare(`SELECT * FROM terminals WHERE id = ?`).get(terminal.id) as Terminal | undefined;
    if (updated) {
      try { broadcast({ type: 'terminal:update', terminal: updated, projectId: terminal.project_id }); } catch { /* */ }
    }

    try {
      broadcast({
        type: 'autopilot:action',
        terminalId: terminal.id,
        windowTitle: terminal.window_title,
        action: 'permission_approve',
      });
    } catch { /* */ }
  } else {
    insertAutopilotLog({
      terminal_id: terminal.id,
      project_id: terminal.project_id,
      window_title: terminal.window_title ?? null,
      agent_name: terminal.agent_name ?? null,
      action: 'error',
      detail: `Failed to send approval to ${tty} (session not found in iTerm2)`,
    });
  }
}

async function tick(): Promise<void> {
  if (!running) return;

  try {
    const targets = getAutopilotTerminals();
    if (targets.length === 0) return;

    for (const terminal of targets) {
      await processTerminal(terminal);
    }
  } catch {
    // Engine is best-effort — never crash
  }
}

// Cleanup old cooldown entries every 60s
function cleanupCooldowns(): void {
  const now = Date.now();
  for (const [id, ts] of recentlyApproved) {
    if (now - ts > COOLDOWN_MS * 2) recentlyApproved.delete(id);
  }
}

export function startAutopilotEngine(): ReturnType<typeof setInterval> {
  running = true;
  console.log('[autopilot] Engine started (3s cycle)');

  // Run first tick after 1s
  setTimeout(() => { tick().catch(() => {}); }, 1000);

  const cooldownInterval = setInterval(cleanupCooldowns, 60_000);

  const interval = setInterval(() => { tick().catch(() => {}); }, 3_000);

  // Store cleanup interval ref on the main interval for later cleanup
  (interval as ReturnType<typeof setInterval> & { _cooldown?: ReturnType<typeof setInterval> })._cooldown = cooldownInterval;

  return interval;
}

export function stopAutopilotEngine(interval: ReturnType<typeof setInterval>): void {
  running = false;
  clearInterval(interval);
  const cooldown = (interval as ReturnType<typeof setInterval> & { _cooldown?: ReturnType<typeof setInterval> })._cooldown;
  if (cooldown) clearInterval(cooldown);
  console.log('[autopilot] Engine stopped');
}
