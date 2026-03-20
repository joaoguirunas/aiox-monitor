# Epic 9 — Lista 2.0: Reflexo Completo do Banco

> **Autor:** Morgan (PM Agent) | **Data:** 2026-03-18
> **Baseado em:** Análise de Atlas (Analyst) — `docs/Lista.md`
> **Status:** Approved for Development

---

## 1. Problema

A aba Lista (`/lista`) exibe apenas **13% do histórico** (3 de 23 sessões) devido a um `LIMIT 200` sobre eventos individuais. Sessões com muitos tool calls (>100 eventos) consomem todo o budget, tornando o resto do histórico invisível. O agrupamento por sessão opera sobre dados truncados, produzindo grupos incompletos (sem prompt, sem resposta, tools parciais).

**Impacto direto:** O utilizador perde visibilidade sobre a atividade passada dos agentes e toma decisões baseado em dados incompletos.

**Dados reais (2026-03-18):**
- 522 eventos, 23 sessões no banco
- 200 eventos carregados → apenas 3 sessões visíveis
- Sessão 739: 162 eventos, apenas 38 carregados (truncada)
- 20 sessões completamente invisíveis

## 2. Visão

A Lista deve ser o **audit log fidedigno** do sistema — cada evento e cada sessão registada no banco deve ser acessível e navegável. O agrupamento por sessão deve funcionar sobre dados completos, usando a tabela `sessions` (já existente) como fonte de verdade.

## 3. Princípios de Design

| # | Princípio | Rationale |
|---|-----------|-----------|
| P1 | **Banco = Verdade** | Cada evento no DB = cada evento acessível na UI |
| P2 | **Sessão como unidade** | A vista agrupada pagina por sessões, não por eventos |
| P3 | **Lazy loading** | Eventos de uma sessão carregam on-demand (ao expandir/clicar) |
| P4 | **Zero data loss** | Nenhum dado é colapsado, deduplicado ou escondido |
| P5 | **Real-time preservado** | WebSocket continua a funcionar para novos eventos |

## 4. Escopo

### In Scope

- Endpoint dedicado `/api/sessions` com agregação server-side
- Paginação real para sessões e eventos individuais
- Agrupamento por sessão correcto e completo
- Carregamento on-demand de eventos por sessão
- Contadores fiéis (totais reais do banco)
- Busca textual server-side
- Filtro por período temporal
- Duração de sessão visível

### Out of Scope

- Replay/re-execução de comandos
- Gráficos/charts de performance
- Notificações push/desktop
- Controlo remoto de agentes
- Reestruturação do pipeline de ingestão (event-processor.ts permanece inalterado)

## 5. Critérios de Sucesso

| # | Critério | Métrica | Verificação |
|---|----------|---------|-------------|
| S1 | Histórico completo | 100% das sessões navegáveis via paginação | Query: `SELECT COUNT(*) FROM sessions` = total visível na UI |
| S2 | Agrupamento íntegro | Sessões nunca truncadas | Sessão com N eventos mostra N eventos no drawer |
| S3 | Performance | Render < 200ms por página de 20 sessões | Chrome DevTools Performance tab |
| S4 | Contadores fiéis | "X de Y sessões" com Y = total real | Comparar UI vs. `SELECT COUNT(*)` |
| S5 | Busca funcional | Resultados em < 500ms para queries de texto | Cronómetro na UI |
| S6 | WebSocket intacto | Novos eventos aparecem em < 1s | Teste manual: enviar evento, verificar lista |

## 6. Stories — Priorização e Sequência

### Wave 1: Fundação (CRITICAL — resolve o problema imediato)

#### Story 9.1 — API de Sessões + Paginação Server-Side
**Prioridade:** P0 — CRITICAL
**Estimativa:** M (backend puro, sem UI)
**Depende de:** nenhuma
**Agente:** @dev (backend) + @data-engineer (query optimization)

**Scope:**
Criar endpoint `GET /api/sessions` que query a tabela `sessions` com dados agregados via SQL, e `GET /api/sessions/:id/events` para carregar eventos on-demand.

**Acceptance Criteria:**
- [ ] **AC1** — `getSessions(filters)` em `queries.ts` retorna sessões com: `id`, `project_id`, `agent_id`, `terminal_id`, `started_at`, `ended_at`, `event_count`, `status`, `prompt` (subquery do 1o `UserPromptSubmit`), `response` (subquery do último `Stop`/`SubagentStop`), `tool_count` (COUNT de `PreToolUse`), `tools` (GROUP_CONCAT de tools distintos)
- [ ] **AC2** — `getSessionEvents(sessionId)` em `queries.ts` retorna todos os eventos de uma sessão sem LIMIT, ordenados por `id ASC`
- [ ] **AC3** — `GET /api/sessions?project_id=X&agent_id=Y&limit=20&offset=0` retorna `{ sessions, total, hasMore }`
- [ ] **AC4** — `GET /api/sessions/:id/events` retorna `{ events }` (todos os eventos da sessão)
- [ ] **AC5** — Filtros suportados: `project_id`, `agent_id`, `terminal_id`, `status` (`active`/`completed`), `since`, `until`
- [ ] **AC6** — Tipo `SessionFilters` e `SessionWithSummary` adicionados a `types.ts`
- [ ] **AC7** — Sessões ordenadas por `started_at DESC` (mais recentes primeiro)

**Notas técnicas:**
- A tabela `sessions` já existe com 23 registos, `event_count` incrementado automaticamente
- Subqueries são preferíveis a JOINs para manter simplicidade e evitar duplicação de rows
- Index `idx_events_session` (se não existir) deve ser criado para performance

---

#### Story 9.2 — Vista de Sessões com Dados Completos
**Prioridade:** P0 — CRITICAL
**Estimativa:** L (refactor do frontend principal)
**Depende de:** 9.1
**Agente:** @dev (frontend)

**Scope:**
Refactoring da vista summary em `page.tsx` para usar `/api/sessions` em vez de `groupBySession(events)`. A vista summary passa a ser alimentada diretamente por sessões do banco, com paginação real e carregamento on-demand de eventos.

**Acceptance Criteria:**
- [ ] **AC1** — Novo hook `useSessions(filters)` em `src/hooks/useSessions.ts` que fetch de `/api/sessions`
- [ ] **AC2** — `useSessions` suporta WebSocket: ao receber `event:new`, incrementa contadores da sessão ativa ou refetch se nova sessão
- [ ] **AC3** — Vista summary usa `useSessions()` em vez de `useEvents()` + `groupBySession()`
- [ ] **AC4** — `SessionTable` renderiza dados de `SessionWithSummary` (do endpoint) em vez de `SessionGroup` (calculado client-side)
- [ ] **AC5** — Botão "Carregar mais" no fundo da tabela quando `hasMore === true`
- [ ] **AC6** — Click numa sessão chama `GET /api/sessions/:id/events` e renderiza no `SessionDetail`
- [ ] **AC7** — Loading state no drawer enquanto eventos carregam
- [ ] **AC8** — Contador: "X de Y sessões" com Y = total real do banco
- [ ] **AC9** — `groupBySession()` mantido como fallback (não removido) para compatibilidade
- [ ] **AC10** — Página de sessões carrega em blocos de 20, com scroll preservado ao carregar mais

**Decisão de design:** Manter `groupBySession()` disponível mas não como path principal. O path principal é agora server-side via `/api/sessions`.

---

### Wave 2: Completude (HIGH — garante reflexo completo)

#### Story 9.3 — Paginação de Eventos Individuais
**Prioridade:** P1 — HIGH
**Estimativa:** M
**Depende de:** 9.1 (reutiliza padrão de paginação)
**Agente:** @dev

**Scope:**
As vistas "all" e por tipo de evento (UserPromptSubmit, Stop, PreToolUse, PostToolUse) passam a ter paginação real com "Carregar mais".

**Acceptance Criteria:**
- [ ] **AC1** — `useEvents` aceita paginação incremental: ao carregar mais, faz fetch com `offset` e concatena
- [ ] **AC2** — Remoção do `{ limit: 200 }` hardcoded em `page.tsx:20`
- [ ] **AC3** — Vista "all" carrega em blocos de 50, com "Carregar mais"
- [ ] **AC4** — Vistas filtradas por tipo paginam igualmente
- [ ] **AC5** — Contador: "X de Y eventos" com Y = total real do banco
- [ ] **AC6** — WebSocket continua a prepend novos eventos em real-time
- [ ] **AC7** — Performance: render < 150ms ao carregar mais 50 eventos

---

#### Story 9.4 — Contadores Fiéis e Indicadores de Completude
**Prioridade:** P1 — HIGH
**Estimativa:** S
**Depende de:** 9.2, 9.3
**Agente:** @dev

**Scope:**
Corrigir todos os contadores para mostrar totais reais e adicionar indicadores quando dados são paginados.

**Acceptance Criteria:**
- [ ] **AC1** — Vista summary: "X sessões de Y total" (Y = total de sessões no banco para os filtros ativos)
- [ ] **AC2** — Vista eventos: "X eventos carregados de Y total"
- [ ] **AC3** — Indicador visual quando há mais dados (ex: "Mostrando 20 de 23 — carregar mais")
- [ ] **AC4** — Indicador de retenção: "Dados retidos: 30 dias" (lido de `company_config.event_retention_days`)

---

### Wave 3: Enriquecimento (MEDIUM — melhora a experiência)

#### Story 9.5 — Busca Textual Server-Side
**Prioridade:** P2 — MEDIUM
**Estimativa:** M
**Depende de:** 9.1
**Agente:** @dev

**Scope:**
Adicionar busca textual na FilterBar que pesquisa `input_summary` e `output_summary` via query SQL.

**Acceptance Criteria:**
- [ ] **AC1** — Campo de busca na `FilterBar` com debounce de 300ms
- [ ] **AC2** — Parâmetro `search` adicionado a `getEvents()` e `getSessions()`: `WHERE input_summary LIKE ? OR output_summary LIKE ?`
- [ ] **AC3** — Busca funciona em ambas as vistas (sessões e eventos)
- [ ] **AC4** — Resultados paginados normalmente
- [ ] **AC5** — Placeholder: "Pesquisar prompts, respostas, tools..."
- [ ] **AC6** — Clear button para limpar busca

---

#### Story 9.6 — Filtro por Período + Duração de Sessão
**Prioridade:** P2 — MEDIUM
**Estimativa:** M
**Depende de:** 9.2
**Agente:** @dev

**Scope:**
Date range picker e exibição de duração das sessões.

**Acceptance Criteria:**
- [ ] **AC1** — Filtros "Desde" e "Até" na FilterBar (inputs type=datetime-local ou similar)
- [ ] **AC2** — Parâmetros `since` e `until` propagados para ambos endpoints
- [ ] **AC3** — `SessionRow` mostra duração calculada (`ended_at - started_at`), ex: "2m 34s", "1h 12m"
- [ ] **AC4** — Sessões ativas mostram duração desde `started_at` até agora (live)
- [ ] **AC5** — `SessionDetail` mostra timestamps de início e fim

---

### Wave 4: Polish (LOW — qualidade e robustez)

#### Story 9.7 — Testes, Cleanup & Export
**Prioridade:** P3 — LOW
**Estimativa:** M
**Depende de:** 9.2, 9.3
**Agente:** @qa (testes) + @dev (export)

**Scope:**
Testes unitários dos componentes core, fix do status `interrupted`, e export básico.

**Acceptance Criteria:**
- [ ] **AC1** — Testes para `getSessions()` e `getSessionEvents()` (queries)
- [ ] **AC2** — Testes para `useSessions` hook (mock fetch + WS)
- [ ] **AC3** — Testes para `groupBySession()` (edge cases: sessão vazia, orphans, sessão sem stop)
- [ ] **AC4** — Status `interrupted` atribuído a sessões ativas sem eventos há > 1h
- [ ] **AC5** — Botão de export JSON dos eventos visíveis (download file)
- [ ] **AC6** — Cobertura ≥ 80% nos componentes novos/modificados

---

## 7. Dependency Graph

```
                    Wave 1 (CRITICAL)
                    ┌─────────────┐
                    │  Story 9.1  │  API /sessions + queries
                    │  (backend)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            │            ▼
     ┌─────────────┐      │   ┌─────────────┐
     │  Story 9.2  │      │   │  Story 9.3  │   Wave 2 (HIGH)
     │  (sessions  │      │   │  (eventos   │
     │   frontend) │      │   │  paginação) │
     └──────┬──────┘      │   └──────┬──────┘
            │             │          │
            ▼             │          ▼
     ┌─────────────┐      │   ┌─────────────┐
     │  Story 9.4  │◄─────┘   │  Story 9.5  │   Wave 3 (MEDIUM)
     │ (contadores)│          │  (busca)     │
     └──────┬──────┘          └─────────────┘
            │                        │
            ▼                        ▼
     ┌─────────────┐          ┌─────────────┐
     │  Story 9.6  │          │  Story 9.7  │   Wave 4 (LOW)
     │ (período +  │          │ (testes +   │
     │  duração)   │          │  export)    │
     └─────────────┘          └─────────────┘
```

## 8. Execution Strategy

### Paralelismo

| Wave | Stories | Podem correr em paralelo? |
|------|---------|--------------------------|
| 1 | 9.1 | Sozinha (foundation) |
| 1→2 | 9.2, 9.3 | Sim — 9.2 (sessions frontend) e 9.3 (events pagination) são independentes após 9.1 |
| 2→3 | 9.4, 9.5, 9.6 | 9.5 pode correr em paralelo com 9.4+9.6 |
| 4 | 9.7 | Corre em paralelo com Wave 3 |

### Recomendação de execução

```
Dia 1:  9.1 (backend API)
Dia 2:  9.2 + 9.3 em paralelo
Dia 3:  9.4 + 9.5 em paralelo
Dia 4:  9.6 + 9.7 em paralelo
```

**Critical path:** 9.1 → 9.2 → 9.4 (resolve o problema completo em 3 stories sequenciais)

### Definition of Done (per story)

- [ ] Todos os ACs verificados
- [ ] `npm run build` passa sem erros
- [ ] `npm run lint` passa sem warnings
- [ ] Testes relevantes passam
- [ ] Story `.md` atualizada com checkboxes e File List
- [ ] WebSocket real-time funcional (teste manual)

## 9. Riscos e Mitigações

| # | Risco | Prob. | Impacto | Mitigação |
|---|-------|-------|---------|-----------|
| R1 | Subqueries de sessão lentas com muitos eventos | Média | Alto | Index em `events(session_id, type)` + EXPLAIN QUERY PLAN em 9.1 |
| R2 | Refactor de `page.tsx` quebra vista de eventos | Média | Médio | Manter `useEvents()` intacto, `useSessions()` é aditivo (9.2 AC9) |
| R3 | WebSocket events perdem-se durante paginação | Baixa | Alto | `useSessions` reconcilia WS com estado paginado (9.2 AC2) |
| R4 | SQLite LIKE sem FTS é lento para busca textual | Média | Médio | Aceitável para volumes atuais (<10k eventos), FTS5 como evolução futura |

## 10. Quality Gates

| Gate | Story | Validação |
|------|-------|-----------|
| Backend API | 9.1 | `curl` retorna sessões completas com totais correctos |
| Frontend reflexo | 9.2 | UI mostra 23/23 sessões (100% visível) |
| Zero data loss | 9.4 | Contadores = `SELECT COUNT(*)` |
| Search works | 9.5 | Busca por prompt existente retorna resultado |
| Full coverage | 9.7 | ≥80% coverage nos módulos novos |

---

## 11. Atualização do context.md

Após conclusão da Wave 1, adicionar ao `docs/context.md`:

```markdown
### Fase 9 — Lista 2.0: Reflexo Completo do Banco (EM PROGRESSO)

| Story | Título | Status | Depende |
|-------|--------|--------|---------|
| 9.1 | API de Sessões + Paginação Server-Side | Draft | 6.1 |
| 9.2 | Vista de Sessões com Dados Completos | Draft | 9.1 |
| 9.3 | Paginação de Eventos Individuais | Draft | 9.1 |
| 9.4 | Contadores Fiéis e Indicadores de Completude | Draft | 9.2, 9.3 |
| 9.5 | Busca Textual Server-Side | Draft | 9.1 |
| 9.6 | Filtro por Período + Duração de Sessão | Draft | 9.2 |
| 9.7 | Testes, Cleanup & Export | Draft | 9.2, 9.3 |
```

---

*Epic formalizada por Morgan (PM Agent) com base na análise de Atlas (Analyst Agent).*
*Próximo passo: @sm para draftar as stories individuais em `docs/stories/9.X.story.md`*
*— Morgan, planejando o futuro 📊*
