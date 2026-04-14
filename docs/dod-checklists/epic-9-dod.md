# Definition of Done — Epic 9: Sala de Comando v2

> **Autoridade:** Mace Windu (QA) · **Baseado em:** SALA-DE-COMANDO-v2-MASTER-PLAN.md
> **Regra:** cada story só fecha quando TODOS os itens do seu bloco estiverem marcados.
> **Trabalho paralelo:** este documento não bloqueia as implementações — mas o merge final de cada story bloqueia.

---

## Pitfalls Globais — Luke (§6.1) — valem para TODAS as stories frontend

> Checklist transversal. Cada story frontend DEVE verificar os itens aplicáveis.

- [ ] **P1 — Pan/drag conflict:** wrapper do node tem `nodrag nopan`; drag ativado apenas via `dragHandle` dedicado
- [ ] **P2 — Seleção de texto:** container de mensagens tem classe `nodrag` (permite selecionar texto sem arrastar node)
- [ ] **P3 — Input foco em re-render:** `data` do node gerado com `useMemo` OU input state em Zustand/ref fora de `data`; sem reconstrução em cada render
- [ ] **P4 — `deleteKeyCode={null}`:** ReactFlow configurado com `deleteKeyCode={null}` OU filtro ativo de Backspace quando input tem foco
- [ ] **P5 — `nowheel` no body:** container de mensagens tem prop `nowheel`; scroll do chat não dispara zoom no canvas

---

## Guard-rails Globais — Han Solo (§7.3) — valem para TODAS as stories backend

> Checklist transversal. Story 9.9 implementa; as demais NÃO regridem.

- [ ] **G1 — Anti-ciclo A→B→A:** `depth-guard` implementado com `visited set` por `conversation_id` + `max_depth=3`; 4º hop retorna 409
- [ ] **G2 — Race `/ask` enquanto streama:** lock per-card; `status='streaming'` → enfileirar ou rejeitar 409; nunca dispara dispatch paralelo
- [ ] **G3 — WS backpressure:** cap `ws._socket.bufferedAmount` (limite 1MB → drop+reconnect); coalescing de frames PTY < 10ms
- [ ] **G4 — Limite 500 PTYs:** `transient: true` em todos os `maestri ask` via ProcessManager → purge imediato pós-exit; PTY default só quando promovido
- [ ] **G5 — DatabaseSync WAL:** nenhum handler de evento usa `setImmediate` que bloqueie o único writer; WAL habilitado; carga testada sob inserções concorrentes
- [ ] **G6 — Maestri zombies:** `child.kill()` chamado em todo `ws.close` / disconnect de cliente; reaper por inatividade configurado

---

## Story 9.0 — Spike: AgentChatNode isolado

> Objetivo: validar `useChat` + shadcn sem persistência. Spike — não vai para produção.

### Critérios de Aceite
- [ ] `AgentChatNode` renderiza corretamente como node no ReactFlow sem interferência do canvas
- [ ] `useChat` (Vercel AI SDK) envia e recebe streaming de tokens; UI exibe bolha token-a-token
- [ ] shadcn chat blocks integrados sem conflito de estilo com o design system atual
- [ ] Node não persiste estado no backend (in-memory ou mock)

### Pitfalls Aplicáveis
- [ ] P1, P2, P4, P5 verificados no `AgentChatNode` isolado

### Qualidade
- [ ] Sem erros no console durante uso normal
- [ ] Sem regressão em `TerminalNode` existente
- [ ] TypeScript sem erros (`npm run typecheck`)
- [ ] Lint passa (`npm run lint`)

---

## Story 9.1 — Migration SQLite

> Tabelas: `agent_cards`, `connections`, `conversations`, `messages`, `canvas_layouts`, `agent_catalog`, `agent_groups` + coluna `user_id='local'` em todas.

### Critérios de Aceite
- [ ] Migration idempotente: rodar duas vezes não quebra
- [ ] Todas as tabelas criadas com schema exatamente conforme §3.1 do plano mestre
- [ ] `user_id TEXT NOT NULL DEFAULT 'local'` presente em: `agent_cards`, `connections`, `conversations`, `messages`, `canvas_layouts`
- [ ] Índices criados: `idx_msg_conv_created`, `idx_catalog_project`, `idx_groups_project`
- [ ] Constraints `CHECK` e `ON DELETE` conforme plano (CASCADE/SET NULL/RESTRICT por tabela)
- [ ] `command_room_terminals` mantém compatibilidade; `agent_cards.pty_terminal_id` referencia com `ON DELETE SET NULL`
- [ ] `linked_terminal_ids` JSON legado NÃO removido nesta story (migração incremental)

### Guard-rails Aplicáveis
- [ ] G5: WAL habilitado no SQLite após migration; verificado via `PRAGMA journal_mode`

### Qualidade
- [ ] Migration tem rollback documentado (ou script de down-migration)
- [ ] TypeScript sem erros; lint passa
- [ ] Sem regressão nas rotas existentes de `command_room_terminals`

---

## Story 9.1b — Agent Catalog Service

> Scanner dinâmico por `projectPath`: `{projectPath}/.claude/commands/` + `~/.claude/commands/` + builtin; merge por prioridade; cache LRU; eventos WS.

### Critérios de Aceite
- [ ] `GET /api/agents/catalog?projectPath=…` retorna catálogo resolvido com merge `project > user > builtin`
- [ ] Badge `source` (`'project' | 'user' | 'builtin'`) presente em cada entrada
- [ ] Campos extraídos corretamente: `squad`, `agent_id`, `display_name`, `icon`, `role`, `skill_path`, `definition_path`, `source`, `persona_tags`
- [ ] `fs.watch` criado sob demanda ao abrir projeto; descartado após 5min sem acesso
- [ ] Múltiplos projetos abertos simultaneamente = múltiplos watchers sem vazamento de memória
- [ ] Mudança em `.claude/commands/*.md` dispara evento WS `catalog.updated` escopado ao `projectPath`
- [ ] Evento `catalog.reloaded` emitido na abertura inicial do projeto
- [ ] Cache LRU de 5–10 projetos: segundo acesso ao mesmo projeto NÃO re-parseia do disco
- [ ] Clientes em outros projetos NÃO recebem eventos de catálogo de projetos alheios

### Guard-rails Aplicáveis
- [ ] G6: watchers destruídos em `project.close`; sem watcher zumbi verificado via testes

### Qualidade
- [ ] TypeScript sem erros; lint passa
- [ ] Sem regressão em rotas existentes
- [ ] Teste unitário: merge de prioridade (mesmo `skill_path` em project + user → vence project)

---

## Story 9.1c — Project Manager

> MRU de projetos, seletor no topo da UI, ciclo de vida de watchers, eventos WS `project.*`.

### Critérios de Aceite
- [ ] `GET /api/projects/recent` retorna lista MRU (mínimo últimos 10 projetos)
- [ ] `POST /api/projects/open` cria watchers + retorna catálogo inicial; registra no MRU
- [ ] `POST /api/projects/close` libera watchers do projeto; não afeta outros projetos abertos
- [ ] Eventos WS `project.opened` e `project.closed` emitidos com `projectPath`
- [ ] Dropdown de seletor no topo da UI lista MRU + botão "Abrir pasta…" (file picker nativo)
- [ ] Trocar projeto no dropdown: canvas, catálogo, conversas e layout trocam para o novo projeto
- [ ] "Abrir pasta…" abre file picker nativo do SO; projeto selecionado registrado no MRU
- [ ] Projeto sem AIOX instalado (sem `.claude/commands/`) mostra catálogo builtin mínimo

### Pitfalls Aplicáveis
- [ ] Troca de projeto não causa re-render que dispare P3 (foco perdido nos inputs)

### Qualidade
- [ ] TypeScript sem erros; lint passa
- [ ] Sem regressão no canvas atual

---

## Story 9.2 — APIs CRUD

> `/api/agents`, `/api/connections`, `/api/conversations` + tradução dos legados.

### Critérios de Aceite
- [ ] `POST /api/agents` cria `agent_card`; retorna 201 com id
- [ ] `GET /api/agents?project=…` lista cards filtrados por projeto
- [ ] `PATCH /api/agents/:id` suporta rename, change kind; kind='terminal' só permitido com `pty_terminal_id` válido
- [ ] `DELETE /api/agents/:id` remove card + cascade em `connections`, `conversation_participants`
- [ ] `POST /api/connections` cria aresta; valida que source e target existem; `UNIQUE(source_id, target_id, kind)` aplicado
- [ ] `DELETE /api/connections/:id` remove aresta + notifica WS `connection.removed`
- [ ] `POST /api/conversations` cria conversa com participants
- [ ] `GET /api/conversations/:id/messages` retorna histórico paginado (cursor-based)
- [ ] `PATCH /api/command-room/[id]` com `linked_terminal_ids` traduzido para `/api/connections` (legado não quebra)

### Qualidade
- [ ] Todos os endpoints retornam erros estruturados (não stack trace)
- [ ] TypeScript sem erros; lint passa

---

## Story 9.2b — API `POST /api/agents/invoke`

> Cria card a partir de `{skill_path, projectPath, kind}`; valida catálogo; spawna PTY com cwd correto.

### Critérios de Aceite
- [ ] `POST /api/agents/invoke` valida que `skill_path` existe no catálogo do `projectPath` antes de criar card
- [ ] `skill_path` inexistente no catálogo → 422 com mensagem clara
- [ ] `kind='chat'` cria card sem PTY; `kind='terminal'` spawna PTY com `cwd=projectPath`
- [ ] PTY de terminal spawna com primeira linha `/{squad}:agents:{id}` escrita automaticamente
- [ ] `agent_cards.skill_path` preenchido com o valor do catálogo
- [ ] `agent_cards.project_path` preenchido com o `projectPath` da invocação
- [ ] Evento WS `agent.added` emitido após criação bem-sucedida

### Guard-rails Aplicáveis
- [ ] G4: `transient: true` NÃO usado aqui (card PTY é persistente); verificar que ProcessManager não faz purge indevido

### Qualidade
- [ ] TypeScript sem erros; lint passa
- [ ] Sem regressão em `ProcessManager` existente

---

## Story 9.3 — MessageDispatcher

> `POST /api/conversations/:id/messages` + prompt enrichment + `context-injector` + `maestri ask` via PTY transient + AgentBus.

### Critérios de Aceite
- [ ] `POST /api/conversations/:id/messages` persiste mensagem e dispara dispatcher
- [ ] Dispatcher valida `connection(sender→addressed_to)` antes de qualquer ação; sem aresta → 403
- [ ] Chief (`is_chief=1`) tem autorização implícita com todos os cards
- [ ] `context-injector` injeta bloco "Seus vizinhos" com direção (outbound/inbound/bidirectional) no início de cada turn
- [ ] Bloco "Seus vizinhos" regenerado quando `connection.added` ou `connection.removed`
- [ ] `kind='chat'`: dispatcher chama Anthropic SDK server-side com prompt enriquecido + stream SSE
- [ ] `kind='terminal'`: dispatcher chama `maestri ask` via PTY transient + ProcessManager
- [ ] PTY transient de `maestri ask` usa `transient: true`; cleanup imediato pós-exit
- [ ] `stdout-parser` agrupa output do PTY em mensagens estruturadas; não expõe bytes brutos à conversa
- [ ] Mensagem de resposta persistida em `messages` com `sender_id=B`
- [ ] `agent.status` → `thinking` ao iniciar; `idle` ao finalizar; broadcast WS em ambas transições

### Pitfalls Aplicáveis
- [ ] P3: `data` dos nodes não reconstruído a cada dispatch/broadcast

### Guard-rails Aplicáveis
- [ ] G1: `depth-guard` com visited set aplicado a cascatas (resposta de B que contém `/ask @C`)
- [ ] G2: lock per-card; status='streaming' bloqueia novo dispatch
- [ ] G4: PTY transient de `maestri ask` com purge imediato
- [ ] G6: `child.kill()` em disconnect do cliente WS

### Qualidade
- [ ] TypeScript sem erros; lint passa
- [ ] Sem regressão em PTYs permanentes existentes

---

## Story 9.4 — Extensão Protocolo WS

> Novos tipos: `chat.chunk`, `message.new`, `agent.status`, `connection.*`, `catalog.updated`, `group.invoked` + `seq`/heartbeat/reconnect.

### Critérios de Aceite
- [ ] Todos os tipos definidos com `v: 1` e campos obrigatórios conforme §3.3 do plano
- [ ] Campo `seq` monotônico por canal emitido em todos os eventos
- [ ] Heartbeat emitido a cada 25 segundos; cliente detecta ausência e reconecta
- [ ] Reconexão usa `Last-Event-ID` para retomar sequência; sem mensagens perdidas nem duplicadas
- [ ] Escopo de reconexão (`canvas|conversation|agent|pty`) respeita filtro por `projectPath`
- [ ] Clientes em projeto diferente NÃO recebem eventos de catalog/card/connection/conversation alheios
- [ ] `chat.chunk` emitido por token durante streaming; `message.new` emitido ao finalizar mensagem
- [ ] `agent.status` emitido em todas as transições de status (`idle/thinking/speaking/waiting/offline/error`)
- [ ] `connection.added` e `connection.removed` emitidos pelo CRUD de connections (9.2)

### Guard-rails Aplicáveis
- [ ] G3: cap de `bufferedAmount` (1MB) implementado no WS server; coalescing de frames PTY < 10ms

### Qualidade
- [ ] TypeScript sem erros; lint passa
- [ ] Teste: cliente perdendo conexão e reconectando recebe eventos a partir do `Last-Event-ID` correto

---

## Story 9.5 — AgentChatNode completo + Zustand store

> `AgentChatNode` full, Zustand store (`canvasStore` + `conversationsStore`), coexistência com `TerminalNode`.

### Critérios de Aceite
- [ ] `AgentChatNode` renderiza header (avatar + nome + status dot + menu), área de mensagens, input composer
- [ ] Bolhas assimétricas: user direita (accent@12%), agent esquerda (surface-200)
- [ ] Code blocks com JetBrains Mono 12px
- [ ] Input placeholder "Fale com {Nome}… ou / para comandos"; Enter envia; ⌘↵ run
- [ ] Handles: entrada (esquerda), saída (direita), broadcast (topo, diamante)
- [ ] `canvasStore` (Zustand): nodes, edges, layout; `CanvasView` lê apenas store, não props diretas
- [ ] `conversationsStore` (Zustand): conversations + messages normalizados; atualizado pelos eventos WS (9.4)
- [ ] `TerminalNode` continua funcionando no mesmo canvas; sem regressão
- [ ] `NODE_TYPES` registra ambos: `chatNode` e `terminalNode`
- [ ] Feature flag esconde `terminalNode` quando desabilitado (mas não o remove)
- [ ] `edge.data.kind: 'delegation' | 'reference'` unifica semântica entre tipos de node

### Pitfalls Aplicáveis
- [ ] P1, P2, P3, P4, P5 todos verificados no `AgentChatNode`

### Qualidade
- [ ] TypeScript sem erros; lint passa
- [ ] Sem regressão em `TerminalNode` e rotas legadas

---

## Story 9.5b — Dialog "Invocar Agente" (Raycast-style)

> Dialog contextualizado no projeto aberto: catálogo agrupado por squad, preview, toggle kind, invocação por ↵.

### Critérios de Aceite
- [ ] Dialog abre via ⌘K e botão flutuante no canto inferior-direito do canvas
- [ ] Lista agrupada por squad com badge `source` (`project` / `user` / `builtin`) ao lado do nome do squad
- [ ] Busca filtra agentes em tempo real; navegação via teclado (↑↓ + Enter)
- [ ] Preview lateral exibe: nome, role, descrição, origin path (`definition_path` resolvido dentro do projeto aberto), persona quote
- [ ] Toggle kind: `[chat]` / `[terminal]` com chat como default
- [ ] Enter → `POST /api/agents/invoke` com `{skill_path, projectPath, kind}`; card aparece no canvas
- [ ] Seletor de projeto exibido no topo do dialog com opção de trocar (`[⇅ trocar]`)
- [ ] Dialog mostra projeto corrente; trocar projeto recarrega catálogo no dialog
- [ ] Modo Grupo acessível via toggle `[Individual] / [Grupo]` no mesmo dialog (conteúdo implementado em 9.5c)

### Pitfalls Aplicáveis
- [ ] P3: abertura/fechamento do dialog não causa re-render que perca foco nos inputs do canvas

### Qualidade
- [ ] TypeScript sem erros; lint passa
- [ ] Acessibilidade: navegação full-keyboard; foco retorna ao canvas ao fechar

---

## Story 9.5c — Modo Grupo

> Grupos derivados de `.claude/commands/`: grupo-squad auto + grupo-custom de `groups/*.md`; topologias; validação de membros faltantes.

### Critérios de Aceite
- [ ] Scanner lê `{squad}/groups/*.md` no catálogo do projeto; cada arquivo vira um grupo-custom
- [ ] Cada diretório `{squad}/agents/` gera automaticamente um grupo-squad com `source='auto'`
- [ ] Grupos globais de `~/.claude/commands/{squad}/groups/*.md` disponíveis em qualquer projeto com aquele squad
- [ ] Dialog Grupo lista: grupos-squad (auto) + grupos-custom (project/user) com badge `source`
- [ ] Preview do grupo: membros resolvidos no catálogo + topologia + alerta de membros faltantes
- [ ] `POST /api/groups/:id/invoke?projectPath=…` valida cada `skill_path` contra catálogo; membros faltantes → 422 com lista ou opção "invocar parcial"
- [ ] Topologias implementadas: `chief-hub` (Chief no centro + arestas), `pipeline` (A→B→C), `mesh` (todos com todos), `none` (sem arestas)
- [ ] Chief-hub: Chief recebe aresta implícita pra todos; `is_chief=1` garante autorização universal
- [ ] Zero grupos hardcoded no código da aplicação; nenhum `Full Squad`, `Sprint Planning`, etc. pré-compilado
- [ ] `GET /api/groups?projectPath=…` retorna grupos aplicáveis (globais + do projeto)
- [ ] Evento WS `group.invoked` emitido com `{groupId, projectPath, cardIds, connectionIds}`

### Guard-rails Aplicáveis
- [ ] G1: invocar grupo com topologia mesh em squad grande não cria cascata infinita; depth-guard protege
- [ ] G4: invocar grupo não estoura limite de 500 PTYs; kind='chat' é default

### Qualidade
- [ ] TypeScript sem erros; lint passa
- [ ] Sem regressão em invocação individual (9.5b)

---

## Story 9.6 — Promoção chat→PTY (kind=hybrid)

> Promoção de `kind='chat'` para `kind='terminal'` com sumarização do histórico como prompt inicial.

### Critérios de Aceite
- [ ] Card `kind='chat'` pode ser promovido via menu do node (opção "Promover a Terminal")
- [ ] `PATCH /api/agents/:id` com `kind='terminal'` spawna PTY com `cwd=projectPath`
- [ ] Histórico de chat sumarizado antes de injetar no PTY (não full history — sumarizar quando contexto > threshold)
- [ ] Prompt inicial injetado no PTY inclui: resumo do histórico + última mensagem recebida
- [ ] Card exibe visual `kind='hybrid'` durante transição; status dot indicando promoção em andamento
- [ ] Após promoção, agente responde via PTY stream (kind='terminal'); histórico anterior mantido em `messages`
- [ ] Rebaixamento terminal→chat NÃO implementado nesta story (escopo MVP)

### Guard-rails Aplicáveis
- [ ] G4: PTY criado na promoção é permanente (não transient); ProcessManager não faz purge indevido
- [ ] G6: `child.kill()` em disconnect após promoção

### Qualidade
- [ ] TypeScript sem erros; lint passa
- [ ] Sem regressão em cards `kind='chat'` não promovidos

---

## Story 9.7 — CommandPaletteGlobal (⌘K) + SlashMenuInline (/)

> `cmdk` global + inline; vocabulário completo definido em §4.3.

### Critérios de Aceite
- [ ] ⌘K global abre `CommandPaletteGlobal` com contexto de ações do canvas
- [ ] `/` dentro do input do AgentChatNode abre `SlashMenuInline` com comandos do agente
- [ ] Contextos separados: global (ações de canvas) vs inline (comandos do agente)
- [ ] Vocabulário implementado:
  - [ ] `/ask @agente <msg>` — roteia via connection; sem aresta → UI sugere criar
  - [ ] `/task <nome>` — executa task do agente
  - [ ] `/broadcast <msg>` — envia para targets com aresta broadcast
  - [ ] `/clear` — limpa histórico visual do node
  - [ ] `/rename <novo>` — renomeia instância
  - [ ] `/mute` / `/unmute` — pausa recebimento de cross-talk
  - [ ] `/history [@agent]` — abre timeline filtrada
  - [ ] `/connect @A @B` — cria aresta (global)
  - [ ] `/scenario save <nome>` — salva layout (global)
  - [ ] `/scenario load <nome>` — aplica cenário (global)
- [ ] `@` mention no composer filtra agentes conectados (não todos)

### Pitfalls Aplicáveis
- [ ] P4: abertura do SlashMenu com `/` não dispara `deleteKeyCode` nem navegação indesejada no canvas

### Qualidade
- [ ] TypeScript sem erros; lint passa
- [ ] Acessibilidade: cmdk navegável por teclado

---

## Story 9.8 — `canvas_layouts` persistido + cenários + empty-state hero

> Layout persiste entre sessões; cenários nomeados save/load; empty-state cinematográfico.

### Critérios de Aceite
- [ ] `PATCH /api/canvas/layout` salva viewport e posições debounced 500ms em `canvas_layouts`
- [ ] Ao reabrir canvas do mesmo projeto, posições e viewport restaurados
- [ ] `canvas_layouts.project_path` é a chave; layouts diferentes por projeto
- [ ] `/scenario save <nome>` salva `canvas_layouts.scenario_name` + snapshot das posições
- [ ] `/scenario load <nome>` aplica layout salvo; cards ausentes no canvas atual adicionados conforme snapshot
- [ ] Empty-state (canvas vazio): hero cinematográfico com hologramas ciclando (Yoda, Obi-Wan, Leia) a opacity 20%
- [ ] CTA primário: "Invocar Chief (Yoda)" — um clique cria card Chief via `POST /api/agents/invoke`
- [ ] CTA secundário: "Escolher outro agente" — abre dialog ⌘K (9.5b)

### Pitfalls Aplicáveis
- [ ] P3: restauração de layout não causa re-render que perca foco em inputs ativos

### Qualidade
- [ ] TypeScript sem erros; lint passa
- [ ] Animações do empty-state respeitam `prefers-reduced-motion`

---

## Story 9.9 — Guard-rails: depth limit, lock per-card, WS backpressure, purge PTY

> Implementação completa dos 6 guard-rails de Han Solo. QA (Mace Windu) valida tudo.

### Critérios de Aceite

#### G1 — Anti-ciclo
- [ ] `depth-guard.ts` implementado com `visited set` por `conversation_id` + `max_depth=3`
- [ ] 4º hop (A→B→A→B) retorna 409 com log de warning
- [ ] Ciclo detectado NÃO causa crash; apenas bloqueia e loga
- [ ] Teste: mensagem que causaria ciclo A→B→A com depth=3 é bloqueada na tentativa do 4º hop

#### G2 — Race lock per-card
- [ ] `status='streaming'` bloqueia novo dispatch para o mesmo card; comportamento: enfileirar OU rejeitar 409 (configurável)
- [ ] Lock liberado mesmo se o stream terminar com erro
- [ ] Teste: dois `/ask` simultâneos para o mesmo card; segundo enfileirado ou rejeitado

#### G3 — WS backpressure
- [ ] Cap de `ws._socket.bufferedAmount` verificado a cada envio; ≥1MB → drop + reconexão forçada
- [ ] Coalescing de frames PTY: frames emitidos em janela < 10ms são agrupados antes de enviar
- [ ] Cliente reconecta automaticamente após drop sem intervenção do usuário

#### G4 — Limite 500 PTYs
- [ ] Todo `maestri ask` via dispatcher usa `transient: true`; contagem de PTYs ativos monitorada
- [ ] `kind='chat'` é default em novos cards; PTY só ao promover (9.6)
- [ ] Teste: spawn de 10 PTYs transients em sequência; todos destruídos após exit sem acúmulo

#### G5 — DatabaseSync WAL
- [ ] `PRAGMA journal_mode=WAL` verificado ao iniciar
- [ ] Nenhum handler de eventos usa operações síncronas pesadas que bloqueiem o writer
- [ ] Carga testada: 100 inserts/s sem lock timeout

#### G6 — Maestri zombies
- [ ] `child.kill()` chamado em TODOS os paths de `ws.close` (normal, erro, timeout)
- [ ] Reaper de inatividade: PTY transient sem atividade por X segundos → kill automático
- [ ] Teste: fechar tab/conexão WS enquanto PTY streama → PTY destruído em < 5s

### Qualidade Geral
- [ ] TypeScript sem erros; lint passa
- [ ] Testes de regressão: todas as stories 9.0–9.8 funcionam com os guard-rails ativos
- [ ] Sem regressão no `TerminalNode` e PTYs permanentes existentes
- [ ] Performance: canvas com 20 nodes ativos (10 chat + 10 terminal) sem jank (>30fps)
- [ ] OWASP básico: sem injeção via `content` da mensagem; `addressed_to` validado como UUID existente

---

## Resumo de Responsabilidades

| Story | Frontend | Backend | QA Gate |
|-------|----------|---------|---------|
| 9.0 | Luke | — | Mace Windu |
| 9.1 | — | R2-D2 | Mace Windu |
| 9.1b | — | Han Solo + Ahsoka | Mace Windu |
| 9.1c | Luke | Han Solo | Mace Windu |
| 9.2 | — | Han Solo | Mace Windu |
| 9.2b | — | Han Solo | Mace Windu |
| 9.3 | — | Han Solo | Mace Windu |
| 9.4 | Luke | Han Solo | Mace Windu |
| 9.5 | Luke + Padmé | — | Mace Windu |
| 9.5b | Luke + Padmé + Rey | — | Mace Windu |
| 9.5c | Luke + Rey | Han Solo | Mace Windu |
| 9.6 | Luke | Han Solo | Mace Windu |
| 9.7 | Luke + Rey | — | Mace Windu |
| 9.8 | Luke + Padmé | — | Mace Windu |
| 9.9 | — | Han Solo | **Mace Windu (gate final)** |

---

*Este documento é work-in-progress. Mace Windu atualiza este arquivo conforme stories são fechadas.*

— Mace Windu, this party's over. 🧪⚡
