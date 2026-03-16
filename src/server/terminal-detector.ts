import { execSync } from 'node:child_process';

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
}

function runSilent(cmd: string, timeout = 5000): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin' },
    }).trim();
  } catch {
    return '';
  }
}

function isAppRunning(appName: string): boolean {
  return runSilent(`pgrep -x "${appName}" 2>/dev/null`, 2000).length > 0;
}

function detectITerm2(): SystemTerminalInfo[] {
  if (!isAppRunning('iTerm2')) return [];

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

  const raw = runSilent(`osascript -l JavaScript -e '${script.replace(/'/g, "'\\''")}' 2>/dev/null`);
  if (!raw) return [];
  try {
    const sessions: SystemTerminalInfo[] = JSON.parse(raw);
    return enrichWithPids(sessions);
  } catch {
    return [];
  }
}

function detectTerminalApp(): SystemTerminalInfo[] {
  if (!isAppRunning('Terminal')) return [];

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

  const raw = runSilent(`osascript -l JavaScript -e '${script.replace(/'/g, "'\\''")}' 2>/dev/null`);
  if (!raw) return [];
  try {
    const sessions: SystemTerminalInfo[] = JSON.parse(raw);
    return enrichWithPids(sessions);
  } catch {
    return [];
  }
}

function enrichWithPids(sessions: SystemTerminalInfo[]): SystemTerminalInfo[] {
  for (const session of sessions) {
    if (!session.tty) continue;
    const ttyName = session.tty.replace('/dev/', '');
    // Find the `claude` process PID on this TTY — this matches what the hook sends via os.getppid()
    const claudePid = runSilent(
      `ps -t ${ttyName} -o pid= -o comm= 2>/dev/null | grep claude | head -1 | awk '{print $1}'`,
      2000,
    );
    if (claudePid) {
      session.pid = parseInt(claudePid, 10);
    } else {
      // Fallback: last foreground process (non-login, non-shell)
      const pid = runSilent(
        `ps -t ${ttyName} -o pid= -o comm= 2>/dev/null | grep -v "^$" | tail -1 | awk '{print $1}'`,
        2000,
      );
      if (pid) session.pid = parseInt(pid, 10);
    }
  }
  return sessions;
}

export async function detectSystemTerminals(): Promise<SystemTerminalInfo[]> {
  const results: SystemTerminalInfo[] = [];

  results.push(...detectITerm2());
  results.push(...detectTerminalApp());

  return results;
}
