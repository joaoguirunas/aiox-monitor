/**
 * Ganga Ativo — Auto-responder.
 * Sends keystrokes to terminal windows via AppleScript (macOS only).
 */

import { execSync } from 'node:child_process';

/**
 * Check if a process is alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a text response to the iTerm2 session associated with a PID.
 * Uses iTerm2's AppleScript API to write text to the correct session.
 */
export function sendResponse(pid: number, text: string): boolean {
  // Sanitize text — only allow safe characters
  const safe = text.replace(/[^a-zA-Z0-9 ]/g, '');
  if (!safe) return false;

  // Try iTerm2 first (most common dev terminal on macOS)
  if (sendViaITerm2(pid, safe)) return true;

  // Fallback: Terminal.app
  if (sendViaTerminalApp(pid, safe)) return true;

  return false;
}

function sendViaITerm2(pid: number, text: string): boolean {
  const script = `
    tell application "iTerm2"
      repeat with w in windows
        repeat with t in tabs of w
          repeat with s in sessions of t
            try
              set ttyPid to (variable named "pid" of s) as integer
              if ttyPid is ${pid} then
                write text "${text}" in s
                return "sent"
              end if
            end try
          end repeat
        end repeat
      end repeat
    end tell
    return "not-found"
  `;

  try {
    const result = execSync(`osascript -e '${script}'`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return result === 'sent';
  } catch {
    return false;
  }
}

function sendViaTerminalApp(pid: number, text: string): boolean {
  // Terminal.app doesn't expose PID per tab easily.
  // We use `lsof` to find the tty for the PID, then match it.
  try {
    const tty = execSync(`lsof -p ${pid} 2>/dev/null | grep /dev/ttys | head -1 | awk '{print $NF}'`, {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();

    if (!tty) return false;

    const script = `
      tell application "Terminal"
        repeat with w in windows
          repeat with t in tabs of w
            if tty of t is "${tty}" then
              do script "${text}" in t
              return "sent"
            end if
          end repeat
        end repeat
      end tell
      return "not-found"
    `;

    const result = execSync(`osascript -e '${script}'`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return result === 'sent';
  } catch {
    return false;
  }
}
