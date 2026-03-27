# Lista — Contexto Funcional & Estado Atual

> **Autor:** Atlas (Analyst Agent) | **Data original:** 2026-03-18 | **Atualizado:** 2026-03-24
> **Projeto:** aiox-monitor | **Branch:** main

---

## 1. Objetivo da Aba Lista

A aba Lista (`/lista`) serve como **log completo e navegável de toda a atividade dos agentes AI**. É o registo de verdade do sistema — cada evento no banco de dados deve ser visível e consultável nesta interface, respondendo às perguntas:

- **O que aconteceu** (cada tool call, prompt, resposta)?
- **Quando** (timeline cronológica)?
- **Quem fez** (qual agente, em que terminal, em que projeto)?
- **Qual o contexto** (sessão completa com prompt → tools → resposta)?

A Lista opera em dois modos:
- **Summary (sessões)** — Pagina sessões server-side via `/api/sessions`, mostrando prompt, tools e resposta
- **Detalhado (eventos)** — Mostra cada evento individualmente, filtrável por tipo, com paginação server-side

Não é um dashboard de status (isso é o Kanban). É um **audit log + investigação** que deve ser um reflexo fiel e completo do banco de dados.

---

## 2. Arquitetura Atual

### 2.1 Componentes

| Ficheiro | Linhas | Responsabilidade |
|----------|--------|-----------------|
| `src/app/lista/page.tsx` | 238 | Página principal — dual view (sessões/eventos), filtros, drawers, export JSON, retention badge |
| `src/components/lista/FilterBar.tsx` | 287 | Multi-filtro: projeto, agente, tipo, busca textual (300ms debounce), date range (since/until), terminal pills com deduplicação por título |
| `src/components/lista/SessionRow.tsx` | 214 | `groupBySession()` legacy + row de sessão (fallback client-side) |
| `src/components/lista/SessionTable.tsx` | 93 | Tabela de sessões com 8 colunas + load more + loading skeleton |
| `src/components/lista/SessionDetail.tsx` | 254 | Drawer lateral com detalhes de sessão (prompt, timeline, resposta), on-demand fetch via `/api/sessions/:id/events` |
| `src/components/lista/EventRow.tsx` | 158 | Row de evento individual com humanização de tools |
| `src/components/lista/EventTable.tsx` | 103 | Tabela de eventos individuais com paginação + load more |
| `src/components/lista/EventDetail.tsx` | 189 | Drawer lateral com detalhes de evento (input/output, JSON, metadata) |

**Total frontend: ~1.536 linhas**

### 2.2 Hooks

| Ficheiro | Linhas | Responsabilidade |
|----------|--------|-----------------|
| `src/hooks/useSessions.ts` | 124 | Fetch `/api/sessions` com paginação, filtros, real-time via WebSocket (patch in-place para sessões existentes, refresh para novas) |
| `src/hooks/useEvents.ts` | 103 | Fetch `/api/events` com paginação, filtros, real-time via WebSocket com deduplicação. Desabilitado quando view = summary |

### 2.3 API Routes

| Ficheiro | Linhas | Responsabilidade |
|----------|--------|-----------------|
| `src/app/api/sessions/route.ts` | 42 | GET — sessões paginadas com filtros (project, agent, terminal, status, since, until, search). Retorna `{ sessions, total }` |
| `src/app/api/sessions/[id]/events/route.ts` | 21 | GET — todos os eventos de uma sessão (sem limit). On-demand para drawer de detalhes |
| `src/app/api/events/route.ts` | 77 | GET/POST — eventos com filtros e paginação |

### 2.4 Backend (queries.ts)

| Função | Descrição |
|--------|-----------|
| `getSessions(filters)` | Query paginada sobre `sessions` com subqueries para prompt, response, tool_count e tools (GROUP_CONCAT). Retorna `SessionWithSummary[]` + total + hasMore |
| `getSessionEvents(sessionId)` | Todos os eventos de uma sessão, ORDER BY id ASC |
| `getEvents(filters)` | Eventos com filtros, paginação, busca textual |

### 2.5 Fluxo de Dados

```
[Summary View — Server-Side]
useSessions(filters)
├── GET /api/sessions?limit=20&offset=0      ← fetch inicial (paginado por sessões)
│   └── queries.ts:getSessions()
│       └── SELECT s.*, (subqueries: prompt, response, tool_count, tools)
│           FROM sessions s WHERE ... ORDER BY started_at DESC LIMIT 20
├── WebSocket event:new                       ← tempo real
│   ├── Sessão existente → patch in-place (event_count++, tools, response)
│   ├── Sessão nova → trigger refresh após 500ms
│   └── Filtro por project_id
├── Load More → GET /api/sessions?offset=N    ← append
└── → SessionTable → SessionRow → SessionDetail
                                     └── GET /api/sessions/:id/events (on-demand)

[Detail View — Server-Side]
useEvents(filters)
├── GET /api/events?limit=50                  ← fetch inicial
├── WebSocket event:new                       ← tempo real com deduplicação
├── Load More → GET /api/events?offset=N
└── filteredEvents = events.filter(type)
    └── → EventTable → EventRow → EventDetail
```

### 2.6 Modos de Visualização

| Modo | Componente | Descrição |
|------|-----------|-----------|
| `summary` | `SessionTable` | Sessões server-side — 1 linha = 1 sessão com prompt + tools + resposta |
| `all` | `EventTable` | Todos os eventos individuais sem agrupamento |
| `UserPromptSubmit` | `EventTable` | Apenas prompts do utilizador |
| `Stop` | `EventTable` | Apenas respostas do Claude |
| `PreToolUse` | `EventTable` | Apenas chamadas de tools |
| `PostToolUse` | `EventTable` | Apenas resultados de tools |

### 2.7 Humanização de Tools

Tanto `SessionDetail.tsx` como `EventRow.tsx` traduzem tool names para linguagem natural:

| Tool | Humanização |
|------|-------------|
| `Read` | "Leu [ficheiro]" |
| `Write` | "Escreveu [ficheiro]" |
| `Edit` | "Editou [ficheiro]" |
| `Bash` | "Executou [comando]" |
| `Grep` | "Pesquisou [padrão]" |
| `Glob` | "Procurou ficheiros: [padrão]" |
| `WebSearch` | "Pesquisou na web" |
| `Skill` | "Executou skill" |

### 2.8 Funcionalidades Implementadas

- [x] Dual view: sessões server-side (summary) e eventos individuais
- [x] **Endpoint `/api/sessions`** com query paginada sobre tabela sessions
- [x] **Endpoint `/api/sessions/:id/events`** para detalhes on-demand
- [x] **Hook `useSessions`** com paginação, filtros e real-time WebSocket
- [x] **Paginação server-side** em ambas as views (sessions e events)
- [x] **Load more** com botão "carregar mais" e contadores corretos
- [x] **Busca textual server-side** com debounce 300ms no FilterBar
- [x] **Filtro por período** (since/until) com datetime-local inputs
- [x] **Export JSON** dos dados visíveis (sessions ou events) com filtros incluídos
- [x] **Retention badge** mostrando dias de retenção configurados
- [x] **Contadores fiéis** com unidades corretas (sessões/eventos) e total real
- [x] Real-time via WebSocket (`event:new`) com deduplicação e patch in-place
- [x] Filtro por projeto via `ProjectSelector` (navbar)
- [x] Filtro por agente, terminal, tipo de evento
- [x] Terminal pills com deduplicação por título, ranking por status (processing > active > inactive)
- [x] Tool detail e permission badge do JSONL (Story 6.1)
- [x] Drawer de detalhes para sessões (com fetch on-demand) e eventos
- [x] Timeline de ações na sessão com humanização
- [x] Refresh manual + auto-refetch em reconexão WS
- [x] Loading skeleton + loading more indicator

---

## 3. Stories de Origem

**Story 1.6** — "Modo Lista — Tabela de Eventos com Filtros" (Epic 1)

Stories que evoluíram a Lista:
- **Story 2.3** — WebSocket real-time
- **Story 2.5** — ProjectSelector
- **Story 6.1** — JSONL Intelligence (tool detail + permission badge)

### Epic 9 — Lista 2.0 (COMPLETO)

Todas as 7 stories do Epic 9 foram concluídas:

| Wave | Story | Título | Status |
|------|-------|--------|--------|
| 1 | **9.1** | API de Sessões + Paginação Server-Side | Done |
| 1 | **9.2** | Vista de Sessões com Dados Completos | Done |
| 2 | **9.3** | Paginação de Eventos Individuais | Done |
| 2 | **9.4** | Contadores Fiéis e Indicadores de Completude | Done |
| 3 | **9.5** | Busca Textual Server-Side | Done |
| 3 | **9.6** | Filtro por Período + Duração de Sessão | Done |
| 4 | **9.7** | Testes, Cleanup & Export | Done |

> **Epic completo:** [`docs/epics/EPIC-9-LISTA-COMPLETE.md`](epics/EPIC-9-LISTA-COMPLETE.md)

---

## 4. Estado do Banco de Dados

Snapshot em 2026-03-24:

| Métrica | Valor |
|---------|-------|
| Total de eventos | **1.277** |
| Total de sessões | **14** |
| Sessões com eventos associados | **15** (distinct session_id em events) |

---

## 5. Gaps Resolvidos (Epic 9)

Os seguintes gaps identificados na versão original deste documento foram **todos resolvidos**:

| # | Gap Original | Resolução |
|---|-------------|-----------|
| G1 | Histórico truncado pelo LIMIT 200 | Paginação server-side por sessões (20/page) — Story 9.1 |
| G2 | Sessões parcialmente carregadas | Query `getSessions()` com subqueries server-side — Story 9.1 |
| G3 | Sem paginação | Load more em ambas as views — Stories 9.1/9.3 |
| G4 | Agrupamento client-side sobre dados truncados | Substituído por endpoint `/api/sessions` server-side — Story 9.2 |
| G5 | Sem busca textual | Search field com debounce + query EXISTS sobre events — Story 9.5 |
| G6 | Sem filtro por período | datetime-local inputs (since/until) — Story 9.6 |
| G7 | Sem duração de sessão | Calculada a partir de started_at/ended_at — Story 9.6 |
| G8 | Sem export | Botão "Exportar JSON" com dados visíveis + filtros — Story 9.7 |
| G9 | Contagem enganadora | Contadores com unidades corretas por view — Story 9.4 |
| T1 | Sem endpoint `/api/sessions` | Criado com filtros completos — Story 9.1 |
| T2 | `session.event_count` não utilizado | Usado no `useSessions` real-time patch — Story 9.2 |
| T3 | Status `interrupted` nunca atribuído | Filtro disponível na API — parcialmente resolvido |
| T4 | Sem testes unitários | Adicionados na Story 9.7 |

---

## 6. Gaps Remanescentes

| # | Gap | Severidade | Detalhe |
|---|-----|-----------|---------|
| G10 | **`SessionRow.tsx` legacy mantido** | LOW | `groupBySession()` client-side ainda existe (214 linhas) como fallback mas não é usado no fluxo principal. Candidato a remoção |
| G11 | **Sessões fantasma** | LOW | 14 registos em `sessions` mas 15 distinct `session_id` em events — possível orfanagem |
| G12 | **Virtualização de lista ausente** | LOW | Com 1.277+ eventos e crescendo, `EventTable` renderiza tudo no DOM. `react-window` ou similar seria benéfico para listas longas |
| G13 | **Status `interrupted` sem trigger automático** | LOW | Nenhum código atribui `interrupted` automaticamente — apenas `active` e `completed` são usados pelo event-processor |

---

## 7. Dependências

### Dependências Upstream (a Lista depende de)

| Componente | Detalhe |
|------------|---------|
| `GET /api/sessions` | Sessões paginadas com filtros e subqueries (prompt, response, tools) |
| `GET /api/sessions/:id/events` | Todos os eventos de uma sessão (on-demand para drawer) |
| `GET /api/events` | Eventos paginados com filtros |
| `queries.ts:getSessions()` | Query paginada com subqueries sobre `sessions` + `events` |
| `queries.ts:getSessionEvents()` | Eventos por sessão, ORDER BY id ASC |
| `queries.ts:getEvents()` | Query paginada com WHERE dinâmico + busca textual |
| `event-processor.ts` | Pipeline de ingestão: detect project → detect agent → track terminal → resolve session → insert event → broadcast |
| WebSocket `event:new` | Real-time — `useSessions` faz patch in-place, `useEvents` faz deduplicação |
| WebSocket `terminal:update` | Tool detail + permission status dos terminais |
| `ProjectContext` | Filtro por projeto selecionado no navbar |
| `cleanup.ts` | Limpeza automática de eventos > N dias |
| `company_config.event_retention_days` | Configuração de retenção (default: 30 dias) |

### Dependências Downstream (quem depende da Lista)

| Componente | Detalhe |
|------------|---------|
| Navbar | Link `/lista` no menu principal |
| `ProjectSelector` | Filtra a vista Lista por projeto |

---

## 8. Mapa de Ficheiros

```
src/
├── app/
│   ├── lista/
│   │   └── page.tsx                        # Página principal (dual view, export, retention)
│   └── api/
│       ├── events/
│       │   └── route.ts                    # GET/POST eventos paginados
│       └── sessions/
│           ├── route.ts                    # GET sessões paginadas com subqueries
│           └── [id]/
│               └── events/
│                   └── route.ts            # GET eventos de uma sessão (on-demand)
├── components/
│   └── lista/
│       ├── FilterBar.tsx                   # Filtros + busca + date range + terminal pills
│       ├── SessionRow.tsx                  # groupBySession() legacy (fallback)
│       ├── SessionTable.tsx                # Tabela de sessões com load more
│       ├── SessionDetail.tsx               # Drawer de detalhes com fetch on-demand
│       ├── EventRow.tsx                    # Row de evento individual
│       ├── EventTable.tsx                  # Tabela de eventos com load more
│       └── EventDetail.tsx                 # Drawer de detalhes de evento
├── hooks/
│   ├── useSessions.ts                      # Fetch + paginação + WebSocket real-time
│   ├── useEvents.ts                        # Fetch + paginação + WebSocket + deduplicação
│   └── useWebSocket.ts                     # WebSocket subscriber
├── contexts/
│   ├── WebSocketContext.tsx                 # Provider WS singleton
│   └── ProjectContext.tsx                  # Filtro global de projeto
├── lib/
│   ├── queries.ts                          # getSessions(), getSessionEvents(), getEvents(), insertEvent()
│   ├── schema.ts                           # Tabelas: events, sessions, agents, terminals, autopilot_log, ganga_log
│   ├── types.ts                            # SessionWithSummary, SessionFilters, EventFilters, Event, Session
│   └── api-utils.ts                        # parseIntParam, apiErrorResponse, ApiError
├── server/
│   ├── event-processor.ts                  # Pipeline de ingestão
│   ├── cleanup.ts                          # Limpeza de eventos antigos
│   └── ws-broadcaster.ts                   # Broadcast WebSocket
└── server.ts                               # Custom server (WS + cleanup scheduler)
```

---

## 9. Schema Relevante

### Tabela `sessions`
```sql
CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id    INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  terminal_id INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT,
  event_count INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'active'
              CHECK(status IN ('active','completed','interrupted'))
);
```

### Tabela `events`
```sql
CREATE TABLE events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id       INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  session_id     INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  terminal_id    INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
  type           TEXT NOT NULL
                 CHECK(type IN ('PreToolUse','PostToolUse','UserPromptSubmit','Stop','SubagentStop')),
  tool           TEXT,
  input_summary  TEXT,
  output_summary TEXT,
  duration_ms    INTEGER,
  raw_payload    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Tipos TypeScript

```typescript
interface SessionWithSummary extends Session {
  prompt: string | null;
  response: string | null;
  tool_count: number;
  tools: string[];
}

interface SessionFilters {
  projectId?: number;
  agentId?: number;
  terminalId?: number;
  status?: 'active' | 'completed' | 'interrupted';
  since?: string;
  until?: string;
  search?: string;
  limit?: number;
  offset?: number;
}
```

---

*Documento gerado por Atlas (Analyst Agent). Atualizado em 2026-03-24 com estado pós-Epic 9.*
*— Atlas, investigando a verdade*
