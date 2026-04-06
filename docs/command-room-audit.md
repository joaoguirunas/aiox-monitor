# Auditoria Exaustiva — Sala de Comando (Command Room)

**Data:** 2026-04-05
**Auditor:** Sahadeva (Analyst)
**Branch:** `feature/8.8-terminal-tests`
**Escopo:** Todos os arquivos da Command Room — page, components, APIs, repository, DB schema

---

## Resumo Executivo

Foram encontrados **12 bugs**, sendo **3 críticos**, **4 altos**, **3 médios** e **2 baixos**.

Os 3 bugs reportados pelo usuário foram confirmados e suas causas raízes identificadas:
1. **Apagar projeto não persiste** → Confirmado. Causa raiz: `handleRemoveProject` só limpa o state React, nunca chama a API de kill nem atualiza o banco.
2. **Terminais não aparecem em Configuração** → Confirmado. Causa raiz: TabProjects usa a API de processos ativos do ProcessManager (runtime), mas terminais com processo morto e status != 'closed' no banco nunca aparecem.
3. **Instabilidade geral** → Confirmado. Múltiplas causas: falta de cleanup em cascata, estado fantasma, rehydration incorreta.

---

## Arquivos Auditados

| Arquivo | Linhas | Tipo |
|---------|--------|------|
| `src/app/command-room/page.tsx` | 1314 | Página principal |
| `src/components/command-room/TerminalPanel.tsx` | 591 | Componente terminal |
| `src/components/command-room/FolderPicker.tsx` | 199 | Modal seleção pasta |
| `src/components/command-room/CategoryCreator.tsx` | 167 | Modal criar categoria |
| `src/components/command-room/CategoryRow.tsx` | 91 | Container categoria |
| `src/components/command-room/TeamBuilder.tsx` | 28 | Modal equipe (stub) |
| `src/components/command-room/AvatarPicker.tsx` | 20 | Avatar (stub) |
| `src/app/api/command-room/[id]/route.ts` | 78 | API terminal individual |
| `src/app/api/command-room/spawn/route.ts` | 121 | API criar terminal |
| `src/app/api/command-room/kill/route.ts` | 43 | API kill terminais |
| `src/app/api/command-room/list/route.ts` | 51 | API listar terminais |
| `src/app/api/command-room/ensure-chief/route.ts` | 142 | API ensure Chief |
| `src/app/api/command-room/categories/route.ts` | 73 | API categorias |
| `src/app/api/command-room/browse/route.ts` | 80 | API browse pastas |
| `src/app/api/command-room/resize/route.ts` | 37 | API resize terminal |
| `src/app/api/command-room/agents/route.ts` | 127 | API listar agentes |
| `src/lib/command-room-repository.ts` | 225 | Repository (DB) |
| `src/lib/schema.ts` | 238 | Schema SQLite |
| `src/lib/queries.ts` | ~400 | Queries gerais |
| `src/app/config/_components/TabProjects.tsx` | 259 | Tab Config/Projetos |
| `src/server/command-room/process-manager.ts` | ~365 | ProcessManager |

---

## Bugs Encontrados

---

### BUG-01: Apagar projeto não persiste no banco (CRÍTICO)

| Campo | Valor |
|-------|-------|
| **Severidade** | CRITICAL |
| **Arquivo** | `src/app/command-room/page.tsx:276-282` |
| **Reportado pelo usuário** | Sim — Bug #1 |

**Código problemático:**
```typescript
const handleRemoveProject = useCallback((path: string) => {
  setProjects((prev) => prev.filter((p) => p.path !== path));
  setTerminals((prev) => prev.filter((t) => t.projectPath !== path));
  if (activeProject === path) {
    setActiveProject(null);
  }
}, [activeProject]);
```

**Causa raiz:** A função `handleRemoveProject` APENAS remove o projeto do state React local. Ela:
1. **NÃO** chama `DELETE /api/command-room/kill?project=<path>` para matar os processos PTY
2. **NÃO** atualiza `command_room_terminals` no banco para marcar terminais como `closed`
3. **NÃO** remove nenhum dado do banco de dados

**Por que o projeto volta no reload:** O `useEffect` de mount (linha 210-263) chama `GET /api/command-room/list` que lê `command_room_terminals` do banco. Os terminais ainda estão lá com `pty_status != 'closed'`, então o código reconstrói a lista de projetos a partir dos `project_path` únicos dos terminais (linha 229-238).

**Fix sugerido:**
```typescript
const handleRemoveProject = useCallback(async (path: string) => {
  // 1. Remover do state imediatamente (optimistic)
  setProjects((prev) => prev.filter((p) => p.path !== path));
  setTerminals((prev) => prev.filter((t) => t.projectPath !== path));
  if (activeProject === path) {
    setActiveProject(null);
  }
  // 2. Limpar ensuredProjectsRef para permitir re-ensure se reabrir
  ensuredProjectsRef.current.delete(path);
  // 3. Matar processos E atualizar banco
  try {
    await fetch(`/api/command-room/kill?project=${encodeURIComponent(path)}`, { method: 'DELETE' });
  } catch { /* ignore — UI já foi atualizada */ }
}, [activeProject]);
```

---

### BUG-02: Terminais "fantasma" — DB ativo mas processo morto (CRÍTICO)

| Campo | Valor |
|-------|-------|
| **Severidade** | CRITICAL |
| **Arquivo** | `src/lib/command-room-repository.ts:66-74` + `src/app/api/command-room/list/route.ts:16-42` |
| **Reportado pelo usuário** | Sim — contribui para Bug #1 e Bug #3 |

**Causa raiz:** Quando o servidor Node.js reinicia (deploy, crash, hot-reload do Next.js), os processos PTY morrem mas o banco mantém os registros com `pty_status = 'active'` ou `'idle'`. A função `markCrashedTerminals()` existe no repository mas **nunca é chamada no startup da aplicação**.

**Fluxo do problema:**
1. Servidor reinicia → processos PTY morrem
2. `command_room_terminals` ainda tem rows com `pty_status = 'active'`
3. `GET /api/command-room/list` retorna esses terminais como se estivessem vivos
4. Frontend tenta reconectar via WebSocket → falha silenciosamente
5. Terminais aparecem como "ativos" mas não respondem

**Onde `markCrashedTerminals` deveria ser chamada:** No startup do ProcessManager ou na inicialização do servidor custom (`src/server/`).

**Fix sugerido:** Adicionar chamada a `markCrashedTerminals` no singleton init do ProcessManager:
```typescript
// Em ProcessManager.getInstance() ou no server startup
const pm = ProcessManager.getInstance();
const activeIds = pm.list().filter(p => p.status !== 'closed').map(p => p.id);
markCrashedTerminals(activeIds);
```

---

### BUG-03: Config (TabProjects) não mostra terminais do command-room (ALTO)

| Campo | Valor |
|-------|-------|
| **Severidade** | HIGH |
| **Arquivo** | `src/app/config/_components/TabProjects.tsx:45-56` |
| **Reportado pelo usuário** | Sim — Bug #2 |

**Causa raiz:** `TabProjects` carrega processos PTY via `GET /api/command-room/kill` (linha 48), que retorna a lista do `ProcessManager.list()`. Mas o ProcessManager só tem processos que foram spawned **nesta instância do servidor**. Se o servidor reiniciou, os processos não existem no ProcessManager mesmo que existam no banco.

**Código problemático:**
```typescript
const loadPtyProcesses = useCallback(async () => {
  const res = await fetch('/api/command-room/kill'); // GET handler
  // Retorna ProcessManager.list() — apenas processos em memória
});
```

**Problema adicional:** A rota `GET /api/command-room/kill` é semanticamente confusa — um GET numa rota chamada "kill" retorna a lista de processos. Deveria ser uma rota separada.

**Fix sugerido:** `TabProjects` deveria usar `GET /api/command-room/list` (que faz merge DB + ProcessManager) em vez de `GET /api/command-room/kill` (que só retorna ProcessManager). Alternativamente, a tab deveria ler do banco diretamente.

---

### BUG-04: ensuredProjectsRef nunca é limpo ao remover projeto (ALTO)

| Campo | Valor |
|-------|-------|
| **Severidade** | HIGH |
| **Arquivo** | `src/app/command-room/page.tsx:159,276-282` |

**Causa raiz:** Quando um projeto é removido via `handleRemoveProject`, o `ensuredProjectsRef` (Set) mantém o path do projeto. Se o usuário re-adicionar o mesmo projeto, o Chief terminal **não será auto-criado** porque o ref ainda marca o projeto como "já ensured".

**Código problemático:**
```typescript
// Linha 159: ref que persiste durante toda a vida do componente
const ensuredProjectsRef = useRef<Set<string>>(new Set());

// Linha 276-282: handleRemoveProject NÃO limpa o ref
const handleRemoveProject = useCallback((path: string) => {
  setProjects((prev) => prev.filter((p) => p.path !== path));
  // ... mas nunca faz: ensuredProjectsRef.current.delete(path);
}, [activeProject]);
```

**Fix sugerido:** Adicionar `ensuredProjectsRef.current.delete(path)` dentro de `handleRemoveProject`.

---

### BUG-05: Team spawn não marca Chief nem auto-link (ALTO)

| Campo | Valor |
|-------|-------|
| **Severidade** | HIGH |
| **Arquivo** | `src/app/command-room/page.tsx:394-450` |

**Causa raiz:** `handleTeamSpawn` spawna terminais sequencialmente mas:
1. **Não verifica se Chief existe** antes de spawnar
2. **Não passa `is_chief`** para o primeiro terminal da equipe
3. **Não faz auto-link** dos terminais com o Chief
4. **Não passa `aiox_agent`** no body do spawn request (apesar de ter no preset)

**Código problemático (linha 412-421):**
```typescript
const res = await fetch('/api/command-room/spawn', {
  method: 'POST',
  body: JSON.stringify({
    agentName: t.label,
    projectPath: activeProject,
    ...(initialPrompt && { initialPrompt }),
    // FALTANDO: is_chief, category_id, aiox_agent
  }),
});
```

Compare com `handleSpawn` (linha 291-359) que corretamente calcula `isFirstTerminal`, passa `is_chief` e faz auto-link com Chief.

**Fix sugerido:** Antes do loop de team spawn, verificar se Chief existe. Para cada terminal, passar `aiox_agent` no body. Após spawnar todos, atualizar linkedTerminalIds do Chief para incluir todos os novos terminais.

---

### BUG-06: Custom squad spawn com `\n` no initialPrompt (ALTO)

| Campo | Valor |
|-------|-------|
| **Severidade** | HIGH |
| **Arquivo** | `src/app/command-room/page.tsx:483-484` |

**Causa raiz:** O `handleCustomSquadSpawn` cria initialPrompt com `\n` literal para tentar enviar dois comandos:
```typescript
const initialPrompt = `claude --dangerously-skip-permissions\n${agentCommand}`;
```

O problema é que isso envia ambos comandos como um único write para o PTY no momento do spawn. O `\n` pode ser interpretado antes do claude estar pronto para receber comandos, fazendo o segundo comando (`/AIOX:agents:...`) ser perdido ou executado pelo shell em vez do Claude.

**Fix sugerido:** O initialPrompt deveria conter apenas o comando claude. A ativação do agente deveria ser feita após um delay ou após detectar que o Claude está pronto (via polling de status ou evento).

---

### BUG-07: handleClearProject — race condition UI vs API (MÉDIO)

| Campo | Valor |
|-------|-------|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/app/command-room/page.tsx:374-382` |

**Causa raiz:** `handleClearProject` limpa o state React ANTES de chamar a API kill:
```typescript
const handleClearProject = useCallback(async () => {
  if (!activeProject) return;
  setTerminals((prev) => prev.filter((t) => t.projectPath !== activeProject)); // UI limpa ANTES
  cardRefs.current.clear();
  try {
    await fetch(`/api/command-room/kill?project=...`, { method: 'DELETE' }); // API depois
  } catch { /* ignore */ }
}, [activeProject]);
```

Se a API falhar, os terminais sumiram da UI mas os processos PTY continuam rodando no servidor. O usuário perde a capacidade de controlá-los visualmente.

**Fix sugerido:** Chamar a API primeiro, e só limpar o state se a API tiver sucesso. Ou pelo menos re-adicionar os terminais ao state se a API falhar.

---

### BUG-08: Drag-and-drop reorder modifica terminais de TODOS os projetos (MÉDIO)

| Campo | Valor |
|-------|-------|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/app/command-room/page.tsx:581-599` |

**Causa raiz:** `handleDragOver` faz splice diretamente no array `terminals` (que contém terminais de TODOS os projetos), não apenas nos terminais do projeto ativo. Mover um terminal na posição 2 pode afetar a ordem de terminais de outros projetos.

**Código problemático:**
```typescript
const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
  e.preventDefault();
  if (dragIdx === null || dragIdx === idx) return;
  setTerminals((prev) => {
    const updated = [...prev];
    const [moved] = updated.splice(dragIdx, 1); // índice global, não por projeto
    updated.splice(idx, 0, moved);
    return updated;
  });
  setDragIdx(idx);
}, [dragIdx]);
```

**Fix sugerido:** O drag-and-drop deveria operar sobre `projectTerminals` (filtrado) e recalcular os índices globais, ou usar um sistema de `display_order` persistido.

---

### BUG-09: Rename terminal não persiste no banco (MÉDIO)

| Campo | Valor |
|-------|-------|
| **Severidade** | MEDIUM |
| **Arquivo** | `src/app/command-room/page.tsx:528-532` |

**Causa raiz:** `handleRename` só atualiza o state React:
```typescript
const handleRename = useCallback((id: string, newName: string) => {
  setTerminals((prev) =>
    prev.map((t) => (t.id === id ? { ...t, agentName: newName } : t))
  );
}, []);
```

Não há chamada à API para atualizar `agent_name` ou `agent_display_name` no banco `command_room_terminals`. No reload, o terminal volta com o nome original.

**Fix sugerido:** Adicionar chamada PATCH/PUT à API para persistir o rename no banco. Pode ser feito via `updateTerminal()` no repository (precisa adicionar suporte para `agent_display_name`).

---

### BUG-10: Link state (linkedTerminalIds) não persiste (MÉDIO → aceito como design)

| Campo | Valor |
|-------|-------|
| **Severidade** | LOW (se design intencional) / MEDIUM (se bug) |
| **Arquivo** | `src/app/command-room/page.tsx:534-548` |

**Causa raiz:** `handleLink` só atualiza o state React. Os links entre terminais (broadcast targets) são perdidos no reload. A tabela `command_room_terminals` não tem coluna para `linked_terminal_ids`.

**Nota:** Isso pode ser intencional — links são efêmeros e só fazem sentido enquanto os processos estão rodando. Se for design, é LOW. Se deveria persistir, é MEDIUM.

---

### BUG-11: `GET /api/command-room/kill` — semântica confusa e dados incompletos (BAIXO)

| Campo | Valor |
|-------|-------|
| **Severidade** | LOW |
| **Arquivo** | `src/app/api/command-room/kill/route.ts:37-42` |

**Causa raiz:** Uma rota chamada `/kill` que aceita GET para listar processos é semanticamente confusa. Além disso, o GET retorna dados apenas do ProcessManager (memória), sem cruzar com o banco de dados. Isso significa que:
- Terminais persistidos no banco mas sem processo ativo não aparecem
- É a rota usada pelo TabProjects (BUG-03), agravando o problema

**Fix sugerido:** Criar rota dedicada `GET /api/command-room/processes` para listar processos runtime, e usar `GET /api/command-room/list` (que já faz merge DB+PM) para a tab Config.

---

### BUG-12: Autopilot state não persiste no command-room (BAIXO)

| Campo | Valor |
|-------|-------|
| **Severidade** | LOW |
| **Arquivo** | `src/app/command-room/page.tsx:146,551-558` |

**Causa raiz:** `autopilotIds` é um `Set<string>` em state React. Não há persistência no banco. No reload, todos os terminais perdem o estado de autopilot. A tabela `command_room_terminals` não tem coluna `autopilot`.

**Fix sugerido:** Adicionar coluna `autopilot INTEGER NOT NULL DEFAULT 0` à tabela `command_room_terminals` e persistir via API.

---

## Tabela Resumo

| # | Bug | Severidade | Arquivo:Linha | Status |
|---|-----|-----------|---------------|--------|
| 01 | Apagar projeto não persiste | CRITICAL | page.tsx:276 | Aberto |
| 02 | Terminais fantasma (DB ativo, processo morto) | CRITICAL | command-room-repository.ts:66 | Aberto |
| 03 | Config não mostra terminais command-room | HIGH | TabProjects.tsx:48 | Aberto |
| 04 | ensuredProjectsRef não limpo ao remover projeto | HIGH | page.tsx:159,276 | Aberto |
| 05 | Team spawn sem Chief nem auto-link | HIGH | page.tsx:394 | Aberto |
| 06 | Custom squad \n no initialPrompt | HIGH | page.tsx:483 | Aberto |
| 07 | handleClearProject race condition | MEDIUM | page.tsx:374 | Aberto |
| 08 | Drag-and-drop reorder cross-project | MEDIUM | page.tsx:581 | Aberto |
| 09 | Rename não persiste no banco | MEDIUM | page.tsx:528 | Aberto |
| 10 | Link state não persiste | LOW | page.tsx:534 | Design? |
| 11 | GET /kill semântica confusa | LOW | kill/route.ts:37 | Aberto |
| 12 | Autopilot state não persiste | LOW | page.tsx:146 | Aberto |

---

## Ordem de Fix Recomendada

### Fase 1 — Críticos (resolver primeiro)
1. **BUG-01** — Fix `handleRemoveProject` para chamar kill API
2. **BUG-02** — Chamar `markCrashedTerminals()` no startup do servidor

### Fase 2 — Altos (próximo sprint)
3. **BUG-04** — Limpar `ensuredProjectsRef` no remove (1 linha)
4. **BUG-03** — TabProjects usar `/api/command-room/list` em vez de `/kill`
5. **BUG-05** — Team spawn com Chief awareness e auto-link
6. **BUG-06** — Custom squad com delay para agent activation

### Fase 3 — Médios (backlog)
7. **BUG-07** — Inverter ordem: API first, then UI cleanup
8. **BUG-09** — Persistir rename no banco
9. **BUG-08** — Drag scoped por projeto

### Fase 4 — Baixos (nice-to-have)
10. **BUG-11** — Refactor semântico da rota kill
11. **BUG-12** — Persistir autopilot
12. **BUG-10** — Decidir se links devem persistir

---

## Observações Adicionais

### Arquitetura — Dois sistemas de terminais separados
O projeto tem **dois sistemas de terminais distintos** que podem causar confusão:

1. **`terminals`** (tabela) — Terminais detectados por polling/scanning de processos Claude existentes. Usa `INTEGER PRIMARY KEY` e FK para `projects(id)`.
2. **`command_room_terminals`** (tabela) — Terminais spawned pela Sala de Comando via PTY. Usa `TEXT PRIMARY KEY` (UUID) e **NÃO tem FK** para a tabela `projects`.

Isso significa que deletar um projeto da tabela `projects` (via Config → Apagar) **não afeta** os terminais da Sala de Comando. E remover um projeto da Sala de Comando **não afeta** os projetos registrados.

### Sem rota de DELETE real para `command_room_terminals`
Não existe uma rota ou função que faça `DELETE FROM command_room_terminals WHERE ...`. Terminais são apenas marcados como `closed` (`UPDATE ... SET pty_status = 'closed'`). Isso é um soft-delete, o que é aceitável, mas significa que a tabela cresce indefinidamente. A função `purgeOldInactiveTerminals()` existe na tabela `terminals` mas **não na tabela `command_room_terminals`**.

### Processos PTY órfãos
Se o servidor crashar sem graceful shutdown, processos PTY (`node-pty`) continuam rodando no SO. Não há mecanismo de cleanup no nível do OS (como PID file ou process group).

---

*Relatório gerado por Sahadeva (Analyst) — a verdade revelada em silêncio 🔍⭐*
