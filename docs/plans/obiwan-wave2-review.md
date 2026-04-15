# Obi-Wan — Wave 2 Architecture Review
**Job:** JOB-039  
**Reviewer:** Obi-Wan (Architecture)  
**Date:** 2026-04-14  
**Commits revisados:** d5010d8 (Han Solo — 9.1b/9.1c), 28f4a35 (R2-D2 — migration 002)  
**Referência:** master plan §2.5, §3.3, §3.4 + `docs/plans/ahsoka-catalog-parser-spec.md`

---

## Arquivos Verificados

| Arquivo | Status |
|---------|--------|
| `src/server/agent-catalog/scanner.ts` (178 linhas) | lido |
| `src/server/agent-catalog/service.ts` (263 linhas) | lido |
| `src/server/agent-catalog/parser.ts` | lido via agent |
| `src/server/db/migrations/002_pty_fk_and_triggers.sql` (109 linhas) | lido |
| `src/server/db/migrations/002_pty_fk_and_triggers_rollback.sql` (58 linhas) | lido |
| `src/components/command-room/canvas/realtime/events.ts` (186 linhas) | lido |
| `docs/SALA-DE-COMANDO-v2-MASTER-PLAN.md` §2.5 | lido |
| `docs/plans/ahsoka-catalog-parser-spec.md` | lido via agent |

---

## Checklist de Revisão

---

### 1. Scanner — prioridade project > user > builtin

**Verdict: APPROVED (builtin intencionalmente reservado)**

`SOURCE_PRIORITY` em `scanner.ts:31–35`:
```typescript
const SOURCE_PRIORITY: Record<AgentSource, number> = {
  project: 3,
  user:    2,
  builtin: 1,
};
```

`mergeAgents()` em `scanner.ts:37–46`: de-duplica por `skill_path`, mantém entry com maior `SOURCE_PRIORITY` — correto.

`fullScan()` em `scanner.ts:123–140` escaneia apenas `project` + `user`. O escopo `builtin` está **intencionalmente reservado** (comentário `scanner.ts:9`: `"Builtin scope: (reserved, none today)"`), alinhado com master plan §2.5.1 que define builtin como "fallback mínimo — só se nem projeto nem usuário tem nada".

A lógica de merge está correta. Quando builtin for implementado, basta adicionar `scanScope(builtinPath, 'builtin', projectPath)` e incluir no `mergeAgents()` — nenhuma refatoração de merge necessária.

---

### 2. Watcher lifecycle — on-demand + 5min inactivity

**Verdict: NEEDS_FIX (F-01)**

**On-demand setup:** `openProject()` em `service.ts:149` chama `watchProject()` após scan. Idempotente: derruba watcher anterior se já existia (`service.ts:146–148`). ✓

**Cleanup explícito:** `closeProject()` em `service.ts:159–163` chama a cleanup fn e deleta do Map. ✓

**5-minute inactivity timer: AUSENTE.**

Master plan §2.5.4 linha 112 especifica explicitamente:
> "Watchers são **criados sob demanda** quando usuário abre um projeto e **descartados** após inatividade (5min sem acesso)."

O serviço não tem nenhum timer de inatividade. Se o usuário navega para outra aba sem chamar `POST /api/projects/close`, o watcher vaza indefinidamente. Com múltiplos projetos abertos em abas, isso cresce ilimitado.

**Fix necessário em `service.ts`:**
```typescript
// Após cada getCatalog() ou handleCatalogChange() — resetar timer
const inactivityTimers = new Map<string, NodeJS.Timeout>();
const INACTIVITY_MS = 5 * 60 * 1000;

function resetInactivityTimer(projectPath: string): void {
  const existing = inactivityTimers.get(projectPath);
  if (existing) clearTimeout(existing);
  inactivityTimers.set(projectPath, setTimeout(() => {
    closeProject(projectPath);
    inactivityTimers.delete(projectPath);
  }, INACTIVITY_MS));
}
```
Chamar `resetInactivityTimer(projectPath)` em: `openProject()`, `getCatalog()`, `handleCatalogChange()`.

---

### 3. Eventos WS — projectPath para filtro

**Verdict: NEEDS_FIX (F-02) — parcial**

**catalog.updated:** `events.ts:131–136` — `projectPath: string` presente ✓  
**catalog.reloaded:** `events.ts:139–143` — `projectPath: string` presente ✓  

**project.opened / project.closed: AUSENTES do WsEvent union.**

`service.ts:142` e `service.ts:167` emitem:
```typescript
broadcast({ type: 'project.opened', v: 1, projectPath });
broadcast({ type: 'project.closed', v: 1, projectPath });
```

Dois problemas:
1. **Sem tipagem:** `EvProjectOpened` / `EvProjectClosed` não existem em `events.ts`. O WsEvent union (`events.ts:169–182`) não inclui esses tipos. `useRealtime.ts` não pode ter um handler tipado para eles.
2. **Campos faltando:** Os objetos emitidos têm apenas `{ type, v, projectPath }` — mas `WsEventBase` exige também `seq: number` e `at: string` (`events.ts:26–30`). Esses broadcasts violam o contrato do protocolo §3.3.

**Fix necessário em `events.ts`** — adicionar:
```typescript
export interface EvProjectOpened extends WsEventBase {
  type: 'project.opened';
  projectPath: string;
}

export interface EvProjectClosed extends WsEventBase {
  type: 'project.closed';
  projectPath: string;
}
```
Incluir no WsEvent union. Ajustar `service.ts:142,167` para incluir `seq` e `at`.

---

### 4. Parser — conformidade com spec Ahsoka

**Verdict: APPROVED**

Verificados os pontos críticos da spec (`ahsoka-catalog-parser-spec.md`):

| Regra da spec | Implementação | Status |
|---------------|---------------|--------|
| §2.2: squad/agent_id sempre do path, NUNCA do YAML | `parser.ts` deriva squad do dirname, agent_id do basename | ✓ |
| §2.3: YAML extraído via regex (não frontmatter `---`) | `parseAgentFile()` usa regex para localizar bloco ` ```yaml ` | ✓ |
| §2.4: Fallbacks em cascata (name, icon, role, description) | Implementados com 3+ níveis de fallback por campo | ✓ |
| §3.2: Group files usam frontmatter `---` (formato diferente) | `parseGroupFile()` usa delimitador `---` | ✓ |
| §3.4: Validação de member skill_paths via regex | `VALID_SKILL_PATH_REGEX` valida cada member | ✓ |
| §3.5: Topology normalizada | Aceita exatamente `none/chief-hub/mesh/pipeline` | ✓ |
| §5.2: Graceful degradation — 1 arquivo falha, demais continuam | Loop em `scanScope()` acumula erros sem abortar | ✓ |
| §4.3: Merge por skill_path, project sobrescreve user | `mergeAgents()` usa Map com sobrescrita por SOURCE_PRIORITY | ✓ |

Parser está em plena conformidade com a spec Ahsoka.

---

### 5. FK CASCADE / SET NULL — consistência

**Verdict: APPROVED**

| Constraint | Tabela | Coluna | Tipo | Status |
|------------|--------|--------|------|--------|
| Migration 001 | `connections` | `source_id` | ON DELETE CASCADE | ✓ linha 46 |
| Migration 001 | `connections` | `target_id` | ON DELETE CASCADE | ✓ linha 47 |
| Migration 001 | `messages` | `sender_id` | ON DELETE SET NULL | ✓ linha 87 |
| Migration 001 | `messages` | `in_reply_to` | ON DELETE SET NULL | ✓ linha 90 |
| Migration 002 | `agent_cards` | `pty_terminal_id` | ON DELETE SET NULL | ✓ linha 34 |

Semântica correta: card sem terminal (chat puro) é válido — SET NULL preserva o card. Conexões são dados do canvas — CASCADE remove arestas órfãs automaticamente.

Rebuild da tabela (`002:23–53`) segue o padrão autorizado do SQLite (FK OFF → new table → INSERT SELECT → DROP → RENAME). `PRAGMA foreign_key_check(agent_cards)` em `002:57` verifica integridade pós-rebuild.

**Observação (não-bloqueante):** `PRAGMA foreign_key_check` retorna um result set mas **não aborta a execução** automaticamente. O comentário na linha 56 diz "Fails loudly" — isso só é verdade se o migration runner verifica se o result set está vazio. Se o runner usa `db.prepare(...).run()` em vez de `.all()`, a verificação é silenciosa. Recomenda-se na próxima sprint adicionar assertion no migration runner:
```typescript
const violations = db.prepare('PRAGMA foreign_key_check(agent_cards)').all();
if (violations.length > 0) throw new Error(`FK violations: ${JSON.stringify(violations)}`);
```

---

### 6. Triggers — vazamento no rollback

**Verdict: APPROVED**

Rollback 002 (`002_pty_fk_and_triggers_rollback.sql`):

```sql
PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS trg_agent_cards_sync_canvas_updated_at;  -- linha 17
DROP TRIGGER IF EXISTS trg_messages_sync_last_message_at;       -- linha 18

BEGIN;
  CREATE TABLE agent_cards_old ...;   -- schema sem FK
  INSERT INTO agent_cards_old SELECT * FROM agent_cards;
  DROP TABLE agent_cards;
  ALTER TABLE agent_cards_old RENAME TO agent_cards;
COMMIT;

PRAGMA foreign_keys = ON;
```

Ordem correta: triggers dropados **antes** do rebuild da tabela (triggers dependem da tabela — devem ser removidos primeiro). Sem vazamento. Data preservada. PRAGMA foreign_keys reabilitado no final. ✓

---

### 7. LRU cache — conformidade com o plano

**Verdict: NEEDS_FIX (F-03 — baixa severidade)**

`setCache()` em `service.ts:40–47`:
```typescript
if (catalogCache.size >= MAX_CACHE_SIZE && !catalogCache.has(projectPath)) {
  const oldest = catalogCache.keys().next().value;   // ← primeiro da Map
  if (oldest) catalogCache.delete(oldest);
}
catalogCache.set(projectPath, { agents, groups, cachedAt: Date.now() });
```

`Map.keys().next().value` retorna a chave mais antiga **por ordem de inserção** — isso é **FIFO, não LRU**.

Para LRU verdadeiro, um cache hit (`getCatalog():175`) deveria reposicionar a entrada para o fim da Map:
```typescript
// service.ts getCatalog() — linha 175
const cached = catalogCache.get(projectPath);
if (cached) {
  // LRU: move to end
  catalogCache.delete(projectPath);
  catalogCache.set(projectPath, cached);
  return { agents: cached.agents, groups: cached.groups };
}
```

Master plan §2.5.4 especifica "LRU de 5-10 projetos". Impacto prático: baixo (max 10 entradas), mas um projeto muito acessado pode ser eviccionado se não foi o mais recentemente inserido.

---

## Resumo de Findings

| ID | Severidade | Componente | Problema | Bloqueia Wave 3? |
|----|-----------|-----------|---------|-----------------|
| F-01 | **Médio** | `service.ts` | 5-min inactivity timer ausente — watchers vazam se usuário não chama `close` explicitamente | Não |
| F-02 | **Médio** | `events.ts` + `service.ts:142,167` | `project.opened`/`project.closed` sem tipagem no WsEvent union e sem campos `seq`/`at` | Não* |
| F-03 | **Baixo** | `service.ts:40–47` | LRU implementado como FIFO — cache hits não reordenam a entrada | Não |
| OBS-01 | **Baixo** | `002:57` | `PRAGMA foreign_key_check` não aborta automaticamente sem assertion no runner | Não |

\* F-02 não bloqueia Wave 3 **se** Wave 3 não consome `project.opened`/`project.closed` em `useRealtime.ts`. Se consume, precisa de fix antes.

---

## Verdict Final

**NEEDS_FIX — 3 fixes, nenhum bloqueia Wave 3**

O core funcional está correto: scan → merge → persist → cache → broadcast. Parser está em plena conformidade com a spec Ahsoka. FKs e cascades corretos. Rollback seguro. Eventos de catálogo carregam `projectPath` para filtro.

### Green-light para Wave 3?

**SIM — com observação:**

Wave 3 pode começar. Os 3 fixes (F-01, F-02, F-03) devem ser criados como stories de tech debt para a mesma sprint:

- **F-01** (inactivity timer): implementar junto com qualquer story que mexe em `service.ts`
- **F-02** (tipos WS): se Wave 3 tiver qualquer handler para `project.opened/closed` no frontend, fix é **pré-requisito** — fazer antes
- **F-03** (LRU vs FIFO): low priority, pode ser sprint seguinte

Han Solo (backend) e Luke/Padmé (frontend) podem avançar. F-02 deve ser coordenado: se frontend de Wave 3 tiver `case 'project.opened':` em `useRealtime.ts`, R2-D2 precisa fechar F-02 primeiro.
