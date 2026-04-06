# RELATÓRIO EXAUSTIVO DE BUGS — Sala de Comando (Command Room)

**Data:** 2026-04-04  
**Analista:** Sahadeva (Research & Analysis Specialist)  
**Escopo:** 2.357 linhas de componentes + 8 rotas API + 3 server-side + 1 hook PTY + repository + schema  
**Banco atual:** 2 projetos, 0 terminais command-room, 0 duplicatas

---

## BUG #1 — ROTA DE CATEGORIAS NÃO EXISTE (404)

- **Severidade:** CRÍTICO
- **Arquivo:** `src/components/command-room/CategoryCreator.tsx:45`
- **Causa raiz:** O componente `CategoryCreator` faz `POST /api/command-room/categories` para criar categorias, mas essa rota **NÃO EXISTE**. Não há arquivo em `src/app/api/command-room/categories/route.ts`. A função `createCategory()` existe no repository (`src/lib/command-room-repository.ts:153`) mas não há endpoint HTTP para acessá-la.
- **Impacto:** Criar categorias **SEMPRE falha com 404**. O botão "Criar Categoria" na toolbar é completamente inútil. Qualquer workflow que depende de categorias está bloqueado.
- **Fix sugerido:** Criar `src/app/api/command-room/categories/route.ts` com POST handler que valide nome, gere UUID e chame `createCategory()` do repository. Retornar o objeto criado para que o frontend atualize o state.

---

## BUG #2 — TERMINAIS SEM CATEGORIA DESAPARECEM DA UI

- **Severidade:** CRÍTICO
- **Arquivo:** `src/app/command-room/page.tsx:1079-1082`
- **Causa raiz:** Quando existem categorias no banco, o código renderiza: (1) Chief terminal, (2) Terminais agrupados por categoria. Mas o array `uncategorized` (calculado em useMemo na linha 597-600) **NUNCA é renderizado**. Há um comentário explícito: `REMOVIDO: Seção "Sem Categoria"`. O fallback layout (linha 1082) só aparece se NÃO há categorias E NÃO há chief, o que nunca ocorre em uso normal.
- **Impacto:** Se existem categorias no banco, qualquer terminal sem `category_id` (incluindo os criados pelo team spawn — Bug #3) simplesmente **desaparece** da interface. O terminal existe no banco e no ProcessManager, consome recursos, mas é invisível ao usuário. Isso afeta TODOS os terminais criados individualmente e via equipe.
- **Fix sugerido:** Adicionar uma seção "Sem Categoria" ou "Geral" após as CategoryRows que renderize o array `uncategorized`. Alternativa: auto-atribuir uma categoria padrão na criação.

---

## BUG #3 — TEAM SPAWN NÃO PASSA category_id NEM is_chief

- **Severidade:** ALTO
- **Arquivo:** `src/app/command-room/page.tsx:361-369` (handleTeamSpawn) e `436-445` (handleCustomSquadSpawn)
- **Causa raiz:** `handleTeamSpawn` e `handleCustomSquadSpawn` fazem spawn de terminais via `POST /api/command-room/spawn` sem passar `is_chief` e sem `category_id` no body JSON:
  ```typescript
  body: JSON.stringify({
    agentName: t.label,
    projectPath: activeProject,
    ...(initialPrompt && { initialPrompt }),
    // ← NÃO TEM is_chief, NÃO TEM category_id
  })
  ```
  Em contraste, `handleSpawn` (linha 256-265) corretamente passa `is_chief` e `category_id`.
- **Impacto:** Ao usar "Iniciar Equipe" (AIOX Standard — 13 agentes), nenhum terminal é marcado como Chief e nenhum tem categoria. O primeiro terminal (MASTER) deveria ser Chief mas não é. Se houver categorias no banco, TODOS ficam invisíveis (Bug #2). O layout Chief+Categorias não funciona com team spawn.
- **Fix sugerido:** No `handleTeamSpawn`, passar `is_chief: i === 0` para o primeiro terminal. Opcionalmente, criar categorias automáticas por grupo (Coordenação, Desenvolvimento, Design, etc.) baseado na estrutura do preset.

---

## BUG #4 — RACE CONDITION: useProjects WebSocket vs Fetch Inicial

- **Severidade:** ALTO
- **Arquivo:** `src/hooks/useProjects.ts:38-48`
- **Causa raiz:** O useEffect que escuta `lastMessage` do WebSocket pode receber mensagens `project:update` **ANTES** do fetch inicial (linhas 16-33) completar. Quando `projects` ainda é `[]` (array vazio), o check `prev.some(p => p.id === msg.project.id)` falha e o mesmo projeto é adicionado múltiplas vezes:
  ```typescript
  setProjects(prev => {
    const exists = prev.some(p => p.id === msg.project.id);
    if (exists) return prev.map(p => p.id === msg.project.id ? msg.project : p);
    return [msg.project, ...prev];  // ← duplicata se prev ainda é []
  });
  ```
  Cada evento de hook do Claude Code gera um broadcast (`event-processor.ts:66`), potencialmente dezenas de broadcasts antes do fetch completar.
- **Impacto:** Projetos aparecem duplicados na UI (Dashboard, ProjectSelector, Kanban) durante os primeiros segundos após carregamento. Quanto mais agentes ativos, mais duplicatas aparecem.
- **Fix sugerido:** (A) Adicionar deduplicação por `id` no setter: `return [msg.project, ...prev.filter(p => p.id !== msg.project.id)]`. (B) Usar um ref `loadedRef` para bloquear updates WS até o fetch inicial completar. (C) Debounce no broadcast do event-processor (ver Bug #8).

---

## BUG #5 — RENAME NÃO PERSISTE NO BANCO

- **Severidade:** ALTO
- **Arquivo:** `src/app/command-room/page.tsx:477-481`
- **Causa raiz:** `handleRename` apenas atualiza o React state local, sem nenhuma chamada de API:
  ```typescript
  const handleRename = useCallback((id: string, newName: string) => {
    setTerminals((prev) =>
      prev.map((t) => (t.id === id ? { ...t, agentName: newName } : t))
    );
  }, []);
  ```
  Não há endpoint PATCH ou PUT para atualizar `agent_name` na tabela `command_room_terminals`. A função `updateTerminal()` no repository (`src/lib/command-room-repository.ts:104`) suporta `category_id`, `description` e `is_chief`, mas **NÃO** `agent_name`.
- **Impacto:** Renomear um terminal funciona visualmente, mas ao recarregar a página (ou navegar e voltar), o nome reverte ao original. O usuário perde customizações repetidamente.
- **Fix sugerido:** (1) Adicionar `agent_name` ao `updateTerminal()` no repository. (2) Criar endpoint `PATCH /api/command-room/{id}` para aceitar `{agent_name}`. (3) Chamar esse endpoint em `handleRename`.

---

## BUG #6 — LINK STATE NÃO PERSISTE

- **Severidade:** ALTO
- **Arquivo:** `src/app/command-room/page.tsx:484-497` e `191-193`
- **Causa raiz:** `linkedTerminalIds` é mantido apenas no React state local. Ao carregar do banco (loadFromDb, linha 191), sempre inicializa como `[]`:
  ```typescript
  linkedTerminalIds: [],  // ← SEMPRE vazio ao restaurar
  ```
  `handleLink` (linha 484) toggle links no state mas não persiste. Não existe coluna no schema `command_room_terminals` para armazenar links, nem tabela de relacionamento.
- **Impacto:** Links entre terminais (broadcast de comandos do Chief para workers) são perdidos ao recarregar a página. O workflow principal da Sala de Comando (Chief orquestra workers via links) quebra em cada reload. O usuário precisa reconectar manualmente TODOS os links.
- **Fix sugerido:** (1) Criar tabela `terminal_links(source_id, target_id)` ou adicionar coluna `linked_terminal_ids TEXT` (JSON array) ao `command_room_terminals`. (2) Persistir em `handleLink` via API. (3) Carregar em `loadFromDb`.

---

## BUG #7 — TIMER LEAK E CLEANUP INCONSISTENTE NO ProcessManager

- **Severidade:** ALTO
- **Arquivo:** `src/server/command-room/process-manager.ts:268-283`
- **Causa raiz:** Na função `kill()`, `forceKillTimer` é uma variável **LOCAL**. Se `kill()` for chamado múltiplas vezes no mesmo processo, novos timers são criados sem limpar os anteriores:
  ```typescript
  const forceKillTimer = setTimeout(() => {   // ← variável LOCAL
    try { proc.pty.kill('SIGKILL'); } catch {}
  }, KILL_GRACE_MS);

  proc.cleanupTimer = setTimeout(() => {
    clearTimeout(forceKillTimer);  // ← pode já ter disparado
    this.processes.delete(id);
  }, KILL_GRACE_MS + 1000);
  ```
  Além disso, a cleanup no `onExit` (linha 210-212) cria um timer que não é cancelado se `kill()` for chamado depois.
- **Impacto:** Múltiplos SIGKILL enviados ao mesmo PID. Timers orphanados acumulam. Em uso intenso com muitos kill/spawn, memory leak gradual no servidor.
- **Fix sugerido:** (1) Armazenar `forceKillTimer` como `proc.forceKillTimer`. (2) No início de `kill()`, limpar `proc.forceKillTimer` e `proc.cleanupTimer` se existirem. (3) No `onExit`, verificar se `kill()` já foi chamado antes de criar novo timer.

---

## BUG #8 — BROADCAST A CADA EVENTO GERA FLOOD DE WEBSOCKET

- **Severidade:** ALTO
- **Arquivo:** `src/server/event-processor.ts:65-66`
- **Causa raiz:** **CADA** hook event (PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStop) dispara `broadcast({ type: 'project:update', project })`. Com 13 agentes usando tools simultaneamente, isso gera facilmente 50-100+ broadcasts/minuto de `project:update` com dados quase idênticos (só muda `last_active`).
  ```typescript
  try { broadcast({ type: 'project:update', project }); } catch { /* fire-and-forget */ }
  ```
- **Impacto:** Todos os clientes WebSocket recebem flood de mensagens redundantes. Cada mensagem dispara o useEffect no `useProjects` (Bug #4), causando re-renders em todos os componentes que consomem projetos (Dashboard, Kanban, ProjectSelector, ListaPanel). Desperdiça CPU e bandwidth.
- **Fix sugerido:** Implementar throttle/debounce por `project.id` no broadcaster. E.g., no máximo 1 `project:update` por projeto a cada 2 segundos. Usar `Map<projectId, timer>` para agrupar.

---

## BUG #9 — EXTERNAL TERMINALS POLL CRIA CARGA DESNECESSÁRIA

- **Severidade:** MÉDIO
- **Arquivo:** `src/app/command-room/page.tsx:558-572`
- **Causa raiz:** Polling de `GET /api/command-room/list` a cada 5 segundos **INCONDICIONALMENTE**. O useEffect tem deps vazias `[]` e roda desde o mount, mesmo quando não há terminais externos ou a Sala está vazia.
  ```typescript
  useEffect(() => {
    const poll = async () => { /* fetch /api/command-room/list */ };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, []);
  ```
  O endpoint `list/` faz merge de DB + ProcessManager a cada chamada (`listActiveTerminals` + `pm.list()`).
- **Impacto:** 12 chamadas/minuto ao banco + ProcessManager mesmo sem uso. Carga desnecessária no servidor. Em modo dev com hot-reload, múltiplos intervals podem acumular.
- **Fix sugerido:** (1) Usar WebSocket para notificação de terminais novos/removidos em vez de polling. (2) Ou condicionar o poll: só iniciar se `terminals.length > 0`. (3) Ou aumentar intervalo para 15-30s.

---

## BUG #10 — DRAG-AND-DROP OPERA EM ARRAY GLOBAL, NÃO FILTRADO

- **Severidade:** MÉDIO
- **Arquivo:** `src/app/command-room/page.tsx:534-543`
- **Causa raiz:** `handleDragOver` faz splice no array `terminals` (que contém terminais de **TODOS** os projetos), mas `dragIdx` e `idx` vêm da iteração de `projectTerminals` (array filtrado por projeto ativo):
  ```typescript
  setTerminals((prev) => {
    const updated = [...prev];
    const [moved] = updated.splice(dragIdx, 1);  // dragIdx do array filtrado
    updated.splice(idx, 0, moved);                // idx do array filtrado
    return updated;                                // opera no array GLOBAL
  });
  ```
- **Impacto:** Arrastar terminais no Projeto A pode reordenar terminais do Projeto B. O layout fica corrompido entre projetos. Drag-and-drop só funciona corretamente se houver exatamente um projeto.
- **Fix sugerido:** Converter `dragIdx` e `idx` de posição no array filtrado para posição no array global antes do splice. Ou manter um array separado por projeto.

---

## BUG #11 — handleTaskDone DEPENDE DE terminals (RE-CRIA A CADA MUDANÇA)

- **Severidade:** MÉDIO
- **Arquivo:** `src/app/command-room/page.tsx:509-525`
- **Causa raiz:** `handleTaskDone` tem `terminals` nas dependências do useCallback, causando re-criação do callback a cada mudança de estado dos terminais:
  ```typescript
  const handleTaskDone = useCallback((id: string) => {
    const terminal = terminals.find((t) => t.id === id);
    // ...
    const masters = terminals.filter((t) => t.linkedTerminalIds.includes(id));
    // ...
  }, [terminals]);  // ← re-cria a cada mudança
  ```
  Este callback é passado como prop para TODOS os TerminalPanels (linhas 1027, 1071, 1111), causando re-render em cascata.
- **Impacto:** Performance degradada. Com 13 terminais, cada mudança de state em `terminals` (status, rename, link) causa 13 re-renders desnecessários do TerminalPanel (que inclui xterm).
- **Fix sugerido:** Usar `terminalsRef.current` no closure (já existe na linha 555-556) em vez de `terminals` direto, e remover `terminals` das deps.

---

## BUG #12 — markCrashedTerminals ASYNC FIRE-AND-FORGET NO SINGLETON

- **Severidade:** MÉDIO
- **Arquivo:** `src/server/command-room/process-manager.ts:40-47`
- **Causa raiz:** A reconciliação inicial (marcar terminais mortos como crashed) usa `void async` sem await:
  ```typescript
  void (async () => {
    try {
      const { markCrashedTerminals } = await import('@/lib/command-room-repository');
      await markCrashedTerminals([]);
    } catch { }
  })();
  ```
  O `getInstance()` retorna **ANTES** da reconciliação completar. Qualquer chamada a `list()` ou `spawn()` pode ver terminais com status `'active'` que na verdade estão mortos.
- **Impacto:** Na inicialização do servidor, a UI pode mostrar terminais "active" que na verdade estão crashed por alguns milissegundos a segundos. O `loadFromDb` do frontend (linha 160) pode carregar esses terminais fantasma.
- **Fix sugerido:** Tornar a reconciliação síncrona (`markCrashedTerminals` já é sync pois usa `DatabaseSync`), removendo o async wrapper. Ou usar uma promise que bloqueia `list()`/`spawn()` até completar.

---

## BUG #13 — clients MAP NO PTY WS SERVER SEM CLEANUP DE TERMINAL MORTO

- **Severidade:** MÉDIO
- **Arquivo:** `src/server/command-room/pty-websocket-server.ts:68-73`
- **Causa raiz:** Quando um processo morre no ProcessManager (`onExit`), o PtyWebSocketServer **não é notificado** diretamente. A entry no `this.clients` Map para o terminal morto persiste. A cleanup só ocorre quando um WebSocket client desconecta (`ws.on('close')`), mas se o browser já fechou ou nenhum client estava conectado, a entry permanece forever.
- **Impacto:** Memory leak gradual. Em servidores long-running com muitos spawn/kill cycles, o `clients` Map cresce indefinidamente. Cada entry é um Set (pequeno, mas acumula).
- **Fix sugerido:** No constructor do PtyWebSocketServer, escutar `ProcessManager.on('process-event')` e quando `type === 'exit'`, fazer `this.clients.delete(id)` e fechar todos os WebSockets no Set.

---

## BUG #14 — SCROLLBACK BUFFER SEM LIMITE DE BYTES

- **Severidade:** MÉDIO
- **Arquivo:** `src/server/command-room/process-manager.ts:180-184`
- **Causa raiz:** O scrollback buffer limita por **CONTAGEM** de chunks (`MAX_SCROLLBACK = 5000`), mas cada chunk pode ter tamanho arbitrário:
  ```typescript
  proc.scrollback.push(data);  // data pode ser 1 byte ou 100KB
  if (proc.scrollback.length > MAX_SCROLLBACK) {
    proc.scrollback.shift();
  }
  ```
  Se o terminal executa `cat` de um arquivo grande, cada chunk de output pode ter KBs.
- **Impacto:** Um terminal com output pesado pode consumir centenas de MB no scrollback antes que o limite de 5000 chunks entre. Com 13 terminais, isso pode causar OOM (Out of Memory).
- **Fix sugerido:** Adicionar limite por bytes totais (e.g., 10MB) além do limite por chunks. Manter um counter de bytes e ao exceder, fazer `shift()` até ficar abaixo do limite.

---

## BUG #15 — PID RECYCLING NOS CACHES DO EVENT-PROCESSOR

- **Severidade:** MÉDIO
- **Arquivo:** `src/server/event-processor.ts:47-49`
- **Causa raiz:** `terminalAgentCache` e `terminalSessionCache` usam PID (`number`) como chave. PIDs são reciclados pelo OS — quando um processo morre e outro nasce com o mesmo PID, o cache retorna dados stale do processo anterior:
  ```typescript
  const terminalAgentCache = new Map<number, string>();
  const terminalSessionCache = new Map<number, string>();
  ```
  A cleanup só ocorre em `isNewClaudeSession` (linha 101-106), mas depende de `terminal_session_id` ser diferente, o que nem sempre é confiável.
- **Impacto:** Após reiniciar terminais, um novo processo Claude pode herdar o agente cached de um processo antigo com o mesmo PID (e.g., mostrar @dev quando deveria ser @qa). Memory leak gradual pois entries nunca são removidas para PIDs que não retornam.
- **Fix sugerido:** (1) Usar composite key `PID+session_id`. (2) Adicionar TTL-based cleanup periódico. (3) Ou limpar cache no `Stop` event.

---

## BUG #16 — TeamBuilder É STUB, MAS BOTÃO ESTÁ ATIVO NA UI

- **Severidade:** MÉDIO
- **Arquivo:** `src/components/command-room/TeamBuilder.tsx:1-28` e `src/app/command-room/page.tsx:757-767`
- **Causa raiz:** O componente TeamBuilder retorna apenas "Em construção...", mas o botão "Squad" na toolbar está habilitado e visível:
  ```typescript
  export function TeamBuilder({ isOpen, onClose }: TeamBuilderProps) {
    if (!isOpen) return null;
    return (<div>/* ... */ Em construção...</div>);
  }
  ```
  O botão (page.tsx:757) não tem nenhum indicador visual de que a feature está incompleta.
- **Impacto:** UX confusa — usuário clica "Squad", vê modal com "Em construção", perde confiança na aplicação. O `handleCustomSquadSpawn` (page.tsx:402-474) está implementado mas nunca é chamado porque o TeamBuilder não emite `onConfirm`.
- **Fix sugerido:** (A) Desabilitar o botão com tooltip "Em breve" e estilo visual disabled. (B) Ou implementar o TeamBuilder com seleção de agentes e quantidades.

---

## BUG #17 — ws.ping() SEM TRY-CATCH NO INTERVAL DO PTY SERVER

- **Severidade:** BAIXO
- **Arquivo:** `src/server/command-room/pty-websocket-server.ts:39-46`
- **Causa raiz:** O setInterval de ping não tem proteção try-catch para `ws.ping()`:
  ```typescript
  this.pingInterval = setInterval(() => {
    Array.from(this.wss.clients).forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();  // ← pode lançar em edge cases
      }
    });
  }, PING_INTERVAL_MS);
  ```
  Se `ws.ping()` lançar uma exception, o forEach para mas o interval continua na próxima iteração.
- **Impacto:** Em edge cases, o ping interval pode falhar silenciosamente para um ciclo, ou gerar noise nos logs.
- **Fix sugerido:** Envolver `ws.ping()` em try-catch: `try { ws.ping(); } catch { /* ignore */ }`.

---

## BUG #18 — ws.on('error') NÃO REMOVE CLIENTE DA BROADCAST SET

- **Severidade:** BAIXO
- **Arquivo:** `src/server/command-room/pty-websocket-server.ts:117-119`
- **Causa raiz:** O handler de error loga mas não remove o WebSocket do Set de clientes:
  ```typescript
  ws.on('error', (err) => {
    console.error('[PtyWS] client error:', err.message);
    // ← deveria também fazer set.delete(ws)
  });
  ```
  O close handler (linha 107-114) faz a cleanup, e normalmente um error é seguido por close, MAS em edge cases o close pode não disparar imediatamente.
- **Impacto:** Entre o error e o close, broadcasts subsequentes tentam enviar dados para um WebSocket em estado de erro, gerando mais errors nos logs.
- **Fix sugerido:** Adicionar cleanup no error handler: `const set = this.clients.get(terminalId); if (set) set.delete(ws);`.

---

## BUG #19 — HOVER/STYLE INLINE NO SIDEBAR ESCAPA DO REACT

- **Severidade:** BAIXO
- **Arquivo:** `src/app/command-room/page.tsx:630-640`
- **Causa raiz:** onMouseEnter/Leave manipulam `style` diretamente via DOM API, bypassando o virtual DOM do React:
  ```typescript
  onMouseEnter={(e) => {
    (e.currentTarget as HTMLElement).style.color = 'rgba(244,244,232,0.7)';
    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
  }}
  ```
- **Impacto:** Se o componente re-renderizar durante um hover (e.g., por WebSocket update), o estilo manual do DOM é sobrescrito pelo style prop do React, causando flicker visual. É um anti-pattern React.
- **Fix sugerido:** Usar classes CSS com `:hover` pseudo-selector, ou usar useState para `isHovered` e aplicar estilos condicionalmente no JSX.

---

## BUG #20 — AvatarPicker E AvatarImage SÃO STUBS IMPORTADOS

- **Severidade:** BAIXO
- **Arquivo:** `src/components/command-room/AvatarPicker.tsx:1-20`
- **Causa raiz:** Ambos componentes são stubs que retornam `null`, mas são importados e referenciados no TerminalPanel.tsx:
  ```typescript
  export function AvatarImage() { return null; }
  export function AvatarPicker() { return null; }
  export const AIOX_AGENT_TO_AVATAR: Record<string, string> = {};
  ```
  O TerminalPanel importa esses componentes (linha 7) e usa `AIOX_AGENT_TO_AVATAR` para mapear agentes a avatares, mas o mapa está vazio.
- **Impacto:** Import desnecessário. Avatares nunca aparecem na UI dos terminais. Dead code que confunde desenvolvedores.
- **Fix sugerido:** (A) Remover imports e referências a AvatarPicker/AvatarImage do TerminalPanel. (B) Ou implementar com ícones/emojis para cada agente AIOX.

---

## RESUMO POR SEVERIDADE

| Severidade | Qtd | Bugs |
|-----------|-----|------|
| **CRÍTICO** | 2 | #1 (Rota categorias 404), #2 (Terminais sem categoria invisíveis) |
| **ALTO** | 6 | #3 (Team spawn sem chief/category), #4 (Race WS/fetch), #5 (Rename não persiste), #6 (Links não persistem), #7 (Timer leak ProcessManager), #8 (WS broadcast flood) |
| **MÉDIO** | 8 | #9 (Poll desnecessário), #10 (Drag global), #11 (Stale callback), #12 (Async reconciliation), #13 (Client map leak), #14 (Scrollback sem byte limit), #15 (PID recycling), #16 (TeamBuilder stub ativo) |
| **BAIXO** | 4 | #17 (ping sem try-catch), #18 (error handler incompleto), #19 (Hover inline DOM), #20 (Avatar stubs) |
| **TOTAL** | **20** | |

---

## CADEIA DE DEPENDÊNCIA DOS BUGS

```
Bug #1 (rota 404) ──────► Bug #2 (invisíveis) ◄──── Bug #3 (team sem category)
                                                           │
Bug #8 (WS flood) ──────► Bug #4 (race WS/fetch)         │
                                                           │
Bug #5 (rename) ───────────────────────────────────────────┤ todos perdem
Bug #6 (links) ────────────────────────────────────────────┘ dados ao reload
```

Os Bugs #1, #2 e #3 formam uma **cadeia crítica**: sem rota de categorias, categorias não podem ser criadas; se alguma categoria existir, terminais do team spawn ficam invisíveis; sem `is_chief` no team spawn, o layout Chief+Categorias não funciona.

---

## PRIORIDADE DE FIX RECOMENDADA

1. **Bug #1** — Criar rota POST /api/command-room/categories (desbloqueia categorias)
2. **Bug #2** — Renderizar terminais sem categoria (desbloqueia visibilidade)
3. **Bug #3** — Passar `is_chief` e `category_id` no team spawn (desbloqueia equipes)
4. **Bug #5 + #6** — Persistir rename e links (desbloqueia workflow principal)
5. **Bug #4 + #8** — Deduplicar WS e throttle broadcasts (estabilidade)
6. **Bug #7** — Timer cleanup no ProcessManager (confiabilidade)
7. **Restantes** — Por prioridade de impacto

---

*Relatório gerado por Sahadeva — a verdade revelada em silêncio*
