# aiox-monitor — Contexto do Projeto

> Documento de contexto para janelas paralelas. Leia este ficheiro ao iniciar qualquer sessão de desenvolvimento.

## O Que É

**aiox-monitor** é um sistema de controlo e monitorização de agentes AI do framework AIOX, a correr localmente em `http://localhost:8888`.

Serve dois propósitos distintos:

1. **Monitorização passiva** — captura eventos de sessões Claude Code via hook Python, armazena em SQLite, e exibe status de agentes em tempo real.
2. **Controlo activo** — a Sala de Comando permite abrir terminais PTY reais dentro do browser, lançar agentes Claude Code em projectos e enviar instruções directamente.

É um sistema **self-hosted, local, sem cloud**. Stack: Next.js 15 + React 19 + TypeScript + Tailwind CSS + SQLite (`node:sqlite`) + WebSocket (`ws`) + Phaser.js.

---

## Áreas Principais

### 1. Sala de Comando (`/command-room`)

Área central do sistema. Permite gerir terminais PTY activos em qualquer projecto da máquina.

**Funcionalidades:**
- Spawnar terminais PTY (Claude Code ou shell) via `POST /api/command-room/spawn`
- Visualização em grelha (grid) ou Canvas React Flow
- Agente Chief — terminal especial fixo por projecto, sempre primeiro e em destaque
- Categorias de terminais configuráveis (cores, ordem)
- Vista Chat — interface de conversa sobre o terminal activo
- Integração Maestri — resolve agentes de outras squads via `maestri-resolver.ts`
- Envio de instruções com `submit: true` para auto-execução (sem enter manual)

**Backend dedicado:**
```
src/server/command-room/
├── pty-websocket-server.ts   # PTY WebSocket (separado do WS de monitorização)
├── process-manager.ts        # Ciclo de vida dos processos PTY
├── chat-collector.ts         # Colecta output Claude para ChatView
├── claude-output-parser.ts   # Parser de output estruturado do Claude
├── chat-store.ts             # Estado da conversa em memória
└── types.ts                  # Tipos PTY
```

**Tabelas DB:**
- `command_room_terminals` — terminais activos (id, agent_name, project_path, pty_status, is_chief, category_id)
- `terminal_categories` — categorias de agrupamento (id, name, color, display_order)

---

### 2. Real Time (`/empresa`)

Escritório isométrico em pixel art (Phaser.js) onde cada agente AI aparece como personagem animado.

**O que responde:** quais agentes estão a trabalhar, em que ferramenta, em que projecto, se estão à espera de permissão.

**Funcionalidades:**
- 6 clusters de trabalho (12 mesas cada) para até 6 projectos simultâneos
- 4 temas visuais com hot-swap: `espacial`, `moderno`, `oldschool`, `cyberpunk`
- Animações: walk, sit, type, idle, spawn/despawn (Matrix rain)
- 11 sprites de agentes + 20 skins alternativas (aliens/animais)
- Wander system: agentes idle/break movem-se na recreação
- Permission bubble (amber) quando agente aguarda permissão
- Tool detail label em tempo real via JSONL watcher

**Ciclo de vida visual:**

| Status | Localização | Comportamento |
|--------|------------|---------------|
| `working` | Mesa no cluster | Sentado, a teclar |
| `idle` | Recreação | Em pé, wander a cada 8s |
| `break` | Recreação | Relaxando |
| `offline` | Walk até entrada | Matrix despawn, remove sprite |

**Backend relevante:** `idle-detector.ts` (loop 30s), `jsonl-watcher.ts`, `ws-broadcaster.ts`.

---

### 3. Configurações (`/config`)

Página unificada com 4 abas:

| Aba | Conteúdo |
|-----|----------|
| **Geral** | Nome da empresa, timeouts idle/break, retenção de eventos |
| **Aparência** | Tema visual (4 opções), pré-visualização |
| **Agentes** | Skins por agente, gestão de equipas |
| **Projectos** | Lista de projectos detectados, estatísticas, limpeza |

Lê e escreve em `company_config` (singleton DB, id=1). Mudanças de tema fazem broadcast WS → actualiza Empresa em tempo real.

---

### Outras Vistas (não no navbar principal)

| Rota | Função |
|------|--------|
| `/lista` | Log de eventos com filtros (projecto, agente, tipo) |
| `/kanban` | Colunas por projecto com AgentCards em tempo real |
| `/terminais` | Vista Kanban de terminais activos |

---

## Fluxo de Dados

```
Claude Code Hook (Python)
    → POST /api/events (event-processor.ts)
        → SQLite (insert event)
        → agent-tracker.ts  → broadcast WS { agent:update }
        → terminal-tracker.ts → broadcast WS { terminal:update }
        → broadcast WS { event:new }

JSONL Watcher (jsonl-watcher.ts)
    → Lê transcripts Claude Code (tool_detail, waiting_permission)
    → Enriquece terminais + agentes → broadcast WS

Idle Detector (30s loop)
    → working →(5min)→ idle →(15min)→ break →(1h)→ offline
    → broadcast WS { agent:update }

Ganga Engine (src/server/ganga/)
    → Analisa prompts UserPromptSubmit
    → auto-responder.ts → JXA/iTerm2 aprovação automática
    → ganga_log (SQLite)

Sala de Comando PTY
    → POST /api/command-room/spawn → process-manager.ts (pty)
    → PTY WebSocket (porta separada)
    → TerminalPanel (xterm.js no browser)
```

---

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + TypeScript strict + Tailwind CSS |
| Game Engine | Phaser.js 3.x (Canvas 2D, isométrico 2:1) |
| Canvas/Flow | React Flow (scaffold activo na branch actual) |
| Terminal UI | xterm.js (nos painéis PTY da Sala de Comando) |
| Servidor | Custom `server.ts` — Next.js + WebSocket + PTY na mesma porta |
| Base de Dados | SQLite (`node:sqlite` built-in, WAL mode) |
| Realtime | WebSocket `ws` — eventos de monitorização |
| PTY | `node-pty` — terminais reais na Sala de Comando |
| Process Manager | PM2 (produção, auto-restart no boot) |

**URL:** `http://localhost:8888`
**DB:** `data/monitor.db`
**Porta PTY WS:** mesma que HTTP (multiplexada em `server.ts`)

---

## Schema SQLite

| Tabela | Função |
|--------|--------|
| `projects` | Projectos detectados automaticamente via path do hook |
| `agents` | Agentes por projecto (status, tool, display_name, role, team) |
| `terminals` | Terminais Claude Code (pid, session_id, tool_detail, waiting_permission, autopilot) |
| `sessions` | Sessões de trabalho (started_at, ended_at, event_count) |
| `events` | Eventos do hook (PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStop) |
| `company_config` | Singleton — tema, timeouts, ganga_enabled, event_retention_days |
| `command_room_terminals` | Terminais PTY da Sala de Comando (is_chief, category_id, pty_status) |
| `terminal_categories` | Categorias da Sala de Comando (name, color, display_order) |
| `autopilot_log` | Log de aprovações automáticas do Autopilot |
| `ganga_log` | Log de respostas automáticas do Ganga Engine |

**Agent statuses:** `idle` | `working` | `break` | `offline`
**Event types:** `PreToolUse` | `PostToolUse` | `UserPromptSubmit` | `Stop` | `SubagentStop`
**PTY statuses:** `active` | `idle` | `closed` | `crashed`

---

## Estrutura de Ficheiros

```
server.ts                              # Custom server (Next.js + WS + idle detector + PTY WS)
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                       # Redirect → /command-room
│   ├── command-room/page.tsx          # Sala de Comando (terminais PTY)
│   ├── empresa/page.tsx               # Real Time (escritório Phaser.js)
│   ├── config/page.tsx                # Configurações (4 abas)
│   ├── lista/page.tsx                 # Log de eventos
│   ├── kanban/page.tsx                # Kanban de agentes
│   ├── terminais/page.tsx             # Vista de terminais
│   └── api/
│       ├── events/                    # POST (hook) + GET (lista)
│       ├── projects/                  # GET lista + GET/PUT por id
│       ├── agents/                    # GET agentes (+ expand=terminals)
│       ├── terminals/                 # GET + autopilot toggle + health
│       ├── sessions/                  # GET sessões
│       ├── stats/                     # GET stats
│       ├── company-config/            # GET/PUT configuração
│       ├── ganga/                     # POST eventos ganga
│       └── command-room/              # spawn, list, kill, resize, browse,
│                                      # categories, agents, messages, ensure-chief
├── server/
│   ├── event-processor.ts
│   ├── agent-tracker.ts
│   ├── terminal-tracker.ts
│   ├── terminal-detector.ts
│   ├── idle-detector.ts
│   ├── jsonl-watcher.ts
│   ├── transcript-parser.ts
│   ├── project-detector.ts
│   ├── ws-broadcaster.ts
│   ├── autopilot-engine.ts
│   ├── cleanup.ts
│   ├── maestri-resolver.ts
│   └── command-room/
│       ├── pty-websocket-server.ts
│       ├── process-manager.ts
│       ├── chat-collector.ts
│       ├── claude-output-parser.ts
│       ├── chat-store.ts
│       └── ganga/
│           ├── ganga-engine.ts
│           ├── auto-responder.ts
│           └── prompt-matcher.ts
├── components/
│   ├── command-room/                  # TerminalPanel, ChatView, CategoryRow,
│   │   │                              #   CategoryCreator, TeamBuilder, FolderPicker,
│   │   │                              #   AvatarPicker
│   │   └── canvas/                    # CanvasView (React Flow), TerminalNode,
│   │                                  #   useCanvasLayout (scaffold activo)
│   ├── empresa/PhaserGame.tsx
│   ├── kanban/                        # ProjectRow, AgentCard, AgentDetailPanel
│   ├── lista/                         # EventTable, EventRow, SessionTable, etc.
│   ├── terminais/                     # TerminalCard, TerminalKanban
│   ├── realtime/ListaPanel.tsx
│   ├── layout/Navbar.tsx
│   └── shared/                        # Badge, ConnectionStatus, ProjectSelector, TimeAgo
├── hooks/
│   ├── useWebSocket.ts
│   ├── useEvents.ts
│   ├── useAgents.ts
│   ├── useKanban.ts
│   ├── useProjects.ts
│   ├── useTerminals.ts
│   ├── useSessions.ts
│   └── usePtySocket.ts
├── contexts/
│   ├── WebSocketContext.tsx
│   └── ProjectContext.tsx
└── lib/
    ├── db.ts                          # Singleton SQLite (global para hot-reload)
    ├── schema.ts                      # DDL + migrações
    ├── queries.ts                     # Todas as queries
    ├── types.ts                       # Project, Agent, Event, Terminal, Session, etc.
    ├── constants.ts                   # AGENT_COLORS, STATUS_DOT, TWELVE_HOURS_MS
    ├── api-utils.ts
    └── command-room-repository.ts     # CRUD command_room_terminals + terminal_categories
game/                                  # Phaser.js game engine (~4600 LOC, 36 ficheiros)
├── scenes/                            # BootScene, OfficeScene
├── managers/                          # AgentManager, ClusterManager
├── objects/                           # AgentSprite, Desk, Sofa, + 15 outros
├── data/                              # agent-sprite-config, themes, office-layout, skins
├── animations/
├── bridge/react-phaser-bridge.ts
└── utils/
```

---

## Padrões Importantes

### node:sqlite double-cast
```typescript
const result = stmt.all(params) as unknown as Agent[];
```

### DB singleton (hot-reload safe)
```typescript
export const db: DatabaseSync =
  process.env.NODE_ENV === 'production'
    ? createDb()
    : (globalThis.__aiox_db ??= createDb());
```

### Broadcasts fire-and-forget
```typescript
try { broadcast({ type: 'agent:update', agent, projectId }); } catch { /* nunca bloquear */ }
```

### Imports absolutos
`@/` → `src/` (configurado em `tsconfig.json`)

---

## Comandos

```bash
npm run build         # esbuild server.ts + next build
npm run start         # node .server/server.mjs (produção)
npm run dev           # tsx watch server.ts (dev)
npm run lint          # next lint
npm run typecheck     # tsc --noEmit
npm run install-hook  # Instalar hook Python no Claude Code

# PM2
npm run pm2:start     # pm2 start ecosystem.config.cjs
npm run pm2:restart   # pm2 restart aiox-monitor
npm run pm2:stop      # pm2 stop aiox-monitor
npm run pm2:logs      # pm2 logs aiox-monitor --lines 50
npm run pm2:status    # pm2 status

# Deploy de mudanças:
npm run build && pm2 restart aiox-monitor
```

---

## Status de Desenvolvimento

**Branch actual:** `feature/8.8-terminal-tests`
**Objectivo da branch:** unit tests para terminal matching e lifecycle (Story 8.8, Wave 3 do Epic 8).

### Epics activos

| Epic | Foco | Status |
|------|------|--------|
| **Epic 7** | Config module — Ganga dashboard, event retention, logo/branding | Stories 7.1–7.5 em Draft |
| **Epic 8** | Fiabilidade terminais — deduplication, JSONL matching, session-aware upsert | W1+W2 (8.1–8.5) Ready for Review; W3 (8.6–8.8) em Draft |
| **Epic 9** | Lista 2.0 — paginação server-side, busca textual | Planned |
| **Epic 10** | Kanban — visibilidade operacional | 10.1–10.3 Done; 10.4 pendente |

### Gaps visuais abertos (sem epic formal)

| Gap | Severidade |
|-----|-----------|
| G1 — Sem separação visual entre clusters de projectos na Empresa (cor, borda, floor) | CRITICAL |
| G2 — Clusters desaparecem quando projecto fica sem agentes activos | HIGH |
| G4 — Slots de cluster não são determinísticos entre reloads | MEDIUM |

### Gotchas

1. **DB locked durante build** — matar dev server antes de `npm run build`
2. **IPv6 no macOS** — não especificar `'0.0.0.0'` no `httpServer.listen`
3. **EADDRINUSE** — se tsx reiniciar, matar porta manualmente: `kill $(lsof -ti :8888)`
4. **`company_config` sem `idle_timeout_offline`** — timeout offline é constante (3600s)
