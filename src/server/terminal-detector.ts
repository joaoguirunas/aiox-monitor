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

// Session names that are generic/dynamic — prefer profileName over these
const GENERIC_NAMES = /^(claude code|claude|zsh|bash|-zsh|-bash|login|terminal|sh|caffeinate)$/i;

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
  // pgrep -x does exact match on process name — try first.
  const exact = await runAsync('pgrep', ['-x', appName], 2000);
  if (exact.length > 0) return true;
  // Fallback: ps + grep — more reliable on macOS where pgrep -f
  // can miss processes launched by LaunchServices (e.g. iTerm2).
  const byPs = await runShellAsync(
    `ps -eo comm= 2>/dev/null | grep -i '/${appName}$' | head -1`,
    2000,
  );
  return byPs.length > 0;
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
            windowName: sName || wName || sProfile,
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
    // When iTerm2 session name is generic (e.g. "Claude Code", "zsh"),
    // prefer the user-set profile name which is more meaningful.
    for (const s of sessions) {
      const cleaned = s.windowName
        .replace(/\s*\([^)]*\)\s*$/i, '')
        .replace(/^[\u2800-\u28FF\u2702-\u27B0✳●◉◈⬤☐☑✓✔✕✖✗✘⚡⏳🔄]+\s*/u, '')
        .trim();
      if (GENERIC_NAMES.test(cleaned) && s.profileName) {
        s.windowName = s.profileName;
      }
    }
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
  // Batch: get all PIDs with their TTYs, PPIDs and commands in a single ps call
  const psOutput = await runShellAsync('ps -e -o tty=,pid=,ppid=,comm= 2>/dev/null', 3000);
  if (!psOutput) return sessions;

  // Build TTY → entries map AND PID → info map (for child-process lookups)
  const ttyMap = new Map<string, { pid: number; ppid: number; comm: string }[]>();
  const pidMap = new Map<number, { tty: string; ppid: number; comm: string }>();
  for (const line of psOutput.split('\n')) {
    const match = line.trim().match(/^(\S+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;
    const [, tty, pidStr, ppidStr, comm] = match;
    const pid = parseInt(pidStr, 10);
    const ppid = parseInt(ppidStr, 10);
    const entry = { pid, ppid, comm: comm.trim() };
    const entries = ttyMap.get(tty) ?? [];
    entries.push(entry);
    ttyMap.set(tty, entries);
    pidMap.set(pid, { tty, ppid, comm: comm.trim() });
  }

  for (const session of sessions) {
    if (!session.tty) continue;
    const ttyName = session.tty.replace('/dev/', '');
    const entries = ttyMap.get(ttyName);
    if (!entries || entries.length === 0) continue;

    // 1. Direct match: claude process on this TTY
    const claudeEntry = entries.find(e => /\bclaude\b/.test(e.comm));
    if (claudeEntry) {
      session.pid = claudeEntry.pid;
      session.isClaudeProcess = true;
      continue;
    }

    // 2. Child match: `script` (or similar) on session TTY allocates a new PTY
    //    for its child. Check if any claude process has a parent on this TTY.
    const pidsOnTty = new Set(entries.map(e => e.pid));
    let found = false;
    for (const [pid, info] of pidMap) {
      if (/\bclaude\b/.test(info.comm) && pidsOnTty.has(info.ppid)) {
        session.pid = pid;
        session.isClaudeProcess = true;
        found = true;
        break;
      }
    }
    if (found) continue;

    // 3. Grandchild match: walk up 2 levels (handles wrapper → script → claude)
    for (const [pid, info] of pidMap) {
      if (!/\bclaude\b/.test(info.comm)) continue;
      const parent = pidMap.get(info.ppid);
      if (parent && pidsOnTty.has(parent.ppid)) {
        session.pid = pid;
        session.isClaudeProcess = true;
        found = true;
        break;
      }
    }
    if (found) continue;

    // 4. Fallback: last process on TTY
    const last = entries[entries.length - 1];
    session.pid = last.pid;
    session.isClaudeProcess = false;
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
