/**
 * Agent Catalog Parser — JOB-021
 * Implements Ahsoka spec (JOB-020): docs/plans/ahsoka-catalog-parser-spec.md
 *
 * Parses .claude/commands/{squad}/agents/{agent_id}.md files into AgentCatalogEntry.
 * Stateless — all state (cache, DB) is owned by the scanner/service layer.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

// ─── Public types ─────────────────────────────────────────────────────────────

export type AgentSource = 'project' | 'user' | 'builtin';

export interface AgentCatalogEntry {
  project_path: string;
  skill_path: string;
  squad: string;
  agent_id: string;
  display_name: string;
  icon: string;
  role: string;
  description: string;
  definition_path: string; // relative to scopeRoot
  source: AgentSource;
  persona_tags: string[];
  last_seen_at: string;
  parse_warnings: string[];
}

export interface GroupCatalogEntry {
  project_path: string;
  group_id: string;
  name: string;
  description: string;
  squad: string;
  member_skill_paths: string[];
  invalid_members: string[];
  topology: 'none' | 'chief-hub' | 'mesh' | 'pipeline';
  source: 'project' | 'user' | 'auto';
  definition_path: string | null;
  parse_warnings: string[];
}

export interface ParseError {
  file_path: string;
  error_code: 'MISSING_YAML_BLOCK' | 'YAML_PARSE_ERROR' | 'MISSING_REQUIRED_FIELD' | 'READ_ERROR';
  message: string;
  timestamp: string;
}

export interface AgentParseResult {
  entry?: AgentCatalogEntry;
  error?: ParseError;
}

export interface GroupParseResult {
  entry?: GroupCatalogEntry;
  error?: ParseError;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMOJI_REGEX = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
const VALID_SKILL_PATH_REGEX = /^\/[^:]+:agents:[^:]+$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}

function firstLine(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const line = s.split('\n').find(l => l.trim().length > 0);
  return line?.trim();
}

function firstParagraph(markdown: string): string | undefined {
  // Skip headings and empty lines, return first non-heading paragraph
  const lines = markdown.split('\n');
  let para = '';
  let inPara = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      if (inPara && para) break;
      continue;
    }
    if (trimmed === '') {
      if (inPara && para) break;
      continue;
    }
    para += (para ? ' ' : '') + trimmed;
    inPara = true;
  }
  return para || undefined;
}

function extractYamlBlock(content: string): string | null {
  const match = content.match(/^```yaml\s*\n([\s\S]*?)^```/m);
  return match ? match[1] : null;
}

function extractName(yaml: Record<string, unknown>, markdown: string, agentId: string): string {
  const agent = yaml.agent as Record<string, unknown> | undefined;
  if (agent?.name) return String(agent.name);
  const h1 = markdown.match(/^# (?!.*ACTIVATION)(.+)$/m);
  if (h1) return h1[1].trim().replace(EMOJI_REGEX, '').trim();
  return capitalize(agentId);
}

function extractIcon(yaml: Record<string, unknown>, markdown: string): string {
  const agent = yaml.agent as Record<string, unknown> | undefined;
  if (agent?.icon) return String(agent.icon);
  const h1 = markdown.match(/^# (.+)$/m);
  if (h1) {
    const emojiMatch = h1[1].match(EMOJI_REGEX);
    if (emojiMatch) return emojiMatch[0];
  }
  return '🤖';
}

function extractRole(yaml: Record<string, unknown>): string {
  const persona = yaml.persona as Record<string, unknown> | undefined;
  const agent = yaml.agent as Record<string, unknown> | undefined;
  return (
    (persona?.role as string) ??
    (agent?.title as string) ??
    firstLine(persona?.identity as string) ??
    'Agent'
  );
}

function extractDescription(yaml: Record<string, unknown>, postYamlMarkdown: string): string {
  const agent = yaml.agent as Record<string, unknown> | undefined;
  if (agent?.whenToUse) return truncate(String(agent.whenToUse), 280);
  const para = firstParagraph(postYamlMarkdown);
  if (para) return truncate(para, 280);
  const persona = yaml.persona as Record<string, unknown> | undefined;
  if (persona?.identity) return truncate(String(persona.identity), 280);
  return '';
}

function extractPersonaTags(yaml: Record<string, unknown>): string[] {
  const tags: Set<string> = new Set();
  const profile = yaml.persona_profile as Record<string, unknown> | undefined;

  if (profile?.archetype) tags.add(String(profile.archetype).toLowerCase());

  const comm = profile?.communication as Record<string, unknown> | undefined;
  if (comm?.tone) tags.add(String(comm.tone).toLowerCase());

  const vocab = comm?.vocabulary;
  if (Array.isArray(vocab)) {
    vocab.slice(0, 5).forEach(v => tags.add(String(v).toLowerCase()));
  }

  // Extract from commands list
  const commands = yaml.commands;
  if (Array.isArray(commands)) {
    commands.slice(0, 3).forEach(cmd => {
      if (typeof cmd === 'string') tags.add(cmd.replace(/^\*/, '').toLowerCase());
    });
  }

  return Array.from(tags);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a single agent .md file.
 *
 * @param filePath  Absolute path to the .md file
 * @param scopeRoot Absolute path to the project/user root (for definition_path derivation)
 * @param source    Origin scope: 'project' | 'user' | 'builtin'
 * @param projectPath  The project_path key for the catalog entry
 */
export function parseAgentFile(
  filePath: string,
  scopeRoot: string,
  source: AgentSource,
  projectPath: string,
): AgentParseResult {
  const timestamp = new Date().toISOString();

  // Derive squad + agent_id from path (§2.2 — NEVER from YAML content)
  const relative = path.relative(scopeRoot, filePath);
  // Expected: .claude/commands/{squad}/agents/{agent_id}.md
  const parts = relative.split(path.sep);
  const agentsIdx = parts.lastIndexOf('agents');
  if (agentsIdx < 1) {
    return {
      error: {
        file_path: filePath,
        error_code: 'READ_ERROR',
        message: `Cannot derive squad/agent_id from path: ${relative}`,
        timestamp,
      },
    };
  }
  const squad = parts[agentsIdx - 1];
  const agent_id = path.basename(filePath, '.md');
  const skill_path = `/${squad}:agents:${agent_id}`;
  const definition_path = relative.replace(/\\/g, '/');

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return {
      error: {
        file_path: filePath,
        error_code: 'READ_ERROR',
        message: `Failed to read file: ${(err as Error).message}`,
        timestamp,
      },
    };
  }

  const yamlBlock = extractYamlBlock(content);
  if (!yamlBlock) {
    return {
      error: {
        file_path: filePath,
        error_code: 'MISSING_YAML_BLOCK',
        message: 'No ```yaml block found in file',
        timestamp,
      },
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(yamlBlock) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') throw new Error('YAML parsed to non-object');
  } catch (err) {
    return {
      error: {
        file_path: filePath,
        error_code: 'YAML_PARSE_ERROR',
        message: (err as Error).message,
        timestamp,
      },
    };
  }

  // Post-YAML markdown (text after the closing ```)
  const yamlEndIdx = content.indexOf('```', content.indexOf('```yaml') + 7);
  const postYaml = yamlEndIdx >= 0 ? content.slice(yamlEndIdx + 3) : '';

  const warnings: string[] = [];

  const agent = parsed.agent as Record<string, unknown> | undefined;
  if (!agent?.name) {
    warnings.push(`MISSING_REQUIRED_FIELD: agent.name (used fallback '${capitalize(agent_id)}')`);
  }

  const entry: AgentCatalogEntry = {
    project_path: projectPath,
    skill_path,
    squad,
    agent_id,
    display_name: extractName(parsed, content, agent_id),
    icon: extractIcon(parsed, content),
    role: extractRole(parsed),
    description: extractDescription(parsed, postYaml),
    definition_path,
    source,
    persona_tags: extractPersonaTags(parsed),
    last_seen_at: timestamp,
    parse_warnings: warnings,
  };

  return { entry };
}

/**
 * Parse a single group .md file.
 * Group files use YAML frontmatter (--- delimited), not embedded yaml blocks.
 */
export function parseGroupFile(
  filePath: string,
  scopeRoot: string,
  source: 'project' | 'user' | 'auto',
  projectPath: string,
): GroupParseResult {
  const timestamp = new Date().toISOString();

  const relative = path.relative(scopeRoot, filePath);
  const group_id = path.basename(filePath, '.md');
  // Expected: .claude/commands/{squad}/groups/{group_id}.md
  const parts = relative.split(path.sep);
  const groupsIdx = parts.lastIndexOf('groups');
  const squad = groupsIdx >= 1 ? parts[groupsIdx - 1] : 'unknown';

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return {
      error: {
        file_path: filePath,
        error_code: 'READ_ERROR',
        message: `Failed to read file: ${(err as Error).message}`,
        timestamp,
      },
    };
  }

  // Group files use --- frontmatter
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return {
      error: {
        file_path: filePath,
        error_code: 'MISSING_YAML_BLOCK',
        message: 'No --- frontmatter found in group file',
        timestamp,
      },
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(fmMatch[1]) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') throw new Error('YAML parsed to non-object');
  } catch (err) {
    return {
      error: {
        file_path: filePath,
        error_code: 'YAML_PARSE_ERROR',
        message: (err as Error).message,
        timestamp,
      },
    };
  }

  const warnings: string[] = [];
  const rawMembers: unknown[] = Array.isArray(parsed.members) ? parsed.members : [];
  const validMembers: string[] = [];
  const invalidMembers: string[] = [];

  for (const m of rawMembers) {
    const ms = String(m);
    if (VALID_SKILL_PATH_REGEX.test(ms)) {
      validMembers.push(ms);
    } else {
      invalidMembers.push(ms);
      warnings.push(`INVALID_SKILL_PATH: '${ms}' moved to invalid_members`);
    }
  }

  const topologyRaw = String(parsed.topology ?? 'none');
  const validTopologies = ['none', 'chief-hub', 'mesh', 'pipeline'] as const;
  const topology = validTopologies.includes(topologyRaw as typeof validTopologies[number])
    ? (topologyRaw as typeof validTopologies[number])
    : 'none';

  const entry: GroupCatalogEntry = {
    project_path: projectPath,
    group_id,
    name: String(parsed.name ?? capitalize(group_id)),
    description: String(parsed.description ?? ''),
    squad,
    member_skill_paths: validMembers,
    invalid_members: invalidMembers,
    topology,
    source,
    definition_path: relative.replace(/\\/g, '/'),
    parse_warnings: warnings,
  };

  return { entry };
}
