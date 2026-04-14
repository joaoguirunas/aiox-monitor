# Slash Commands — Especificação Completa (Story 9.7)

> **Autor:** Rey (UX Beta) — themaestridev
> **Data:** 2026-04-14
> **Status:** Spec final para implementação
> **Consumidor:** Luke (Dev-Alpha) → Story 9.7 — `CommandPaletteGlobal` + `SlashMenuInline`
> **Referências:** `docs/SALA-DE-COMANDO-v2-MASTER-PLAN.md §4.3`, `§2.5`, `§3.2`, `§3.5`

---

## Sumário

- [Visão Geral da Arquitetura de Comandos](#visão-geral)
- [Grupo A — Comandos Inline (`/` no chat do node)](#grupo-a--comandos-inline)
  - [/ask](#ask)
  - [/task](#task)
  - [/broadcast](#broadcast)
  - [/clear](#clear)
  - [/rename](#rename)
  - [/mute e /unmute](#mute-e-unmute)
  - [/history](#history)
- [Grupo B — Comandos Globais (`⌘K` palette)](#grupo-b--comandos-globais-k)
  - [/connect](#connect)
  - [/scenario save](#scenario-save)
  - [/scenario load](#scenario-load)
- [Autocomplete — cmdk Inline (`/` menu)](#autocomplete--cmdk-inline)
- [Catálogo Dinâmico — Integração com §2.5](#catálogo-dinâmico--integração-com-25)
- [Comportamento sem Conexão](#comportamento-sem-conexão)
- [Acessibilidade e Keyboard Navigation](#acessibilidade-e-keyboard-navigation)
- [Tabela de Referência Rápida](#tabela-de-referência-rápida)

---

## Visão Geral

### Dois contextos de entrada

| Contexto | Atalho | Componente | Escopo |
|----------|--------|-----------|--------|
| **Inline** | `/` no composer do node | `SlashMenuInline` (`cmdk` embarcado no node) | Ações sobre aquele node/agente |
| **Global** | `⌘K` ou `Ctrl+K` em qualquer lugar do canvas | `CommandPaletteGlobal` (cmdk flutuante) | Ações sobre o canvas, conexões, cenários |

### Regra de separação

- **Inline** = o agente é o sujeito da ação. O comando age *naquele card*, *naquela conversa*, *naquele contexto*.
- **Global** = o canvas é o sujeito. O comando age sobre o grafo, as conexões, o layout.

Não há sobreposição: nenhum comando inline aparece no `⌘K` e vice-versa (exceto quando o `⌘K` é invocado com um card selecionado — veja §B.0).

### Como os comandos chegam ao backend

```
Inline  → POST /api/conversations/{convId}/messages
             { sender_id: {cardId}, content: "/{cmd} ...", kind: 'slash' }
             → MessageDispatcher interpreta e roteia

Global  → POST /api/{recurso-específico} (sem passar por messages)
```

---

## Grupo A — Comandos Inline

> **Gatilho:** usuário digita `/` no composer do node → `SlashMenuInline` abre.

---

### /ask

**Propósito:** enviar mensagem diretamente para outro agente do canvas, roteando pelo grafo de conexões.

#### Sintaxe

```
/ask @<agente> <mensagem>
     ^^^^^^^^  ^^^^^^^^^
     required  required (min 1 char após espaço)
```

#### Argumentos

| Argumento | Tipo | Obrigatório | Descrição |
|-----------|------|:-----------:|-----------|
| `@agente` | `string` — mention de card no canvas | Sim | Nome canônico ou alias do card (resolução: `display_name`, case-insensitive, fuzzy) |
| `<mensagem>` | `string` — texto livre | Sim | Corpo da mensagem; suporta markdown inline; sem limite de caractere no cliente (backend valida max 32k) |

#### Resolução de `@agente`

1. Autocomplete mostra **apenas cards atualmente no canvas** (não o catálogo inteiro).
2. Ordenação: cards com conexão ativa para o node atual vêm primeiro (badge `🔗 conectado`).
3. Cards sem conexão aparecem depois com badge `+ conectar` (ver §[Comportamento sem Conexão](#comportamento-sem-conexão)).
4. Fuzzy match por `display_name` — ex.: `@obi` resolve para `Obi-Wan (Architect)`.

#### Comportamento

```
1. Usuário submete /ask @Luke refatora o módulo X

2. UI: bolha user aparece no card atual com conteúdo "→ @Luke: refatora o módulo X"
       badge "→ routing" no header do card

3. Backend: POST /api/conversations/{conv_atual-Luke}/messages
   {
     sender_id: "{id-card-atual}",
     content:   "/ask @Luke refatora o módulo X",
     addressed_to: ["{id-card-luke}"]
   }

4. MessageDispatcher:
   a. Verifica connection(atual → Luke). Se não existe: ver §Sem Conexão.
   b. Se existe: context-injector monta prompt → roteia para Luke.

5. Luke.status → 'thinking' → broadcast WS agent.status
   aresta atual→Luke pulsa (estado 'data-flowing')

6. Luke responde → chat.chunk stream → bolha aparece no card de Luke
   com prefixo [from: {nome-card-atual}]
```

#### Mensagens de erro

| Código | Situação | Mensagem na UI |
|--------|----------|----------------|
| `E_NO_CONNECTION` | connection(A→B) não existe | Toast inline: `"@Luke não está conectado. Criar conexão agora? [Criar] [Cancelar]"` |
| `E_AGENT_NOT_FOUND` | `@agente` não existe no canvas | Toast vermelho: `"@obi não encontrado no canvas. Use ⌘K para adicionar um agente."` |
| `E_AGENT_BUSY` | target está streaming (lock per-card) | Toast: `"@Luke está processando. Tente em instantes ou clique para enfileirar."` com botão `[Enfileirar]` |
| `E_DEPTH_LIMIT` | cascata atingiu depth=3 | Toast cinza discreto: `"Limite de profundidade atingido (3 hops). Ciclo interrompido."` |
| `E_MSG_EMPTY` | mensagem após @agente está vazia | Input shake; tooltip: `"Adicione uma mensagem após @agente"` |

#### Exemplo

```
Você está no card Chief (Yoda). Digita:
/ask @Obi-Wan qual a arquitetura ideal para o módulo de billing?

Resultado:
  Card Chief  → bolha: "→ @Obi-Wan: qual a arquitetura ideal para o módulo de billing?"
  Aresta Chief→Obi-Wan: pulsa
  Card Obi-Wan → badge "thinking" → bolha streaming com [from: Chief]
```

---

### /task

**Propósito:** executar uma task AIOX do repertório do agente (tasks definidas em `.aiox-core/development/tasks/`).

#### Sintaxe

```
/task <nome-da-task> [--arg1=valor] [--arg2=valor]
      ^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^
      required        optional key=value pairs
```

#### Argumentos

| Argumento | Tipo | Obrigatório | Descrição |
|-----------|------|:-----------:|-----------|
| `<nome-da-task>` | `string` — slug da task | Sim | Slug canônico (ex: `create-story`, `draft-adr`, `qa-gate`). Fuzzy match no autocomplete. |
| `--argN=valor` | `key=string` | Não | Argumentos nomeados passados como contexto para a task. Valores com espaço: `--title="Minha feature"` |

#### Resolução de tarefas disponíveis

O menu mostra as tasks **do agente ativo**, lidas de:

1. Definição do agente (`squads/{squad}/agents/{id}.md` → seção `dependencies.tasks`).
2. Catálogo dinâmico: tasks são resolvidas dentro do `projectPath` aberto (`{projectPath}/.aiox-core/development/tasks/`).
3. Fallback para `~/.aiox-core/development/tasks/` se não encontrar no projeto.

Cada entry no autocomplete mostra:
- Nome da task
- Primeira linha da descrição (lida do arquivo `.md`)
- Atalho de teclado se mapeado

#### Comportamento

```
1. Usuário digita /task create-story --title="Feature billing v2"

2. UI: bolha user: "/task create-story — Feature billing v2"

3. Backend:
   a. Lê o arquivo de task do projectPath
   b. Monta prompt: conteúdo completo da task + argumentos injetados
   c. Roteia para o agente (mesmo card, executando a si mesmo)
   d. Se task tem elicit: true → agente responde com perguntas antes de executar

4. Agente executa → stream de resposta aparece no card
   badge "▶ running task: create-story"
```

#### Comportamento com task interativa (`elicit: true`)

Se a task tem pontos de elicitação, o agente apresenta as perguntas uma a uma. A UI não força execução — o agente guia via chat.

#### Mensagens de erro

| Código | Situação | Mensagem na UI |
|--------|----------|----------------|
| `E_TASK_NOT_FOUND` | task não existe no catálogo do agente | `"Task 'xyz' não encontrada no repertório de {NomeAgente}. Ver /help para listar."` |
| `E_TASK_FILE_MISSING` | arquivo .md da task não está no projectPath nem em fallback | `"Task encontrada no catálogo mas arquivo não localizado. Verifique a instalação do AIOX."` |
| `E_AGENT_BUSY` | agente já está executando | `"Agente ocupado. Aguarde ou use /task --queue."` |

#### Exemplo

```
No card Architect (Obi-Wan):
/task draft-adr --title="Usar Zustand no estado do canvas" --status=draft

Resultado:
  Badge: "▶ running task: draft-adr"
  Obi-Wan responde com o ADR gerado em markdown, direto no chat
```

---

### /broadcast

**Propósito:** enviar a mesma mensagem simultaneamente para todos os targets conectados via aresta `kind='broadcast'`.

#### Sintaxe

```
/broadcast <mensagem>
           ^^^^^^^^^
           required
```

#### Argumentos

| Argumento | Tipo | Obrigatório | Descrição |
|-----------|------|:-----------:|-----------|
| `<mensagem>` | `string` | Sim | Corpo da mensagem enviado identicamente a todos os targets broadcast |

#### Comportamento

```
1. /broadcast todos façam review da PR #123

2. UI: bolha user com ícone 📡 + "broadcast para N agentes"
   Badge no header: "📡 broadcasting"

3. Backend:
   a. Busca todas as connections do card atual com kind='broadcast'
   b. Se nenhuma: ver §Sem Conexão (caso broadcast)
   c. Para cada target: mesmo fluxo que /ask (autorização + dispatch)
   d. Execuções são paralelas (Promise.all)

4. Cada target recebe a mensagem com prefixo [broadcast from: {Nome}]
   Todas as arestas broadcast pulsam simultaneamente
   Mini-mapa: múltiplos dots acendem ao mesmo tempo
```

#### Mensagens de erro

| Código | Situação | Mensagem na UI |
|--------|----------|----------------|
| `E_NO_BROADCAST_EDGE` | card não tem arestas `kind='broadcast'` | Toast: `"Nenhum alvo de broadcast conectado. Use /connect ou arraste um handle de broadcast (♦ topo)."` |
| `E_PARTIAL_FAIL` | alguns targets falharam | Toast warning: `"Broadcast parcial: 3/5 receberam. Falhas: @Dev-β, @QA. [Ver detalhes]"` |
| `E_MSG_EMPTY` | mensagem vazia | Input shake; tooltip: `"Adicione uma mensagem após /broadcast"` |

#### Exemplo

```
Chief com arestas broadcast para Dev-α, Dev-β, QA:
/broadcast todos façam code review da PR #123 antes das 18h

Resultado:
  3 arestas pulsam ao mesmo tempo
  Dev-α, Dev-β, QA recebem: "[broadcast from: Chief] todos façam code review da PR #123 antes das 18h"
  Badge Chief: "📡 broadcast enviado para 3 agentes"
```

---

### /clear

**Propósito:** limpar o histórico visual do chat do node (não apaga o DB — apenas UI).

#### Sintaxe

```
/clear [--confirm]
        ^^^^^^^^
        flag opcional para pular diálogo de confirmação
```

#### Argumentos

| Argumento | Tipo | Obrigatório | Descrição |
|-----------|------|:-----------:|-----------|
| `--confirm` | `flag` | Não | Suprime o dialog de confirmação (útil para scripts/automação) |

#### Comportamento

```
1. /clear (sem flag)

2. UI: dialog "Limpar histórico visual de {NomeAgente}?
        As mensagens continuam salvas no banco de dados.
        [Cancelar]  [Limpar]"

3. Se confirmar (ou --confirm):
   a. Mensagens somem com fade-out 200ms (apenas renderização)
   b. Input recebe foco
   c. Card mostra "Histórico limpo — N mensagens preservadas no banco"
      (toast desaparece em 2s)

4. POST /api/conversations/{convId}/ui-clear
   { card_id: ... }  → backend registra evento (sem apagar mensagens)
```

> **Nota de design:** `/clear` é visual-only. O histórico completo continua acessível via `/history`. Essa distinção é importante para auditoria de cross-talk.

#### Mensagens de erro

| Código | Situação | Mensagem na UI |
|--------|----------|----------------|
| `E_NO_HISTORY` | card não tem nenhuma mensagem | Toast suave: `"Nenhuma mensagem para limpar."` |

#### Exemplo

```
/clear
→ Dialog aparece
→ Clica [Limpar]
→ Chat some, input fica em foco, toast "Histórico limpo — 47 mensagens preservadas"
```

---

### /rename

**Propósito:** renomear a instância do agente no canvas (sem alterar o agente base).

#### Sintaxe

```
/rename <novo-nome>
        ^^^^^^^^^^
        required, 1–48 chars
```

#### Argumentos

| Argumento | Tipo | Obrigatório | Validação |
|-----------|------|:-----------:|-----------|
| `<novo-nome>` | `string` | Sim | 1–48 caracteres; sem `@` no início (reservado para mentions); strip whitespace nas bordas |

#### Comportamento

```
1. /rename Dev-α · feature-billing

2. UI: header do card atualiza inline com animação de crossfade (150ms)
   Tooltip no header: "Anteriormente: Dev-Alpha"

3. PATCH /api/agents/{cardId} { display_name: "Dev-α · feature-billing" }

4. Broadcast WS: agent.renamed { cardId, oldName, newName }
   → Outros cards que referenciam este (@Dev-Alpha em mensagens passadas) não são retroativamente atualizados
   → Novas mentions usam o novo nome
   → Mini-mapa atualiza o label do node
```

#### Mensagens de erro

| Código | Situação | Mensagem na UI |
|--------|----------|----------------|
| `E_NAME_EMPTY` | nome vazio | Input shake: `"Nome não pode estar vazio"` |
| `E_NAME_TOO_LONG` | > 48 chars | Contador inline vermelho; bloqueia submit |
| `E_NAME_CONFLICT` | já existe um card com exatamente esse nome | Toast: `"Já existe um agente com esse nome no canvas. Use um sufixo para diferenciar."` |
| `E_NAME_RESERVED` | começa com `@` | `"Nomes não podem começar com @"` |

#### Exemplo

```
Card "Dev-Alpha". Digita:
/rename Dev-α · billing-module

Header atualiza para: "Dev-α · billing-module"
Tooltip: "Anteriormente: Dev-Alpha"
```

---

### /mute e /unmute

**Propósito:** pausar temporariamente o recebimento de cross-talk (mensagens vindas de outros agentes via conexões) sem remover as conexões.

#### Sintaxe

```
/mute   [--duration=<tempo>]
/unmute
```

#### Argumentos (`/mute`)

| Argumento | Tipo | Obrigatório | Descrição |
|-----------|------|:-----------:|-----------|
| `--duration` | `string` — ex: `30s`, `5m`, `1h` | Não | Auto-unmute após o tempo. Sem flag: mute permanente até `/unmute` manual |

#### Comportamento — `/mute`

```
1. /mute --duration=5m

2. UI:
   a. Card entra no estado visual "muted" (opacidade 0.5, borda tracejada)
   b. Badge no header: "🔇 5m"
   c. Contador regressivo no badge (atualiza a cada 60s)
   d. Arestas de entrada ficam com stroke opacity 0.3 ("dormentes")

3. PATCH /api/agents/{cardId} { status: 'muted', muted_until: <ISO timestamp ou null> }

4. Backend: MessageDispatcher ignora este card como target enquanto muted
   Mensagens dirigidas a ele retornam 503 (Muted) → remetente recebe toast:
   "@Luke está mudo. Mensagem não entregue."

5. Auto-unmute: se --duration definido, backend tem job que chama PATCH status='idle' no vencimento
   WS: agent.status atualiza → UI remove badge muted
```

#### Comportamento — `/unmute`

```
1. /unmute

2. UI:
   a. Card sai do estado "muted" — fade-in para opacity normal (200ms)
   b. Badge "🔇" some
   c. Toast: "@Luke voltou a receber mensagens"

3. PATCH /api/agents/{cardId} { status: 'idle', muted_until: null }
```

#### Mensagens de erro

| Código | Situação | Mensagem na UI |
|--------|----------|----------------|
| `E_ALREADY_MUTED` | `/mute` quando já está muted | Toast suave: `"Agente já está mudo. Use /unmute para reativar ou /mute --duration=Xm para redefinir o timer."` |
| `E_NOT_MUTED` | `/unmute` quando não está muted | Toast suave: `"Agente já está ativo."` |
| `E_INVALID_DURATION` | formato inválido ex: `--duration=abc` | Toast: `"Duração inválida. Use: 30s, 5m, 1h, 2h etc."` |

#### Exemplo

```
/mute --duration=10m
→ Card fica translúcido, badge "🔇 10m"
→ Qualquer /ask @Luke retorna: "@Luke está mudo (9m restantes). Mensagem não entregue."

10 min depois:
→ Badge some, card volta ao normal, toast discreto "🔊 Luke voltou a receber mensagens"
```

---

### /history

**Propósito:** abrir a timeline de mensagens filtrada para o agente, opcionalmente cruzada com outro agente específico.

#### Sintaxe

```
/history [@agente] [--last=<N>] [--from=<ISO>] [--to=<ISO>]
          ^^^^^^^^  ^^^^^^^^^^   ^^^^^^^^^^^^^   ^^^^^^^^^^^
          optional  optional     optional         optional
```

#### Argumentos

| Argumento | Tipo | Obrigatório | Descrição |
|-----------|------|:-----------:|-----------|
| `@agente` | `string` — mention | Não | Se presente, filtra apenas mensagens entre este card e o `@agente` especificado |
| `--last=N` | `integer` | Não | Mostra apenas as últimas N mensagens. Default: 50 |
| `--from=<ISO>` | `ISO 8601 date` | Não | Filtra a partir desta data |
| `--to=<ISO>` | `ISO 8601 date` | Não | Filtra até esta data |

#### Comportamento

```
1. /history @Obi-Wan --last=20

2. UI:
   a. Painel lateral "Timeline" desliza da direita (largura 380px)
   b. Header: "Histórico: {NomeCard} ↔ Obi-Wan — últimas 20 mensagens"
   c. Mensagens em ordem cronológica com:
      - Timestamp relativo (ex: "há 3 min") + absoluto no hover
      - Remetente com avatar
      - Conteúdo com markdown renderizado
      - Ícone de tipo: 🔵 user, 🟢 agent, 📡 broadcast, ⚙️ system
   d. Botão "Fechar" (Esc também fecha)
   e. Botão "Exportar CSV" no footer

3. GET /api/conversations?between={cardAtual}&and={idObiWan}&last=20
```

#### Mensagens de erro

| Código | Situação | Mensagem na UI |
|--------|----------|----------------|
| `E_AGENT_NOT_FOUND` | `@agente` não existe | `"@xyz não encontrado no canvas."` |
| `E_NO_HISTORY` | nenhuma mensagem no filtro | Painel abre com empty state: `"Nenhuma mensagem encontrada com esses filtros."` |
| `E_INVALID_DATE` | formato de data inválido | `"Data inválida. Use formato ISO: 2026-04-14T14:00:00Z"` |

#### Exemplo

```
/history
→ Abre timeline do card atual (todas as conversas)

/history @Chief
→ Abre timeline específica: card atual ↔ Chief

/history --last=100 --from=2026-04-14
→ Últimas 100 mensagens desde hoje
```

---

## Grupo B — Comandos Globais (⌘K)

> **Gatilho:** `⌘K` (Mac) ou `Ctrl+K` (Windows/Linux) — abre `CommandPaletteGlobal` flutuante, centralizado na tela.
>
> **Contexto com card selecionado:** se um card está selecionado quando ⌘K é aberto, o contexto `activeCard` é passado e alguns comandos pre-populam `@AgenteSelecionado`.

---

### /connect

**Propósito:** criar uma aresta (conexão) entre dois agentes do canvas, sem ter que arrastar handles.

#### Sintaxe

```
/connect @<origem> @<destino> [--kind=<tipo>] [--direction=<dir>]
          ^^^^^^^^  ^^^^^^^^^  ^^^^^^^^^^^^    ^^^^^^^^^^^^^
          required  required   optional        optional
```

#### Argumentos

| Argumento | Tipo | Obrigatório | Valores | Default |
|-----------|------|:-----------:|---------|---------|
| `@origem` | mention | Sim | Qualquer card no canvas | — |
| `@destino` | mention | Sim | Qualquer card no canvas (diferente de origem) | — |
| `--kind` | `enum` | Não | `chat`, `broadcast`, `supervise`, `context-share` | `chat` |
| `--direction` | `enum` | Não | `forward` (A→B), `backward` (B→A), `both` (A↔B) | `forward` |

#### Comportamento

```
1. /connect @Chief @Dev-Alpha --kind=broadcast

2. CommandPalette fecha

3. Canvas:
   a. Aresta aparece com animação "path draw" via stroke-dasharray (500ms)
   b. Badge flutuante na aresta: "broadcast"
   c. Toast: "✓ Conexão criada: Chief → Dev-Alpha (broadcast)"

4. POST /api/connections
   {
     source_id: "{id-chief}",
     target_id: "{id-dev-alpha}",
     kind: "broadcast",
     directed: 1
   }

5. Broadcast WS: connection.added → outros clientes veem a aresta aparecer
```

#### Autocomplete com card selecionado

Se Chief está selecionado quando ⌘K abre:

```
⌘K → /connect
→ Pre-popula: /connect @Chief _
→ Cursor posicionado após @Chief, aguarda @destino
```

#### Mensagens de erro

| Código | Situação | Mensagem na UI |
|--------|----------|----------------|
| `E_SAME_SOURCE_TARGET` | origem === destino | `"Origem e destino devem ser agentes diferentes."` |
| `E_AGENT_NOT_FOUND` | um dos @agentes não existe | `"@xyz não encontrado no canvas."` |
| `E_CONNECTION_EXISTS` | aresta idêntica já existe | `"Conexão @A → @B (kind: chat) já existe. Use --kind para criar outro tipo."` |
| `E_INVALID_KIND` | kind desconhecido | `"Tipo inválido. Valores: chat, broadcast, supervise, context-share"` |

#### Exemplo

```
/connect @Architect @Dev-Alpha
→ Aresta chat direcionada: Architect → Dev-Alpha

/connect @Chief @Dev-Alpha @Dev-Beta @QA --kind=broadcast
→ Atenção: /connect suporta apenas 2 agentes por chamada.
  Toast: "Use /connect separado para cada par, ou invoque um grupo."

/connect @Architect @Dev-Alpha --direction=both
→ Aresta bidirecional: Architect ↔ Dev-Alpha
```

---

### /scenario save

**Propósito:** salvar o estado atual do canvas (posições, agentes, conexões, zoom/viewport) como um cenário nomeado reutilizável.

#### Sintaxe

```
/scenario save <nome> [--overwrite]
               ^^^^^^  ^^^^^^^^^^^
               required optional
```

#### Argumentos

| Argumento | Tipo | Obrigatório | Validação |
|-----------|------|:-----------:|-----------|
| `<nome>` | `string` | Sim | 1–64 chars; sem `/` ou `\`; strip whitespace; slug auto-gerado internamente (ex: `sprint-planning`) |
| `--overwrite` | `flag` | Não | Sobrescreve sem pedir confirmação se cenário com mesmo nome já existe |

#### Comportamento

```
1. /scenario save sprint-planning

2. Backend captura snapshot:
   - node_positions: { [cardId]: { x, y } }
   - viewport: { x, y, zoom }
   - agent_card_ids: [todos os cards atuais]
   - connection_ids: [todas as arestas atuais]
   - scenario_name: "sprint-planning"
   - project_path: (projeto aberto atualmente)

3. PATCH /api/canvas/layout { scenario_name: "sprint-planning", ... snapshot }
   (upsert: cria se não existe, atualiza se existe com --overwrite ou sem conflito)

4. Se existe conflito (nome já usado) sem --overwrite:
   Dialog: "Cenário 'sprint-planning' já existe. Sobrescrever?
            [Cancelar]  [Sobrescrever]"

5. Success:
   Toast: "✓ Cenário 'sprint-planning' salvo"
   Dropdown de cenários no header atualiza (novo item aparece)
```

#### Mensagens de erro

| Código | Situação | Mensagem na UI |
|--------|----------|----------------|
| `E_NAME_EMPTY` | nome vazio | `"Nome do cenário obrigatório. Ex: /scenario save sprint-planning"` |
| `E_NAME_TOO_LONG` | > 64 chars | `"Nome muito longo (máx. 64 chars)"` |
| `E_NAME_CONFLICT` | nome já existe, sem --overwrite | Dialog de confirmação (ver comportamento acima) |
| `E_CANVAS_EMPTY` | canvas sem nenhum agente | `"Adicione pelo menos um agente ao canvas antes de salvar um cenário."` |

#### Exemplo

```
Canvas tem: Chief, Architect, Dev-Alpha com conexões configuradas.

/scenario save code-review
→ Toast: "✓ Cenário 'code-review' salvo"

Amanhã, canvas limpo:
/scenario load code-review
→ Canvas restaura exatamente o estado salvo
```

---

### /scenario load

**Propósito:** aplicar um cenário salvo ao canvas atual, restaurando posições, agentes e conexões.

#### Sintaxe

```
/scenario load <nome> [--merge]
               ^^^^^^  ^^^^^^^
               required optional
```

#### Argumentos

| Argumento | Tipo | Obrigatório | Descrição |
|-----------|------|:-----------:|-----------|
| `<nome>` | `string` | Sim | Nome exato do cenário (autocomplete lista os disponíveis) |
| `--merge` | `flag` | Não | Em vez de substituir o canvas, adiciona os agentes do cenário aos existentes. Default: substituir (com confirmação se canvas não está vazio) |

#### Autocomplete de `<nome>`

O menu do `/scenario load` mostra a lista de cenários salvos para o projeto aberto, lida de `canvas_layouts` filtrado por `project_path`. Cada entry mostra:

```
  ▸ sprint-planning   ·  5 agentes  ·  salvo há 2 dias
    code-review       ·  4 agentes  ·  salvo há 1 sem
    debug-session     ·  3 agentes  ·  salvo há 3 sem
```

#### Comportamento

```
1. /scenario load sprint-planning

2. Se canvas não está vazio:
   Dialog: "Carregar 'sprint-planning' substituirá o canvas atual.
            (Os dados de conversa são preservados no banco.)
            [Cancelar]  [--merge Mesclar]  [Substituir]"

3. Se canvas está vazio OU --merge: sem dialog.

4. GET /api/canvas/layout?scenario=sprint-planning&project={projectPath}

5. Canvas:
   a. Agentes do cenário aparecem nas posições salvas (fade-in, 300ms stagger)
   b. Conexões são re-criadas com animação "path draw"
   c. Viewport restaurado (zoom + pan)
   d. Toast: "✓ Cenário 'sprint-planning' carregado — 5 agentes, 4 conexões"

6. Se --merge:
   Agentes existentes permanecem. Novos agentes do cenário são adicionados.
   Se houver card com mesmo skill_path: não duplica, apenas reposiciona.
```

#### Mensagens de erro

| Código | Situação | Mensagem na UI |
|--------|----------|----------------|
| `E_SCENARIO_NOT_FOUND` | nome não existe | `"Cenário 'xyz' não encontrado. Use /scenario save para criar."` — lista os disponíveis como sugestão |
| `E_AGENT_MISSING` | agente do cenário não está mais no catálogo do projeto | Toast warning: `"⚠ 2 agentes do cenário não encontrados no catálogo de /projeto-X: @Dev-Gamma, @DevOps. Carregamento parcial."` — carrega o que for possível |
| `E_SCENARIO_EMPTY` | cenário salvo sem agentes | `"Cenário 'xyz' está vazio."` |

#### Exemplo

```
/scenario load
→ Autocomplete abre com lista de cenários disponíveis

/scenario load code-review
→ Dialog de confirmação se canvas tem agentes
→ Canvas restaura code-review: Architect, Dev-Alpha, QA + 2 conexões

/scenario load sprint-planning --merge
→ Sem dialog; sprint-planning é somado ao que já está no canvas
```

---

## Autocomplete — cmdk Inline

### Componente: `SlashMenuInline`

O menu abre automaticamente ao digitar `/` no composer do node. Implementado com `cmdk` embarcado diretamente no node (não é o CommandPaletteGlobal).

### Estrutura visual do menu

```
╭──────────────────────────────────────────────────────────╮
│  /ask                    ← input do usuário              │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ ▸ /ask @agente           Enviar para outro agente   │ │
│ │   /task <nome>           Executar task do agente    │ │
│ │   /broadcast <msg>       Enviar para todos targets  │ │
│ │   /clear                 Limpar histórico visual    │ │
│ │   /rename <novo>         Renomear esta instância    │ │
│ │   /mute                  Pausar recebimento         │ │
│ │   /history               Ver timeline               │ │
│ └──────────────────────────────────────────────────────┘ │
│ ┌──────── preview ──────────────────────────────────────┐ │
│ │ /ask @agente <mensagem>                               │ │
│ │ Roteia a mensagem para outro agente via conexão.      │ │
│ │ Se não houver conexão, a UI sugere criar.             │ │
│ │                                                       │ │
│ │ Exemplo:  /ask @Obi-Wan qual a arquitetura?           │ │
│ └───────────────────────────────────────────────────────┘ │
╰──────────────────────────────────────────────────────────╯
```

### Painel de preview (obrigatório)

Ao navegar o menu, o item focado expande um preview abaixo (ou lateral, dependendo do espaço disponível). O preview mostra:

| Campo | Conteúdo |
|-------|---------|
| **Sintaxe completa** | `/{comando} {args com tipos}` |
| **Descrição** | 1–2 linhas do que o comando faz |
| **Exemplo** | exemplo real contextualizado com o agente atual |
| **Atalho de teclado** | se existir, ex: `↵ executar • Tab completar` |

### Comportamento do filtro

```
/ → lista todos os 7 comandos
/a → filtra: /ask, (/broadcast não aparece — apenas prefixo)
/ask → comando selecionado, cursor move para espaço pós-comando
/ask @ → submenu de @mentions abre (cards no canvas)
/ask @o → fuzzy filtra: Obi-Wan, (nada mais que comece com "o")
/ask @Obi-Wan → mention confirmada, cursor move para espaço da mensagem
```

### Submenu de @mentions (após `/ask @`)

```
┌──────────────────────────────────────────────────────────┐
│ 🔗 conectado (3)                                         │
│   🏛 Obi-Wan · Architect         /themaestridev:arch      │
│   💻 Luke · Dev-Alpha            /themaestridev:dev-alpha  │
│   🧪 Mace · QA                   /themaestridev:qa         │
│                                                          │
│ + sem conexão (2)                                        │
│   💻 Han · Dev-Beta              + conectar              │
│   🚀 Gage · DevOps               + conectar              │
└──────────────────────────────────────────────────────────┘
```

- **Seção "conectado":** cards com connection(atual→target) existente. Navegação imediata.
- **Seção "+ sem conexão":** outros cards no canvas. Selecionar um abre o flow de "Criar conexão?" antes de enviar.

### Submenu de tasks (após `/task `)

```
┌──────────────────────────────────────────────────────────┐
│ Tasks disponíveis para Architect (Obi-Wan)               │
│                                                          │
│   ux-user-research       Pesquisa de usuário             │
│   draft-adr              Criar Architecture Decision     │
│   complexity-assessment  Avaliar complexidade            │
│   create-doc             Gerar documentação              │
│   ...                                                    │
│                                                          │
│ Fonte: /Users/me/projeto-x/.aiox-core/development/tasks/ │
└──────────────────────────────────────────────────────────┘
```

### Keyboard shortcuts

| Tecla | Ação |
|-------|------|
| `↑` / `↓` | navegar items |
| `Tab` | completar token atual (comando ou @mention) |
| `Enter` | confirmar item e mover para próximo argumento |
| `Esc` | fechar menu sem executar |
| `Backspace` (quando input vazio) | fechar menu |

---

## Catálogo Dinâmico — Integração com §2.5

### Regra fundamental

**O autocomplete de @mentions nunca é hardcoded.** Ele lê exclusivamente:

1. **Cards ativos no canvas** (fonte primária) — agentes já invocados na sessão atual.
2. **Catálogo do projeto aberto** (para `/connect @A @B` e `/task`) — via `GET /api/agents/catalog?projectPath=…`.

### Como o catálogo afeta cada comando

| Comando | Fonte de autocomplete | Atualização |
|---------|-----------------------|-------------|
| `/ask @agente` | Cards no canvas (live) | Reativo ao WS `agent.added/removed` |
| `/task <nome>` | Tasks do agente ativo (do catálogo do projeto) | Reativo ao WS `catalog.updated` |
| `/broadcast` | Nenhum argumento adicional — age sobre arestas existentes | — |
| `/connect @A @B` | Cards no canvas + catálogo do projeto | Reativo a ambos |
| `/scenario load` | `canvas_layouts` por `project_path` | Reativo ao save de cenários |

### Evento de recarregamento

Quando o usuário troca de projeto (`project.opened` via WS), o `SlashMenuInline` e o `CommandPaletteGlobal`:

1. Descartam o cache de catálogo anterior.
2. Refletem o novo catálogo assim que `catalog.reloaded` chega via WS.
3. Se o menu estiver aberto no momento da troca: fecha automaticamente e abre novamente com nova lista.

### Badge de origem no autocomplete

Para `/task`, cada task mostra sua origem:

```
  create-story     [project]   Criar nova story
  draft-adr        [project]   Criar ADR
  create-doc       [user]      Gerar documentação
  run-tests        [builtin]   Executar testes
```

- `[project]`: task existe em `{projectPath}/.aiox-core/`
- `[user]`: task existe em `~/.aiox-core/`
- `[builtin]`: fallback do aiox-monitor

---

## Comportamento sem Conexão

### Cenário: `/ask @Luke` sem connection(atual → Luke)

```
1. Backend retorna 403 E_NO_CONNECTION

2. UI: toast inline no chat (não bloqueia o input):

   ┌─────────────────────────────────────────────────────────┐
   │ ⚠ @Luke não está conectado a este agente               │
   │                                                         │
   │   [Criar conexão chat →]   [Criar + enviar]   [Cancelar] │
   └─────────────────────────────────────────────────────────┘

3. "Criar conexão chat →":
   POST /api/connections { source: atual, target: luke, kind: 'chat' }
   → Aresta aparece no canvas com animação
   → Toast: "✓ Conectado. Reenvie a mensagem para @Luke."
   → Mensagem original NÃO é enviada automaticamente (requer ação do usuário)

4. "Criar + enviar":
   POST /api/connections → aguarda confirmação → POST /api/conversations/.../messages
   → Sequência automática: cria conexão + envia a mensagem
   → Aresta aparece E resposta de Luke começa a aparecer

5. "Cancelar": toast some, input preserva o texto original
```

### Cenário: `/broadcast` sem arestas broadcast

```
Toast:
  "Nenhum alvo de broadcast. Arraste o handle ♦ (topo do card)
   para outro agente, ou use /connect @A @B --kind=broadcast"
```

### Cenário: `/connect @A @B` com um dos agentes fora do canvas

```
Toast:
  "@Dev-Gamma não está no canvas.
   [Invocar @Dev-Gamma]   [Cancelar]"

"Invocar @Dev-Gamma":
  Abre ⌘K dialog pré-filtrado para "Dev-Gamma" no catálogo do projeto
```

---

## Acessibilidade e Keyboard Navigation

### ARIA

| Elemento | Role | Atributos |
|----------|------|-----------|
| Container do menu | `role="combobox"` | `aria-expanded`, `aria-controls` |
| Lista de comandos | `role="listbox"` | `aria-label="Comandos disponíveis"` |
| Cada item | `role="option"` | `aria-selected`, `aria-describedby` (preview id) |
| Preview | `role="region"` | `aria-label="Pré-visualização do comando"`, `aria-live="polite"` |
| Toast de erro | `role="alert"` | `aria-live="assertive"` |

### Focus management

- Ao digitar `/`, foco permanece no input do composer (menu é sobreposto, não desvia foco).
- `↑`/`↓` navigam o `listbox` sem tirar foco do input.
- `Esc` fecha o menu e devolve foco ao input.
- Toast de erro: anunciado via `aria-live="assertive"` mas **não** rouba foco.

### `prefers-reduced-motion`

Todas as animações do slash menu (scale, fade, path draw) são omitidas quando `prefers-reduced-motion: reduce`. O menu aparece/desaparece instantaneamente.

---

## Tabela de Referência Rápida

### Grupo A — Inline (`/`)

| Comando | Sintaxe | Argumentos obrigatórios | Comportamento resumido | Erro principal |
|---------|---------|------------------------|----------------------|----------------|
| `/ask` | `/ask @agente <msg>` | `@agente`, `<msg>` | Roteia msg via connection; 403 se não há conexão → UI sugere criar | `E_NO_CONNECTION` → criar connection |
| `/task` | `/task <nome> [--arg=v]` | `<nome>` | Executa task AIOX do repertório do agente; task pode ser interativa | `E_TASK_NOT_FOUND` |
| `/broadcast` | `/broadcast <msg>` | `<msg>` | Envia para todos targets com kind=broadcast em paralelo | `E_NO_BROADCAST_EDGE` |
| `/clear` | `/clear [--confirm]` | — | Limpa visual do chat (DB preservado); dialog de confirmação sem flag | `E_NO_HISTORY` |
| `/rename` | `/rename <novo>` | `<novo>` | Renomeia instância no canvas; broadcast WS agent.renamed | `E_NAME_CONFLICT` |
| `/mute` | `/mute [--duration=T]` | — | Pausa cross-talk; auto-unmute se duration definido | `E_ALREADY_MUTED` |
| `/unmute` | `/unmute` | — | Reativa recebimento de cross-talk | `E_NOT_MUTED` |
| `/history` | `/history [@a] [--last=N]` | — | Abre painel lateral de timeline filtrada | `E_NO_HISTORY` |

### Grupo B — Global (`⌘K`)

| Comando | Sintaxe | Argumentos obrigatórios | Comportamento resumido | Erro principal |
|---------|---------|------------------------|----------------------|----------------|
| `/connect` | `/connect @A @B [--kind=T] [--direction=D]` | `@A`, `@B` | Cria aresta A→B; kind default=chat; animação path draw | `E_CONNECTION_EXISTS` |
| `/scenario save` | `/scenario save <nome>` | `<nome>` | Snapshot do canvas → canvas_layouts; dialog se conflito de nome | `E_CANVAS_EMPTY` |
| `/scenario load` | `/scenario load <nome> [--merge]` | `<nome>` | Restaura canvas; dialog se canvas não-vazio; --merge adiciona | `E_SCENARIO_NOT_FOUND` |

---

*— Rey, the Force reveals all 🎨🌟*
