/**
 * Agent Catalog Scanner — JOB-021
 * Scans {projectPath}/.claude/commands/ + ~/.claude/commands/ for agent/group definitions.
 * Manages fs.watch watchers per project, writes results to SQLite, broadcasts WS events.
 *
 * Architecture (from master plan §2.5.4 + hansolo-backend.md):
 * - Project scope:  {projectPath}/.claude/commands/{squad}/agents/*.md
 * - User scope:     ~/.claude/commands/{squad}/agents/*.md
 * - Builtin scope:  (reserved, none today)
 * - Merge strategy: project > user > builtin (same skill_path → higher specificity wins)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseAgentFile, parseGroupFile } from './parser';
import type { AgentCatalogEntry, GroupCatalogEntry, AgentSource } from './parser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScanResult {
  agents: AgentCatalogEntry[];
  groups: GroupCatalogEntry[];
  errors: { file: string; error: string }[];
}

type WatcherCleanup = () => void;

// ─── Merge strategy ───────────────────────────────────────────────────────────

const SOURCE_PRIORITY: Record<AgentSource, number> = {
  project: 3,
  user: 2,
  builtin: 1,
};

function mergeAgents(entries: AgentCatalogEntry[]): AgentCatalogEntry[] {
  const map = new Map<string, AgentCatalogEntry>();
  for (const entry of entries) {
    const existing = map.get(entry.skill_path);
    if (!existing || SOURCE_PRIORITY[entry.source] > SOURCE_PRIORITY[existing.source]) {
      map.set(entry.skill_path, entry);
    }
  }
  return Array.from(map.values());
}

// ─── Scanner ─────────────────────────────────────────────────────────────────

/**
 * Scan a single scope root (project or user dir) for agent/group .md files.
 * Returns raw entries before merge — the service layer owns merge.
 */
export function scanScope(
  scopeRoot: string,
  source: AgentSource,
  projectPath: string,
): ScanResult {
  const commandsDir = path.join(scopeRoot, '.claude', 'commands');
  const result: ScanResult = { agents: [], groups: [], errors: [] };

  if (!fs.existsSync(commandsDir)) return result;

  let squads: string[];
  try {
    squads = fs.readdirSync(commandsDir).filter(name => {
      const full = path.join(commandsDir, name);
      return fs.statSync(full).isDirectory();
    });
  } catch {
    return result;
  }

  for (const squad of squads) {
    const agentsDir = path.join(commandsDir, squad, 'agents');
    const groupsDir = path.join(commandsDir, squad, 'groups');

    // Scan agents
    if (fs.existsSync(agentsDir)) {
      let files: string[];
      try {
        files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
      } catch {
        files = [];
      }
      for (const file of files) {
        const filePath = path.join(agentsDir, file);
        const res = parseAgentFile(filePath, scopeRoot, source, projectPath);
        if (res.entry) {
          result.agents.push(res.entry);
        } else if (res.error) {
          result.errors.push({ file: filePath, error: res.error.message });
        }
      }
    }

    // Scan groups (may not exist yet — graceful)
    if (fs.existsSync(groupsDir)) {
      let files: string[];
      try {
        files = fs.readdirSync(groupsDir).filter(f => f.endsWith('.md'));
      } catch {
        files = [];
      }
      for (const file of files) {
        const filePath = path.join(groupsDir, file);
        const res = parseGroupFile(filePath, scopeRoot, source === 'builtin' ? 'auto' : source, projectPath);
        if (res.entry) {
          result.groups.push(res.entry);
        } else if (res.error) {
          result.errors.push({ file: filePath, error: res.error.message });
        }
      }
    }
  }

  return result;
}

/**
 * Full scan for a project: project scope + user scope, then merge.
 */
export function fullScan(projectPath: string): ScanResult {
  const projectResult = scanScope(projectPath, 'project', projectPath);
  const userResult = scanScope(os.homedir(), 'user', projectPath);

  const allAgents = mergeAgents([...projectResult.agents, ...userResult.agents]);

  // Groups: project overrides user by group_id
  const groupMap = new Map<string, GroupCatalogEntry>();
  for (const g of [...userResult.groups, ...projectResult.groups]) {
    groupMap.set(g.group_id, g); // project overwrites user
  }

  return {
    agents: allAgents,
    groups: Array.from(groupMap.values()),
    errors: [...projectResult.errors, ...userResult.errors],
  };
}

/**
 * Set up fs.watch on the .claude/commands directories for a project.
 * Calls onChange whenever any .md file changes.
 * Returns a cleanup function to stop watching.
 */
export function watchProject(
  projectPath: string,
  onChange: (projectPath: string) => void,
): WatcherCleanup {
  const watchers: fs.FSWatcher[] = [];

  function tryWatch(dir: string): void {
    if (!fs.existsSync(dir)) return;
    try {
      let debounce: NodeJS.Timeout | null = null;
      const watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename?.endsWith('.md')) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => onChange(projectPath), 200);
      });
      watchers.push(watcher);
    } catch {
      // Directory watch failed — not critical
    }
  }

  tryWatch(path.join(projectPath, '.claude', 'commands'));
  tryWatch(path.join(os.homedir(), '.claude', 'commands'));

  return () => {
    for (const w of watchers) {
      try { w.close(); } catch { /* ignore */ }
    }
    watchers.length = 0;
  };
}
