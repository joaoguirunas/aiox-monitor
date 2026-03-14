# aiox-monitor — Contexto do Projeto

> Documento de contexto para janelas paralelas. Leia este ficheiro ao iniciar qualquer sessão de desenvolvimento.

## Visão Geral

**aiox-monitor** é um dashboard de monitorização em tempo real para agentes AI do framework AIOX. Recebe eventos via hook (Claude Code hooks), armazena em SQLite, e exibe em interface web com WebSocket para tempo real.

- **URL:** `http://localhost:8888`
- **Stack:** Next.js 15 + React 19 + TypeScript + Tailwind CSS + SQLite (`node:sqlite`) + WebSocket (`ws`)
- **Servidor:** Custom server (`server.ts`) com Next.js + WebSocket na mesma porta
- **DB:** `data/monitor.db` (SQLite com WAL mode, singleton global)

## Fases e Status

### Fase 1 — Core Backend + UI Básica (COMPLETA)

| Story | Título | Status |
|-------|--------|--------|
| 1.1 | Setup Next.js + TypeScript + Tailwind + Deps | Ready for Review |
| 1.2 | Schema SQLite + lib/db.ts + lib/schema.ts | Ready for Review |
| 1.3 | POST /api/events — Receptor de Eventos do Hook | Ready for Review |
| 1.4 | Hook Python + Script install-hook | Ready for Review |
| 1.5 | GET /api/projects, /api/agents, /api/events | Ready for Review |
| 1.6 | Modo Lista — Tabela de Eventos com Filtros | Ready for Review |
| 1.7 | Teste End-to-End — Hook → Servidor → Visualização | Ready for Review |

### Fase 2 — Tempo Real + Kanban (COMPLETA)

| Story | Título | Status |
|-------|--------|--------|
| 2.1 | WebSocket Server — Custom Server + ws Broadcaster | Ready for Review |
| 2.2 | useWebSocket Hook — Conexão Tempo Real no Frontend | Ready for Review |
| 2.3 | Broadcast de Eventos via WebSocket — Tempo Real E2E | Ready for Review |
| 2.4 | Modo Kanban — Colunas de Projeto com Cards de Agente | Ready for Review |
| 2.5 | ProjectSelector — Seletor de Projeto na Navbar | Ready for Review |
| 2.6 | Idle Detector — Transições Automáticas de Status | Ready for Review |

### Fase 3 — Modo Empresa Isométrico (COMPLETA)

| Story | Título | Status | Depende |
|-------|--------|--------|---------|
| 3.1 | Integração Phaser.js no Next.js (dynamic import, SSR disabled) | Ready for Review | 2.6 |
| 3.2 | Tilemap do Escritório Isométrico (layout com 3 zonas) | Ready for Review | 3.1 |
| 3.3 | Sprites de Móveis (mesas, computadores, sofás, porta) | Ready for Review | 3.2 |
| 3.4 | Sprite Base de Personagem (1 agente funcional) | Ready for Review | 3.3 |
| 3.5 | Animações Básicas: walk, sit, type, idle | Ready for Review | 3.4 |
| 3.6 | Mesa Central Dinâmica (posições por agente ativo via API) | Ready for Review | 3.5 |
| 3.7 | Agente Caminha até Mesa ao Receber Evento via WebSocket | Ready for Review | 3.6 |

### Fase 4 — Empresa Completa (PRÓXIMA)

| Story | Título | Status | Depende |
|-------|--------|--------|---------|
| 4.1 | Sprites Pixel Art por Agente — Identidade Visual Única | Draft | 3.7 |
| 4.2 | Animações Completas de Transição entre Zonas | Draft | 4.1 |
| 4.3 | Break Room Expandida — Móveis e Interações | Draft | 4.2 |
| 4.4 | Sistema de Temas Visuais — Espacial, Moderno, Oldschool, Cyberpunk | Draft | 4.3 |
| 4.5 | Personalização da Empresa — UI de Configuração | Draft | 4.4 |

## Arquitetura

### Fluxo de Dados

```
Claude Code Hook (Python)
    → POST /api/events (event-processor.ts)
        → SQLite (insert event)
        → agent-tracker.ts (upsert agent, status working/idle)
        → terminal-tracker.ts (upsert terminal)
        → broadcast WS { type: 'event:new', event, projectId }
        → broadcast WS { type: 'agent:update', agent, projectId }

Idle Detector (30s interval)
    → Query agents by status + last_active
    → working →(5min)→ idle →(15min)→ break →(1h)→ offline
    → broadcast WS { type: 'agent:update', agent, projectId }

Frontend (React)
    → useWebSocket() → receives WS messages
    → useEvents() → merges WS event:new into state
    → useAgents() → merges WS agent:update into state
    → useKanban() → aggregates projects + agents + WS patches
```

### Estrutura de Ficheiros

```
server.ts                          # Custom server (Next.js + WS + idle detector)
src/
├── app/
│   ├── layout.tsx                 # Root layout (ProjectProvider wrapping)
│   ├── page.tsx                   # Redirect → /lista
│   ├── lista/page.tsx             # Modo Lista — tabela de eventos com filtros
│   ├── kanban/page.tsx            # Modo Kanban — colunas por projeto
│   ├── empresa/page.tsx           # Página de configuração da empresa
│   └── api/
│       ├── events/route.ts        # POST (receptor hook) + GET (lista filtrada)
│       ├── projects/route.ts      # GET projects
│       ├── projects/[id]/route.ts # GET/PUT project by id
│       ├── agents/route.ts        # GET agents
│       └── stats/route.ts         # GET stats dashboard
├── server/
│   ├── ws-broadcaster.ts          # Singleton WS broadcaster (setBroadcaster + broadcast)
│   ├── event-processor.ts         # Processa payload do hook → DB + WS broadcast
│   ├── agent-tracker.ts           # Upsert agent + status working/idle + broadcast
│   ├── terminal-tracker.ts        # Upsert terminal + broadcast
│   ├── project-detector.ts        # Detecta projeto a partir do path
│   └── idle-detector.ts           # Loop 30s: working→idle→break→offline
├── lib/
│   ├── db.ts                      # Singleton SQLite (global para hot-reload)
│   ├── schema.ts                  # DDL: projects, agents, terminals, sessions, events, company_config
│   ├── queries.ts                 # Todas as queries (upsert, get, update, stats)
│   ├── types.ts                   # Tipos: Project, Agent, Event, WS messages, etc.
│   └── api-utils.ts               # Helpers para API routes
├── hooks/
│   ├── useWebSocket.ts            # WS hook (reconnect exponential, Strict Mode safe)
│   ├── useEvents.ts               # Events + WS merge (event:new prepend)
│   ├── useAgents.ts               # Agents + WS merge (agent:update by id)
│   ├── useKanban.ts               # Projects + agents + WS aggregation
│   └── useProjects.ts             # Projects list
├── contexts/
│   └── ProjectContext.tsx          # Selected project (localStorage persist, SSR-safe)
└── components/
    ├── layout/
    │   └── Navbar.tsx              # Nav links + ProjectSelector + ConnectionStatus
    ├── shared/
    │   ├── ConnectionStatus.tsx    # WS status indicator (green/grey dot)
    │   ├── ProjectSelector.tsx     # <select> de projetos na Navbar
    │   ├── Badge.tsx               # Badge component
    │   └── TimeAgo.tsx             # Relative time display
    ├── lista/
    │   ├── EventTable.tsx          # Tabela de eventos
    │   ├── EventRow.tsx            # Linha individual
    │   ├── EventDetail.tsx         # Detalhe expandido
    │   └── FilterBar.tsx           # Filtros (projeto, agente, tipo)
    ├── kanban/
    │   ├── ProjectColumn.tsx       # Coluna por projeto com AgentCards
    │   └── AgentCard.tsx           # Card de agente (status, tool, flash)
    └── empresa/
        └── config/
            └── agent-colors.ts     # Cores por agente
```

## Schema SQLite

| Tabela | Colunas Principais | Notas |
|--------|-------------------|-------|
| `projects` | id, name, path (UNIQUE), detected_at, last_active | Auto-detect via hook path |
| `agents` | id, project_id (FK), name, display_name, status, current_tool, last_active | UNIQUE(project_id, name) |
| `terminals` | id, project_id (FK), pid, session_id, status, first_seen_at, last_active | UNIQUE(project_id, pid) |
| `sessions` | id, project_id (FK), agent_id, terminal_id, started_at, ended_at, event_count, status | Track sessions |
| `events` | id, project_id (FK), agent_id, session_id, terminal_id, type, tool, input/output_summary, duration_ms, raw_payload, created_at | Core event store |
| `company_config` | id=1, name, logo_path, theme, ambient_music, idle_timeout_lounge, idle_timeout_break, updated_at | Singleton config row |

**Agent statuses:** `idle` | `working` | `break` | `offline`
**Event types:** `PreToolUse` | `PostToolUse` | `UserPromptSubmit` | `Stop` | `SubagentStop`
**Themes:** `espacial` | `moderno` | `oldschool` | `cyberpunk`

## WebSocket

- **Endpoint:** `ws://localhost:8888/ws`
- **Messages do servidor:** `event:new`, `agent:update`, `terminal:update`, `ping`
- **Ping:** a cada 30s (mantém conexões vivas)
- **Reconnect:** exponencial 1s→2s→4s→8s→16s, max 5 retries
- **Strict Mode safety:** `unmountedRef` previne updates após unmount

## Padrões Importantes

### node:sqlite double-cast
```typescript
// .all() retorna Record<string, SQLOutputValue>[] — precisa double-cast
const result = stmt.all(params) as unknown as Agent[];
```

### DB singleton (hot-reload safe)
```typescript
export const db: DatabaseSync =
  process.env.NODE_ENV === 'production'
    ? createDb()
    : (globalThis.__aiox_db ??= createDb());
```

### Fire-and-forget broadcast
```typescript
// TODOS os broadcasts são wrapped em try/catch — nunca bloquear event processing
try { broadcast({ type: 'agent:update', agent, projectId }); } catch { /* fire-and-forget */ }
```

### Agent display names
```typescript
const DISPLAY_NAMES: Record<string, string> = {
  '@dev': 'Dex', '@qa': 'Quinn', '@architect': 'Aria',
  '@pm': 'Morgan', '@sm': 'River', '@po': 'Pax',
  '@analyst': 'Alex', '@devops': 'Gage',
  '@data-engineer': 'Dara', '@ux-design-expert': 'Uma',
  '@aiox-master': 'AIOX',
};
```

### Idle detector timeouts
- `idle_timeout_lounge`: 300s (5min) — working → idle (lido de company_config)
- `idle_timeout_break`: 900s (15min) — idle → break (lido de company_config)
- `TIMEOUT_OFFLINE`: 3600s (1h) — break → offline (constante, sem coluna no schema)

## Comandos

```bash
npm run dev          # tsx --watch server.ts (porta 8888)
npm run build        # next build (MATAR dev server antes — DB lock)
npm run start        # NODE_ENV=production tsx server.ts
npm run lint         # next lint
npm run typecheck    # tsc --noEmit
npm run install-hook # Instalar hook Python no Claude Code
```

## Gotchas

1. **DB locked durante build**: `next build` renderiza rotas estáticas que abrem SQLite. Se o dev server está rodando, dá lock. Solução: matar dev server antes de build.
2. **IPv6 no macOS**: `httpServer.listen(port)` sem hostname faz bind em `::` (dual-stack). Se especificar `'0.0.0.0'`, browser pode falhar por tentar IPv6 primeiro.
3. **tsx --watch restart**: Ao mudar `server.ts`, o `tsx --watch` reinicia mas o processo antigo pode não liberar a porta. Se der `EADDRINUSE`, matar manualmente: `kill $(lsof -ti :8888)`.
4. **Imports absolutos**: Usar `@/` para imports dentro de `src/` (configurado em `tsconfig.json` paths).
5. **`company_config` não tem `idle_timeout_offline`**: Apenas `idle_timeout_lounge` e `idle_timeout_break` existem no schema. O timeout offline é constante (3600s).
