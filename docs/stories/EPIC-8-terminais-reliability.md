# Epic 8 — Terminais: Deduplication, Session Matching & Operational Reliability

> **Status:** Approved — Ready for Story Drafting
> **Owner:** Morgan (PM) | **Discovery by:** Atlas (Analyst)
> **Created:** 2026-03-18
> **Reference:** `docs/Terminais.md` (full module documentation)

---

## 1. Problem Statement

O modulo Terminais e a **fonte operacional unica (source of truth)** de sessoes Claude Code no aiox-monitor. Alimenta directamente a aba Terminais (UI), a Empresa (sprites de agentes em workstations), Sessions, Events e o Ganga Ativo. O diagnostico do @analyst (docs/Terminais.md, secao 5) revelou **6 bugs e 4 gaps** que comprometem a integridade dos dados:

1. **Duplicados visíveis na UI** — system detection cria registos paralelos ao hook por divergência de PID
2. **Enrichment JSONL quebrado** — path conversion destrói nomes com hifen, impedindo `current_tool_detail` e `waiting_permission` de chegar ao terminal correcto
3. **Dados cruzados entre sessões** — PID recycling mantém dados stale, fallback por projecto enriquece terminal errado
4. **Terminais fantasma** — atribuição ao "primeiro projecto" quando title não faz match

Estes problemas degradam **todos os módulos downstream**: Empresa mostra sprites fantasma, Sessions ficam associadas a terminais errados, Events dispersam-se entre registos duplicados.

---

## 2. Vision & Goal

**Garantir correspondência 1:1 entre sessões Claude Code reais e registos na tabela `terminals`**, com enrichment JSONL fiável e dados observáveis — eliminando duplicados, dados cruzados, e fantasmas.

### Não é objectivo desta epic:
- Suporte multi-OS (Linux/Windows) — requer rewrite do terminal-detector
- Histórico de sessões por terminal (timeline view)
- Integração com metadados Claude Code (model, tokens, cost)
- Persistência de terminais após restart do servidor (by-design efémero)

---

## 3. Success Criteria

| ID | Critério | Métrica de Validação | Threshold |
|----|---------|---------------------|-----------|
| **SC-1** | Zero duplicados por sessão | `SELECT session_id, COUNT(*) c FROM terminals WHERE session_id IS NOT NULL GROUP BY session_id HAVING c > 1` retorna 0 rows | 0 duplicates |
| **SC-2** | JSONL enrichment funcional para projectos com hifen | Com Claude Code activo em projecto `aiox-monitor`: `current_tool_detail IS NOT NULL` quando tool em execução | 100% match |
| **SC-3** | Tool details no terminal correcto | Abrir 2 terminais Claude Code no mesmo projecto; cada card mostra a tool da sua sessão, não da outra | Manual verification |
| **SC-4** | Zero terminais em projectos errados | `SELECT t.id FROM terminals t JOIN projects p ON t.project_id=p.id` — todos com path coerente | 0 orphans |
| **SC-5** | Frontend sincronizado sem acumulação | Tab aberto 1h; `terminals.length` no React state = count na DB | Delta = 0 |
| **SC-6** | PID recycling não contamina | Fechar e reabrir Claude Code (mesmo PID possível); `first_seen_at` reseta | Reset confirmed |
| **SC-7** | Observabilidade disponível | Endpoint `/api/terminals/health` retorna `matchRate`, `orphanCount`, `enrichmentCoverage` | Endpoint 200 OK |

---

## 4. Scope — Stories Propostas

### Wave 1 — Critical Fixes (P0) — Parallel, sem dependências

| Story | Título | Ficheiros | Esforço | Bug Ref |
|-------|--------|----------|---------|---------|
| **8.1** | Fix hyphenated path conversion in JSONL watcher | `src/server/jsonl-watcher.ts` | XS | 5.1 |
| **8.2** | Eliminate "first project" fallback in syncSystemTerminals | `src/server/terminal-tracker.ts` | XS | 5.4 |

**Rationale Wave 1:** Estas duas correcções são triviais (< 20 linhas cada), sem risco de regressão, e desbloqueiam a Wave 2. Podem ser implementadas em paralelo.

### Wave 2 — Core Reliability (P1) — Sequencial parcial

| Story | Título | Ficheiros | Esforço | Bug Ref | Depende |
|-------|--------|----------|---------|---------|---------|
| **8.3** | Improve JSONL-to-terminal matching accuracy | `src/server/jsonl-watcher.ts` | S | 5.3 | 8.1 |
| **8.4** | Session-aware PID dedup in syncSystemTerminals | `src/server/terminal-tracker.ts`, `src/server/terminal-detector.ts` | M | 5.2 | — |
| **8.5** | Session-aware upsert with reset on session change | `src/lib/queries.ts` | S | 5.5 | — |

**Rationale Wave 2:** 8.3 depende de 8.1 (path fix) para que o matching funcione. 8.4 e 8.5 são independentes entre si e de 8.1/8.2, podem correr em paralelo com 8.3.

### Wave 3 — Polish & Confidence (P2)

| Story | Título | Ficheiros | Esforço | Gap Ref | Depende |
|-------|--------|----------|---------|---------|---------|
| **8.6** | Frontend terminal removal via WebSocket | `src/hooks/useTerminals.ts`, `src/server/terminal-tracker.ts`, `src/lib/types.ts` | S | 5.6 | — |
| **8.7** | Terminal health observability endpoint | `src/app/api/terminals/health/route.ts` (novo), `src/lib/queries.ts` | M | 5.10 | 8.1, 8.3 |
| **8.8** | Unit tests for terminal matching & lifecycle | `tests/terminal-*.test.ts` (novos) | M | 5.8 | 8.1–8.5 |

**Rationale Wave 3:** Solidificação. 8.6 é independente. 8.7 valida que SC-1 a SC-4 são verificáveis automaticamente. 8.8 congela o comportamento correcto em testes.

---

## 5. Execution Plan

```
Wave 1 (P0) ──────────────────────────────────
  8.1  Fix path conversion         [XS] ─────┐
  8.2  Remove first-project fallback [XS] ───┤
                                              │
Wave 2 (P1) ──────────────────────────────────┤
  8.3  JSONL matching accuracy     [S]  ◄─────┘ (depends on 8.1)
  8.4  Session-aware PID dedup     [M]  ─── parallel
  8.5  Session-aware upsert        [S]  ─── parallel
                                              │
Wave 3 (P2) ──────────────────────────────────┤
  8.6  Frontend WS removal         [S]  ─── parallel
  8.7  Health observability         [M]  ◄─── (depends on 8.1, 8.3)
  8.8  Unit tests                  [M]  ◄─── (depends on 8.1-8.5)
```

**Estimativa total:** 2 XS + 3 S + 3 M = ~5-7 sessões de desenvolvimento

---

## 6. Cross-Module Impact

| Módulo | Impacto Esperado | Risco de Regressão |
|--------|-----------------|-------------------|
| **Empresa (PhaserGame)** | Positivo — menos sprites fantasma, tool detail correcto, permission bubbles fiáveis | Baixo — consome `getAgentInstances()` que já filtra `inactive` |
| **Sessions** | Positivo — `terminal_id` correcto nas sessões | Nenhum — schema não muda |
| **Events** | Positivo — eventos associados ao terminal certo | Nenhum — schema não muda |
| **Lista** | Positivo — filtragem por terminal mais precisa | Nenhum |
| **Ganga Ativo** | Neutro — ganga_log.terminal_id fica mais fiável | Nenhum |
| **Hook Python** | Nenhum — hook não é alterado nesta epic | Zero |

---

## 7. Risk Assessment

| Risco | Prob. | Impacto | Mitigação |
|-------|-------|---------|-----------|
| Regressão no enrichment JSONL após fix de path | Média | Alto | 8.8 (testes) cobre cenários com/sem hifen |
| PGID check (8.4) é lento com muitos terminais | Baixa | Médio | Limitar a terminais activos; ps é O(1) por PID |
| `terminal:removed` WS (8.6) causa flash na UI | Baixa | Baixo | Debounce no frontend; remover apenas após confirmação |
| Claude Code muda formato JSONL | Média | Alto — fora do controlo | Parser defensivo; 8.8 inclui snapshot tests |
| Session-aware upsert (8.5) altera SQL complexo | Média | Médio | Testar com DB fixture antes/depois; rollback é trivial |

---

## 8. Story Summaries (para @sm draftar)

### 8.1 — Fix Hyphenated Path Conversion in JSONL Watcher
**Como** sistema, **quero** que `findTerminalByProjectDir` converta correctamente paths de projecto com hífens, **para que** o JSONL enrichment funcione para projectos como `aiox-monitor`.
- **Scope:** `jsonl-watcher.ts:findTerminalByProjectDir` — inverter a lógica: converter `projects.path` para formato Claude (`/a/b-c` → `-a-b--c`) em vez de converter formato Claude para path real.
- **AC principal:** Projecto `aiox-monitor` recebe `current_tool_detail` quando tools em execução.

### 8.2 — Eliminate "First Project" Fallback
**Como** sistema, **quero** que `syncSystemTerminals` ignore terminais sem match de projecto em vez de os atribuir ao primeiro projecto, **para que** não existam terminais fantasma.
- **Scope:** `terminal-tracker.ts:175` — `projects[0].id` → `continue`.
- **AC principal:** Terminais sem match verificável não aparecem na UI.

### 8.3 — Improve JSONL-to-Terminal Matching Accuracy
**Como** sistema, **quero** que o fallback de matching por project dir prefira terminais em status `processing`, **para que** tool details vão para o terminal que está realmente a executar.
- **Scope:** `jsonl-watcher.ts:findTerminalByProjectDir` — query `WHERE status = 'processing'` primeiro; fallback `WHERE status != 'inactive'`.
- **AC principal:** Com 2 terminais no mesmo projecto, cada um mostra a sua tool.

### 8.4 — Session-Aware PID Deduplication
**Como** sistema, **quero** que `syncSystemTerminals` verifique session_id e PGID antes de criar novos terminais, **para que** a mesma sessão Claude Code não gere registos duplicados.
- **Scope:** `terminal-tracker.ts:syncSystemTerminals` — check session_id existente + PGID do processo.
- **AC principal:** Uma sessão Claude Code = um registo na tabela terminals.

### 8.5 — Session-Aware Upsert (Reset on Session Change)
**Como** sistema, **quero** que `upsertTerminal` resete `first_seen_at`, `agent_name`, e tool fields quando `session_id` muda num conflito PID, **para que** PID recycling não contamine dados entre sessões.
- **Scope:** `queries.ts:upsertTerminal` — SQL `CASE WHEN excluded.session_id != session_id`.
- **AC principal:** Após restart de Claude Code no mesmo terminal, `first_seen_at` reflecte a nova sessão.

### 8.6 — Frontend Terminal Removal via WebSocket
**Como** utilizador, **quero** que terminais removidos/desactivados desapareçam da UI em tempo real, **para que** a lista não acumule fantasmas.
- **Scope:** Novo WS message type `terminal:removed`; broadcast em `cleanupStaleTerminals`; handler no `useTerminals.ts`.
- **AC principal:** Tab aberto 1h, contagem UI = contagem DB.

### 8.7 — Terminal Health Observability Endpoint
**Como** operador, **quero** um endpoint `/api/terminals/health` que reporte match rate, orphan count, e enrichment coverage, **para que** problemas de dados sejam detectáveis sem inspecção manual da DB.
- **Scope:** Novo route `src/app/api/terminals/health/route.ts`; queries de auditoria em `queries.ts`.
- **AC principal:** Endpoint retorna JSON com métricas; SC-1 a SC-4 verificáveis automaticamente.

### 8.8 — Unit Tests for Terminal Matching & Lifecycle
**Como** equipa, **quero** testes unitários para path conversion, PID dedup, session-aware upsert, e cleanup lifecycle, **para que** regressões sejam detectadas automaticamente.
- **Scope:** Novos ficheiros `tests/terminal-matching.test.ts`, `tests/terminal-lifecycle.test.ts`.
- **AC principal:** `npm test` cobre os 6 bugs corrigidos com assertions explícitas.

---

## 9. Delegation & Agent Assignment

| Story | Agent Executor | QA Gate | Notes |
|-------|---------------|---------|-------|
| 8.1 | @dev | @qa — verificar enrichment com projecto hifen | Trivial; pode agrupar com 8.2 num commit |
| 8.2 | @dev | @qa — verificar que terminais unknown não aparecem | 1 linha |
| 8.3 | @dev | @qa — teste com 2 terminais simultâneos | Depende de 8.1 |
| 8.4 | @dev | @qa — abrir/fechar Claude Code, contar registos | PGID logic precisa review do @architect se complexa |
| 8.5 | @dev | @qa — PID recycling scenario | SQL CASE testável com fixture |
| 8.6 | @dev | @qa — tab aberto com cleanup a correr | Frontend + backend |
| 8.7 | @dev | @qa — endpoint retorna métricas coerentes | Novo ficheiro |
| 8.8 | @qa (primary) + @dev | Self — testes validam a si mesmos | @qa lidera criação de test cases |

---

## 10. Definition of Done (Epic-level)

- [ ] Todas as 8 stories com status Done
- [ ] SC-1 a SC-7 verificados e documentados
- [ ] `docs/Terminais.md` actualizado com bugs marcados como resolvidos
- [ ] Zero bugs conhecidos abertos no módulo Terminais
- [ ] `npm run build` passa sem erros
- [ ] PR criado com changelog descritivo

---

*Epic 8 — Formalizada por Morgan (PM) com base no discovery de Atlas (Analyst)*
*Próximo passo: @sm draftar stories individuais a partir da secção 8*
