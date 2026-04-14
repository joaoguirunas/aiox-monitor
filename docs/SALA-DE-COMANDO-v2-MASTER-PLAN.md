# Sala de Comando v2 — Plano Mestre

> **Consolidação orquestrada por Yoda (Chief).** Baseado em 6 pesquisas paralelas: Rey (UX), Ahsoka (Tech), Padmé (UI), Obi-Wan (Arch), Luke (Frontend), Han Solo (Backend).
> **Data:** 2026-04-14 · **Status:** Plano para aprovação — SEM código ainda.
> **Origens:**
> - `docs/ux-sala-comando-v2.md` (Rey)
> - `docs/plans/ahsoka-tech.md`
> - `docs/plans/padme-ui.md`
> - `docs/plans/obiwan-architecture.md`
> - `docs/plans/luke-frontend.md`
> - `docs/plans/hansolo-backend.md`

---

## 1. Visão

Transformar a Sala de Comando de um **grid estático de terminais pretos** num **canvas vivo de agentes conversando** — estilo n8n mas com chat real, não pipeline.

**Regras centrais:**
1. Cada agente é um **cartão de chat ao vivo** (não terminal). Opcionalmente promovível a PTY real.
2. Canvas infinito com **drag-to-connect**; conexões transportam **contexto conversacional**, não dados tipados.
3. **⌘K** é o ponto de entrada universal. Não existe mais `+Squad`.
4. `/` dentro do chat do agente = slash commands do repertório dele.
5. Tudo é **tempo real**: streaming token-a-token + arestas pulsando quando contexto flui.
6. **Claude Code como runtime real** — `maestri ask` sob o capô, nunca mock.

---

## 1.5 Decisões Aprovadas (2026-04-14)

| # | Decisão | Valor |
|---|---------|-------|
| 1 | Arestas direcionadas por default | ✅ Sim; broadcast é kind separado |
| 2 | Conversation auto-criada ao conectar | ✅ Sim |
| 3 | Coexistência TerminalNode × ChatNode | ✅ Permanente (chat default, PTY promovível) |
| 4 | Chief é card normal | ✅ Sim (`is_chief=1`) |
| 5 | Cenários salvos na v2.0 | ✅ Sim (story 9.8) |
| 6 | `user_id='local'` em todas as tabelas | ✅ Sim (multi-user ready) |
| 7 | Persistir scrollback PTY | ❌ Não, só mensagens estruturadas |
| **8** | **Catálogo de agentes é dinâmico por projeto** | ✅ **Scanner lê `{projectAberto}/.claude/commands/` — nunca hardcoded no aiox-monitor. Merge com `~/.claude/commands/` (user) + builtin mínimo** |
| **9** | **Modo Grupo (multi-select → auto-connect)** | ✅ **Incluído no escopo v2.0 — grupos escopados por projeto ou globais** |
| **10** | **Seletor de projeto é cidadão primeira-classe da UI** | ✅ **Dropdown no topo + "Abrir pasta…" + MRU; trocar projeto troca catálogo, canvas, conversas** |

---

## 2. Stack Final (convergência dos 6 relatórios)

| Camada | Escolha | Por quê |
|--------|---------|---------|
| **Canvas** | `@xyflow/react` v12 (já no repo) | Scaffold existe, custom nodes ricos provados (TerminalPanel já roda xterm dentro). Mantém commit `80a0ce0`. |
| **Chat UI** | **Vercel AI SDK `useChat` + shadcn chat blocks** | Headless + provider-agnostic; aponta pra rota própria que roteia via Maestri. Zero lock-in. (Ahsoka sugeriu assistant-ui; Luke venceu debate — opinativo demais). |
| **State** | **Zustand** global + `BroadcastChannel` multi-tab | React Flow já usa Zustand internamente; sem CRDT (single-user). |
| **Realtime** | **Manter WebSocket** existente (`/ws`, `/pty`) + estender protocolo | Han Solo venceu Ahsoka: já existe infra completa com scrollback, reconnect 30s, broadcast. Zero regressão. |
| **Persistência** | **node:sqlite atual** + novo schema | `DatabaseSync` WAL faz 5-10k inserts/s. 100 msgs/min é folga 3000×. |
| **Maestri CLI** | `node-pty` (reuso do `ProcessManager`) | Trata `maestri ask` como PTY transient. Reaproveita scrollback, WS broadcast, cleanup. |
| **Command palette** | **cmdk** global (⌘K) + cmdk inline (`/`) no composer | Já no shadcn; contexto separado (global=ações, inline=comandos do agente). |
| **Drag-drop** | HTML5 DnD nativo + `screenToFlowPosition` | React Flow não tem `useOnDrop`. Padrão oficial; ~30 linhas. |

---

## 2.5 AIOX-Native Agent Discovery — fundamento do sistema

**Princípio crítico:** o **aiox-monitor é META** — observa N projetos. **Cada projeto tem sua própria `.claude/commands/`.** A Sala de Comando descobre agentes **dinamicamente a partir do projeto aberto**, nunca a partir do próprio aiox-monitor.

**Zero hardcode.** Se hoje abro o projeto `~/work/projeto-X`, aparecem os agentes de `~/work/projeto-X/.claude/commands/`. Se amanhã abro `~/work/projeto-Y`, aparecem os de lá. O aiox-monitor é só o orquestrador visual.

### 2.5.1 Fontes de descoberta (ordem de prioridade)

Para cada projeto aberto, o **Agent Catalog Service** escaneia:

| Prioridade | Escopo | Path | Override? |
|:-:|---|---|---|
| 1 | **Projeto** (primário) | `{projectPath}/.claude/commands/**/*.md` | — |
| 2 | **Usuário** (global) | `~/.claude/commands/**/*.md` | Mescla se não existir no projeto |
| 3 | **Embutido** (fallback mínimo) | `packages/aiox-monitor/defaults/commands/` | Só se nem projeto nem usuário tem nada (ex: projeto sem AIOX instalado) |

**Regra de merge:** mesmo `skill_path` em múltiplos escopos → vence o mais específico (projeto > usuário > embutido). UI mostra badge da origem (`project`, `user`, `builtin`).

### 2.5.2 Estrutura esperada (convenção AIOX)

Cada projeto segue o mesmo padrão:

```
{projectPath}/.claude/commands/
├── {squadName1}/agents/*.md     → agentes do squad 1
├── {squadName2}/agents/*.md     → agentes do squad 2
└── ...                           → N squads por projeto
```

**Chave canônica do agente:** `/{squad}:agents:{id}` — resolvida pelo Claude Code CLI rodando **dentro** do `projectPath`.

### 2.5.3 Projeto aberto é um estado global da Sala

- Hoje `command_room_terminals` já tem `project_path` → **boa base**.
- **Sala de Comando v2** tem UI de **seletor de projeto** (dropdown no topo): lista projetos recentes + botão "Abrir pasta…" (file picker nativo).
- Trocar o projeto **troca o catálogo inteiro** — evento WS `catalog.reloaded` dispara re-render do dialog de invocação.
- Cada projeto tem seu próprio canvas, suas próprias conversas, seu próprio layout persistido (§3.1 `canvas_layouts.project_path` já prevê isso).

### 2.5.4 Novo módulo: Agent Catalog Service (backend)

```
src/server/agent-catalog/
├── scanner.ts         # fs.watch parametrizado por projectPath + ~/.claude
├── parser.ts          # extrai name, icon, role, squad, description
├── mergeStrategy.ts   # aplica prioridade project > user > builtin
├── cache.ts           # cache por projectPath (LRU de 5-10 projetos)
└── api.ts             # GET /api/agents/catalog?projectPath=…
```

**Parametrização por projeto:**
- Todo método aceita `projectPath: string`.
- Watchers são **criados sob demanda** quando usuário abre um projeto e **descartados** após inatividade (5min sem acesso).
- Múltiplos projetos abertos em abas diferentes = múltiplos watchers ativos simultaneamente, sem vazamento.

**Campos extraídos do markdown:**
- `squad` → nome do diretório pai (ex: `AIOX`, `themaestridev`, `minha-squad-custom`)
- `agent_id` → basename do arquivo sem `.md`
- `display_name` → primeiro H1 após frontmatter
- `icon` → emoji do H1 ou campo explícito do YAML
- `role` → linha "Role" / "Title" / primeira linha de descrição
- `skill_path` → `/{squad}:agents:{id}` (comando slash correspondente)
- `definition_ref` → apontador pro YAML de definição (`squads/{squad}/agents/{id}.md` relativo ao projeto)
- `source` → `'project' | 'user' | 'builtin'` (origem do merge)
- `persona_tags` → keywords extraídas

**Reatividade por projeto:**
- `fs.watch` em `{projectPath}/.claude/commands/**/*.md` → mudança → re-parse → broadcast WS `catalog.updated` **escopado ao projectPath**.
- Clientes conectados a **outros projetos** não recebem (evita ruído).

### 2.5.5 Novo schema (adicional ao §3.1)

```sql
-- Cache do catálogo (chave composta por projeto) — reconstruível do disco
CREATE TABLE agent_catalog (
  project_path    TEXT NOT NULL,              -- '/Users/me/work/projeto-X'
  skill_path      TEXT NOT NULL,              -- '/themaestridev:agents:chief'
  squad           TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  icon            TEXT,
  role            TEXT,
  description     TEXT,
  definition_path TEXT NOT NULL,              -- path relativo ao project_path
  source          TEXT NOT NULL CHECK(source IN ('project','user','builtin')),
  persona_tags    TEXT,                       -- JSON array
  last_seen_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(project_path, skill_path)
);
CREATE INDEX idx_catalog_project ON agent_catalog(project_path);

-- Cache de grupos descobertos do disco (reconstruível via scanner)
-- Grupos NUNCA ficam só no DB — sempre vêm de `.claude/commands/{squad}/groups/*.md`
-- ou são implícitos (1 grupo por squad descoberto). Tabela é cache pra query rápida.
CREATE TABLE agent_groups (
  project_path TEXT NOT NULL,                 -- escopo do projeto
  group_id     TEXT NOT NULL,                 -- slug: '{squad}:auto' ou '{squad}:groups:{slug}'
  name         TEXT NOT NULL,                 -- 'Sprint Planning' (do frontmatter) ou '{squad}' (auto)
  description  TEXT,
  squad        TEXT NOT NULL,
  member_skill_paths TEXT NOT NULL,           -- JSON array
  topology     TEXT DEFAULT 'chief-hub',      -- 'none','chief-hub','mesh','pipeline'
  source       TEXT NOT NULL CHECK(source IN ('project','user','auto')),
  definition_path TEXT,                       -- path do .md (NULL para 'auto')
  last_seen_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(project_path, group_id)
);
CREATE INDEX idx_groups_project ON agent_groups(project_path);
```

**Resolução de grupo ao invocar:** para cada `skill_path` do grupo, verifica se existe no catálogo do projeto aberto. Se faltar, UI avisa (`⚠ 2 agentes não encontrados neste projeto — instale via squad-creator`).

**`agent_cards.skill_path`** (coluna nova em `agent_cards`) → rastreia qual agente do catálogo esse card instancia.

### 2.5.6 UX — "Adicionar Agente" (substitui o `+Squad`)

**Ponto de entrada:** `⌘K` global OU botão flutuante sutil no canto inferior-direito do canvas (`Invocar agente`).

**Dialog de adição (Raycast-style) — sempre escopado ao projeto aberto:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔎 Invocar agente em  📁 /Users/me/work/projeto-X        [⇅ trocar] │
├─────────────────────────────────────────────────────────────────┤
│ Modo:  [● Individual] [○ Grupo]          Busca: [ ___________ ] │
├─────────────────────────────────────────────────────────────────┤
│ ▼ squad-alpha (project)          3 agentes                      │
│   💻 Dev                         /squad-alpha:agents:dev        │
│   🧪 QA                          /squad-alpha:agents:qa         │
│ ▼ themaestridev (project)        12 agentes                     │
│   🧘 Yoda · Chief                /themaestridev:agents:chief    │
│   🏛 Obi-Wan · Architect         /themaestridev:agents:architect│
│   ...                                                            │
│ ▼ AIOX (user)                    12 agentes                     │
│   🎯 AIOX Master                 /AIOX:agents:aiox-master       │
│   💻 Dev                         /AIOX:agents:dev               │
├─────────────────────────────────────────────────────────────────┤
│ Preview do agente selecionado:                                  │
│   Yoda — Squad Orchestrator  (source: project)                  │
│   Origem: .claude/commands/themaestridev/agents/chief.md        │
│   Definição: squads/themaestridev/agents/chief.md               │
│   "Do or do not. There is no try."                              │
├─────────────────────────────────────────────────────────────────┤
│ [Esc cancelar]                         [↵ Invocar no canvas]    │
└─────────────────────────────────────────────────────────────────┘
```

**Badge de `source`** (`project` / `user` / `builtin`) aparece ao lado do nome do squad — deixa claro de onde vem.

**Fluxo de invocação (Individual):**
1. Usuário seleciona agente na lista → preview aparece à direita (lido do `definition_path` **resolvido dentro do projeto aberto**).
2. `Enter` → backend cria `agent_card` com `skill_path`, `project_path`, `kind='chat'` (default), status='thinking'.
3. Se `kind='terminal'` selecionado: spawna PTY via `ProcessManager` **com cwd = projectPath**, escreve automaticamente o `/squad:agents:id` como primeira linha.
4. Card aparece no canvas com a persona já ativada — Claude Code executa dentro do projeto correto.

### 2.5.7 Modo Grupo (derivado do `.claude/commands/` do projeto aberto)

**Princípio:** grupos NÃO são hardcoded. Eles **emergem do próprio catálogo do projeto aberto** — mesma fonte de verdade do agente individual (`{projectPath}/.claude/commands/`).

**Hierarquia de grupos (tudo lido do disco do projeto):**

| Tipo | Origem | Exemplo |
|---|---|---|
| **Grupo-Squad** (auto) | Cada diretório `.claude/commands/{squad}/agents/` vira 1 grupo implícito contendo todos os seus agentes | `themaestridev` → grupo "themaestridev (12 agentes)" |
| **Grupo-Custom** (opcional) | Arquivo `.claude/commands/{squad}/groups/{name}.md` com frontmatter `members:` + `topology:` | `themaestridev/groups/sprint-planning.md` → grupo "Sprint Planning" |
| **Grupo-Global** (user) | `~/.claude/commands/{squad}/groups/*.md` — disponível em qualquer projeto que tenha aquele squad | grupo reutilizável entre projetos |

**Zero grupos hardcoded no binário do aiox-monitor.** Nenhum `Full Squad`, `Sprint Planning`, etc. pré-compilado — se você quer esses grupos, eles vivem no `.claude/commands/` do projeto.

**Formato do arquivo de grupo (`.md` com frontmatter YAML):**

```markdown
---
name: Sprint Planning
description: Reunião de refinamento de sprint
members:
  - /themaestridev:agents:pm
  - /themaestridev:agents:po
  - /themaestridev:agents:architect
  - /themaestridev:agents:dev-alpha
  - /themaestridev:agents:qa
topology: chief-hub   # chief-hub | pipeline | mesh | none
---

# Sprint Planning

Notas adicionais exibidas no preview do dialog.
```

**UX:**
- Toggle `[○ Individual]` → `[● Grupo]` no dialog.
- Seção superior lista **grupos descobertos do projeto aberto** (auto-squad + custom), com badge `source` (`project`, `user`, `auto`).
- Seleção dispara preview: membros resolvidos no catálogo + topologia + alertas de faltantes.
- Invocar cria N cards + arestas conforme topology.

**Topologias suportadas (mesmas de antes):**
- **Chief-hub** (default): Chief no centro, todos conectados a ele → orquestração.
- **Pipeline**: A → B → C → fluxo sequencial.
- **Mesh**: todos com todos → brainstorm.
- **None**: só adiciona sem conectar.

**Comportamento quando grupo referencia agente ausente:**
- `POST /api/groups/:id/invoke` valida cada `skill_path` contra o catálogo do projeto aberto.
- Se faltante → UI mostra `⚠ 2 agentes não encontrados neste projeto` com opção de "invocar parcial" ou "cancelar".
- Nunca falha silenciosamente.

**Criar grupo via UI (opcional, pós-MVP):**
- Botão "Salvar seleção como grupo…" no dialog gera `.claude/commands/{squad}/groups/{slug}.md` no projeto.
- Checkbox "Salvar como global" grava em `~/.claude/commands/` em vez do projeto.
- Mesma fonte de verdade — arquivo no disco; scanner pega na próxima leitura.

### 2.5.8 APIs adicionais (todas aceitam `projectPath` como parâmetro)

| Método | Rota | Propósito |
|--------|------|-----------|
| GET | `/api/projects/recent` | Lista projetos recentes (MRU) |
| POST | `/api/projects/open` | Registra projeto aberto (cria watchers, retorna catálogo inicial) |
| POST | `/api/projects/close` | Libera watchers do projeto |
| GET | `/api/agents/catalog?projectPath=…` | Lista catálogo resolvido pro projeto (merge project+user+builtin) |
| POST | `/api/agents/invoke` | Cria card a partir de `{skill_path, projectPath, kind}` |
| GET | `/api/groups?projectPath=…` | Lista grupos aplicáveis (globais + do projeto) |
| POST | `/api/groups` | Salva grupo custom (`project_path` opcional) |
| POST | `/api/groups/:id/invoke?projectPath=…` | Spawn N cards no projeto + aplica topologia |
| DELETE | `/api/groups/:id` | Remove grupo salvo |

### 2.5.9 Eventos WS adicionais

```ts
| { type: 'catalog.updated';  v: 1; projectPath: string; added: AgentCatalogEntry[]; removed: string[] }
| { type: 'catalog.reloaded'; v: 1; projectPath: string; full: AgentCatalogEntry[] }
| { type: 'project.opened';   v: 1; projectPath: string }
| { type: 'project.closed';   v: 1; projectPath: string }
| { type: 'group.invoked';    v: 1; groupId: string; projectPath: string; cardIds: string[]; connectionIds: string[] }
```

Todos os eventos de catálogo/card/conexão/conversa **carregam `projectPath`** e o cliente filtra pelo projeto atualmente aberto no canvas.

---

## 3. Arquitetura

### 3.1 Modelo de Dados (SQLite — proposta Obi-Wan)

```sql
-- Card do canvas (desacoplado do PTY)
CREATE TABLE agent_cards (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK(kind IN ('chat','terminal','hybrid')),
  display_name  TEXT NOT NULL,
  aiox_agent    TEXT,                  -- 'chief','architect',...
  project_path  TEXT,
  pty_terminal_id TEXT REFERENCES command_room_terminals(id) ON DELETE SET NULL,
  category_id   TEXT,
  is_chief      INTEGER DEFAULT 0,
  status        TEXT CHECK(status IN ('idle','thinking','speaking','waiting','offline','error')),
  system_prompt TEXT,
  model         TEXT,
  user_id       TEXT NOT NULL DEFAULT 'local',   -- Han Solo: multi-user ready
  created_at    TEXT DEFAULT (datetime('now')),
  last_active   TEXT DEFAULT (datetime('now'))
);

-- Aresta 1ª classe (substitui linked_terminal_ids JSON)
CREATE TABLE connections (
  id            TEXT PRIMARY KEY,
  source_id     TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
  target_id     TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
  directed      INTEGER DEFAULT 1,
  kind          TEXT CHECK(kind IN ('chat','broadcast','supervise','context-share')),
  label         TEXT,
  metadata      TEXT,
  user_id       TEXT NOT NULL DEFAULT 'local',
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, kind)
);

-- Conversa entre 1+ cards
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,
  kind        TEXT CHECK(kind IN ('peer','group','broadcast','chief-thread')),
  title       TEXT,
  user_id     TEXT NOT NULL DEFAULT 'local',
  created_at  TEXT DEFAULT (datetime('now')),
  last_message_at TEXT
);

CREATE TABLE conversation_participants (
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  agent_card_id   TEXT REFERENCES agent_cards(id) ON DELETE CASCADE,
  role TEXT CHECK(role IN ('member','owner','observer')),
  PRIMARY KEY(conversation_id, agent_card_id)
);

-- Mensagem individual
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT REFERENCES agent_cards(id) ON DELETE SET NULL,
  sender_role     TEXT CHECK(sender_role IN ('chief','agent','system','tool','user')),
  content         TEXT NOT NULL,
  artifacts       TEXT,                    -- JSON de anexos/outputs
  in_reply_to     TEXT REFERENCES messages(id) ON DELETE SET NULL,
  user_id         TEXT NOT NULL DEFAULT 'local',
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_msg_conv_created ON messages(conversation_id, created_at);

-- Layout visual persistido
CREATE TABLE canvas_layouts (
  project_path   TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL DEFAULT 'local',
  viewport       TEXT DEFAULT '{"x":0,"y":0,"zoom":1}',
  node_positions TEXT DEFAULT '{}',
  scenario_name  TEXT,                     -- cenários salvos (Rey)
  updated_at     TEXT DEFAULT (datetime('now'))
);
```

**Delta vs hoje:**
- `command_room_terminals` separa papéis — vira backing PTY opcional de `agent_cards.pty_terminal_id`.
- `ChatMessageStore` in-memory é substituído por `messages` persistido.
- `linked_terminal_ids JSON` morre → migra 1-para-N em `connections`.

### 3.2 Event Flow — "/ask" de A conectado a B

```
Cliente (ChatNode de A)
  POST /api/conversations/{conv_AB}/messages
  { sender_id: A, content: "/ask @B <pergunta>", addressed_to: [B] }
      │
      ▼
API route
  ├─ persiste message (sender=A)
  ├─ valida connection A→B (kind='chat') — senão 403
  ├─ enfileira no MessageDispatcher
  └─ broadcast WS: message.new + conversation.updated
      │
      ▼
MessageDispatcher (in-process, singleton)
  ├─ monta prompt enriquecido com snapshot das últimas N msgs de conv_AB
  ├─ B.kind='chat'     → chamada direta ao modelo (Claude SDK server-side)
  ├─ B.kind='terminal' → maestri ask via PTY transient (ProcessManager)
  ├─ B.kind='hybrid'   → chat por default; promove a PTY se comando exigir tool
  └─ B.status='thinking' → broadcast WS: agent.status
      │
      ▼
Stream de B → WS (chat:chunk) → ChatNode B renderiza token-a-token
                              → aresta A→B pulsa (data-flowing)
                              → message final persistida em messages
```

**Regra de ouro (Han Solo + Obi-Wan convergem):**
- **Stateless prompt enrichment** — nunca estado compartilhado entre agentes.
- DB = verdade única; PTY é transporte.
- Autorização via `connection` obrigatória (sem aresta → 403). Chief tem conexão implícita com todos.
- Snapshot do contexto no momento do `/ask`, não live reference (evita race).

### 3.2b Comunicação Inter-Agente — ⚠️ **refação completa do real-time**

**Auditoria honesta do estado atual (2026-04-14):**

| Peça | Existe? | O que realmente faz |
|------|:-:|---|
| `node-pty` spawnando Claude Code | ✅ | `ProcessManager` cria PTYs, 480 linhas |
| PTY streaming → frontend | ✅ | `pty-websocket-server.ts` + `/pty` WS |
| Parser de output do Claude | ✅ parcial | `claude-output-parser.ts` extrai texto |
| `ChatMessageStore` | ✅ in-memory | não persiste, some em restart |
| `maestri list` | ✅ | `execSync` único via rota `/api/command-room/maestri-agents` |
| `maestri-resolver.ts` | ✅ | Lê `~/.maestri/manifest.json` pra resolver UUID → nome |
| **PTYs registrados no Maestri** | ❌ | node-pty não registra em `maestri list`; **só emuladores (Ghostty/iTerm com plugin) registram** |
| **Chamadas `maestri ask/check/note` pela app** | ❌ | **A app NUNCA chama isso hoje** |
| **Comunicação entre PTYs da app** | ❌ | Cada PTY streama pro front e fim; não há router |
| **Protocolo de mensagens estruturadas** | ❌ | Só stream bruto de bytes do PTY |
| **Autorização/grafo de agentes** | ❌ | `linked_terminal_ids JSON` cru, sem semântica |

**Conclusão:** a v2 **constrói o barramento inter-agente do zero**. Maestri CLI externo é usado só como **descoberta de contexto de emuladores** (quando houver), nunca como transporte da app.

---

#### Nova peça: Agent Bus (core do real-time)

```
src/server/agent-bus/
├── registry.ts         # registro ativo dos agent_cards + PTYs em memória
├── dispatcher.ts       # roteia mensagens A→B com autorização por connection
├── stdin-writer.ts     # escreve no PTY de B via pty.write()
├── stdout-parser.ts    # agrupa saída de B em mensagens estruturadas
├── context-injector.ts # monta prompt enriquecido + bloco "seus vizinhos"
├── depth-guard.ts      # anti-ciclo (A→B→A) com visited set
└── broadcaster.ts      # publica eventos no WS
```

**Responsabilidade:** tudo que envolve "agente B receber uma instrução vinda do canvas".

---

#### Transportes por `kind` (3 modos)

| kind | Transporte de entrada | Transporte de saída |
|------|----------------------|---------------------|
| **`chat`** | Chamada HTTP ao modelo (Anthropic SDK server-side) com prompt enriquecido | Stream SSE do SDK → persistir → broadcast WS `chat.chunk` + `message.new` |
| **`terminal`** | `AgentBus` escreve no stdin do PTY via `pty.write('/ask @... ...\n')` | `stdout-parser` captura chunks do PTY stream → persiste → broadcast WS |
| **`hybrid`** | Começa como chat; é promovido a terminal quando precisa de tool real; histórico vai como prompt inicial injetado no PTY | — |

**Importante:** nenhum dos 3 modos depende de Maestri daemon externo. A autoridade é a app.

---

#### Descoberta — como o agente B "sabe" de A

Zero mágica. Explicitação total no prompt:

**Bloco injetado automaticamente pelo `context-injector` no início de cada turn:**

```
## Seus vizinhos neste canvas
Você é "Luke (Dev-Alpha)". Você está conectado a:
- Obi-Wan (Architect) — outbound: você pode mandar /ask
- Rey (UX) — bidirectional
- Chief (Yoda) — inbound: ele pode te delegar

Para falar com um vizinho: /ask @<nome> <mensagem>
Para broadcast aos outbound: /broadcast <mensagem>
Fora desses vizinhos, /ask retorna 403.
```

- Regenerado sempre que `connection.added` ou `connection.removed` — re-injetado no próximo turn
- Agent nunca tem que "descobrir" nada — o dispatcher é a autoridade

---

#### Fluxo completo — `/ask @Luke` digitado no card do Chief

```
1. UI (ChatNode Chief) envia POST /api/conversations/{convChiefLuke}/messages
   { sender_id: chief, content: "/ask @Luke tal coisa", addressed_to: [luke] }

2. API valida connection(chief→luke). Se não existe → 403.

3. Persiste message em SQLite.

4. Broadcast WS message.new → outras UIs animam a bolha do Chief.

5. AgentBus.dispatcher recebe trigger:
   ├─ busca agent_card de luke no registry
   ├─ verifica luke.status != 'streaming' (senão enfileira ou 409)
   ├─ marca luke.status = 'thinking' → broadcast WS agent.status

6. context-injector monta prompt:
   ├─ bloco "Seus vizinhos" (regenerado do grafo atual)
   ├─ últimas N msgs de convChiefLuke
   └─ mensagem atual do Chief

7. Roteamento por kind:

   7a. Se luke.kind='chat':
      ├─ chama Anthropic SDK com prompt
      ├─ stream de tokens vem via SSE do SDK
      └─ para cada chunk: persiste delta + broadcast WS chat.chunk

   7b. Se luke.kind='terminal':
      ├─ ptyProcess.write(prompt + '\n')
      ├─ stdout-parser agrupa bytes em turns
      ├─ quando detecta fim de turn: persiste message + broadcast message.new
      └─ durante stream: broadcast chat.chunk com deltas

8. UI do card Luke anima bolha streaming; aresta Chief→Luke pulsa 'data-flowing'.

9. Luke responde. Se resposta tem "/ask @X": depth-guard verifica visited set
   + max_depth=3. Se ok, cascata; senão, log warning.

10. luke.status = 'idle' → broadcast.
```

---

#### O que isso substitui/refaz

| Antes (hoje) | Depois (v2) |
|---|---|
| `ChatMessageStore` in-memory | `messages` em SQLite + broadcast WS estruturado |
| PTY stream bruto pro front | PTY stream pro `stdout-parser` que gera mensagens estruturadas; front recebe ambos |
| `linked_terminal_ids` JSON | `connections` tabela com autorização + direção |
| Sem dispatcher | `AgentBus.dispatcher` com locks, depth-guard, visited set |
| Sem prompt injection | `context-injector` gera bloco "seus vizinhos" automaticamente |
| `execSync('maestri list')` | Descarta ou mantém só para listar emuladores externos (opcional, feature desacoplada) |

---

#### Relação com Maestri externo (emuladores)

O `maestri-resolver.ts` **continua existindo** porque resolve nomes de terminais de emuladores externos (Ghostty, iTerm com plugin) — útil pra **detectar contexto** (saber qual projeto está aberto em cada aba do usuário), mas **não é transporte**.

Se quisermos no futuro que a Sala de Comando **também** orquestre emuladores externos (ex: mandar `/ask` para um terminal Ghostty aberto), aí sim plugamos um transporte que shelle para `maestri ask "..."`. **Isso é uma feature opcional pós-v2.0** — o core não depende disso.

---

#### Autorização — regra absoluta

- **Toda** mensagem A→B passa por `dispatcher` que valida `connection(A→B)` antes de agir.
- Sem conexão → 403. UI oferece criar a conexão antes de repetir.
- Chief tem conexão implícita com todos (`is_chief=1`).
- Grupos pré-semeados criam as conexões necessárias no invoke.

---

#### Guard-rails anti-caos (story 9.9)

| Risco | Mitigação |
|-------|-----------|
| Ciclo A→B→A | `depth-guard`: visited set por `conversation_id` + max_depth=3 |
| Race /ask enquanto streama | Lock per-card: status='streaming' → enfileira ou 409 |
| PTY zumbi | `child.kill()` em WS close + reaper por inatividade |
| 500 PTYs (limit) | `kind='chat'` é default; PTY só quando promovido |
| WS buffer overflow | Cap `bufferedAmount=1MB` → drop+reconnect + coalescing <10ms |
| Modelo caro em chat-only | Rate-limit por conversa + Chief aprova broadcasts custos |

---

#### Stories tocadas por essa refação

| Story | Foco dessa seção |
|-------|------------------|
| 9.3 | AgentBus completo: registry + dispatcher + stdin-writer + stdout-parser + context-injector |
| 9.4 | Protocolo WS estendido com chat.chunk, message.new, agent.status |
| 9.6 | Promoção chat→PTY reusando histórico como prompt inicial |
| 9.9 | depth-guard + lock per-card + cap WS + reaper PTY |

#### Duas camadas complementares

| Camada | Papel | Transporte | Identidade |
|--------|-------|-----------|-----------|
| **Maestri daemon** (mantém) | Registry + transporte entre instâncias Claude Code reais (PTY) | Unix socket + processo Maestri | `terminal_name` (ex: `"🧘 Yoda / Chief"`) |
| **Canvas Connections** (novo) | Grafo de **autorização** + **roteamento de UI** | WebSocket + SQLite | `agent_card.id` (UUID) |

**Elas não competem — o canvas é a UI de orquestração; o Maestri é o barramento subjacente.**

#### Mapeamento Card ↔ Terminal Maestri

Nova coluna em `agent_cards`:
```sql
ALTER TABLE agent_cards ADD COLUMN maestri_terminal_name TEXT;
-- Ex: '🧘 Yoda / Chief ' (casa com o que aparece em 'maestri list')
```

Esse nome é **descoberto dinamicamente** quando o PTY é spawned:
1. `ProcessManager` spawna Claude Code
2. Claude Code auto-registra no Maestri (comportamento atual do CLI)
3. Agent Catalog Service chama `maestri list`, faz match pelo nome esperado do agente, preenche `maestri_terminal_name`
4. A partir daí, o card sabe seu endereço Maestri

#### Como o agente B "sabe" de A (duas respostas, por kind)

**Se B é `kind='terminal'` (Claude Code via PTY):**
- B já executa dentro de uma instância Claude Code → já tem acesso ao Maestri nativo
- Quando o usuário digita `/ask @A` no card de B, o `MessageDispatcher` do backend **traduz** para: `maestri ask "<nome_maestri_de_A>" "<prompt enriquecido>"`
- A recebe a mensagem no próprio terminal dele, exatamente como eu (Chief) recebo quando você me despacha
- **Descoberta:** B não precisa saber sobre A antecipadamente. Dispatcher resolve `target_id → maestri_terminal_name`.
- **Autorização:** se não existe `connection(B→A)`, dispatcher retorna 403 e o `maestri ask` nunca é executado.

**Se B é `kind='chat'` (chamada direta ao modelo, sem PTY):**
- Não há Maestri por baixo — o modelo não "se registra" em lugar nenhum
- Dispatcher monta um **prompt enriquecido** que inclui:
  - `system`: "Você é o agente B. Você está conectado a: [A, C, D]. Use `/ask @X` pra enviar contexto."
  - `context`: últimas N mensagens de `conv_AB`
  - `user_message`: a pergunta atual
- B responde; se a resposta tem `/ask @C`, dispatcher captura e **cascata** (respeitando depth limit de 3 hops)

**Se B é `kind='hybrid'`:**
- Começa como chat. Quando B precisa de tool real (fs, bash, etc), é promovido a terminal — ganha PTY + registro Maestri automaticamente. Histórico de chat vira prompt inicial injetado no PTY.

#### System prompt injetado — agente sabe seus vizinhos

Cada agente recebe no início de cada turn um bloco:

```
## Seus vizinhos neste canvas
Você está conectado a:
- Obi-Wan (Architect) — direção: outbound (você pode mandar /ask)
- Luke (Dev-Alpha) — direção: inbound (ele pode te mandar contexto)
- Rey (UX) — bidirectional

Para falar com um vizinho, use: /ask @<nome> <mensagem>
Para broadcast aos vizinhos outbound: /broadcast <mensagem>
Apenas esses vizinhos estão acessíveis — demais retornam 403.
```

**Isso é regenerado** sempre que uma conexão é adicionada/removida — evento WS `connection.added/removed` → re-render do bloco na próxima mensagem.

#### Fluxo completo "usuário digita /ask @B no card A" (kind=terminal)

```
1. UI: usuário digita "/ask @B olá" no ChatNode A
2. POST /api/conversations/{convAB}/messages { sender_id: A, content, addressed_to: [B] }
3. API valida connection(A→B) existe — senão 403
4. Persiste message em SQLite
5. MessageDispatcher resolve A→B:
   - busca agent_cards.maestri_terminal_name de B
   - monta prompt enriquecido com contexto das últimas N msgs
   - executa: maestri ask "<terminal_name_de_B>" "<prompt>"
6. Maestri daemon entrega no PTY de B
7. B (Claude Code real) processa e responde — output stream volta via /pty WS
8. ChatMessageStore parser captura mensagens estruturadas do stream
9. Persiste message em SQLite com sender_id=B
10. Broadcast WS message.new → ChatNode B anima nova bolha
11. Aresta A→B pulsa durante o streaming (estado data-flowing)
```

#### Grupos e broadcast

- `Group.invoke` (ex: Sprint Planning com chief-hub) cria N cards + N-1 arestas Chief→membro
- Cada membro recebe no system prompt: "Você está conectado ao Chief. Chief pode orquestrar seu trabalho."
- Chief tem conexão implícita com **todos** os cards ativos (`is_chief=1` → autorização universal)
- `/broadcast` num card com aresta `kind='broadcast'` envia para todos os targets simultaneamente

#### O que já existe hoje vs o que precisa ser construído

| Peça | Status | Story |
|------|--------|-------|
| Maestri daemon funcionando | ✅ Já existe | — |
| `maestri list/ask/check/note` CLI | ✅ Já existe | — |
| PTY spawn + auto-registro no Maestri | ✅ Já existe (`ProcessManager`) | — |
| Parse de output pra extrair mensagens estruturadas | ⚠️ Parcial (`ChatMessageStore`) | 9.3 |
| `maestri_terminal_name` mapping no card | ❌ Novo | 9.2b |
| `MessageDispatcher` que traduz card_id → maestri ask | ❌ Novo | 9.3 |
| System prompt injection com lista de vizinhos | ❌ Novo | 9.3 |
| Autorização por `connection` antes do dispatch | ❌ Novo | 9.3 |
| Depth limit + visited set pra evitar ciclos | ❌ Novo | 9.9 |
| `kind='chat'` (sem PTY) chamando modelo direto | ❌ Novo | 9.3 |

**Conclusão:** sim, comunicação inter-agente está **totalmente contemplada**. A mágica é que v2 **reaproveita o Maestri** como barramento real (não reinventa transporte) e adiciona só a **camada de autorização visual (connections)** e o **dispatcher que traduz intenção UI → chamada Maestri**.

---

### 3.3 Protocolo WebSocket estendido (reuso + novos tipos)

Hoje `/ws` já faz broadcast. Adicionar tipos:

```ts
type WsEvent =
  | { type: 'agent.status';       v: 1; cardId; status; at }
  | { type: 'agent.added';        v: 1; card }
  | { type: 'agent.removed';      v: 1; cardId }
  | { type: 'connection.added';   v: 1; connection }
  | { type: 'connection.removed'; v: 1; id }
  | { type: 'conversation.updated'; v: 1; conversationId; lastMessageAt }
  | { type: 'message.new';        v: 1; conversationId; message }
  | { type: 'chat.chunk';         v: 1; messageId; delta }   // streaming token
  | { type: 'layout.patch';       v: 1; patches }
  | { type: 'heartbeat';          v: 1; at }
  | { type: 'pty.frame';          v: 1; terminalId; data }   // já existe em /pty
```

Cada evento com `seq` monotônico por canal. Heartbeat 25s. Reconnect usa Last-Event-ID (escopo: `canvas|conversation|agent|pty`).

### 3.4 APIs

| Método | Rota | Propósito |
|--------|------|-----------|
| POST | `/api/agents` | Criar card |
| GET | `/api/agents?project=…` | Listar cards |
| PATCH | `/api/agents/:id` | Rename, change kind, promote chat→PTY |
| DELETE | `/api/agents/:id` | Remove |
| POST | `/api/connections` | Criar aresta |
| DELETE | `/api/connections/:id` | Remover aresta |
| POST | `/api/conversations` | Abrir conversa (auto-criada ao conectar) |
| GET | `/api/conversations/:id/messages` | Histórico paginado |
| POST | `/api/conversations/:id/messages` | Envia msg (dispatcher + WS) |
| PATCH | `/api/canvas/layout` | Salvar viewport/posições (debounced 500ms) |
| WS | `/ws?scope=…` | Stream realtime |
| WS | `/pty?id=…` | Stream PTY bruto (mantém) |

**Depreca:** `PATCH /api/command-room/[id]` com `linked_terminal_ids` → traduz para `/api/connections`.

### 3.5 Módulos Frontend

```
src/components/command-room/canvas/
├── CanvasView.tsx              # ReactFlow orquestrador; lê Zustand store
├── nodes/
│   ├── AgentChatNode.tsx       # NOVO — card chat (kind='chat')
│   ├── TerminalNode.tsx        # existe — kind='terminal'
│   └── NodeHeader.tsx          # comum: avatar, status, menu
├── edges/
│   └── ConnectionLine.tsx      # custom Bezier + label + estados
├── palette/
│   ├── CommandPaletteGlobal.tsx  # cmdk ⌘K
│   └── SlashMenuInline.tsx       # cmdk dentro do composer
├── realtime/
│   ├── WsClient.ts             # EventSource-like wrapper sobre ws existente
│   └── useRealtime.ts          # hook → Zustand
├── store/
│   ├── canvasStore.ts          # nodes, edges, layout
│   └── conversationsStore.ts   # conversations, messages normalizados
└── useCanvasLayout.ts          # refatorar: ler layout persistido
```

**Regra:** `CanvasView` não conhece realtime. `WsClient` só escreve no store. Troca de transporte não toca UI.

---

## 4. UX — Fluxos & Comandos (Rey)

### 4.1 Jobs-to-be-Done (JTBDs)

1. **Ver o estado da squad em ≤10s** — abrir canvas já mostra tudo ativo.
2. **Largar agente e mandar executar em ≤15s** — ⌘K + `/comando`.
3. **Conectar dois agentes em ≤20s** — arrastar handle → soltar em outro.
4. **Ver cross-talk fluir** — streaming visível, arestas pulsam, balões aparecem.
5. **Salvar cenários** — layouts nomeados (sprint-planning, code-review).

### 4.2 Fluxo Principal

```
ADICIONAR ──▶ POSICIONAR ──▶ CONECTAR ──▶ COMANDAR ──▶ CROSS-TALK
   (⌘K ou        (drag +       (hover     (/ no chat     (streams +
    drag dock)    guides)      handle →     ou ⌘K)        edges pulse)
                               drag → drop)
```

### 4.3 Vocabulário `/` (slash commands)

| Comando | Escopo | Efeito |
|---------|--------|--------|
| `/ask @agente <msg>` | chat inline | Rotea via connection; se não houver, UI sugere criar |
| `/task <nome>` | chat inline | Executa task do agente (repertório AIOX) |
| `/broadcast <msg>` | chat inline | Envia para todos os targets do node (se aresta broadcast) |
| `/clear` | chat inline | Limpa histórico visual do node |
| `/rename <novo>` | chat inline | Renomeia instância ("Dev-α · feature-x") |
| `/mute` `/unmute` | chat inline | Pausa recebimento de cross-talk |
| `/history [@agent]` | chat inline | Abre timeline filtrada |
| `/connect @A @B` | `⌘K` global | Cria aresta A→B |
| `/scenario save <nome>` | `⌘K` global | Salva layout como cenário |
| `/scenario load <nome>` | `⌘K` global | Aplica cenário salvo |

### 4.4 Empty state — morte do `+Squad`

- Hero cinematográfico com holograma ciclando (Yoda, Obi-Wan, Leia, opacity 20%).
- **CTA primário:** "Invocar Chief (Yoda)" — um clique já traz o orquestrador.
- **CTA secundário:** "Escolher outro agente" → abre ⌘K.
- Depois, novos agentes via ⌘K, double-click no canvas, ou drag do handle para área vazia ("Create agent here" popover).

---

## 5. Design System (Padmé)

### 5.1 Anatomia do Node-Chat

- **Dimensão base:** 360×280px (colapsado 360×88, expandido 420×520). Border-radius **14px**.
- **Header (56px):** avatar 36px com ring cor-acento, nome `Inter 14/600/-0.01em`, status dot 8px, menu ⋯.
- **Mensagens:** bolhas assimétricas `12/12/12/4`, user direita accent@12%, agent esquerda surface-200, code blocks JetBrains Mono 12px.
- **Input (48px):** placeholder "Fale com {Nome}… ou / para comandos". `@` mention + ⏎ send + ⌘↵ run.
- **Handles:** entrada (esquerda), saída (direita), broadcast (topo, estilo diamante).

### 5.2 Conexões

- **Bezier suave** (control points 40%), stroke 1.5px idle → 2px active.
- **Estados:** idle (dashed cinza), active-speaking (glow cor-agente), data-flowing (partícula percorrendo), error (shake + ⚠), hover (label com latência).
- Handles magnéticos: ao arrastar cabo, compatíveis pulsam 1.2× scale.

### 5.3 Estados do Agente (status dot + avatar ring + card border)

| Estado | Visual |
|--------|--------|
| online | dot emerald, ring estático |
| thinking | dot amber pulsando, ring shimmer, "•••" typing indicator |
| speaking | dot verde+halo, border-glow cor-agente, cursor piscando no final |
| idle | dot zinc, 92% opacity no card |
| error | dot rose, border rose-500, toast "Conexão perdida · retry" |

### 5.4 Paleta

- **Surface:** `#0E1014` (canvas) → `#15181F` (card) → `#1C2029` (input) → `#262B36` (border) → `#353B48` (code).
- **Text:** `#E8EAED` primary, `#9BA1AD` muted, `#6B7280` subtle.
- **Acentos por personagem:** 12 cores distintas (Yoda verde `#84CC16`, Obi-Wan azul `#38BDF8`, Luke dourado `#FACC15`, Leia rosa `#F472B6`, etc). Uso apenas em avatar-ring, speaking-glow, bolha user, aresta de saída. **Nunca** no bg do card.

### 5.5 Micro-interações (todas com `cubic-bezier(0.4,0,0.2,1)`, respeitando `prefers-reduced-motion`)

- Nova mensagem: bolha desliza de baixo 8px + fade (240ms) + glow cor-agente (1.2s).
- Speaking: avatar ring 1→1.08 spring, halo pulsante.
- Typing: três dots stagger 120ms, loop 1.4s.
- Conexão criada: path desenha via `stroke-dasharray` (500ms) + partícula.
- Drag node: scale 1.02 + shadow, aresta segue com rAF.

---

## 6. Frontend — Pitfalls & Migração (Luke)

### 6.1 5 Armadilhas **obrigatórias** na DoD

1. **Pan/drag conflict:** `nodrag nopan` no wrapper, `dragHandle` dedicado.
2. **Seleção de texto:** classe `nodrag` no container de mensagens.
3. **Foco de input em re-render:** **não reconstruir `data` em cada render.** O código atual `CanvasView.tsx:100-109` tem esse bug latente — usar `useMemo` por node OU mover estado do input para Zustand/ref fora de `data`.
4. **`deleteKeyCode={null}`** OU filtrar Backspace quando input tem foco — senão digitar apaga o node.
5. **`nowheel`** no body das mensagens — senão scroll do chat dá zoom no canvas.

### 6.2 Coexistência `terminalNode` × `chatNode`

- React Flow suporta múltiplos `nodeTypes` no mesmo canvas (`CanvasView.tsx:25` já tem `NODE_TYPES`).
- **Estratégia:**
  1. Criar `AgentChatNode` isolado + nova rota chat + novo store slice.
  2. Registrar junto com `terminalNode` em `NODE_TYPES`.
  3. Toolbar cria ambos durante transição.
  4. Feature flag esconde `terminalNode` quando estiver pronto.
  5. **Não migrar automaticamente.** Usuário decide; rotas legadas permanecem.
- **Edge comum:** `edge.data.kind: 'delegation' | 'reference'` unifica semântica entre tipos de node.

### 6.3 Performance

- 10-20 nodes com chat: tranquilo.
- 30+: memo + `onlyRenderVisibleElements` + virtualização de mensagens (`react-virtuoso` ou `@tanstack/react-virtual`).
- Zoom < 0.4 → degradar node (LOD): mostrar card com 3 últimas msgs em vez de chat completo.

---

## 7. Backend — Reuso & Defesa (Han Solo)

### 7.1 Reaproveita 80% do que existe

- **WS nativo (`ws` 8.18.0)** com `/ws` broadcast e `/pty` PTY — **estender, não substituir**.
- **ProcessManager singleton** com scrollback 5000, reconnect 30s, EventEmitter — tratar `maestri ask` como PTY transient.
- **DatabaseSync (node:sqlite)** em WAL — suporta carga atual com folga 3000×.
- **ChatMessageStore + WsBroadcaster** — generalizar para novos tipos de evento.

### 7.2 `maestri ask` via node-pty (não `spawn`)

- PTY dá TTY real; maestri pode exigir.
- Flag `transient: true` no ProcessManager → cleanup **imediato** pós-exit (não 30s; senão estoura limite de 500 processes).
- Stream vai no WS como qualquer terminal → coerência conceitual.
- `child.kill()` no disconnect do cliente — senão vira zombie.

### 7.3 Guard-rails defensivos (6 riscos nomeados)

| Risco | Mitigação |
|-------|-----------|
| Ciclo A→B→A | `max_depth: 3` + visited set por `conversation_id`; 4º hop → 409 |
| Race `/ask` enquanto A streama | Lock per-node: status='streaming' → enfileirar ou rejeitar 409 |
| Backpressure WS | Cap de `ws._socket.bufferedAmount` (1MB → drop+reconnect) + coalescing de PTY frames (<10ms) |
| Limite 500 PTYs | `transient: true` → purge imediato pós-exit |
| DatabaseSync lock | WAL permite 1 writer; cuidado com `setImmediate` em handlers |
| Maestri zombies | `child.kill()` em client disconnect |

---

## 8. Roadmap — Stories Derivadas

Sugestão de epic `9 — Sala de Comando v2` dividido em 8 stories sequenciais:

| # | Story | Quem | Dependências |
|---|-------|------|--------------|
| 9.0 | Spike: validar `AgentChatNode` isolado com `useChat` + shadcn (sem persistência) | Luke | — |
| 9.1 | Migration SQLite: `agent_cards`, `connections`, `conversations`, `messages`, `canvas_layouts`, `agent_catalog`, `agent_groups` + `user_id` | R2-D2 | — |
| **9.1b** | **Agent Catalog Service** parametrizado por `projectPath`: scanner fs.watch em `{projectPath}/.claude/commands/` + `~/.claude/commands/` + builtin; merge por prioridade; cache LRU por projeto; parser markdown; `GET /api/agents/catalog?projectPath=…`; eventos WS `catalog.updated`/`catalog.reloaded` escopados ao projeto | **Han Solo + Ahsoka** | 9.1 |
| **9.1c** | **Project Manager**: MRU de projetos recentes, seletor no topo da UI, `POST /api/projects/open` + `close`, ciclo de vida dos watchers, evento WS `project.*` | **Luke + Han Solo** | 9.1b |
| 9.2 | APIs CRUD: `/api/agents`, `/api/connections`, `/api/conversations` + tradução legados | Han Solo | 9.1 |
| **9.2b** | **API `POST /api/agents/invoke`**: cria card a partir de `{skill_path, projectPath, kind}`; valida que `skill_path` existe no catálogo do `projectPath`; se `kind='terminal'`, spawna PTY **com cwd=projectPath** e escreve `/squad:agents:id` como 1ª linha | **Han Solo** | 9.1b, 9.2 |
| 9.3 | `MessageDispatcher` + `POST /api/conversations/:id/messages` + prompt enrichment + `maestri ask` via PTY transient | Han Solo | 9.2 |
| 9.4 | Extensão protocolo WS: `chat.chunk`, `message.new`, `agent.status`, `connection.*`, `catalog.updated`, `group.invoked` + `seq`/heartbeat/reconnect | Han Solo + Luke | 9.3 |
| 9.5 | `AgentChatNode` completo + Zustand store + coexistência com `TerminalNode` | Luke + Padmé | 9.0, 9.2 |
| **9.5b** | **Dialog "Invocar Agente"** (Raycast-style) — contextualizado no projeto aberto: catálogo agrupado por squad com badge `source` (project/user/builtin), preview lido do `definition_path` do projeto, toggle kind (chat/terminal), invocação por ↵ | **Luke + Padmé + Rey** | 9.1b, 9.5 |
| **9.5c** | **Modo Grupo** derivado do `.claude/commands/` do projeto: scanner estende §9.1b pra ler `{squad}/groups/*.md` + grupo auto por squad; dialog mostra grupos descobertos com badge `source` (project/user/auto); topologia (chief-hub/pipeline/mesh/none); validação de membros faltantes com alerta na UI; zero grupos hardcoded | **Luke + Rey + Han Solo** | 9.5b |
| 9.6 | Promoção `chat→PTY` (kind=hybrid) com sumarização do histórico | Luke + Han Solo | 9.5 |
| 9.7 | `CommandPaletteGlobal` (⌘K) + `SlashMenuInline` (/) com vocabulário definido | Luke + Rey | 9.5 |
| 9.8 | `canvas_layouts` persistido + cenários nomeados (save/load) + empty-state hero | Luke + Padmé | 9.5 |
| 9.9 | Guard-rails: depth limit, lock per-node, WS backpressure, purge agressivo | Han Solo + Mace Windu (QA) | 9.3, 9.4 |

**Ordem natural:** 9.0 (spike) → 9.1 → (9.1b + 9.1c paralelos) → (9.2 + 9.2b) → 9.3 → 9.4 → 9.5 → 9.5b → (9.5c, 9.6, 9.7, 9.8 paralelos) → 9.9 (QA final).

**Estimativa Luke (calibragem):** 2-3 dias ChatNode isolado + 2 dias SSE/Maestri + 1 dia slash/cmdk + 1 dia dialog de invocação + 1 dia modo grupo → ~8 dias frontend; backend (catalog + APIs + dispatcher) em paralelo ~6 dias.

---

## 9. Riscos de Mais Alto Impacto

| Risco | Severidade | Owner | Status |
|-------|-----------|-------|--------|
| Estado duplicado (PTY scrollback + messages) | Médio | Arch | Decisão: só messages estruturadas persistem; scrollback é raw view opcional |
| Custo de modelo em chat-only (agentes viram chatterbots) | **Alto** | PO | Rate-limit por conversa + Chief aprova broadcasts |
| Autorização por aresta (conexão indevida propaga) | **Alto** | Arch | UI sempre mostra arestas; audit inclui connection_id |
| React Flow com N>50 nodes | Médio | Luke | `onlyRenderVisibleElements` + colapsar por category_id + LOD por zoom |
| Foco perdido no input (bug latente atual) | Médio | Luke | `useMemo` em `data` / mover input state pra fora |
| Promoção chat→PTY com contexto grande | Médio | Arch | Sumarizar antes de injetar; full em DB |
| Zombies de `maestri ask` | Alto | DevOps | `child.kill()` em disconnect + transient purge |

---

## 10. Decisões Abertas — precisam de você

1. **Arestas direcionadas por default?** Recomendado **sim**; broadcast é `kind` separado. ✅/❌?
2. **Conversation 1-por-connection ou ad-hoc?** Recomendado **auto-cria ao conectar**; permite extras (grupos). ✅/❌?
3. **Persistir scrollback PTY no DB?** Recomendado **não**. Só `messages` estruturadas. ✅/❌?
4. **Chief é card normal (`is_chief=1`) ou overlay fixo?** Recomendado **card**; overlay é feature UX posterior. ✅/❌?
5. **Remover `TerminalNode` quando `ChatNode` estiver pronto** ou manter permanentemente coexistindo? Recomendado **coexistência permanente** (hybrid power). ✅/❌?
6. **Cenários salvos** são feature do v2.0 ou pro v2.1? (Rey puxa pra v2.0 pelo empty-state)
7. **Auth/multi-user** agora só scaffolding de `user_id='local'` (Han Solo sugere). Confirmar? ✅/❌?

---

## 11. Próximos Passos (quando aprovado)

1. **Você aprovar decisões abertas** (§10).
2. Chief (Yoda) cria **epic 9** e stories 9.0→9.9.
3. Chief despacha 9.0 pra Luke (spike) e 9.1 pra R2-D2 (migration) em paralelo.
4. QA (Mace Windu) prepara checklist de Definition-of-Done com os 5 pitfalls + 6 guard-rails.
5. DevOps (Chewbacca) prepara branch `feature/sala-comando-v2` a partir de `main`.

---

**Consolidado.** Nada de código até você confirmar. Pergunte, refine, ou dê green light — que os despachos começam.

— Yoda, the Force guides all 🧘‍♂️✨
