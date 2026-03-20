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

### Fase 4 — Empresa Completa (COMPLETA)

| Story | Título | Status | Depende |
|-------|--------|--------|---------|
| 4.1 | Sprites Pixel Art por Agente — Identidade Visual Única | Ready for Review | 3.7 |
| 4.2 | Animações Completas de Transição entre Zonas | Ready for Review | 4.1 |
| 4.3 | Break Room Expandida — Móveis e Interações | Ready for Review | 4.2 |
| 4.4 | Sistema de Temas Visuais — Espacial, Moderno, Oldschool, Cyberpunk | Ready for Review | 4.3 |
| 4.5 | Personalização da Empresa — UI de Configuração | Ready for Review | 4.4 |

### Fase 5 — Polish + Publicação (PRÓXIMA)

| Story | Título | Status | Depende |
|-------|--------|--------|---------|
| 5.1 | PM2 — Startup Automático no Boot do Mac | Draft | 4.5 |
| 5.2 | npm run setup — Comando Único de Instalação | Draft | 5.1 |
| 5.3 | README Completo para Open Source | Draft | 5.2 |
| 5.4 | Limpeza Automática de Eventos Antigos (>30 dias) | Draft | 4.5 |
| 5.5 | Responsive Design e Polish Visual | Draft | 4.5 |
| 5.6 | Preparação para npm publish | Draft | 5.3 |

### Fase 6 — Transcript Intelligence (COMPLETA)

| Story | Título | Status | Depende |
|-------|--------|--------|---------|
| 6.1 | JSONL Transcript Intelligence — Tool Granularity, Permission Detection & Spawn Effects | Ready for Review | 5.6 |

### Fase 7 — Config Module: Operational Excellence (ACTIVA)

| Story | Título | Status | Depende |
|-------|--------|--------|---------|
| 7.0 | PM2 Fast Restart — Node Directo + Build Pipeline Optimizado | Ready for Review | 6.1 |
| 7.1 | Ganga Dashboard — Logs, Stats, Scope Control & Heartbeat | Draft | 7.0 |
| 7.2 | Config UX Polish — Dirty State, Debounce & Build Warnings | Draft | 7.0 |
| 7.3 | Skins Server-Persisted — localStorage → SQLite | Draft | 7.2 |
| 7.4 | Event Retention Config — Slider na UI + Cleanup Manual | Draft | 7.0 |
| 7.5 | Logo & Branding — Upload, Persistência e Display | Draft | 7.2 |

> **Epic completa:** `docs/stories/EPIC-7.md`

### Fase 8 — Empresa 2.0: Clareza, Performance & Estabilidade (PRÓXIMA)

| Story | Título | Status | Depende |
|-------|--------|--------|---------|
| 8.1 | Persistência de Clusters por Projeto — Mesas Nunca Desaparecem | Draft | 6.1 |
| 8.2 | Separação Visual entre Projetos — Floor Highlight, Borda & Label | Draft | 8.1 |
| 8.3 | Performance: Sync Incremental & Redução de Carga Visual | Draft | 8.1 |
| 8.4 | Atribuição Determinística de Slots por Projeto | Draft | 8.1 |
| 8.5 | Consolidação de Cores & Cleanup Técnico | Draft | 8.2 |

> **Referência:** `docs/Empresa.md` — diagnóstico completo, regras de comportamento, métricas baseline

### Fase 9 — Lista 2.0: Reflexo Completo do Banco (PLANNED)

| Story | Título | Status | Depende |
|-------|--------|--------|---------|
| 9.1 | API de Sessões + Paginação Server-Side | Draft | 6.1 |
| 9.2 | Vista de Sessões com Dados Completos | Draft | 9.1 |
| 9.3 | Paginação de Eventos Individuais | Draft | 9.1 |
| 9.4 | Contadores Fiéis e Indicadores de Completude | Draft | 9.2, 9.3 |
| 9.5 | Busca Textual Server-Side | Draft | 9.1 |
| 9.6 | Filtro por Período + Duração de Sessão | Draft | 9.2 |
| 9.7 | Testes, Cleanup & Export | Draft | 9.2, 9.3 |

> **Epic completa:** `docs/epics/EPIC-9-LISTA-COMPLETE.md`
> **Análise:** `docs/Lista.md` — diagnóstico completo, causa raiz, gaps, dependências

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
│   ├── empresa/
│   │   ├── page.tsx               # Modo Empresa — escritório isométrico Phaser.js
│   │   └── config/page.tsx        # Config empresa (nome, tema, timeouts)
│   └── api/
│       ├── events/route.ts        # POST (receptor hook) + GET (lista filtrada)
│       ├── projects/route.ts      # GET projects
│       ├── projects/[id]/route.ts # GET/PUT project by id
│       ├── agents/route.ts        # GET agents
│       ├── stats/route.ts         # GET stats dashboard
│       └── company-config/route.ts # GET/PUT company config + WS theme broadcast
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
        └── PhaserGame.tsx          # Phaser game wrapper (dynamic import, WS sync)
game/
├── config.ts                       # Phaser game config
├── constants.ts                    # NAVBAR_HEIGHT, TILE_SIZE, etc.
├── bridge/
│   └── react-phaser-bridge.ts      # React↔Phaser bridge (syncAgents, updateAgent, setTheme)
├── data/
│   ├── agent-sprite-config.ts      # 11 agent visual configs (color, accessory, hair)
│   ├── agent-visuals.ts            # Agent color/icon mapping
│   ├── office-layout.ts            # Tile positions, zones, furniture, lounge V2
│   └── themes.ts                   # 4 themes (moderno, espacial, oldschool, cyberpunk)
├── animations/
│   └── agent-animations.ts         # Frame-based animation registration
├── managers/
│   └── AgentManager.ts             # Agent lifecycle, walk transitions, collision avoidance
├── objects/
│   ├── AgentSprite.ts              # Agent sprite with pixel art + status badge
│   ├── Desk.ts                     # Desk with monitor + theme support
│   ├── Sofa.ts                     # Sofa + theme support
│   ├── CoffeeTable.ts             # Coffee table + theme support
│   ├── CoffeeMachine.ts           # Coffee machine with steam animation
│   ├── Bookshelf.ts               # Bookshelf with colored books
│   ├── Plant.ts                    # Plant with pot and leaves
│   ├── WaterCooler.ts             # Water cooler with translucent bottle
│   └── Door.ts                     # Office entrance door
├── scenes/
│   ├── BootScene.ts               # Asset loading + spritesheet generation
│   └── OfficeScene.ts             # Main office scene (floor, walls, furniture, themes)
└── utils/
    ├── iso-utils.ts               # Isometric 2:1 projection utilities
    └── sprite-generator.ts        # Procedural pixel art spritesheet (Canvas API)
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
npm run build        # esbuild server.ts + next build (compila tudo)
npm run start        # node .server/server.mjs (produção)
npm run lint         # next lint
npm run typecheck    # tsc --noEmit
npm run install-hook # Instalar hook Python no Claude Code

# PM2 (sistema permanente — auto-inicia com o Mac)
npm run pm2:start    # pm2 start ecosystem.config.cjs
npm run pm2:restart  # pm2 restart aiox-monitor
npm run pm2:stop     # pm2 stop aiox-monitor
npm run pm2:logs     # pm2 logs aiox-monitor --lines 50
npm run pm2:startup  # pm2 startup launchd && pm2 save
npm run pm2:status   # pm2 status

# Deploy de mudanças (SEMPRE este combo):
npm run build && pm2 restart aiox-monitor
```

## Gotchas

1. **DB locked durante build**: `next build` renderiza rotas estáticas que abrem SQLite. Se o dev server está rodando, dá lock. Solução: matar dev server antes de build.
2. **IPv6 no macOS**: `httpServer.listen(port)` sem hostname faz bind em `::` (dual-stack). Se especificar `'0.0.0.0'`, browser pode falhar por tentar IPv6 primeiro.
3. **tsx --watch restart**: Ao mudar `server.ts`, o `tsx --watch` reinicia mas o processo antigo pode não liberar a porta. Se der `EADDRINUSE`, matar manualmente: `kill $(lsof -ti :8888)`.
4. **Imports absolutos**: Usar `@/` para imports dentro de `src/` (configurado em `tsconfig.json` paths).
5. **`company_config` não tem `idle_timeout_offline`**: Apenas `idle_timeout_lounge` e `idle_timeout_break` existem no schema. O timeout offline é constante (3600s).
