# Epic 10 — Kanban: Visibilidade Operacional Completa

> **Autor:** Morgan (PM Agent) | **Data:** 2026-03-18
> **Status:** Draft | **Origem:** Análise Atlas (Analyst) — `docs/Kanban.md` Rev 2.0
> **Módulo:** `/kanban` | **Branch alvo:** `main`

---

## 1. Contexto & Motivação

O módulo Kanban foi entregue na **Epic 2** (Stories 2.4, 2.5, 2.6) como monitor real-time de workforce AI. Todas as funcionalidades originais estão implementadas e funcionais (17 features completas).

Entretanto, a **Story 6.1** (JSONL transcript intelligence) adicionou ao backend dados operacionais críticos — `waiting_permission` e `current_tool_detail` — que **nunca foram expostos ao Kanban**. Estes dados existem na tabela `terminals`, mas o Kanban consome apenas a tabela `agents`, criando uma lacuna de visibilidade.

### Problema Central

O utilizador não consegue ver, a partir do Kanban:
1. **Se um agente está bloqueado** à espera de permissão (`waiting_permission`)
2. **O que o agente está a fazer em detalhe** ("Reading src/lib/db.ts" vs. genérico "Read")
3. **Quantos terminais** o agente tem activos simultaneamente
4. **Detalhes operacionais** sem navegar para outras abas (Lista, Terminais)

### Valor Estratégico

O Kanban é a vista de "command center" — se falha em mostrar informação operacional crítica, o utilizador perde tempo a navegar entre abas para obter contexto que deveria estar à vista.

---

## 2. Gaps Verificados (Confirmados por Código)

Apenas gaps **confirmados** pela verificação directa do código-fonte. Falsos positivos foram descartados.

| ID | Gap | Severidade | Root Cause Verificada | Dados Disponíveis? |
|----|-----|-----------|----------------------|-------------------|
| **G3** | `waiting_permission` invisível no Kanban | **CRITICAL** | `useAgents()` chama `/api/agents` SEM `expand=terminals`; `AgentCard.tsx` não renderiza o campo | SIM — `terminals.waiting_permission` |
| **G4** | `current_tool_detail` não exibido | **HIGH** | Mesmo root cause que G3; AgentCard mostra apenas `current_tool` genérico | SIM — `terminals.current_tool_detail` |
| **G2** | Sem detail panel on-click | **HIGH** | AgentCard é puramente apresentacional — zero handlers de click, zero modais | SIM — eventos, sessões, terminais na BD |
| **G5** | Multi-terminal sem indicação | **MEDIUM** | `getAgents()` retorna `terminal_count` mas AgentCard ignora o campo; WS default é `terminal_count: 0` | SIM — `terminal_count` no query |
| **T4** | Zero testes unitários | **MEDIUM** | Nenhum ficheiro `*.test.*` ou `*.spec.*` em `src/components/kanban/` ou para `useKanban` | N/A |

### Gaps Descartados

| ID | Gap | Motivo da Exclusão |
|----|-----|-------------------|
| G1 | Sem drag & drop | **Intencional** — monitor, não task board |
| G6 | `ProjectColumn.tsx` órfão | **Dead code por refactoring**, não gap funcional — cleanup técnico menor |
| G7 | Sem timestamps relativos | **Nice-to-have**, não gap real — informação de status já existe via dots |
| G8 | Sem filtro por status | **Nice-to-have** — filtro por projecto já existe |
| T5 | 12h threshold hardcoded | **Intencional** — lógica de negócio válida, não configuração em falta |
| T2/T3 | Throttle WS / Flash best-effort | **Performance adequada** para o volume actual (<50 agentes) |

---

## 3. Decisão Arquitectural: Bridge terminals → Kanban

Os gaps G3 e G4 partilham o mesmo root cause: o Kanban não acede a dados de terminal.

| Opção | Abordagem | Esforço | Real-time? | Backend Change? |
|-------|-----------|---------|-----------|----------------|
| **A** | `useAgents()` usa `expand=terminals` | Baixo | Apenas no fetch (não WS) | Nenhum |
| **B** | Enriquecer `agent:update` WS com campos de terminal | Médio | Sim | `agent-tracker.ts` |
| **C** | Novo endpoint `/api/agents/kanban` | Alto | Apenas no fetch | Novo route |

**Decisão PM:** **Opção B** (enriquecer WS) como implementação principal, com **Opção A** como fallback imediato para o fetch inicial. Justificação:
- O valor do `waiting_permission` é máximo em **real-time** — não adianta ver com delay de refetch
- Adicionar 2 campos ao payload `agent:update` é minimamente invasivo
- O fetch com `expand=terminals` serve de fallback para o estado inicial (antes do primeiro WS update)

---

## 4. Scope da Epic

### In Scope

| Item | Justificação |
|------|-------------|
| Badge `waiting_permission` pulsante nos cards | Gap G3 — informação crítica invisível |
| `current_tool_detail` nos cards working | Gap G4 — detalhe operacional disponível mas oculto |
| Enriquecimento do WS `agent:update` com dados de terminal | Decisão arquitectural — bridge necessário |
| Detail panel on-click com eventos + sessão + terminal | Gap G2 — contexto operacional sem trocar de aba |
| Badge multi-terminal com count | Gap G5 — visibilidade de instâncias paralelas |
| Testes unitários dos componentes Kanban | Gap T4 — zero cobertura actual |
| Remoção de `ProjectColumn.tsx` | Cleanup técnico — dead code |

### Out of Scope

| Item | Motivo |
|------|--------|
| Drag & drop / task management | Não é o propósito do módulo |
| Controlo remoto de agentes (start/stop/kill) | Feature separada, requer nova infra |
| Notificações push/desktop | Epic separada |
| Gráficos de performance / analytics | Epic separada |
| Timestamps relativos ("há X min") | Nice-to-have, pode entrar como melhoria futura |
| Filtros por status / configuração do limiar 12h | Nice-to-have, não resolve gaps reais |
| Reestruturação do backend | Fora de scope — apenas enriquecimento pontual |

---

## 5. Critérios de Sucesso

| # | Critério | Métrica | Tipo |
|---|----------|---------|------|
| S1 | `waiting_permission` visível em real-time | Badge pulsante aparece em <2s após terminal entrar em estado de permissão | MUST |
| S2 | Tool detail enriquecido | Card working mostra `current_tool_detail` quando disponível (ex: "Reading src/lib/db.ts") | MUST |
| S3 | Detail panel funcional | Click em agente mostra eventos recentes + sessão activa + terminal | SHOULD |
| S4 | Multi-terminal visível | Badge com count >1 quando agente tem múltiplos terminais activos | SHOULD |
| S5 | Cobertura de testes | ≥80% de cobertura nos componentes Kanban (AgentCard, ProjectRow, useKanban) | SHOULD |
| S6 | Performance mantida | Tempo de render < 100ms com 50 agentes simultâneos | MUST |
| S7 | Zero dead code | `ProjectColumn.tsx` removido; nenhum import órfão | NICE |

---

## 6. Stories Propostas

### Story 10.1 — Terminal Data Bridge + Permission Badge + Tool Detail
**Prioridade:** CRITICAL | **Size:** M
**Resolve:** G3 + G4 (root cause comum)

**Scope:**
1. Enriquecer `agent:update` WS com `waiting_permission` e `current_tool_detail` do terminal mais recente (`agent-tracker.ts`)
2. Usar `expand=terminals` no fetch inicial do `useAgents()` como fallback
3. Actualizar interface `Agent` com campos opcionais `waiting_permission` e `current_tool_detail`
4. Adicionar badge pulsante (vermelho/amber) no `AgentCard` quando `waiting_permission === 1`
5. Substituir display de `current_tool` por `current_tool_detail` quando disponível
6. Manter fallback para `current_tool` quando `current_tool_detail` é null

**ACs:**
- [ ] Badge `waiting_permission` visível em variante `chip` e `card`
- [ ] `current_tool_detail` exibido no card working (fallback para `current_tool`)
- [ ] WS `agent:update` inclui `waiting_permission` e `current_tool_detail`
- [ ] Fetch inicial usa `expand=terminals` para estado completo
- [ ] Performance: render < 100ms com 30 agentes

**Ficheiros impactados:**
- `src/server/agent-tracker.ts` (enriquecer broadcast)
- `src/hooks/useAgents.ts` (expand=terminals no fetch)
- `src/components/kanban/AgentCard.tsx` (badge + tool detail)
- `src/lib/types.ts` (Agent interface)

---

### Story 10.2 — Agent Detail Panel
**Prioridade:** HIGH | **Size:** M
**Resolve:** G2

**Scope:**
1. Criar componente `AgentDetailPanel.tsx` (side panel ou slide-over)
2. Click em `AgentCard` abre o panel com dados do agente
3. Exibir: eventos recentes (últimos 10), sessão activa (duração, event count), terminal (PID, window title, status), tool history
4. Dados via composição de endpoints existentes (`/api/agents/[id]` + events)
5. Fechar com ESC ou click fora

**ACs:**
- [ ] Click em AgentCard (chip ou card) abre side panel
- [ ] Panel mostra eventos recentes do agente (últimos 10)
- [ ] Panel mostra sessão activa com duração e event count
- [ ] Panel mostra terminal associado (PID, window title)
- [ ] Panel fecha com ESC, click fora, ou botão close
- [ ] Panel actualiza em real-time via WS

**Ficheiros impactados:**
- `src/components/kanban/AgentDetailPanel.tsx` (NOVO)
- `src/components/kanban/AgentCard.tsx` (onClick handler)
- `src/app/kanban/page.tsx` (state do panel)

---

### Story 10.3 — Multi-Terminal Badge
**Prioridade:** MEDIUM | **Size:** S
**Resolve:** G5

**Scope:**
1. Exibir badge com `terminal_count` no AgentCard quando > 1
2. Corrigir `terminal_count: 0` hardcoded no WS update handler do `useAgents()`
3. Tooltip no badge mostrando "X terminais activos"

**ACs:**
- [ ] Badge numérico visível quando `terminal_count > 1`
- [ ] Badge ausente quando `terminal_count <= 1`
- [ ] WS updates preservam `terminal_count` do fetch (não resetam para 0)
- [ ] Tooltip com texto "X terminais activos"

**Ficheiros impactados:**
- `src/components/kanban/AgentCard.tsx` (badge)
- `src/hooks/useAgents.ts` (fix WS merge)

---

### Story 10.4 — Testes & Cleanup
**Prioridade:** LOW | **Size:** M
**Resolve:** T4 + dead code

**Scope:**
1. Remover `ProjectColumn.tsx`
2. Testes unitários para `AgentCard` (variantes chip/card, badge permission, flash)
3. Testes unitários para `ProjectRow` (categorização de agentes)
4. Testes para `useKanban` (agregação, filtragem, WS merge)
5. Extrair `AGENT_COLORS` e `TWELVE_HOURS_MS` para `src/lib/constants.ts`

**ACs:**
- [ ] `ProjectColumn.tsx` removido sem quebrar imports
- [ ] ≥80% cobertura em `AgentCard.tsx`
- [ ] ≥80% cobertura em `ProjectRow.tsx`
- [ ] Testes para `useKanban` (happy path + edge cases)
- [ ] Constantes extraídas para `src/lib/constants.ts`

**Ficheiros impactados:**
- `src/components/kanban/ProjectColumn.tsx` (REMOVER)
- `src/components/kanban/__tests__/AgentCard.test.tsx` (NOVO)
- `src/components/kanban/__tests__/ProjectRow.test.tsx` (NOVO)
- `src/hooks/__tests__/useKanban.test.ts` (NOVO)
- `src/lib/constants.ts` (NOVO ou existente)

---

## 7. Sequência de Implementação

```
Wave 1 — CRITICAL (desbloqueador):
  10.1 Terminal Data Bridge + Permission Badge + Tool Detail

Wave 2 — HIGH (valor incremental):
  10.2 Agent Detail Panel
  10.3 Multi-Terminal Badge  ←── parallelizável com 10.2

Wave 3 — LOW (qualidade):
  10.4 Testes & Cleanup
```

### Dependências entre Stories

```
10.1 ──→ 10.2 (detail panel precisa dos dados enriched da 10.1)
10.1 ──→ 10.3 (badge precisa do fix de terminal_count da 10.1)
10.1 ──→ 10.4 (testes cobrem funcionalidades das stories anteriores)
         10.2 ─┐
         10.3 ─┤──→ 10.4 (testes cobrem tudo)
               │
```

**Story 10.1 é o desbloqueador** — todas as outras dependem do bridge `terminals → agents` que ela implementa.

---

## 8. Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|-------|-------|---------|-----------|
| R1 | Enriquecimento do WS `agent:update` pode aumentar payload e afectar performance | Baixa | Médio | Apenas 2 campos adicionais (string + boolean); monitorar tamanho do payload |
| R2 | Detail panel pode introduzir N+1 queries no click | Média | Médio | Usar batch endpoint ou composição eficiente; lazy loading |
| R3 | `terminal_count` inconsistente entre fetch e WS | Média | Baixo | Story 10.3 corrige o handler; testes validam |
| R4 | Remoção de `ProjectColumn.tsx` pode quebrar referências não detectadas | Baixa | Baixo | Grep completo antes de remover; validar build |

---

## 9. Agentes Envolvidos

| Story | Dev | QA | Architect |
|-------|-----|----|-----------|
| 10.1 | @dev (backend + frontend) | @qa (validar WS enrichment + badge) | @architect (validar decisão bridge) |
| 10.2 | @dev (frontend) | @qa (validar UX do panel) | — |
| 10.3 | @dev (frontend) | @qa (validar badge) | — |
| 10.4 | @dev (testes) | @qa (validar cobertura) | — |

---

## 10. Métricas de Acompanhamento

| Métrica | Baseline (hoje) | Target |
|---------|-----------------|--------|
| Campos de terminal visíveis no Kanban | 0 | 3 (`waiting_permission`, `current_tool_detail`, `terminal_count`) |
| Componentes com >0% test coverage | 0/3 | 3/3 |
| Dead code files no módulo Kanban | 1 (`ProjectColumn.tsx`) | 0 |
| Clicks necessários para ver detalhes de agente | N/A (impossível) | 1 |

---

*Epic formalizada por Morgan (PM Agent) com base na análise de Atlas (Analyst Agent).*
*Todos os gaps foram verificados contra o código-fonte — apenas gaps confirmados foram incluídos.*

— Morgan, planejando o futuro 📊
