import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

export const dynamic = 'force-dynamic';

interface AgentInfo {
  name: string;
  persona: string;
  color: string;
}

const DEFAULT_AGENTS: AgentInfo[] = [
  { name: '@dev', persona: 'Dex', color: '#34d399' },
  { name: '@qa', persona: 'Quinn', color: '#fbbf24' },
  { name: '@architect', persona: 'Aria', color: '#a78bfa' },
  { name: '@pm', persona: 'Morgan', color: '#22d3ee' },
  { name: '@po', persona: 'Pax', color: '#fb923c' },
  { name: '@sm', persona: 'River', color: '#60a5fa' },
  { name: '@analyst', persona: 'Alex', color: '#c084fc' },
  { name: '@data-engineer', persona: 'Dara', color: '#2dd4bf' },
  { name: '@ux-design-expert', persona: 'Uma', color: '#f472b6' },
  { name: '@devops', persona: 'Gage', color: '#f87171' },
];

const AGENT_COLORS: Record<string, string> = {
  dev: '#34d399',
  qa: '#fbbf24',
  architect: '#a78bfa',
  pm: '#22d3ee',
  po: '#fb923c',
  sm: '#60a5fa',
  analyst: '#c084fc',
  'data-engineer': '#2dd4bf',
  'ux-design-expert': '#f472b6',
  devops: '#f87171',
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const projectPath = url.searchParams.get('path');

  if (!projectPath) {
    return Response.json({ agents: DEFAULT_AGENTS, hasAioxConfig: false });
  }

  // Check if path exists
  try {
    const stat = statSync(projectPath);
    if (!stat.isDirectory()) {
      return Response.json({ agents: DEFAULT_AGENTS, hasAioxConfig: false });
    }
  } catch {
    return Response.json({ agents: DEFAULT_AGENTS, hasAioxConfig: false });
  }

  // Check for Claude project indicators
  const hasClaudeDir = existsSync(join(projectPath, '.claude'));
  const hasClaudeMd = existsSync(join(projectPath, 'CLAUDE.md'));
  const isClaudeProject = hasClaudeDir || hasClaudeMd;

  // Check for AIOX agents directory
  const agentsDir = join(projectPath, '.aiox-core', 'development', 'agents');
  const hasAioxConfig = existsSync(agentsDir);

  if (!hasAioxConfig) {
    return Response.json({
      agents: DEFAULT_AGENTS,
      hasAioxConfig: false,
      isClaudeProject,
    });
  }

  // Read agents from .aiox-core/development/agents/
  const agents: AgentInfo[] = [];
  try {
    const files = readdirSync(agentsDir);
    for (const file of files) {
      if (!file.endsWith('.md') && !file.endsWith('.yaml') && !file.endsWith('.yml')) continue;

      const filePath = join(agentsDir, file);
      try {
        const stat = statSync(filePath);
        if (!stat.isFile()) continue;

        const content = readFileSync(filePath, 'utf-8');
        const agentId = basename(file, file.endsWith('.yaml') || file.endsWith('.yml')
          ? (file.endsWith('.yaml') ? '.yaml' : '.yml')
          : '.md');

        // Extract persona name from content
        let persona = agentId.charAt(0).toUpperCase() + agentId.slice(1);
        const nameMatch = content.match(/^\s*name:\s*(.+)$/m);
        if (nameMatch) {
          persona = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
        }

        const name = `@${agentId}`;
        const color = AGENT_COLORS[agentId] ?? '#6b7fff';

        agents.push({ name, persona, color });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    return Response.json({ agents: DEFAULT_AGENTS, hasAioxConfig: false, isClaudeProject });
  }

  // If we found agents, return them; otherwise fall back to defaults
  if (agents.length === 0) {
    return Response.json({ agents: DEFAULT_AGENTS, hasAioxConfig: true, isClaudeProject });
  }

  // Sort: known agents first (by DEFAULT_AGENTS order), then alphabetically
  const defaultOrder = DEFAULT_AGENTS.map((a) => a.name);
  agents.sort((a, b) => {
    const ai = defaultOrder.indexOf(a.name);
    const bi = defaultOrder.indexOf(b.name);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  return Response.json({ agents, hasAioxConfig: true, isClaudeProject });
}
