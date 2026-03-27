# Terminais — Module Documentation

> **Epic Proposal:** Terminais Reliability & Data Integrity
> **Autor:** Atlas (Analyst) | **Data:** 2026-03-18
> **Status:** Discovery Complete — Ready for Story Breakdown
> **Última actualização:** 2026-03-24 (adicionado Autopilot System)

---

## 1. Objective

O modulo **Terminais** e o sistema central de rastreamento de sessoes ativas do Claude Code dentro do aiox-monitor. Fornece visibilidade em tempo real sobre que terminais estao a executar, que ferramentas estao a ser usadas, que agentes estao ativos, e se existem pedidos de permissao pendentes.

**Terminais e a fonte de verdade (source of truth)** para:
- A aba Terminais na UI (grid de cards com status processing/active/inactive)
- O modulo Empresa (escritorio virtual pixel art) — cada terminal com agente gera um sprite de agente posicionado numa workstation
- O sistema de sessoes (sessions sao criadas/fechadas com base em terminais)
- Eventos (cada evento e associado a um terminal_id)

---

## 2. Architecture Overview

### 2.1 Data Sources — 3 Camadas

| Camada | Componente | Trigger | Responsabilidade |
|--------|-----------|---------|-----------------|
| **L1 — Hook** | `hooks/aiox-monitor-hook.py` | Cada evento Claude Code (PreToolUse, PostToolUse, UserPromptSubmit, Stop) | Fonte primaria: captura PID (`os.getppid()`), `CLAUDE_SESSION_ID`, agent name, tool name |
| **L2 — System Detection** | `terminal-detector.ts` + `syncSystemTerminals()` | Intervalo 30s | Fonte secundaria: detecta tabs iTerm2/Terminal.app via AppleScript, enriquece com PID via `ps grep claude`, cria terminais novos, desactiva mortos |
| **L3 — JSONL Watcher** | `jsonl-watcher.ts` + `transcript-parser.ts` | fs.watch + polling 1s | Enriquecimento: parse incremental de `~/.claude/projects/*/session.jsonl`, extrai tool_start/tool_done/turn_end, detecta permission waits (timeout 7s) |

### 2.2 Data Flow Completo

```
                    ┌─────────────────────────┐
                    │  Claude Code Session     │
                    │  (Terminal do utilizador)│
                    └─────┬─────────────┬──────┘
                          │             │
                    Hook (L1)     Writes JSONL
                    os.getppid()  ~/.claude/projects/<hash>/<session>.jsonl
                          │             │
                          v             v
              ┌───────────────┐  ┌──────────────────┐
              │ POST /api/    │  │ jsonl-watcher.ts  │
              │ events        │  │ (L3)              │
              └──────┬────────┘  └────────┬──────────┘
                     │                    │
                     v                    │ Match terminal:
              event-processor.ts          │ 1. session_id
              ├─ upsert project           │ 2. project_dir
              ├─ detect agent             │ 3. lsof (async)
              ├─ trackTerminal()          │
              └─ insert event             v
                     │            ┌──────────────────┐
                     │            │ Enrich terminal:  │
                     │            │ current_tool_detail│
                     │            │ waiting_permission │
                     │            └────────┬──────────┘
                     │                     │
                     v                     v
              ┌─────────────────────────────────┐
              │ SQLite: terminals table          │
              │ UNIQUE(project_id, pid)          │
              └──────────────┬──────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              v              v              v
        WebSocket       GET /api/     getAgentInstances()
        broadcast       terminals     (Empresa query)
        terminal:update              -(terminal.id) as agent
              │              │              │
              v              v              v
        useTerminals     TerminaisPage   PhaserGame
        (real-time)      (grid cards)    (pixel sprites)

    ─── Parallel (every 30s) ─────────────────────────
              │
    syncSystemTerminals() (L2)
    ├─ AppleScript: iTerm2 + Terminal.app windows/tabs
    ├─ enrichWithPids: ps -t TTY | grep claude → PID
    ├─ Update existing terminals (window title, reactivate)
    ├─ Create NEW terminals (for detected claude PIDs)
    └─ Deactivate terminals whose PIDs died

    ─── Parallel (every 15s) ─────────────────────────
              │
    cleanupStaleTerminals()
    ├─ processing → active (5min sem evento)
    ├─ active → inactive (15min sem actividade)
    └─ DELETE inactive > 1h + deduplicate PIDs

    ─── Parallel (every 3s) — Autopilot Engine ─────
              │
    autopilot-engine.ts tick()
    ├─ Query: autopilot=1 AND waiting_permission=1
    ├─ findSessionTty(pid) → walk process tree → TTY
    ├─ sendApprovalToSession(tty) → JXA → iTerm2 sess.write({text:'y'})
    ├─ DB: waiting_permission = 0
    ├─ insertAutopilotLog(action)
    └─ broadcast(terminal:update + autopilot:action)
```

### 2.3 Autopilot System

O sistema Autopilot permite aprovar automaticamente pedidos de permissão do Claude Code em terminais seleccionados. Funciona como um loop independente do event processing.

#### 2.3.1 Arquitectura

```
User toggle (TerminalCard)
  │
  ├─ Per-terminal: PATCH /api/terminals/{id}/autopilot {enabled: true}
  └─ Global:       PATCH /api/terminals/autopilot {enabled: true}
         │
         v
   setTerminalAutopilot(id, enabled) → DB update + WS broadcast
         │
         │    ┌─── Independently, every 3s ───────────────────┐
         │    │                                                │
         v    v                                                │
   autopilot-engine.ts tick()                                  │
   ├─ getAutopilotTerminals()                                  │
   │   WHERE autopilot=1 AND waiting_permission=1              │
   │   AND status != 'inactive'                                │
   ├─ Per terminal:                                            │
   │   ├─ Cooldown check (8s entre approvals)                  │
   │   ├─ findSessionTty(pid)                                  │
   │   │   ├─ Walk process tree: PID → parent → grandparent   │
   │   │   └─ Find iTerm2 session TTY                          │
   │   ├─ sendApprovalToSession(tty)                           │
   │   │   └─ JXA osascript: sess.write({text: 'y'})          │
   │   ├─ Clear waiting_permission = 0                         │
   │   ├─ insertAutopilotLog(action: 'permission_approve')     │
   │   └─ broadcast(terminal:update + autopilot:action)        │
   └─ Best-effort: nunca crash                                 │
                                                               │
   cleanupCooldowns() (every 60s) ────────────────────────────┘
```

#### 2.3.2 API Routes

| Method | Route | Descrição |
|--------|-------|-----------|
| `GET` | `/api/terminals/autopilot` | Summary: total, on, off, waiting, stats (24h) |
| `PATCH` | `/api/terminals/autopilot` | Toggle ALL terminais activos |
| `PATCH` | `/api/terminals/{id}/autopilot` | Toggle um terminal específico |
| `GET` | `/api/terminals/autopilot/log` | Logs recentes (default 50, max 200) + stats |

#### 2.3.3 DB: autopilot_log

```sql
CREATE TABLE IF NOT EXISTS autopilot_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  terminal_id    INTEGER NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  window_title   TEXT,
  agent_name     TEXT,
  action         TEXT NOT NULL,   -- 'permission_approve' | 'idle_skip' | 'error'
  detail         TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Indexes: idx_autopilot_log_created, idx_autopilot_log_terminal
```

#### 2.3.4 Constraints

| Parametro | Valor | Notas |
|-----------|-------|-------|
| Cycle interval | 3s | Tick do engine |
| Cooldown per terminal | 8s | Previne double-tapping |
| Cooldown cleanup | 60s | Remove entries expiradas |
| osascript timeout | 5s | JXA execution limit |
| PS timeout | 2s | Process tree walk limit |
| Scope | iTerm2 only | Usa JXA, nao funciona em Terminal.app |

#### 2.3.5 UI: TerminalCard Toggle

O `TerminalCard` renderiza um botão de toggle autopilot:
- **ON:** Badge verde com indicador pulsante
- **OFF:** Badge cinza
- **Toggling:** Estado de loading durante o PATCH
- Ao clicar: `PATCH /api/terminals/{id}/autopilot {enabled: !isOn}` → broadcast WS → UI actualiza

### 2.4 DB Schema

```sql
CREATE TABLE terminals (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pid                INTEGER NOT NULL,
  session_id         TEXT,
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK(status IN ('processing','active','inactive')),
  agent_name         TEXT,
  agent_display_name TEXT,
  current_tool       TEXT,
  current_input      TEXT,
  window_title       TEXT,
  current_tool_detail TEXT,
  waiting_permission INTEGER DEFAULT 0,
  autopilot          INTEGER NOT NULL DEFAULT 0,
  first_seen_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_active        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, pid)
);
```

### 2.5 Status Lifecycle

```
[Novo]  ──evento──►  processing  ──5min idle──►  active  ──15min idle──►  inactive  ──1h──►  [DELETE]
                        │                            │                        │
                        └───evento───►  processing ◄─┘                        │
                                                                              │
                        ◄──reactivate (syncSystem)──  still running  ◄────────┘
```

### 2.6 Key Files

| File | LOC | Responsibility |
|------|-----|---------------|
| `hooks/aiox-monitor-hook.py` | 222 | Hook Python: captura PID, session_id, agent, tool; POST /api/events |
| `src/server/event-processor.ts` | 177 | Processa eventos: upsert project + agent + terminal + session + event |
| `src/server/terminal-tracker.ts` | 203 | Core lifecycle: upsert, deactivate, cleanup, syncSystemTerminals |
| `src/server/terminal-detector.ts` | 166 | macOS AppleScript: iTerm2 + Terminal.app detection + PID enrichment |
| `src/server/jsonl-watcher.ts` | 419 | JSONL monitoring: incremental parse, terminal matching, permission detection |
| `src/server/transcript-parser.ts` | 189 | JSONL parser: tool_start/tool_done/turn_end extraction, tool status formatting |
| `src/lib/queries.ts` | 527 | DB queries: upsertTerminal, purge, getAgentInstances, etc. |
| `src/lib/schema.ts` | 157 | DDL: terminals table + migrations + indexes |
| `src/lib/types.ts` | 209 | TypeScript interfaces: Terminal, TerminalStatus, WsTerminalUpdate |
| `src/hooks/useTerminals.ts` | 72 | React hook: fetch + WebSocket real-time sync |
| `src/app/terminais/page.tsx` | 106 | UI: grid com 3 seccoes (processing, active, inactive) |
| `src/components/terminais/TerminalCard.tsx` | 153 | Card component: title, agent, tool detail, permission badge, metadata |
| `src/app/api/terminals/route.ts` | 54 | GET /api/terminals: retorna terminais filtrados por projecto, ordenados |
| `src/server/autopilot-engine.ts` | 225 | Autopilot engine: ciclo 3s, TTY resolution, JXA approval, cooldown, logging |
| `src/app/api/terminals/autopilot/route.ts` | 57 | GET summary + PATCH global toggle (todos terminais activos) |
| `src/app/api/terminals/[id]/autopilot/route.ts` | 35 | PATCH per-terminal toggle com broadcast WS |
| `src/app/api/terminals/autopilot/log/route.ts` | 17 | GET autopilot logs + stats (24h) |
| `server.ts` | ~130 | Scheduling: intervals para cleanup (15s), sync (30s), JSONL watcher (5s delay), autopilot engine |

---

## 3. Current Status — What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Hook capture (PID, session_id, agent, tool) | OK | Funciona correctamente via `os.getppid()` |
| Event processing + terminal upsert | OK | ON CONFLICT update funcional |
| WebSocket real-time broadcast | OK | terminal:update propagado correctamente |
| UI grid (3 seccoes por status) | OK | Layout responsivo, shimmer loading |
| TerminalCard visual | OK | Agent color, tool detail badge, permission indicator, timeago |
| System detection (iTerm2/Terminal.app) | Parcial | Detecta tabs, mas PID matching tem problemas (ver gaps) |
| JSONL watcher (tool enrichment) | Parcial | Funciona para tool parsing, mas terminal matching e fragil |
| Permission detection (7s timeout) | Parcial | Depende de terminal matching correcto |
| Cleanup lifecycle | OK | processing→active→inactive→delete funcional |
| Autopilot engine (per-terminal toggle) | OK | Engine 3s, JXA approval via iTerm2, cooldown 8s, logging |
| Autopilot API (global + per-terminal) | OK | PATCH toggle, GET summary/stats/logs |
| Autopilot UI (TerminalCard toggle) | OK | Toggle button com estados ON/OFF, loading state |
| Autopilot logging & stats | OK | autopilot_log table, stats 24h, max 200 logs via API |
| Empresa integration (getAgentInstances) | OK | Cada terminal activo com agente gera sprite |

---

## 4. Dependencies — Upstream & Downstream

### 4.1 Upstream (Terminais depende de)

| Dependency | Type | Risk |
|-----------|------|------|
| Claude Code Hook System | External | Se Claude Code mudar a API de hooks, o hook Python quebra |
| `CLAUDE_SESSION_ID` env var | External | Se nao definida, session matching falha |
| `os.getppid()` accuracy | OS | Retorna PID do processo pai; pode variar se hook e executado noutro contexto |
| `~/.claude/projects/` JSONL format | External | Formato nao documentado, pode mudar entre versoes do Claude Code |
| macOS AppleScript (iTerm2/Terminal.app) | OS | Requer permissoes de accessibilidade; nao funciona em Linux |
| SQLite (node:sqlite) | Runtime | Node.js built-in; funciona mas nao suporta concurrent writes |

### 4.2 Downstream (Dependem de Terminais)

| Consumer | Dependency | Impact se Terminais falha |
|----------|-----------|--------------------------|
| **Empresa (PhaserGame)** | `getAgentInstances()` — converte terminais em sprites | Escritorio vazio, sem agentes |
| **Sessions** | `createSession(projectId, agentId, terminalId)` | Sessoes sem terminal_id, sem associacao |
| **Events** | `insertEvent({terminal_id})` | Eventos orfaos, sem contexto de terminal |
| **Aba Lista** | Filtragem por terminal_id | Filtragem nao funciona |
| **Idle Detector** | Verifica last_active de agents (via terminals) | Transicoes de status incorrectas |
| **Ganga Ativo** | `terminal_id` em ganga_log | Logs sem associacao a terminal |

---

## 5. Gaps & Known Bugs

### 5.1 CRITICAL — BUG: Path Conversion Destroys Hyphenated Names

**Localização:** `src/server/jsonl-watcher.ts:75`

```typescript
const realPath = '/' + projectDirName.slice(1).replace(/-/g, '/');
```

O directorio JSONL `-Users-joaoramos-Desktop-aiox-monitor` e convertido para `/Users/joaoramos/Desktop/aiox/monitor` em vez de `/Users/joaoramos/Desktop/aiox-monitor`. Qualquer projecto com hifen no nome fica com matching quebrado.

**Impacto cascata:** JSONL enrichment (L3) falha → `current_tool_detail` e `waiting_permission` ficam orfaos → TerminalCard nao mostra tool detail → Empresa nao mostra tool status.

### 5.2 HIGH — BUG: System Detection Cria Duplicados

**Localização:** `src/server/terminal-tracker.ts:160-185`

`syncSystemTerminals()` detecta PIDs via `ps -t TTY | grep claude | head -1`. Este PID pode diferir do PID do hook (`os.getppid()`) — child processes, non-deterministic `head -1`. Resultado: dois registos DB para a mesma sessao Claude Code.

A constraint `UNIQUE(project_id, pid)` nao impede isto porque sao PIDs diferentes.

### 5.3 HIGH — BUG: JSONL Enrichment no Terminal Errado

**Localização:** `src/server/jsonl-watcher.ts:82-88`

Quando session_id matching falha (agravado por 5.1), o fallback `findTerminalByProjectDir` selecciona `ORDER BY last_active DESC LIMIT 1`. Com multiplos terminais para o mesmo projecto, tool details vao sempre para o terminal mais recente, nao para o que esta realmente a executar.

### 5.4 MEDIUM — BUG: Fallback "First Project"

**Localização:** `src/server/terminal-tracker.ts:175`

```typescript
projectId = matched?.id ?? projects[0].id;
```

Terminais detectados sem match de window title sao atribuidos ao primeiro projecto. Cria terminais fantasma.

### 5.5 MEDIUM — BUG: PID Recycling sem Session Awareness

**Localização:** `src/lib/queries.ts:203-232`

Quando o OS recicla um PID, `ON CONFLICT DO UPDATE` com `COALESCE` mantém dados stale (agent_name, first_seen_at) da sessao anterior se a nova nao envia esses campos.

### 5.6 LOW — BUG: Frontend Acumula Terminais

**Localização:** `src/hooks/useTerminals.ts:58-65`

WebSocket handler adiciona novos terminais ao state (`unshift`) mas nunca remove eliminados. A lista so e limpa num full refetch.

### 5.7 GAP — Sem Suporte Multi-OS

System detection (`terminal-detector.ts`) usa AppleScript — funciona apenas em macOS com iTerm2 ou Terminal.app. Linux e Windows nao sao suportados.

### 5.8 GAP — Sem Testes Automatizados

Nenhum dos ficheiros do modulo Terminais tem testes unitarios ou de integracao. A complexidade da logica de matching e lifecycle torna isto arriscado.

### 5.9 GAP — Terminal sem Identificador Unico Forte

A unicidade e baseada em `(project_id, pid)` — um identificador efemero. `session_id` seria mais robusto como chave de matching, mas nao e parte da UNIQUE constraint e nem sempre e disponivel (system detection nao o obtem).

### 5.10 GAP — Sem Metrica de Saude do Modulo

Nao ha como saber se o JSONL watcher esta matched correctamente, quantos terminais estao orfaos, ou qual a taxa de match do enrichment. Diagnosticar problemas requer inspecao manual da DB.

### 5.11 GAP — Autopilot Apenas iTerm2

O `autopilot-engine.ts` usa JXA (`osascript -l JavaScript`) para enviar keystrokes ao iTerm2. Terminal.app e outros emuladores nao sao suportados. Diferente do `terminal-detector.ts` que suporta ambos, o autopilot so funciona com iTerm2.

### 5.12 GAP — Autopilot Sem Selectividade de Permissao

O autopilot aprova cegamente qualquer pedido de permissao (`y`). Nao distingue entre operacoes de baixo risco (Read, Grep) e alto risco (Bash com rm, Write em ficheiros criticos). Uma whitelist/blacklist de tools permitiria controlo mais granular.

### 5.13 GAP — Autopilot Engine Desactivado no server.ts

O `server.ts` actual tem o autopilot engine comentado/desactivado com nota "handled by OpenClaw cron". O import existe mas o engine nao e iniciado automaticamente pelo servidor — requer activacao externa.

---

## 6. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Claude Code muda formato JSONL | Media | Alto — L3 inteiro quebra | Pin version, parser defensivo, testes com snapshots |
| Claude Code muda hook API | Baixa | Alto — L1 inteiro quebra | Hook e versionado, facil de adaptar |
| PID collision em scale (muitos terminais) | Media | Medio — duplicados confusos | Session-aware upsert |
| macOS recusa permissao AppleScript | Media | Baixo — L2 falha gracefully | L1 (hook) continua a funcionar |
| DB corruption (sqlite WAL + crash) | Baixa | Alto — dados perdidos | Backup periodico, schema resiliente |
| Performance: JSONL watcher com muitos ficheiros | Media | Medio — latencia | Ja tem filtro 1h; monitorar |
| Autopilot aprova operacoes destrutivas | Media | Alto — rm, force push, etc. | Tool whitelist/blacklist (gap 5.12) |
| Autopilot TTY mismatch (PID reciclado) | Baixa | Medio — aprovacao noutro terminal | Cooldown 8s mitiga parcialmente |
| Autopilot JXA falha silenciosamente | Baixa | Baixo — log de erro, nao crash | Logging funcional, best-effort |

---

## 7. Epic Proposal: Terminais Reliability & Data Integrity

### 7.1 Vision

Transformar o modulo Terminais num sistema robusto onde cada sessao Claude Code e rastreada com precision 1:1 — sem duplicados, sem dados cruzados, com enrichment JSONL fiavel e diagnosticos observaveis.

### 7.2 Success Criteria

| # | Criterio | Metrica |
|---|---------|---------|
| SC-1 | Zero terminais duplicados para a mesma sessao Claude Code | DB audit: COUNT por session_id = 1 |
| SC-2 | JSONL enrichment funciona para projectos com hifens no nome | `current_tool_detail` populated quando tools a correr |
| SC-3 | Tool details aparecem no terminal correcto | Manual: verificar que card X mostra tool de sessao X |
| SC-4 | Sem terminais fantasma em projectos errados | DB audit: todos terminais com project_id correcto |
| SC-5 | Frontend sincronizado em tempo real sem acumulacao | Tab aberto 1h, contagem = contagem da DB |
| SC-6 | PID recycling nao contamina dados entre sessoes | Restart Claude Code, verificar first_seen_at reset |
| SC-7 | Observabilidade: metricas de saude do modulo disponíveis | Endpoint ou log com match rate, orphan count |

### 7.3 Proposed Stories

| # | Story Title | Scope | Priority | Estimate | Dependencies |
|---|------------|-------|----------|----------|-------------|
| **S1** | Fix hyphenated path conversion in JSONL watcher | `jsonl-watcher.ts:findTerminalByProjectDir` — converter path→claudeFormat em vez de claudeFormat→path | P0 | XS | None |
| **S2** | Eliminate "first project" fallback in syncSystemTerminals | `terminal-tracker.ts:175` — skip em vez de `projects[0].id` | P0 | XS | None |
| **S3** | Improve JSONL-to-terminal matching accuracy | `jsonl-watcher.ts` — preferir terminal com status 'processing' no fallback; considerar cruzar com PID via lsof no match initial | P1 | S | S1 |
| **S4** | Session-aware PID deduplication in syncSystemTerminals | `terminal-tracker.ts` — antes de criar novo terminal, verificar session_id existente e/ou PGID match | P1 | M | None |
| **S5** | Session-aware upsert (reset on session change) | `queries.ts:upsertTerminal` — quando session_id muda, reset first_seen_at, agent_name, tool fields | P1 | S | None |
| **S6** | Frontend terminal removal via WebSocket | `useTerminals.ts` + `terminal-tracker.ts` — broadcast `terminal:removed`, handle no hook React | P2 | S | None |
| **S7** | Terminal health observability endpoint | Novo endpoint `/api/terminals/health` — match rate, orphan count, enrichment coverage | P2 | M | S1, S3 |
| **S8** | Unit tests for terminal matching & lifecycle | Testes para: path conversion, PID dedup, session-aware upsert, cleanup lifecycle | P2 | M | S1-S5 |

### 7.4 Execution Order Recomendado

```
Phase 1 — Quick Wins (P0)
  S1: Fix path conversion        [XS — 1 ficheiro, ~20 linhas]
  S2: Remove first-project fallback [XS — 1 linha]

Phase 2 — Core Reliability (P1)
  S3: JSONL matching accuracy     [S — depende de S1]
  S4: Session-aware PID dedup     [M — terminal-tracker.ts]
  S5: Session-aware upsert        [S — queries.ts]

Phase 3 — Polish & Confidence (P2)
  S6: Frontend WS removal         [S — hook + tracker]
  S7: Health observability         [M — novo endpoint]
  S8: Unit tests                  [M — test infra]
```

### 7.5 Out of Scope (para esta epic)

- Suporte multi-OS (Linux/Windows) — requer rewrite do terminal-detector
- Persistencia de terminais apos restart do servidor (e by-design efemero)
- Historico de sessoes por terminal (timeline view)
- Integracao com metadados de contexto do Claude Code (model, tokens, etc.)

---

## 8. Cross-Module Impact Analysis

### 8.1 Empresa

A correcao dos bugs de duplicados e matching vai **melhorar directamente** a Empresa:
- Menos sprites duplicados (bug 5.2 cria agentes fantasma)
- Tool detail correcto nos sprites (bug 5.1 + 5.3 impedem enrichment)
- Permission bubbles nos sprites correctos

### 8.2 Lista

A aba Lista usa `terminal_id` para filtrar eventos. Terminais duplicados causam dispersao de eventos entre registos — corrigir duplicados unifica a timeline.

### 8.3 Sessions

Sessoes sao criadas com `terminal_id`. Se o terminal duplicado e usado, a sessao fica associada ao registo errado. Correcoes em S4/S5 resolvem.

---

## 9. Technical Notes

### 9.1 Por Que PID como Chave

O hook Python usa `os.getppid()` — e o unico identificador estavel disponivel no momento da invocacao. `CLAUDE_SESSION_ID` existe mas:
- Nao e garantido em todas as invocacoes
- Nao e disponivel via system detection (L2)
- Pode mudar durante a mesma sessao de terminal (se o utilizador re-invoca Claude Code)

A solucao ideal seria `session_id` como chave primaria de matching, com PID como fallback. A Story S5 move nessa direcao.

### 9.2 JSONL Format (Undocumented)

O formato dos ficheiros `~/.claude/projects/<hash>/<session>.jsonl` nao e oficialmente documentado pelo Anthropic. O parser (`transcript-parser.ts`) foi construido por reverse-engineering e inspirado no projecto pixel-agents. Mudancas no Claude Code podem quebrar o parsing.

### 9.3 AppleScript Permissions

`terminal-detector.ts` usa `osascript -l JavaScript` para queries a iTerm2 e Terminal.app. Isto requer permissoes de automacao/accessibilidade em macOS. Se negadas, a deteccao falha silenciosamente (L2 degrada gracefully, L1 continua).

### 9.4 Concurrency

SQLite com WAL mode suporta concurrent reads mas single writer. O servidor usa `busy_timeout = 5000`. Com multiplos intervalos a escrever (cleanup, sync, JSONL watcher, autopilot engine), podem ocorrer busy waits. Nao e um problema actual mas pode ser com scale.

### 9.5 Autopilot — TTY Resolution

O `autopilot-engine.ts` precisa encontrar o TTY do iTerm2 session para enviar keystrokes. O Claude Code tipicamente corre dentro de `script` (que aloca um novo pty), por isso o PID do claude esta num TTY diferente do session do iTerm2. O engine caminha a process tree (PID → parent → grandparent) para encontrar o TTY original do session. Se todos os TTYs na arvore sao iguais, usa o proprio. Nao funciona em Terminal.app porque o JXA de aprovacao usa API especifica do iTerm2 (`sess.write({text: 'y'})`).

### 9.6 Autopilot — Cooldown Design

O cooldown de 8s por terminal previne double-tapping: se o permission wait e detectado pelo JSONL watcher e imediatamente processado pelo autopilot, o `waiting_permission` e limpo mas pode ser re-setado pelo proximo tick do JSONL watcher antes do Claude Code consumir a aprovacao. O cooldown garante que o engine nao envia "y" repetidamente. O mapa de cooldowns e limpo a cada 60s para evitar memory leaks.
