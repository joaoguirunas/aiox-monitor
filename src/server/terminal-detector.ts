import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SystemTerminalInfo {
  app: string;
  windowId: number;
  windowName: string;
  tabIndex: number;
  sessionId: string;
  tty: string;
  profileName: string;
  isProcessing: boolean;
  columns: number;
  rows: number;
  currentCommand: string;
  pid?: number;
  /** True if the PID was resolved from a `grep claude` match on the TTY */
  isClaudeProcess?: boolean;
}

const SHELL_ENV = { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin' };

async function runAsync(cmd: string, args: string[], timeout = 5000): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 1024 * 1024,
      env: SHELL_ENV,
    });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function runShellAsync(script: string, timeout = 5000): Promise<string> {
  try {
    const { stdout } = await execFileAsync('/bin/sh', ['-c', script], {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 1024 * 1024,
      env: SHELL_ENV,
    });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function isAppRunning(appName: string): Promise<boolean> {
  const result = await runAsync('pgrep', ['-x', appName], 2000);
  return result.length > 0;
}

async function detectITerm2(): Promise<SystemTerminalInfo[]> {
  if (!(await isAppRunning('iTerm2'))) return [];

  const script = `
    var app = Application('iTerm2');
    var results = [];
    var wins = app.windows();
    for (var w = 0; w < wins.length; w++) {
      var win = wins[w];
      var wName = '' + (win.name() || '');
      var tabs = win.tabs();
      for (var t = 0; t < tabs.length; t++) {
        var tab = tabs[t];
        var sessions = tab.sessions();
        for (var s = 0; s < sessions.length; s++) {
          var sess = sessions[s];
          var sName = '' + (sess.name() || '');
          var sProfile = '' + (sess.profileName() || '');
          var sTty = '' + (sess.tty() || '');
          results.push({
            app: 'iTerm2',
            windowId: w,
            windowName: sName || sProfile || wName,
            tabIndex: t,
            sessionId: 'iterm-' + w + '-' + t + '-' + s,
            tty: sTty,
            profileName: sProfile,
            isProcessing: false,
            columns: 80,
            rows: 24,
            currentCommand: sName,
          });
        }
      }
    }
    JSON.stringify(results);
  `;

  const raw = await runAsync('osascript', ['-l', 'JavaScript', '-e', script]);
  if (!raw) return [];
  try {
    const sessions: SystemTerminalInfo[] = JSON.parse(raw);
    return enrichWithPids(sessions);
  } catch {
    return [];
  }
}

async function detectTerminalApp(): Promise<SystemTerminalInfo[]> {
  if (!(await isAppRunning('Terminal'))) return [];

  const script = `
    var app = Application('Terminal');
    var results = [];
    var wins = app.windows();
    for (var w = 0; w < wins.length; w++) {
      var win = wins[w];
      var wName = '' + (win.name() || '');
      var tabs = win.tabs();
      for (var t = 0; t < tabs.length; t++) {
        var tab = tabs[t];
        var sTty = '' + (tab.tty() || '');
        var sProfile = '';
        var sCustomTitle = '';
        try { sProfile = '' + tab.currentSettings().name(); } catch(e) {}
        try { sCustomTitle = '' + (tab.customTitle() || ''); } catch(e) {}
        results.push({
          app: 'Terminal',
          windowId: w,
          windowName: sCustomTitle || wName || sProfile,
          tabIndex: t,
          sessionId: 'terminal-' + w + '-' + t,
          tty: sTty,
          profileName: sProfile,
          isProcessing: false,
          columns: 80,
          rows: 24,
          currentCommand: '',
        });
      }
    }
    JSON.stringify(results);
  `;

  const raw = await runAsync('osascript', ['-l', 'JavaScript', '-e', script]);
  if (!raw) return [];
  try {
    const sessions: SystemTerminalInfo[] = JSON.parse(raw);
    return enrichWithPids(sessions);
  } catch {
    return [];
  }
}

async function enrichWithPids(sessions: SystemTerminalInfo[]): Promise<SystemTerminalInfo[]> {
  // Batch: get all PIDs with their TTYs and commands in a single ps call
  const psOutput = await runShellAsync('ps -e -o tty=,pid=,comm= 2>/dev/null', 3000);
  if (!psOutput) return sessions;

  // Build TTY → entries map
  const ttyMap = new Map<string, { pid: number; comm: string }[]>();
  for (const line of psOutput.split('\n')) {
    const match = line.trim().match(/^(\S+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;
    const [, tty, pid, comm] = match;
    const entries = ttyMap.get(tty) ?? [];
    entries.push({ pid: parseInt(pid, 10), comm: comm.trim() });
    ttyMap.set(tty, entries);
  }

  for (const session of sessions) {
    if (!session.tty) continue;
    const ttyName = session.tty.replace('/dev/', '');
    const entries = ttyMap.get(ttyName);
    if (!entries || entries.length === 0) continue;

    // Find claude process on this TTY
    const claudeEntry = entries.find(e => /\bclaude\b/.test(e.comm));
    if (claudeEntry) {
      session.pid = claudeEntry.pid;
      session.isClaudeProcess = true;
    } else {
      // Fallback: last process
      const last = entries[entries.length - 1];
      session.pid = last.pid;
      session.isClaudeProcess = false;
    }
  }
  return sessions;
}

export async function detectSystemTerminals(): Promise<SystemTerminalInfo[]> {
  const results: SystemTerminalInfo[] = [];

  // Run both detectors in parallel
  const [iterm, terminal] = await Promise.all([
    detectITerm2(),
    detectTerminalApp(),
  ]);

  results.push(...iterm, ...terminal);
  return results;
}
