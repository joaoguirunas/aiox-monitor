# E2E User Journeys — Wave 3 Validation

> **Autor:** Rey (UX Beta) — themaestridev
> **Data:** 2026-04-14
> **Status:** Pronto para consumo por Mace Windu (QA) — JOB-033
> **Pré-condição:** Han Solo (backend) com stories 9.1b, 9.1c, 9.2, 9.2b, 9.3, 9.4 UP
> **Branch:** `feature/sala-comando-v2`
> **Referências:** `docs/SALA-DE-COMANDO-v2-MASTER-PLAN.md`; `docs/plans/hansolo-backend.md`; `docs/plans/rey-cmdk-global-spec.md`

---

## Contexto de Execução

Estas 6 jornadas validam o sistema completo da Wave 3 — backend ativo, catálogo dinâmico, canvas persistido, reconexão WS. Cada jornada é independente (pode ser executada isoladamente ou em sequência).

**Ambiente mínimo esperado:**
- `aiox-monitor` rodando em `localhost:3000`
- Projeto de teste `~/work/projeto-teste-e2e` com pelo menos 1 squad em `.claude/commands/` contendo Chief e mais 1 agente
- Projeto com grupo `sprint-planning` em `.claude/commands/{squad}/groups/sprint-planning.md` com ≥ 6 membros + topologia `chief-hub`
- WS conectado (verificar badge de status no rodapé da UI)

---

## J1 — Abrir Projeto → Catálogo → Invocar Chief → Card no Canvas

**Propósito:** validar o fluxo end-to-end de abertura de projeto, descoberta dinâmica de catálogo e criação do primeiro card.

**Stories cobertas:** 9.1b (catalog service), 9.1c (project manager), 9.2b (invoke API)

### Passos

1. Navegar para `localhost:3000/sala-de-comando`
2. Canvas deve estar no **empty state** (hero com holograma, CTA "Invocar Chief")
3. Pressionar `⌘K` (Mac) ou `Ctrl+K`
4. Na paleta, selecionar **"Abrir projeto"** → sub-fluxo "Projetos recentes" ou "Abrir pasta…"
5. Selecionar o diretório `~/work/projeto-teste-e2e`
6. Aguardar: `POST /api/projects/open` deve retornar status 200

### Assertions observáveis

- [ ] **A1** — Após `POST /api/projects/open`, evento WS `project.opened { projectPath }` é recebido em ≤ 500ms
- [ ] **A2** — Catálogo populado: dropdown do seletor de projeto no topo da UI mostra `projeto-teste-e2e`
- [ ] **A3** — Badge de projeto no cabeçalho exibe o nome do projeto (não `undefined` nem caminho completo bruto)
- [ ] **A4** — `GET /api/agents/catalog?projectPath=…` retorna ao menos 1 agente com `source: 'project'`
- [ ] **A5** — CTA "Invocar Chief (Yoda)" no empty state aparece (Chief detectado no catálogo)
- [ ] **A6** — Clicar "Invocar Chief" (ou `⌘K → Invocar agente → Chief → ↵`) chama `POST /api/agents/invoke`
- [ ] **A7** — Resposta de invoke retorna `{ id, skill_path, status: 'idle' }` em ≤ 1s
- [ ] **A8** — Evento WS `agent.added` recebido; card `AgentChatNode` aparece no canvas com avatar, nome e status dot "online"
- [ ] **A9** — Empty state desaparece após o primeiro card ser adicionado
- [ ] **A10** — Card está posicionado no centro do viewport (não em `{x:0, y:0}`)

### Pitfalls a evitar

- **Catálogo stale:** se `GET /api/agents/catalog` retorna dados de projeto anterior, o watcher não foi criado corretamente. Verificar se `POST /api/projects/open` faz `fs.watch` no `projectPath` novo.
- **Invoke sem projectPath:** `POST /api/agents/invoke` sem `projectPath` deve retornar 400 — testar esse caso também.
- **Empty state não some:** store Zustand pode não estar reagindo ao evento `agent.added`. Verificar se `WsClient` está despachando para o slice correto.
- **Card em (0,0):** `screenToFlowPosition` pode retornar `{x:0, y:0}` se viewport não estiver inicializado. Garantir que `CanvasView` chama `fitView` ou define viewport antes do primeiro `agent.added`.

---

## J2 — Conectar Chief→Luke por Drag → Aresta → `/ask @Luke oi` → Stream

**Propósito:** validar drag-to-connect, criação de aresta, autorização por connection e streaming de resposta.

**Stories cobertas:** 9.2 (connections API), 9.3 (MessageDispatcher), 9.4 (WS protocol)

**Pré-condição:** J1 concluído (Chief no canvas); Luke também invocado no canvas.

### Passos

1. Hover sobre o card do Chief — handle de saída deve aparecer na borda direita
2. Arrastar o handle do Chief e soltar sobre o card do Luke
3. Aguardar criação da aresta
4. No composer do card do Chief, digitar `/ask @Luke oi`
5. Pressionar `↵`

### Assertions observáveis

- [ ] **A1** — Ao iniciar drag do handle: outros cards compatíveis pulsam (escala 1.2×) indicando que são targets válidos
- [ ] **A2** — Ao soltar sobre Luke: `POST /api/connections { source_id: chief_id, target_id: luke_id, kind: 'chat' }` retorna 201
- [ ] **A3** — Evento WS `connection.added` recebido; aresta Bezier aparece entre Chief e Luke (1.5px, cor do Chief)
- [ ] **A4** — Aresta no estado `idle` (dashed cinza) até mensagem ser enviada
- [ ] **A5** — Após digitar `/ask @Luke oi` e `↵`: `POST /api/conversations/{convId}/messages` com `{ sender_id: chief, content: '/ask @Luke oi', addressed_to: [luke_id] }` retorna 202
- [ ] **A6** — Evento WS `agent.status { cardId: luke_id, status: 'thinking' }` recebido em ≤ 300ms
- [ ] **A7** — Status dot do Luke muda para âmbar pulsante (thinking)
- [ ] **A8** — Aresta Chief→Luke muda para estado `data-flowing` (partícula percorrendo o bezier)
- [ ] **A9** — Eventos WS `chat.chunk` chegam sequencialmente; bolha de resposta do Luke renderiza token-a-token
- [ ] **A10** — Após stream completar: `message.new` recebido; Luke volta para status `idle`; aresta volta para `active-speaking` depois `idle`

### Pitfalls a evitar

- **403 sem connection:** se `/ask` for enviado antes de aresta existir, deve retornar 403 e UI deve oferecer "Criar conexão antes de enviar". Testar esse path de erro.
- **Drag conflict:** arrastar o handle não deve mover o card. Verificar `nodrag` no handle element e `dragHandle` no header do card.
- **Aresta duplicada:** segundo drag Chief→Luke não deve criar segunda aresta (constraint `UNIQUE(source_id, target_id, kind)` no DB). UI deve mostrar toast "Conexão já existe".
- **Stream não aparece:** se `chat.chunk` chega mas a bolha não atualiza, verificar se `conversationsStore` está fazendo merge correto do delta (e não substituindo a mensagem inteira a cada chunk).
- **Luke status travado em 'thinking':** se dispatcher travar (ex: erro no SDK), `agent.status` com `idle` nunca vem. Timeout de 30s deve resetar status automaticamente.

---

## J3 — Trocar Projeto → Canvas Limpa → Catálogo Novo → Layout Antigo Salvo

**Propósito:** validar isolamento de projeto — canvas, catálogo e conversas são escopados por projeto; layout persiste por projeto.

**Stories cobertas:** 9.1b (catalog scoped), 9.1c (project switch), 9.8 (canvas_layouts)

**Pré-condição:** Projeto A aberto com 2+ cards no canvas; Projeto B disponível com catálogo diferente.

### Passos

1. Com Projeto A aberto e cards no canvas, pressionar `⌘K` → "Salvar cenário" → nome `projeto-a-default` → `↵`
2. `⌘K` → "Abrir projeto" → selecionar Projeto B
3. Confirmar troca (se houver diálogo de confirmação)
4. Observar canvas
5. `⌘K` → "Abrir projeto" → selecionar Projeto A novamente

### Assertions observáveis

- [ ] **A1** — Ao salvar cenário: `PATCH /api/canvas/layout` com `{ scenario_name: 'projeto-a-default', viewport, node_positions }` retorna 200
- [ ] **A2** — Após trocar para Projeto B: evento WS `project.closed { projectPath: projetoA }` e `project.opened { projectPath: projetoB }` em sequência
- [ ] **A3** — Canvas **limpa completamente** — nodes e arestas do Projeto A desaparecem; Zustand store `nodes` e `edges` são `[]`
- [ ] **A4** — `GET /api/agents/catalog?projectPath=projetoB` retorna agentes do Projeto B (não mistura com Projeto A)
- [ ] **A5** — Seletor de projeto no topo mostra nome do Projeto B
- [ ] **A6** — Empty state aparece se Projeto B não tiver cards salvos
- [ ] **A7** — Ao voltar para Projeto A: canvas restaura o layout salvo (`projeto-a-default`), cards nas posições corretas
- [ ] **A8** — Catálogo reverte para agentes do Projeto A (evento `catalog.reloaded`)
- [ ] **A9** — Conversas do Projeto A não aparecem no Projeto B (isolation por `project_path` nas queries)

### Pitfalls a evitar

- **Canvas não limpa:** se `project.closed` é recebido mas o reducer Zustand não limpa `nodes`/`edges`, os cards ficam "órfãos". Verificar handler do evento no store.
- **Catálogo não recarrega:** trocar projeto deve invalidar o cache do catálogo. Se `GET /api/agents/catalog` usa cache stale do projeto anterior, catálogo fica errado.
- **Layout não persiste:** `canvas_layouts` usa `project_path` como PK. Se ao salvar o `project_path` não for enviado, o layout salvo fica em limbo (não associado a nenhum projeto).
- **Watcher leak:** ao fechar Projeto A, o `fs.watch` daquele path deve ser destruído. Verificar que `POST /api/projects/close` faz cleanup; senão memória vaza com N trocas.
- **Race condition na troca:** se usuário trocar projeto enquanto stream está ativo, o `chat.chunk` que chega depois da troca não deve aparecer no novo canvas.

---

## J4 — Invocar Grupo Sprint Planning → 6 Cards + 5 Arestas Chief-Hub

**Propósito:** validar invocação de grupo com topologia chief-hub — N cards criados de uma vez, arestas corretas, members validados.

**Stories cobertas:** 9.5c (grupos), 9.2b (invoke multi-agent)

**Pré-condição:** Projeto com arquivo `.claude/commands/{squad}/groups/sprint-planning.md` contendo 6 membros (Chief + 5 outros) e `topology: chief-hub`.

### Passos

1. Canvas vazio (ou limpar com `⌘K` → fechar + reabrir projeto)
2. `⌘K` → "Invocar agente" → toggle para modo **Grupo**
3. Selecionar "Sprint Planning" na lista → preview mostra membros e topologia
4. `↵` para invocar

### Assertions observáveis

- [ ] **A1** — `POST /api/groups/{groupId}/invoke?projectPath=…` retorna `{ cardIds: [6 ids], connectionIds: [5 ids] }` em ≤ 2s
- [ ] **A2** — Exatamente 6 eventos WS `agent.added` chegam (um por card)
- [ ] **A3** — Exatamente 5 eventos WS `connection.added` chegam (Chief → cada membro)
- [ ] **A4** — Canvas mostra 6 `AgentChatNode` com nomes corretos dos agentes do grupo
- [ ] **A5** — Layout inicial: Chief centrado, 5 membros distribuídos em arco ao redor (topologia chief-hub). Não sobrepõem.
- [ ] **A6** — As 5 arestas partem do Chief para cada membro (não membro→Chief, não mesh)
- [ ] **A7** — Badges `source` corretos em cada card (agentes do projeto têm `project`, do usuário têm `user`)
- [ ] **A8** — Se um membro do grupo não existir no catálogo: toast `⚠ 1 agente não encontrado: /squad:agents:missing` + opção "Invocar parcial" (os 5 existentes) ou "Cancelar"

### Pitfalls a evitar

- **Posicionamento sobreposto:** o backend retorna apenas `cardIds`; o posicionamento inicial é calculado no frontend. Garantir que `group.invoked` payload ou a resposta do invoke inclui sugestões de posição baseadas na topologia.
- **Arestas duplicadas se Chief já existe:** se Chief já estava no canvas, `POST /api/groups/invoke` não deve criar um segundo card Chief — deve reusar o existente. Verificar lógica de "upsert or create" no backend.
- **Preview com membro desconhecido:** o preview do grupo no painel direito da paleta deve mostrar `[?] agente-desconhecido` para skill_paths não encontrados no catálogo — não deve cravar.
- **Timeout em grupo grande:** invocar 12 agentes deve ter timeout adequado (≥ 5s). Não usar timeout padrão de 1s para requests de grupos.
- **5 arestas ou 6?** Chief-hub com 6 membros = 5 arestas (Chief já é membro, não se conecta a si mesmo). Verificar que backend não cria `connection(chief → chief)`.

---

## J5 — ⌘K → Salvar Cenário → Reload Página → Carregar Cenário → Layout Restaurado

**Propósito:** validar persistência de cenários — save/load survive page reload.

**Stories cobertas:** 9.7 (CommandPaletteGlobal — scenario save/load), 9.8 (canvas_layouts)

**Pré-condição:** Canvas com pelo menos 3 cards em posições distintas, viewport não-default.

### Passos

1. Anotar posições dos 3 cards (mental ou screenshot)
2. `⌘K` → "Salvar cenário" → digitar `meu-layout` → `↵`
3. Aguardar confirmação visual (toast "Cenário 'meu-layout' salvo")
4. Recarregar a página (`Cmd+R` / `F5`)
5. Aguardar carregamento completo da Sala de Comando
6. `⌘K` → "Carregar cenário" → selecionar `meu-layout` → `↵`

### Assertions observáveis

- [ ] **A1** — Após salvar: toast "Cenário 'meu-layout' salvo" aparece em ≤ 300ms (otimista — não aguarda backend)
- [ ] **A2** — `PATCH /api/canvas/layout` com `{ scenario_name: 'meu-layout', viewport: {...}, node_positions: {...} }` retorna 200 em background
- [ ] **A3** — Após reload: canvas recarrega o **estado padrão** do projeto (último cenário ativo, não "meu-layout" automaticamente — intencional)
- [ ] **A4** — `⌘K` → "Carregar cenário" → lista mostra `meu-layout` com data de última edição
- [ ] **A5** — Selecionar `meu-layout` → `↵`: `GET /api/canvas/layout?scenario=meu-layout` retorna o payload salvo
- [ ] **A6** — Canvas aplica as posições: cards nas coordenadas idênticas às do passo 1 (tolerância ±1px)
- [ ] **A7** — Viewport restaurado: zoom e pan iguais ao estado salvo
- [ ] **A8** — Cards mantêm seus `id`s originais (não são recriados) — nomes, conversas e status preservados
- [ ] **A9** — Ao salvar com nome já existente (`meu-layout` novamente): paleta mostra "Sobrescrever 'meu-layout'? [↵ sim / Esc não]" antes de salvar

### Pitfalls a evitar

- **node_positions indexado por id errado:** se `node_positions` é salvo com IDs temporários (ex: UUIDs gerados no frontend a cada render), após reload os IDs mudam e o restore falha. Garantir que `agent_cards.id` é persistido no DB e reusado.
- **Viewport não restaurado:** `fitView` automático do React Flow pode sobrescrever o viewport restaurado. Desabilitar `fitView` quando carregando layout de cenário.
- **Toast otimista sem fallback:** se `PATCH /api/canvas/layout` falhar em background, usuário não sabe. Adicionar toast de erro secundário se request falhar em background.
- **Cenário não aparece na lista:** `GET /api/canvas/layouts` deve retornar todos os cenários do projeto ativo, não de todos os projetos. Verificar filtro por `project_path` na query.
- **Save sem nome:** input vazio ao salvar deve ser bloqueado com mensagem inline ("Nome é obrigatório") — não enviar request com `scenario_name: ''`.

---

## J6 — Desconectar Rede → WS Reconnect 30s → Catch-up de Mensagens Perdidas

**Propósito:** validar resiliência da conexão WS — reconnect automático em 30s e recuperação de eventos perdidos durante a desconexão.

**Stories cobertas:** 9.4 (WS protocol com seq + Last-Event-ID), 9.9 (guard-rails)

**Pré-condição:** Canvas com Chief e Luke conectados. Chief com stream ativo ou em conversa.

### Passos

1. Verificar que WS está conectado (badge de status verde no rodapé)
2. **Simular desconexão:** Chrome DevTools → Network → "Offline" (ou desativar interface de rede)
3. Aguardar 5s — durante esse tempo, o servidor pode ter gerado eventos (ex: heartbeat, mensagem de outro agente)
4. Observar comportamento da UI durante a desconexão
5. Restaurar conexão de rede
6. Aguardar reconnect automático

### Assertions observáveis

**Fase de desconexão:**
- [ ] **A1** — Em ≤ 5s após perda de conexão: badge de status WS muda para vermelho/laranja com tooltip "Reconectando…"
- [ ] **A2** — Toast não-intrusivo aparece: "Conexão perdida · reconectando…" (não bloqueia interação)
- [ ] **A3** — Canvas continua **interativo** durante desconexão — usuário pode mover cards, abrir paleta, ler mensagens existentes
- [ ] **A4** — `WsClient` inicia backoff: 1s → 2s → 4s → … → máximo 30s entre tentativas
- [ ] **A5** — Tentativas de reconnect visíveis no console: `[WsClient] reconnect attempt #N in Xs`

**Fase de reconnect:**
- [ ] **A6** — Após restaurar rede: WS reconecta em ≤ 30s (conforme `ProcessManager` existente)
- [ ] **A7** — Ao reconectar, cliente envia `Last-Event-ID` do último `seq` recebido antes da queda
- [ ] **A8** — Backend responde com eventos faltantes (`seq > Last-Event-ID`) em ordem
- [ ] **A9** — Mensagens enviadas por agentes durante a desconexão aparecem no canvas após reconnect (catch-up completo)
- [ ] **A10** — Badge de status WS volta para verde; toast de reconexão desaparece
- [ ] **A11** — Nenhuma mensagem duplicada (servidor não reenvia eventos anteriores ao `Last-Event-ID`)

**Verificação de integridade:**
- [ ] **A12** — Contagem de mensagens por conversa bate com o que estava no DB antes da desconexão + mensagens do período offline
- [ ] **A13** — Status dos cards (idle/thinking/speaking) está correto após catch-up — não "travado" em estado anterior à queda

### Pitfalls a evitar

- **Reconnect sem catch-up:** se WS reconecta mas não envia `Last-Event-ID`, mensagens durante a queda são perdidas silenciosamente. Verificar que `WsClient` preserva o `lastSeq` em memória e o envia no header de upgrade ou como query param.
- **Mensagens duplicadas:** se backend reenviar todos os eventos desde o início (não desde `Last-Event-ID`), canvas mostra bolhas duplicadas. Verificar lógica de sequence no `WsBroadcaster`.
- **Status travado:** se `agent.status { status: 'thinking' }` foi enviado antes da queda e `agent.status { status: 'idle' }` foi perdido, o card fica em thinking para sempre. O catch-up deve incluir eventos de status.
- **Canvas congela durante desconexão:** React não deve travar só porque WS caiu. Garantir que `useRealtime.ts` trata erros do WS sem propagar exceções para o render tree.
- **Reconexão em loop:** se o servidor estiver sobrecarregado e fechar conexões ativamente, o cliente não deve ficar em reconnect loop agressivo. Backoff exponencial com jitter (±500ms) é obrigatório.
- **DevTools "Offline" vs queda real:** DevTools bloqueia todos os requests HTTP também. No ambiente real, pode ser queda só do WS com HTTP ainda up. Testar ambos os cenários se possível.

---

## Checklist de Pré-execução (Mace Windu)

Antes de executar qualquer jornada, verificar:

- [ ] `npm run dev` rodando sem erros no terminal
- [ ] `localhost:3000` acessível no browser
- [ ] `~/work/projeto-teste-e2e` existe com estrutura `.claude/commands/` válida
- [ ] Grupo `sprint-planning.md` existe com ≥ 6 membros
- [ ] WS badge verde (conectado)
- [ ] Console do browser sem erros 🔴 no carregamento inicial
- [ ] Network tab: `GET /api/agents/catalog` retorna 200 com dados

---

## Matriz de Cobertura

| Journey | Backend stories | Frontend stories | Crítico para |
|---------|----------------|-----------------|-------------|
| J1 | 9.1b, 9.1c, 9.2b | 9.5, 9.5b | Catálogo dinâmico |
| J2 | 9.2, 9.3, 9.4 | 9.5, 9.7 | Inter-agent comm |
| J3 | 9.1b, 9.1c | 9.5, 9.8 | Isolamento de projeto |
| J4 | 9.5c, 9.2b | 9.5b, 9.5c | Modo grupo |
| J5 | 9.7, 9.8 | 9.7, 9.8 | Persistência de cenário |
| J6 | 9.4, 9.9 | 9.4 | Resiliência WS |

---

*Rey, your only limit is your heart.*
