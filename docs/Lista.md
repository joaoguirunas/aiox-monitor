# Lista — Contexto Funcional & Epic de Evolução

> **Autor:** Atlas (Analyst Agent) | **Data:** 2026-03-18
> **Projeto:** aiox-monitor | **Branch:** main

---

## 1. Objetivo da Aba Lista

A aba Lista (`/lista`) serve como **log completo e navegável de toda a atividade dos agentes AI**. É o registo de verdade do sistema — cada evento no banco de dados deve ser visível e consultável nesta interface, respondendo às perguntas:

- **O que aconteceu** (cada tool call, prompt, resposta)?
- **Quando** (timeline cronológica)?
- **Quem fez** (qual agente, em que terminal, em que projeto)?
- **Qual o contexto** (sessão completa com prompt → tools → resposta)?

A Lista opera em dois modos:
- **Summary (sessões)** — Agrupa eventos por sessão/comando, mostrando prompt, tools usadas e resposta
- **Detalhado (eventos)** — Mostra cada evento individualmente, filtrável por tipo

Não é um dashboard de status (isso é o Kanban). É um **audit log + investigação** que deve ser um reflexo fiel e completo do banco de dados.

---

## 2. Arquitetura Atual

### 2.1 Componentes

| Ficheiro | Linhas | Responsabilidade |
|----------|--------|-----------------|
| `src/app/lista/page.tsx` | 146 | Página principal — dual view (sessões/eventos), filtros, drawers |
| `src/components/lista/FilterBar.tsx` | 209 | Multi-filtro: projeto, agente, tipo, terminal pills |
| `src/components/lista/SessionRow.tsx` | 176 | `groupBySession()` + row de sessão agrupada |
| `src/components/lista/SessionTable.tsx` | 71 | Tabela de sessões com 8 colunas |
| `src/components/lista/SessionDetail.tsx` | 194 | Drawer lateral com detalhes de sessão (prompt, timeline, resposta) |
| `src/components/lista/EventRow.tsx` | 158 | Row de evento individual com humanização de tools |
| `src/components/lista/EventTable.tsx` | 80 | Tabela de eventos individuais |
| `src/components/lista/EventDetail.tsx` | 189 | Drawer lateral com detalhes de evento |
| `src/hooks/useEvents.ts` | 71 | Fetch + WebSocket merge + deduplicação |
| `src/app/api/events/route.ts` | 75 | GET/POST endpoint de eventos |

**Total: ~1.369 linhas** (frontend + hook + API)

### 2.2 Fluxo de Dados

```
useEvents(filters)
├── GET /api/events?limit=200          ← fetch inicial
│   └── queries.ts:getEvents()
│       └── SELECT * FROM events ORDER BY created_at DESC LIMIT 200
├── WebSocket event:new                ← tempo real
│   ├── Filtro por project/agent/terminal
│   ├── Deduplicação por event.id
│   └── Prepend ao array de eventos
│
├── [Summary View]
│   └── groupBySession(events)
│       ├── Map<session_id, Event[]>
│       ├── Para cada sessão:
│       │   ├── UserPromptSubmit → prompt
│       │   ├── Stop/SubagentStop → resposta
│       │   ├── PreToolUse/PostToolUse → tools[]
│       │   └── isComplete = !!stopEvent
│       └── → SessionTable → SessionRow → SessionDetail
│
└── [Detail View]
    └── filteredEvents = events.filter(type)
        └── → EventTable → EventRow → EventDetail
```

### 2.3 Modos de Visualização

| Modo | Componente | Descrição |
|------|-----------|-----------|
| `summary` | `SessionTable` | Agrupa por sessão — 1 linha = 1 comando (prompt + tools + resposta) |
| `all` | `EventTable` | Todos os eventos individuais sem agrupamento |
| `UserPromptSubmit` | `EventTable` | Apenas prompts do utilizador |
| `Stop` | `EventTable` | Apenas respostas do Claude |
| `PreToolUse` | `EventTable` | Apenas chamadas de tools |
| `PostToolUse` | `EventTable` | Apenas resultados de tools |

### 2.4 Agrupamento por Sessão (`groupBySession`)

A função em `SessionRow.tsx:20-68` agrupa eventos client-side:

1. Agrupa por `session_id` (eventos sem sessão ficam como `orphan-{id}`)
2. Ordena eventos dentro de cada grupo por `id` ASC (cronológico)
3. Extrai: prompt (1o `UserPromptSubmit`), resposta (último `Stop`/`SubagentStop`), tools únicas, contagem de ações
4. Retorna `SessionGroup[]` com todos os eventos preservados no array `.events`

**O agrupamento é não-destrutivo** — todos os eventos ficam disponíveis em `SessionGroup.events` para o drawer de detalhes.

### 2.5 Humanização de Tools

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

### 2.6 Funcionalidades Implementadas

- [x] Dual view: sessões agrupadas (summary) e eventos individuais
- [x] Real-time via WebSocket (`event:new`) com deduplicação
- [x] Filtro por projeto via `ProjectSelector` (navbar)
- [x] Filtro por agente, terminal, tipo de evento
- [x] Terminal pills com status (processing/active/inactive)
- [x] Tool detail e permission badge do JSONL (Story 6.1)
- [x] Drawer de detalhes para sessões e eventos
- [x] Timeline de ações na sessão com humanização
- [x] Refresh manual + auto-refetch em reconexão WS
- [x] Loading skeleton
- [x] Contadores: X sessões/eventos de Y total

---

## 3. Story de Origem

**Story 1.6** — "Modo Lista — Tabela de Eventos com Filtros"
- **Status:** Ready for Review
- **Epic:** 1 (Core Backend + UI Básica)
- **Depende de:** Story 1.5 (APIs GET)

Stories que evoluíram a Lista:
- **Story 2.3** — WebSocket real-time (removeu polling, adicionou merge WS)
- **Story 2.5** — ProjectSelector (filtro global por projeto)
- **Story 6.1** — JSONL Intelligence (tool detail + permission badge nos terminais)

---

## 4. Problema Atual: Histórico Desaparece + Agrupamento Quebrado

### 4.1 Diagnóstico Quantificado

Análise do banco de dados real (`data/monitor.db`) em 2026-03-18:

| Métrica | Valor |
|---------|-------|
| Total de eventos no banco | **522** |
| Total de sessões | **23** |
| Eventos carregados pela Lista | **200** (hardcoded `limit: 200` em `page.tsx:20`) |
| Sessões visíveis com limit 200 | **3 de 23** |
| Percentagem de histórico invisível | **87%** |
| Eventos órfãos (sem session_id) | **0** |

### 4.2 Causa Raiz

A query em `queries.ts:413` é:
```sql
SELECT * FROM events ORDER BY created_at DESC LIMIT 200 OFFSET 0
```

O `LIMIT 200` opera sobre **eventos individuais**, não sobre sessões. Com sessões que contêm dezenas/centenas de eventos, o limit esgota-se nas sessões mais recentes:

| session_id | Eventos totais | Na janela de 200 | Estado |
|------------|---------------|------------------|--------|
| 740 | 104 | 104 | Completa |
| 741 | 58 | 58 | Completa |
| 739 | 162 | **38** | **Truncada** (faltam 124 eventos) |
| 737 | 70 | 0 | **Invisível** |
| 735 | 46 | 0 | **Invisível** |
| 738 | 38 | 0 | **Invisível** |
| 726 | 10 | 0 | **Invisível** |
| 721 | 8 | 0 | **Invisível** |
| (+ 15 mais) | — | 0 | **Invisíveis** |

### 4.3 Cadeia de Efeitos

```
LIMIT 200 sobre eventos (não sessões)
    ↓
Sessões recentes com muitos eventos consomem todo o budget
    ↓
Sessão 739 (162 eventos) chega truncada — só 38 de 162
    ↓ ↓
│   groupBySession() cria grupo incompleto:
│   - Pode faltar UserPromptSubmit → prompt = null
│   - Pode faltar Stop → isComplete = false (mostra "Em curso")
│   - Tools parciais → contagem errada
│   → "Agrupamento parou de funcionar"
│
Sessões 737, 735, 738, 726, 721... = 0 eventos na janela
    ↓
20 de 23 sessões completamente invisíveis
    → "Histórico está a desaparecer"
```

### 4.4 Agravantes

1. **Sem paginação** — Não existe "carregar mais" nem scroll infinito. O utilizador está preso aos 200 eventos mais recentes.
2. **Crescimento natural** — À medida que se usam mais agentes, as sessões ficam maiores (mais tool calls), agravando o truncamento.
3. **Sem endpoint de sessões** — A tabela `sessions` existe no banco (23 registos com `event_count`, `status`, `started_at`, `ended_at`) mas não tem endpoint API dedicado. O frontend faz agrupamento client-side sobre dados já truncados.

---

## 5. Gaps Identificados

### 5.1 Gaps Funcionais

| # | Gap | Severidade | Detalhe |
|---|-----|-----------|---------|
| G1 | **Histórico truncado pelo LIMIT 200** | CRITICAL | 87% dos eventos/sessões invisíveis — viola o princípio de reflexo completo do banco |
| G2 | **Sessões parcialmente carregadas** | CRITICAL | Sessões cortadas pelo limit aparecem com dados incompletos (sem prompt, sem resposta, tools parciais) |
| G3 | **Sem paginação** | HIGH | Sem "carregar mais", scroll infinito, ou navegação por página |
| G4 | **Agrupamento feito client-side sobre dados truncados** | HIGH | `groupBySession()` recebe dados parciais — resultado é imprevisível |
| G5 | **Sem busca textual** | MEDIUM | Não há pesquisa por conteúdo de prompt, resposta, ou tool input |
| G6 | **Sem filtro por período** | MEDIUM | Não há date picker para filtrar por intervalo de tempo |
| G7 | **Sem duração de sessão** | MEDIUM | SessionRow não calcula nem mostra tempo decorrido (started_at → ended_at) |
| G8 | **Sem export** | LOW | Não há export CSV/JSON dos eventos ou sessões |
| G9 | **Contagem "de X total" enganadora** | LOW | Mostra "3 sessões de 522 eventos (agrupado)" — mistura unidades |

### 5.2 Gaps Técnicos

| # | Gap | Severidade | Detalhe |
|---|-----|-----------|---------|
| T1 | **Sem endpoint `/api/sessions`** | HIGH | Tabela `sessions` tem dados ricos (event_count, status, timestamps) mas não é exposta via API |
| T2 | **`session.event_count` não utilizado** | MEDIUM | O campo é incrementado no insert mas o frontend ignora-o, recalcula do array |
| T3 | **Status `interrupted` nunca atribuído** | LOW | Schema define 3 status (`active`, `completed`, `interrupted`) mas código só usa 2 |
| T4 | **Sem testes unitários** | MEDIUM | Zero testes para `groupBySession`, `FilterBar`, ou `useEvents` |
| T5 | **groupBySession recalcula a cada render** | LOW | Está em `useMemo` com dep em `events` — ok, mas com milhares de eventos pode ser lento |

---

## 6. Riscos

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| R1 | Histórico continua a desaparecer à medida que o sistema cresce | **Certa** | **Crítico** | Implementar paginação real + endpoint de sessões |
| R2 | Sessões grandes (>100 eventos) distorcem a vista summary | **Alta** | **Alto** | Paginar por sessões (não por eventos) no modo summary |
| R3 | Performance degrada com mais eventos na UI | **Média** | **Médio** | Virtualização de lista (react-window) ou server-side pagination |
| R4 | Utilizador toma decisões erradas baseado em dados truncados | **Alta** | **Alto** | Indicação clara de dados parciais + link "ver completo" |
| R5 | Cleanup automático (30 dias) apaga eventos sem aviso visual | **Baixa** | **Médio** | Indicador de "retenção: 30 dias" na UI |

---

## 7. Dependências

### Dependências Upstream (a Lista depende de)

| Componente | Detalhe |
|------------|---------|
| `GET /api/events` | Fetch de eventos com filtros (project, agent, terminal, type, limit, offset) |
| `queries.ts:getEvents()` | Query SQLite com WHERE dinâmico + LIMIT/OFFSET |
| `queries.ts:insertEvent()` | Insert de eventos + increment de `sessions.event_count` |
| `event-processor.ts` | Pipeline de 8 passos: detect project → detect agent → track terminal → resolve session → insert event → broadcast |
| WebSocket `event:new` | Atualização real-time de novos eventos |
| WebSocket `terminal:update` | Tool detail + permission status dos terminais |
| `ProjectContext` | Filtro por projeto selecionado no navbar |
| `sessions` table | Tabela com session_id, status, event_count, timestamps (existe mas não tem endpoint dedicado) |
| Story 6.1 (JSONL) | `current_tool_detail` e `waiting_permission` nos terminais |
| `cleanup.ts` | Limpeza automática de eventos > N dias |
| `company_config.event_retention_days` | Configuração de retenção (default: 30 dias) |

### Dependências Downstream (quem depende da Lista)

| Componente | Detalhe |
|------------|---------|
| Navbar | Link `/lista` no menu principal |
| `ProjectSelector` | Filtra a vista Lista por projeto |

---

## 8. Epic Formalizada: Epic 9 — Lista 2.0

> **Documento completo:** [`docs/epics/EPIC-9-LISTA-COMPLETE.md`](epics/EPIC-9-LISTA-COMPLETE.md)

A proposta de evolução foi formalizada como **Epic 9** pelo @pm (Morgan), com 7 stories organizadas em 4 waves:

| Wave | Story | Título | Prioridade |
|------|-------|--------|-----------|
| 1 | **9.1** | API de Sessões + Paginação Server-Side | P0 CRITICAL |
| 1 | **9.2** | Vista de Sessões com Dados Completos | P0 CRITICAL |
| 2 | **9.3** | Paginação de Eventos Individuais | P1 HIGH |
| 2 | **9.4** | Contadores Fiéis e Indicadores de Completude | P1 HIGH |
| 3 | **9.5** | Busca Textual Server-Side | P2 MEDIUM |
| 3 | **9.6** | Filtro por Período + Duração de Sessão | P2 MEDIUM |
| 4 | **9.7** | Testes, Cleanup & Export | P3 LOW |

**Critical path:** 9.1 → 9.2 → 9.4 (resolve os dois problemas críticos em 3 stories sequenciais)

---

## 9. Mapa de Ficheiros Relevantes

```
src/
├── app/
│   ├── lista/
│   │   └── page.tsx                        # Página principal (dual view)
│   └── api/
│       └── events/
│           └── route.ts                    # GET/POST eventos
│       # (FALTA: api/sessions/route.ts)    # Endpoint de sessões (proposto L.1)
├── components/
│   └── lista/
│       ├── FilterBar.tsx                   # Filtros + terminal pills
│       ├── SessionRow.tsx                  # groupBySession() + row de sessão
│       ├── SessionTable.tsx                # Tabela de sessões
│       ├── SessionDetail.tsx               # Drawer de detalhes de sessão
│       ├── EventRow.tsx                    # Row de evento individual
│       ├── EventTable.tsx                  # Tabela de eventos
│       └── EventDetail.tsx                 # Drawer de detalhes de evento
├── hooks/
│   ├── useEvents.ts                        # Fetch + WS merge
│   ├── useWebSocket.ts                     # WebSocket subscriber
│   └── # (FALTA: useSessions.ts)           # Hook de sessões (proposto L.2)
├── contexts/
│   ├── WebSocketContext.tsx                 # Provider WS singleton
│   └── ProjectContext.tsx                  # Filtro global de projeto
├── lib/
│   ├── queries.ts                          # getEvents(), insertEvent(), createSession(), closeSession()
│   │   # (FALTA: getSessions())            # Query de sessões (proposto L.1)
│   ├── schema.ts                           # Tabelas: events, sessions, agents, terminals
│   └── types.ts                            # Event, Session, SessionGroup, EventFilters
├── server/
│   ├── event-processor.ts                  # Pipeline de ingestão (8 passos)
│   ├── cleanup.ts                          # Limpeza de eventos antigos
│   └── ws-broadcaster.ts                   # Broadcast WebSocket
└── # server.ts                             # Custom server (WS + cleanup scheduler)

data/
└── monitor.db                              # SQLite — 522 eventos, 23 sessões (snapshot 2026-03-18)
```

---

## 10. Schema Relevante

### Tabela `events`
```sql
CREATE TABLE events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER NOT NULL,
  agent_id       INTEGER REFERENCES agents(id),
  session_id     INTEGER REFERENCES sessions(id),
  terminal_id    INTEGER REFERENCES terminals(id),
  type           TEXT NOT NULL CHECK(type IN ('PreToolUse','PostToolUse','UserPromptSubmit','Stop','SubagentStop')),
  tool           TEXT,
  input_summary  TEXT,          -- truncado a 500 chars
  output_summary TEXT,          -- truncado a 500 chars
  duration_ms    INTEGER,
  raw_payload    TEXT,          -- truncado a 2000 chars
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Tabela `sessions` (subutilizada)
```sql
CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL,
  agent_id    INTEGER REFERENCES agents(id),
  terminal_id INTEGER REFERENCES terminals(id),
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT,
  event_count INTEGER DEFAULT 0,    -- incrementado em cada insertEvent
  status      TEXT DEFAULT 'active' CHECK(status IN ('active','completed','interrupted'))
);
```

**Nota:** A tabela `sessions` tem dados ricos e correctos mas não tem endpoint API dedicado. O frontend ignora-a completamente, reconstruindo a informação de sessão a partir dos eventos via `groupBySession()` — o que falha quando os eventos estão truncados pelo LIMIT.

---

*Documento gerado por Atlas (Analyst Agent) como base para decisão de Epic e priorização de stories.*
*— Atlas, investigando a verdade*
