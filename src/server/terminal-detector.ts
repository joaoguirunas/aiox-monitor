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

function isAppRunning(appName: string): boolean {
  try {
    const result = execSync(
      `pgrep -x "${appName}" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 2000 },
    ).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

function detectITerm2(): SystemTerminalInfo[] {
  if (!isAppRunning('iTerm2')) return [];

  const script = `
    const app = Application('iTerm2');
    const results = [];
    const wins = app.windows();
    for (let w = 0; w < wins.length; w++) {
      const win = wins[w];
      const wId = win.id();
      const wName = win.name();
      const tabs = win.tabs();
      for (let t = 0; t < tabs.length; t++) {
        const tab = tabs[t];
        const sessions = tab.sessions();
        for (let s = 0; s < sessions.length; s++) {
          const sess = sessions[s];
          results.push({
            app: 'iTerm2',
            windowId: wId,
            windowName: wName,
            tabIndex: t,
            sessionId: sess.uniqueId(),
            tty: sess.tty() || '',
            profileName: sess.profileName() || '',
            isProcessing: sess.isProcessing(),
            columns: sess.columns(),
            rows: sess.rows(),
            currentCommand: sess.name() || '',
          });
        }
      }
    }
    JSON.stringify(results);
  `;

  try {
    const raw = execSync(
      `osascript -l JavaScript -e '${script.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    const sessions: SystemTerminalInfo[] = JSON.parse(raw);
    return enrichWithPids(sessions);
  } catch {
    return [];
  }
}

function detectTerminalApp(): SystemTerminalInfo[] {
  if (!isAppRunning('Terminal')) return [];

  const script = `
    const app = Application('Terminal');
    const results = [];
    const wins = app.windows();
    for (let w = 0; w < wins.length; w++) {
      const win = wins[w];
      const wId = win.id();
      const wName = win.name();
      const tabs = win.tabs();
      for (let t = 0; t < tabs.length; t++) {
        const tab = tabs[t];
        results.push({
          app: 'Terminal',
          windowId: wId,
          windowName: wName,
          tabIndex: t,
          sessionId: 'terminal-' + wId + '-' + t,
          tty: tab.tty() || '',
          profileName: tab.currentSettings().name() || '',
          isProcessing: tab.busy(),
          columns: tab.numberOfColumns(),
          rows: tab.numberOfRows(),
          currentCommand: tab.processes().join(', ') || '',
        });
      }
    }
    JSON.stringify(results);
  `;

  try {
    const raw = execSync(
      `osascript -l JavaScript -e '${script.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    return JSON.parse(raw) as SystemTerminalInfo[];
  } catch {
    return [];
  }
}

function enrichWithPids(sessions: SystemTerminalInfo[]): SystemTerminalInfo[] {
  for (const session of sessions) {
    if (!session.tty) continue;
    try {
      const ttyName = session.tty.replace('/dev/', '');
      const pid = execSync(
        `ps -t ${ttyName} -o pid= -o comm= 2>/dev/null | grep -v "^$" | tail -1 | awk '{print $1}'`,
        { encoding: 'utf-8', timeout: 2000 },
      ).trim();
      if (pid) session.pid = parseInt(pid, 10);
    } catch {
      // ignore
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
