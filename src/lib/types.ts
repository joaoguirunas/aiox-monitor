export interface Project {
  id: number;
  name: string;
  path: string;
  detected_at: string;
  last_active: string;
}

export interface Agent {
  id: number;
  project_id: number;
  name: string;
  display_name?: string;
  status: AgentStatus;
  current_tool?: string;
  last_active: string;
}

export type TerminalStatus = 'processing' | 'active' | 'inactive';

export interface Terminal {
  id: number;
  project_id: number;
  pid: number;
  session_id?: string;
  status: TerminalStatus;
  agent_name?: string;
  agent_display_name?: string;
  current_tool?: string;
  current_input?: string;
  window_title?: string;
  first_seen_at: string;
  last_active: string;
}

export interface Session {
  id: number;
  project_id: number;
  agent_id?: number;
  terminal_id?: number;
  started_at: string;
  ended_at?: string;
  event_count: number;
  status: 'active' | 'completed' | 'interrupted';
}

export interface Event {
  id: number;
  project_id: number;
  agent_id?: number;
  session_id?: number;
  terminal_id?: number;
  type: EventType;
  tool?: string;
  input_summary?: string;
  output_summary?: string;
  duration_ms?: number;
  raw_payload?: string;
  created_at: string;
}

export type EventType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStop';

export type AgentStatus = 'idle' | 'working' | 'break' | 'offline';

export type ThemeName = 'espacial' | 'moderno' | 'oldschool' | 'cyberpunk';

export type GangaScope = 'safe-only' | 'safe-and-ambiguous';

export interface CompanyConfig {
  id: 1;
  name: string;
  logo_path: string | null;
  theme: ThemeName;
  ambient_music: 0 | 1;
  idle_timeout_lounge: number;
  idle_timeout_break: number;
  event_retention_days: number;
  ganga_enabled: 0 | 1;
  ganga_scope: GangaScope;
  updated_at: string;
}

export interface GangaLog {
  id: number;
  terminal_id: number | null;
  project_id: number | null;
  prompt_text: string;
  response: string;
  classification: 'safe' | 'blocked' | 'ambiguous';
  action: 'auto-responded' | 'skipped' | 'blocked';
  created_at: string;
}

export interface GangaHeartbeat {
  activeAgents: number;
  workingProjects: string[];
  autoResponses: number;
  blockedPrompts: number;
  skippedPrompts: number;
  lastCheck: string;
}

export interface EventFilters {
  projectId?: number;
  agentId?: number;
  terminalId?: number;
  type?: EventType;
  since?: string;
  limit?: number;
  offset?: number;
}

export interface EventPayload {
  hook_type: string;
  project_path: string;
  project_name?: string;
  agent_name?: string;
  tool_name?: string;
  input?: unknown;
  output?: unknown;
  timestamp?: string;
  terminal_pid?: number;
  terminal_session_id?: string;
}

export interface AgentWithStats extends Agent {
  terminal_count: number;
}

export interface ProjectWithDetails extends Project {
  agents: Agent[];
  terminals: Terminal[];
}

export interface Stats {
  eventsToday: number;
  activeAgents: number;
  activeProjects: number;
  lastEvent?: Event;
}

// WebSocket message types
export interface WsMessage {
  type: string;
}

export interface WsEventNew extends WsMessage {
  type: 'event:new';
  event: Event;
  projectId: number;
  agentId?: number;
}

export interface WsAgentUpdate extends WsMessage {
  type: 'agent:update';
  agent: Agent;
  projectId: number;
}

export interface WsTerminalUpdate extends WsMessage {
  type: 'terminal:update';
  terminal: Terminal;
  projectId: number;
}

export interface WsProjectUpdate extends WsMessage {
  type: 'project:update';
  project: Project;
}

export interface WsThemeChange extends WsMessage {
  type: 'theme:change';
  theme: ThemeName;
}

export interface WsPing extends WsMessage {
  type: 'ping';
}

export interface WsGangaHeartbeat extends WsMessage {
  type: 'ganga:heartbeat';
  summary: GangaHeartbeat;
}

export interface WsGangaToggle extends WsMessage {
  type: 'ganga:toggle';
  enabled: boolean;
}

export type WsIncomingMessage =
  | WsEventNew
  | WsAgentUpdate
  | WsTerminalUpdate
  | WsProjectUpdate
  | WsThemeChange
  | WsGangaHeartbeat
  | WsGangaToggle
  | WsPing;
