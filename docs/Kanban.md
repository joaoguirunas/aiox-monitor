# Kanban — Contexto Funcional, Arquitectura & Epic de Evolução

> **Autor:** Atlas (Analyst Agent) | **Data:** 2026-03-24 | **Rev:** 3.0
> **Projeto:** aiox-monitor | **Branch:** main

---

## 1. Objetivo do Módulo

A aba Kanban (`/kanban`) serve como **painel de visibilidade operacional** dos agentes AI em tempo real. Permite ao utilizador ver, de relance, o estado de todos os agentes organizados por projeto:

- **Quem** está a trabalhar agora?
- **Em quê** (qual tool/operação detalhada)?
- **Em que projeto?**
- Quais agentes estão **disponíveis vs. ativos vs. trabalhando**?
- Quem está **bloqueado à espera de permissão**?
- Quantos **terminais** cada agente tem abertos?

**Não é** um Kanban de gestão de tarefas (Jira/Trello). É um **monitor de workforce AI** com atualização em tempo real via WebSocket. Sem drag & drop, sem boards, sem tasks — apenas visualização de estado.

---

## 2. Arquitetura Atual

### 2.1 Componentes Frontend

| Ficheiro | Responsabilidade | Status |
|----------|-----------------|--------|
| `src/app/kanban/page.tsx` | Página principal — layout, loading skeleton, empty state, refresh, selectedAgent state | ATIVO |
| `src/components/kanban/ProjectRow.tsx` | Linha por projeto com 3 colunas de status, propaga `onAgentClick` | ATIVO |
| `src/components/kanban/AgentCard.tsx` | Card de agente (variantes: `chip` e `card`) com permission badge, tool detail, multi-terminal badge | ATIVO |
| `src/components/kanban/AgentDetailPanel.tsx` | Painel lateral slide-in com terminal info, sessão ativa, eventos recentes | ATIVO |

### 2.2 Infraestrutura Partilhada

| Ficheiro | Responsabilidade |
|----------|-----------------|
| `src/hooks/useKanban.ts` | Hook de agregação: projects + agents + WS updates |
| `src/hooks/useAgents.ts` | Fetch + merge WS de agentes |
| `src/hooks/useProjects.ts` | Fetch + merge WS de projetos |
| `src/hooks/useWebSocket.ts` | Subscriber genérico do WebSocket |
| `src/contexts/WebSocketContext.tsx` | Provider WS singleton (exponential backoff, ping 30s) |
| `src/contexts/ProjectContext.tsx` | Filtro por projeto (persiste em localStorage) |
| `src/lib/types.ts` | Interfaces TypeScript (Agent, AgentWithStats, Project, Event, Terminal, Session) |
| `src/lib/constants.ts` | Constantes partilhadas: `AGENT_COLORS`, `STATUS_DOT`, `TWELVE_HOURS_MS` |

### 2.3 Backend (Server-side)

| Ficheiro | Responsabilidade |
|----------|-----------------|
| `server.ts` | HTTP + WebSocket server (porta 8888) |
| `src/server/event-processor.ts` | Processa eventos do Claude Code hook → insere na BD → broadcast WS |
| `src/server/agent-tracker.ts` | Upsert de agentes, atualização de status/tool → broadcast `agent:update` |
| `src/server/idle-detector.ts` | State machine: working→idle→break→offline (loop 30s) |
| `src/server/terminal-tracker.ts` | Ciclo de vida dos terminais |
| `src/server/jsonl-watcher.ts` | Parser de JSONL transcripts → `current_tool_detail` + `waiting_permission` |
| `src/server/ws-broadcaster.ts` | Broadcast fire-and-forget para todos os clientes WS |
| `src/server/autopilot-engine.ts` | Motor autopilot — auto-approve permissions, gestão de terminais |
| `src/lib/queries.ts` | Queries SQLite (getAgents, getProjects, upsertAgent, updateAgentStatus) |
| `src/lib/schema.ts` | Schema SQLite + migrações |

### 2.4 API Endpoints Consumidos

| Endpoint | Método | Uso no Kanban |
|----------|--------|---------------|
| `/api/projects` | GET | Lista de projetos com `last_active` |
| `/api/agents` | GET | Agentes com `status`, `current_tool`, `current_tool_detail`, `waiting_permission`, `project_id` |
| `/api/agents?expand=terminals` | GET | Agentes com dados de terminal e `terminal_count` |
| `/api/events?agent_id={id}&limit=10` | GET | Eventos recentes (usado pelo AgentDetailPanel) |
| `/api/sessions?agent_id={id}&status=active&limit=1` | GET | Sessão ativa (usado pelo AgentDetailPanel) |
| `/api/terminals?project_id={id}` | GET | Terminais do projeto (usado pelo AgentDetailPanel) |

### 2.5 WebSocket Messages

| Mensagem | Payload | Efeito no Kanban |
|----------|---------|-----------------|
| `agent:update` | `{ agent, projectId }` | Patch individual no `agentState` local |
| `event:new` | `{ event, projectId, agentId? }` | Flash animation (500ms border highlight) + append no AgentDetailPanel |
| `project:update` | `{ project }` | Atualiza metadados do projeto |
| `terminal:update` | `{ terminal, projectId }` | Disponível mas não consumido diretamente pelo Kanban |
| `ping` | `{}` | Keep-alive (ignorado pelos componentes) |

---

## 3. Fluxo de Dados Completo

```
Claude Code Terminal (hook)
    │
    ▼
POST /api/ganga (event payload: PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStop)
    │
    ▼
event-processor.ts
├── detectProject() → upsertProject() → broadcast project:update
├── detectAgent() → trackAgent() → broadcast agent:update
│   └── agent:update inclui: current_tool_detail, waiting_permission (bridge)
├── trackTerminal() → broadcast terminal:update
├── insertEvent() → broadcast event:new
└── On Stop/SubagentStop: deactivateTerminal() + closeSession()
    │
    ▼
idle-detector.ts (loop 30s)
├── working → idle (5 min, configurável via company_config)
├── idle → break (15 min, configurável)
└── break → offline (1h, hardcoded)
    │ broadcasts agent:update a cada transição
    │
    ▼
WebSocket /ws (multiplexado, todos os tipos na mesma conexão)
    │
    ▼
useKanban() — Hook de Agregação Frontend
├── useProjects()  ───→ GET /api/projects → state local
├── useAgents()    ───→ GET /api/agents   → agentState (Record<id, Agent>)
└── useWebSocket() ───→ subscriber de mensagens WS
    ├── agent:update  → patch agentState[agent.id]
    ├── event:new     → set flashTrigger no card relevante
    └── reconnect     → auto-refetch completo
         │
         ▼
Filtragem & Organização
├── Filtra projetos por last_active >= 24h
├── Filtra por selectedProjectId (ProjectContext)
├── Agrupa agentes por project_id
└── Ordena: working primeiro → last_active DESC
         │
         ▼
ProjectRow (por projeto visível)
├── categorizeAgents():
│   ├── Trabalhando: status === 'working'                        → AgentCard variant="card" + pulse
│   ├── Ativos:      last_active ≤ 12h (TWELVE_HOURS_MS)        → AgentCard variant="chip"
│   └── Disponíveis: last_active > 12h                           → AgentCard variant="chip"
├── StatusColumn (x3) com contadores
└── onAgentClick → setSelectedAgent → AgentDetailPanel slide-in
         │
         ▼
AgentDetailPanel (quando agente selecionado)
├── Fetch: events (últimos 10) + sessão ativa + terminal do agente
├── Real-time: append event:new para o agente
├── Secções: Terminal (PID, título, status, tool, permissão) / Sessão / Eventos
└── ESC ou click no backdrop → fecha com animação
```

---

## 4. Schema de BD Relevante

```sql
-- Entidades primárias do Kanban
projects   (id, name, path, detected_at, last_active)
agents     (id, project_id FK, name, display_name, status, current_tool,
            current_tool_detail, waiting_permission, last_active)

-- Entidades usadas pelo AgentDetailPanel
terminals  (id, project_id FK, pid, agent_name, agent_display_name,
            current_tool, current_tool_detail, current_input, window_title,
            waiting_permission, autopilot, status, first_seen_at, last_active)
sessions   (id, project_id, agent_id, terminal_id, started_at, ended_at, event_count, status)
events     (id, project_id, agent_id, session_id, terminal_id, type, tool,
            input_summary, output_summary, duration_ms, created_at)

-- Configuração
company_config (idle_timeout_lounge, idle_timeout_break, theme, ganga_enabled, ganga_scope, ...)
```

**Nota:** Os campos `current_tool_detail` e `waiting_permission` existem **tanto** na tabela `agents` (bridge implementada em Story 10.1) **como** na tabela `terminals`. O Kanban consome diretamente do `Agent` via `agent:update` WS. O `AgentDetailPanel` faz fetch adicional de terminais para detalhes mais granulares.

---

## 5. Agent State Machine

```
                    Qualquer evento
                         │
                         ▼
                    ┌──────────┐
                    │ WORKING  │ ◄──── Reset em qualquer novo evento
                    │ (green)  │
                    └────┬─────┘
                         │ idle_timeout_lounge (5 min default)
                         ▼
                    ┌──────────┐
                    │   IDLE   │
                    │  (gray)  │
                    └────┬─────┘
                         │ idle_timeout_break (15 min default)
                         ▼
                    ┌──────────┐
                    │  BREAK   │
                    │ (amber)  │
                    └────┬─────┘
                         │ 1 hora (hardcoded)
                         ▼
                    ┌──────────┐
                    │ OFFLINE  │
                    │ (dark)   │
                    └──────────┘
```

Timeouts configuráveis via `company_config` excepto `break→offline` (hardcoded 1h).

---

## 6. Categorização Visual

### 6.1 Categorias de Status (ProjectRow)

| Categoria | Critério | Visual |
|-----------|----------|--------|
| **Disponíveis** | `status !== 'working'` AND `last_active > 12h` | Dot cinza, chip compacto |
| **Ativos** | `status !== 'working'` AND `last_active ≤ 12h` | Dot azul, chip compacto |
| **Trabalhando** | `status === 'working'` | Dot verde pulsante, card expandido com tool detail |

### 6.2 AgentCard — Variantes

- **`chip`** — Pill horizontal compacta: dot de status + nome colorido por role + badge multi-terminal (`x{N}`) + dot amber pulsante se `waiting_permission`
- **`card`** — Card expandido: avatar com inicial, nome, tool detail detalhado (mono, truncado a 40 chars), badge "Aguarda permissão" (amber pulsante), badge multi-terminal, pulse verde

### 6.3 AgentDetailPanel — Secções

- **Terminal** — PID, window_title, status, current_tool_detail, waiting_permission badge
- **Sessão Activa** — Duração relativa (auto-calculada), event_count, status
- **Eventos Recentes** — Últimos 10 eventos com hora, tool/type, input_summary
- **Interação** — Slide-in animation (200ms), backdrop click/ESC para fechar, real-time event append

### 6.4 Cores por Agent Role

| Agent | Cor | Hex |
|-------|-----|-----|
| `@dev` | indigo | `#6366f1` |
| `@qa` | emerald | `#34d399` |
| `@architect` | violet | `#a78bfa` |
| `@pm` | orange | `#fb923c` |
| `@sm` | cyan | `#22d3ee` |
| `@po` | amber | `#fbbf24` |
| `@analyst` | indigo-light | `#818cf8` |
| `@devops` | red | `#f87171` |
| `@data-engineer` | pink | `#f472b6` |
| `@ux-design-expert` | fuchsia | `#e879f9` |
| `@aiox-master` | amber | `#fbbf24` |

---

## 7. Funcionalidades Implementadas

- [x] Agrupamento por projeto (projetos ativos nas últimas 24h)
- [x] 3 colunas de status por projeto (Disponíveis / Ativos / Trabalhando)
- [x] Real-time via WebSocket (`agent:update` + `event:new`)
- [x] Flash animation (500ms border highlight) em eventos
- [x] Sorting: working primeiro, depois por `last_active DESC`
- [x] Filtro por projeto via `ProjectSelector` (navbar)
- [x] Loading skeleton (shimmer animation)
- [x] Empty state (sem projetos ativos)
- [x] Botão "Atualizar" (refresh manual)
- [x] Auto-refetch em reconexão WebSocket
- [x] Contadores: total de agentes e "X trabalhando"
- [x] Pulse animation contínua em agentes working
- [x] Status dots coloridos (working/idle/break/offline)
- [x] Agent color coding por role (11 roles mapeados)
- [x] Display de `current_tool` em cards expandidos
- [x] Reconnect automático com exponential backoff (max 30s, 20 retries)
- [x] Heartbeat ping a cada 30s
- [x] **Badge `waiting_permission`** — amber pulsante em chip (dot) e card (label) *(Story 10.1)*
- [x] **`current_tool_detail`** — exibido no card expandido com truncação a 40 chars *(Story 10.1)*
- [x] **AgentDetailPanel** — painel lateral slide-in com terminal, sessão, eventos recentes *(Story 10.2)*
- [x] **Multi-terminal badge** — `x{N}` no chip, contador no card quando `terminal_count > 1` *(Story 10.3)*
- [x] **Bridge agent ↔ terminal** — campos `current_tool_detail` e `waiting_permission` na interface `Agent` *(Story 10.1)*
- [x] **Constantes centralizadas** — `AGENT_COLORS`, `STATUS_DOT`, `TWELVE_HOURS_MS` em `constants.ts`

---

## 8. Story de Origem

**Story 2.4** — "Modo Kanban — Colunas de Projeto com Cards de Agente em Tempo Real"
- **Status:** Done
- **Epic:** 2 (Real-time + Kanban)
- **Depende de:** Story 2.3 (WebSocket Broadcast)
- **ACs:** 11 critérios de aceitação (todos implementados)
- **Commit:** `9eaef40 feat: Modo Kanban — colunas de projeto com cards de agente em tempo real [Story 2.4]`

**Stories relacionadas:**
- **Story 2.5** — ProjectSelector: filtro por projeto na Navbar com localStorage (`82e826d`)
- **Story 2.6** — Idle Detector: transições automáticas working→idle→break→offline (`6746d10`)
- **Story 6.1** — JSONL transcript intelligence: `current_tool_detail` + `waiting_permission` (`2406a93`)
- **Story 10.1** — Terminal Data Bridge + Permission Badge + Tool Detail (Done)
- **Story 10.2** — Agent Detail Panel (Done)
- **Story 10.3** — Multi-Terminal Badge (Done)

---

## 9. Gaps Identificados

### 9.1 Gaps Funcionais

| # | Gap | Severidade | Detalhe | Status |
|---|-----|-----------|---------|--------|
| ~~G3~~ | ~~Sem indicação de `waiting_permission`~~ | ~~CRITICAL~~ | Badge amber implementado em ambas variantes do AgentCard | **RESOLVIDO** (Story 10.1) |
| ~~G4~~ | ~~Sem `current_tool_detail`~~ | ~~HIGH~~ | Exibido no card variant com truncação a 40 chars | **RESOLVIDO** (Story 10.1) |
| ~~G2~~ | ~~Sem detalhe on-click~~ | ~~MEDIUM~~ | AgentDetailPanel com terminal, sessão, eventos | **RESOLVIDO** (Story 10.2) |
| ~~G5~~ | ~~Sem indicação de multi-terminal~~ | ~~MEDIUM~~ | Badge `x{N}` em chip, contador em card | **RESOLVIDO** (Story 10.3) |
| G7 | **Sem timestamps relativos** | LOW | Não mostra há quanto tempo o agente está no estado atual ("trabalhando há 5 min") | ABERTO |
| G8 | **Sem filtro por status** | LOW | Não há toggle para esconder categorias vazias | ABERTO |
| ~~G6~~ | ~~`ProjectColumn.tsx` órfão~~ | ~~LOW~~ | Ficheiro removido | **RESOLVIDO** |
| G1 | Sem drag & drop | NONE | Intencional — monitor, não task board | N/A |

### 9.2 Gaps Técnicos

| # | Gap | Severidade | Detalhe | Status |
|---|-----|-----------|---------|--------|
| T1 | **Fetch de todos os agentes sem filtro** | MEDIUM | `useAgents()` busca TODOS os agentes — ineficiente se escalar para 100+ | ABERTO |
| T4 | **Sem testes unitários** | MEDIUM | 0% cobertura para `useKanban`, `AgentCard`, `ProjectRow`, `AgentDetailPanel` | ABERTO (Story 10.4 pendente) |
| T3 | **Flash animation best-effort** | LOW | Flash depende de `lastMessage` global — dois eventos rápidos podem perder o segundo | ABERTO |
| T2 | **Sem throttle de WS updates** | LOW | Cada `agent:update` causa re-render — ok com React batching, mas sem debounce explícito | ABERTO |
| ~~T5~~ | ~~Limiar 12h hardcoded~~ | ~~LOW~~ | Extraído para `TWELVE_HOURS_MS` em `constants.ts` | **RESOLVIDO** (parcial — ainda não configurável via `company_config`) |

---

## 10. Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|-------|-------|---------|-----------|
| ~~R1~~ | ~~Informação crítica (`waiting_permission`) invisível~~ | ~~Alta~~ | ~~Alto~~ | **RESOLVIDO** — badge implementado |
| R2 | **Escala — muitos agentes tornam o Kanban ilegível** | Baixa | Alto | Paginação/virtualização, colapso de categorias vazias |
| R3 | **Inconsistência de estado entre Kanban e Empresa** | Média | Médio | Ambas usam o mesmo `useWebSocket` + APIs — risco é drift do state local |
| ~~R5~~ | ~~Dados de terminal não chegam ao Kanban~~ | ~~Alta~~ | ~~Alto~~ | **RESOLVIDO** — bridge feita via `Agent` interface + `agent:update` WS |
| R6 | **AgentDetailPanel fetch sem cache** | Média | Baixo | Cada click abre painel e faz 3 fetches — sem cache/dedup entre aberturas |

---

## 11. Dependências

### 11.1 Upstream (o Kanban depende de)

| Componente | Tipo | Detalhe |
|------------|------|---------|
| `GET /api/projects` | API | Lista de projetos com `last_active` |
| `GET /api/agents` | API | Agentes com `status`, `current_tool`, `current_tool_detail`, `waiting_permission`, `project_id` |
| `GET /api/agents?expand=terminals` | API | Agentes com dados de terminal e `terminal_count` |
| `GET /api/events` | API | Eventos recentes (AgentDetailPanel) |
| `GET /api/sessions` | API | Sessão ativa (AgentDetailPanel) |
| `GET /api/terminals` | API | Terminais do projeto (AgentDetailPanel) |
| WebSocket `agent:update` | WS | Atualização real-time de status/tool/permission |
| WebSocket `event:new` | WS | Trigger de flash animation + append no detail panel |
| `ProjectContext` | Context | Filtro por projeto selecionado no navbar |
| `idle-detector.ts` | Server | State machine que transiciona status |
| `agent-tracker.ts` | Server | Upsert de agentes quando eventos chegam (inclui bridge de terminal data) |
| `constants.ts` | Shared | `AGENT_COLORS`, `STATUS_DOT`, `TWELVE_HOURS_MS` |
| Story 6.1 (JSONL) | Feature | `current_tool_detail` e `waiting_permission` nos terminais |

### 11.2 Downstream (quem depende do Kanban)

| Componente | Detalhe |
|------------|---------|
| Navbar | Link `/kanban` no menu principal |
| `ProjectSelector` | Filtra a vista Kanban por projeto |

### 11.3 Cross-Tab Context

| Tab | Relação com Kanban | Dados Partilhados |
|-----|-------------------|-------------------|
| **Lista** (`/lista`) | Log de eventos — detalhe que o Kanban resume | Mesmos agentes + eventos via WS |
| **Terminais** (`/terminais`) | Sessões de terminal — granularidade que o Kanban agora mostra parcialmente via AgentDetailPanel | `terminals` table |
| **Empresa** (`/empresa`) | Visualização isométrica dos mesmos agentes | Mesmo `useWebSocket`, mesma BD |
| **Config** | Timeouts de idle, tema, ganga toggle | `company_config` (afeta state machine do Kanban) |

---

## 12. Epic Formal

> **Proposta draft do Atlas substituída pela epic formalizada pelo PM.**

**Epic 10 — Kanban: Visibilidade Operacional Completa**
**Documento:** [`docs/epics/epic-10-kanban-operational-visibility.md`](epics/epic-10-kanban-operational-visibility.md)
**Status:** Em Progresso | **Autor:** Morgan (PM Agent)

### Stories

| Story | Título | Prioridade | Size | Resolve | Status |
|-------|--------|-----------|------|---------|--------|
| **10.1** | Terminal Data Bridge + Permission Badge + Tool Detail | CRITICAL | M | G3 + G4 | **Done** |
| **10.2** | Agent Detail Panel | HIGH | M | G2 | **Done** |
| **10.3** | Multi-Terminal Badge | MEDIUM | S | G5 | **Done** |
| **10.4** | Testes & Cleanup | LOW | M | T4 + dead code | **Pendente** |

### Decisão Arquitectural (Implementada)

**Bridge `terminals` → `agents`:** Opção B (enriquecer `agent:update` WS com `waiting_permission` + `current_tool_detail`) + Opção A como fallback (`expand=terminals` no fetch inicial). Campos `current_tool_detail` e `waiting_permission` adicionados diretamente à interface `Agent`.

### Sequência

```
Wave 1: 10.1 (desbloqueador — bridge + badge + tool detail) ✅ DONE
Wave 2: 10.2 + 10.3 (parallelizáveis)                      ✅ DONE
Wave 3: 10.4 (testes cobrem tudo)                           ⏳ PENDENTE
```

### Gaps Descartados pelo PM

| ID | Gap Original | Motivo de Exclusão |
|----|-------------|-------------------|
| G1 | Drag & drop | Intencional — monitor, não task board |
| G6 | `ProjectColumn.tsx` órfão | Dead code removido — cleanup feito |
| G7/G8 | Timestamps / Filtros | Nice-to-have — pode entrar como melhoria futura fora desta epic |
| T5 | 12h hardcoded | Extraído para constante mas lógica de negócio válida |
| T2/T3 | Throttle WS / Flash | Performance adequada para volume actual |

> Detalhes completos com ACs, ficheiros impactados, riscos e métricas: [`docs/epics/epic-10-kanban-operational-visibility.md`](epics/epic-10-kanban-operational-visibility.md)

---

## 13. Mapa de Ficheiros

```
src/
├── app/kanban/page.tsx                    # Página principal + selectedAgent state
├── components/kanban/
│   ├── ProjectRow.tsx                     # Layout ativo (3 colunas por projeto) + onAgentClick
│   ├── AgentCard.tsx                      # Card de agente (chip/card) + permission + tool detail + multi-terminal
│   └── AgentDetailPanel.tsx               # Painel lateral slide-in (terminal, sessão, eventos)
├── hooks/
│   ├── useKanban.ts                       # Hook de agregação principal
│   ├── useAgents.ts                       # Fetch + WS merge de agentes
│   ├── useProjects.ts                     # Fetch + WS merge de projetos
│   └── useWebSocket.ts                    # WebSocket subscriber genérico
├── contexts/
│   ├── WebSocketContext.tsx               # Provider WS singleton
│   └── ProjectContext.tsx                 # Filtro de projeto (localStorage)
├── lib/
│   ├── types.ts                           # Tipos (Agent, AgentWithStats, Terminal, Event, Project, Session)
│   ├── constants.ts                       # AGENT_COLORS, STATUS_DOT, TWELVE_HOURS_MS
│   ├── queries.ts                         # Queries SQLite
│   └── schema.ts                          # Schema + migrações
├── app/api/
│   ├── agents/route.ts                    # GET /api/agents(?expand=terminals)
│   ├── projects/route.ts                  # GET /api/projects
│   ├── events/route.ts                    # GET /api/events(?agent_id=&limit=)
│   ├── sessions/route.ts                  # GET /api/sessions(?agent_id=&status=&limit=)
│   └── terminals/route.ts                 # GET /api/terminals(?project_id=)
└── server/
    ├── event-processor.ts                 # Processamento de eventos → BD → WS broadcast
    ├── agent-tracker.ts                   # Upsert + status update + terminal bridge
    ├── idle-detector.ts                   # State machine (30s loop)
    ├── terminal-tracker.ts                # Ciclo de vida de terminais
    ├── jsonl-watcher.ts                   # Parser JSONL (tool detail, permission)
    ├── autopilot-engine.ts                # Motor autopilot (auto-approve permissions)
    └── ws-broadcaster.ts                  # Broadcast WS fire-and-forget
```

---

*Documento gerado por Atlas (Analyst Agent) — Rev 3.0, atualização completa com análise de código vs. documentação.*
*— Atlas, investigando a verdade 🔎*
