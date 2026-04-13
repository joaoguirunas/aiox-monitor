# Sala de Comando — Documentação Técnica

> Baseado no código-fonte em `src/app/command-room/`, `src/components/command-room/`, `src/hooks/` e `src/server/command-room/`.
> Branch: `feature/8.8-terminal-tests` — atualizado em 2026-04-08.

---

## 1. Visão Geral

A Sala de Comando é uma interface de orquestração de agentes AI que permite spawnar, monitorar e controlar múltiplos terminais PTY em paralelo. Cada terminal roda um processo `claude` (ou shell puro) e se comunica via WebSocket em tempo real.

### Conceitos fundamentais

| Conceito | Descrição |
|---|---|
| **Terminal** | Processo PTY gerenciado pelo `ProcessManager`. Persiste no banco entre reinícios. |
| **Chief** | Terminal marcado com `is_chief=true`. Criado automaticamente ao ativar um projeto. Funciona como orquestrador da equipe — outros terminais se vinculam a ele. |
| **Projeto** | Diretório de código. A UI organiza terminais por `project_path`. |
| **Categoria** | Agrupamento visual de terminais dentro de um projeto. Tem nome e cor. |
| **Link** | Relação 1-para-muitos entre Chief e outros terminais. Habilita broadcast. |
| **Autopilot** | Modo em que o terminal reage ao evento de idle: reinicia o agente automaticamente (estado somente na UI, não persiste). |

---

## 2. Modos de Visualização

A página `src/app/command-room/page.tsx` mantém o estado `viewMode: 'grid' | 'canvas'` e renderiza condicionalmente.

### 2.1 Grid (padrão)

Terminais organizados em linhas por categoria (`CategoryRow`). Cada categoria tem scroll horizontal. O drag-and-drop reordena terminais via `handleDragOver` usando índice no array global `terminals`.

Renderização condicional na página:

```tsx
// page.tsx — layout grid
{viewMode === 'grid' && (
  <div className="flex flex-col gap-6">
    {/* Chief sempre primeiro, sem categoria */}
    {/* Terminais sem categoria */}
    {/* CategoryRow[] para cada categoria */}
  </div>
)}
```

### 2.2 Canvas (React Flow)

Componente `src/components/command-room/canvas/CanvasView.tsx` usando `@xyflow/react`.

**Hook de layout:** `useCanvasLayout.ts` — calcula posições e dimensões:

| Tipo | Posição | Tamanho (px) |
|---|---|---|
| Chief (`is_chief=true`) | Topo, centralizado | 700 × 500 (LG) |
| Outros terminais | Grid 3 colunas, gap 24px horizontal / 60px vertical | 500 × 350 (MD) |

Cada terminal é encapsulado em `TerminalNode.tsx` — um nó ReactFlow que renderiza o `TerminalPanel` com um drag handle de 8px no topo (cor AIOX orange). Edges animadas (`smoothstep`) conectam terminais vinculados.

**Carregamento dinâmico:** `CanvasView` é importado com `dynamic(..., { ssr: false })` — não renderiza no servidor.

---

## 3. Sistema de Terminais

### 3.1 Ciclo de vida de um terminal

```
Spawn Request
     │
     ▼
ProcessManager.spawn()  →  node-pty cria processo
     │
     ▼
insertTerminal() no SQLite  (pty_status='active')
     │
     ▼
WebSocket /pty?id={id}  ←→  usePtySocket.ts  ←→  xterm.js
     │
     ├─ inatividade 60s → pty_status='idle'
     ├─ exit code → pty_status='closed'
     └─ crash/restart servidor → markCrashedTerminals() → pty_status='crashed'
```

### 3.2 Modos de terminal (TerminalMode)

| Modo | Comando inicial | Uso |
|---|---|---|
| `claude` | `claude --dangerously-skip-permissions` | Agentes AI interativos |
| `bypass` | `claude --dangerously-skip-permissions` (variante) | Alias para o modo principal |
| `clean` | shell puro (sem prompt claude) | Terminal de sistema |

### 3.3 Chief — criação automática

Quando um projeto se torna ativo, `page.tsx` chama `POST /api/command-room/ensure-chief`. A rota:

1. Verifica se existe Chief ativo/idle para o `projectPath`.
2. Se não existe: usa um `Set` (`pendingProjects`) como mutex para evitar race conditions e spawna um novo terminal com `is_chief=true` e `initialPrompt: 'claude --dangerously-skip-permissions'`.
3. Retorna `{ created: boolean, terminal: {...} }`.

Todo terminal novo (exceto Chief) se vincula automaticamente ao Chief via `handleSpawn`, que chama `PATCH /api/command-room/{id}` para atualizar `linked_terminal_ids`.

### 3.4 Autopilot

Estado mantido em `autopilotIds: Set<string>` no state de `page.tsx`. Quando ativo, o callback `onIdle` do `usePtySocket` (disparado após 2s sem stdout) reencaminha o agente. **Não persiste no banco — resetado ao recarregar a página.**

### 3.5 Chat mode

Cada `TerminalPanel` tem um toggle interno `viewMode: 'terminal' | 'chat'`:

- **`terminal`:** xterm.js renderizando stdout binário em tempo real.
- **`chat`:** componente `ChatView.tsx` exibindo mensagens estruturadas.

A troca não mata o processo PTY — ambos os modos consomem o mesmo processo.

**Extração de artifacts no chat:** `ChatView` usa regex para detectar tool calls no output:

```typescript
TOOL_HEADER_RE = /^(?:⏺\s*)?(?:Read|Write|Edit|Bash|Grep|Glob|Agent|Skill)\s*[:(]/i
```

Artifacts detectados são exibidos como blocos colapsáveis (arquivo, comando, código).

---

## 4. Componentes Principais

### 4.1 `page.tsx` — Orquestrador

**Path:** `src/app/command-room/page.tsx`

Estado central:

| State | Tipo | Descrição |
|---|---|---|
| `terminals` | `ActiveTerminal[]` | Todos os terminais carregados |
| `projects` | `string[]` | Paths de projetos com terminais |
| `activeProject` | `string \| null` | Projeto selecionado na UI |
| `categories` | `TerminalCategory[]` | Categorias do projeto ativo |
| `viewMode` | `'grid' \| 'canvas'` | Modo de visualização |
| `autopilotIds` | `Set<string>` | IDs com autopilot ativo |
| `teamSpawning` | `string \| null` | Nome do preset sendo spawnado |
| `teamProgress` | `{ current, total }` | Progresso do spawn de equipe |
| `notifications` | `AgentNotification[]` | Notificações de conclusão de agentes |

Handlers principais:

| Handler | Ação |
|---|---|
| `handleSpawn` | Spawna terminal único, auto-linka com Chief |
| `handleTeamSpawn` | Spawna preset de equipe (ex: AIOX Standard, 13 agentes) |
| `handleCustomSquadSpawn` | Spawna composição customizada via TeamBuilder |
| `handleRemoveProject` | Remove projeto do state (sem persistência — BUG-01) |
| `handleClearProject` | Mata todos os terminais do projeto ativo |
| `handleDragOver` | Reordena terminais via drag (índice global — BUG-08) |
| `handleRename` | Renomeia terminal no state (sem persistência — BUG-09) |
| `handleLink` | Atualiza `linkedTerminalIds` no state e via PATCH |

**Carregamento inicial (mount):** `GET /api/command-room/list` retorna DB + ProcessManager merged. Reconstrói `projects[]` a partir dos `project_path` únicos dos terminais.

### 4.2 `TerminalPanel.tsx`

**Path:** `src/components/command-room/TerminalPanel.tsx`

Responsabilidades:
- Renderiza xterm.js (`@xterm/xterm` + `@xterm/addon-fit`)
- Conecta ao PTY via `usePtySocket`
- Toggle terminal ↔ chat
- Controles: rename inline, expand info, broadcast input, link picker
- Exibe badge "respondeu" quando idle detectado após envio

Tema AIOX aplicado ao xterm:

```typescript
background: '#0A0A0A'
foreground: '#F4F4E8'
cursor: '#FF4400'
selectionBackground: 'rgba(255,68,0,0.25)'
```

Mapa de agentes AIOX (hardcoded):

```typescript
'@dev'              → '/AIOX:agents:dev'
'@qa'               → '/AIOX:agents:qa'
'@architect'        → '/AIOX:agents:architect'
'@pm'               → '/AIOX:agents:pm'
'@ux-design-expert' → '/AIOX:agents:ux-design-expert'
'@devops'           → '/AIOX:agents:devops'
// + outros agentes AIOX
```

### 4.3 `ChatView.tsx`

**Path:** `src/components/command-room/ChatView.tsx`

Props:

```typescript
interface ChatViewProps {
  messages: ChatMessage[]
  agentName: string
  onSend: (text: string) => void
  disabled?: boolean
}
```

Renderiza balões por `role` (`chief` → esquerda, `agent` → direita). Artifacts são blocos colapsáveis com syntax coloring. Auto-scroll ao adicionar mensagem.

### 4.4 Canvas: `CanvasView`, `TerminalNode`, `useCanvasLayout`

**Paths:** `src/components/command-room/canvas/`

- `CanvasView.tsx` — container ReactFlow com `MiniMap`, `Controls`, `Background`. Mantém posições de nós em estado local preservado entre re-renders.
- `TerminalNode.tsx` — nó customizado ReactFlow. Drag handle no topo (8px, `cursor: grab`). Renderiza `TerminalPanel` com classes `nodrag nopan`. Memoizado.
- `useCanvasLayout.ts` — calcula `nodes[]` e `edges[]`. Chief sempre primeiro. Edges deduplicated por par ordenado de IDs.

### 4.5 `CategoryRow.tsx`

**Path:** `src/components/command-room/CategoryRow.tsx`

Container de categoria com scroll horizontal. Border-left colorido. Suporta rename inline (Enter/Escape/blur). Exibe gradient hints nas extremidades quando há overflow.

### 4.6 `FolderPicker.tsx`

**Path:** `src/components/command-room/FolderPicker.tsx`

Modal de file browser. Browse hierárquico via `GET /api/command-room/browse?path={path}`. Default: `~/Desktop`. Filtra pastas ocultas (`.`). Breadcrumb de navegação.

### 4.7 `CategoryCreator.tsx`

**Path:** `src/components/command-room/CategoryCreator.tsx`

Modal dialog. Preset de 8 cores. `POST /api/command-room/categories` ao confirmar. Retorna `{ id, name, color }` ao parent via `onCreated`.

### 4.8 `TeamBuilder.tsx` e `AvatarPicker.tsx`

Stubs — componentes criados mas sem implementação. `TeamBuilder` (28 linhas) tem a interface definida; `AvatarPicker` (19 linhas) é placeholder.

---

## 5. Hooks

### 5.1 `usePtySocket.ts`

**Path:** `src/hooks/usePtySocket.ts`

Gerencia a conexão WebSocket com o servidor PTY.

```typescript
interface UsePtySocketOptions {
  terminalId: string | null
  terminal: Terminal | null           // instância xterm.js
  onStatusChange?: (status: PtyStatus) => void
  onExit?: (code: number, signal?: string) => void
  onError?: (message: string) => void
  onIdle?: () => void                 // disparado após 2s sem stdout
  onOutput?: (text: string) => void   // texto cru do PTY
  isRestored?: boolean
}
```

Comportamentos:

| Comportamento | Detalhe |
|---|---|
| Reconnection | 5 tentativas, backoff exponencial |
| Keep-alive | Ping a cada 30s |
| Scrollback | Solicitado automaticamente na (re)conexão |
| Idle watch | Callback após 2s sem stdout, se `startIdleWatch()` chamado antes |
| Stdin | xterm `onData` → WebSocket binary frame |
| Stdout | WebSocket binary frame → `terminal.write(Uint8Array)` + `onOutput` |
| Resize | Negociado via mensagem `{ type: 'resize', cols, rows }` |

Status possíveis: `'connecting' | 'active' | 'idle' | 'error' | 'closed'`

### 5.2 `useWebSocket.ts`

**Path:** `src/hooks/useWebSocket.ts`

Hook fino que expõe o contexto WebSocket global (reconexão, `lastMessage`). Usado em `page.tsx` para receber eventos `agent-completed` e gerar notificações na UI.

---

## 6. APIs REST

### Terminais

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/command-room/list` | Lista terminais (merge DB + ProcessManager) |
| `POST` | `/api/command-room/spawn` | Cria terminal PTY |
| `GET` | `/api/command-room/[id]` | Detalhes de um terminal |
| `POST` | `/api/command-room/[id]` | Escreve no stdin do PTY |
| `PATCH` | `/api/command-room/[id]` | Atualiza `linked_terminal_ids` |
| `DELETE` | `/api/command-room/[id]` | Fecha terminal (marca `closed` no DB) |
| `POST` | `/api/command-room/ensure-chief` | Garante que Chief existe para o projeto |
| `DELETE` | `/api/command-room/kill` | Mata terminais (por projeto, por `all`, com `purge`) |
| `POST` | `/api/command-room/resize` | Redimensiona PTY e persiste no DB |

### Chat

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/command-room/[id]/messages` | Histórico de chat (max 500, suporte a `?after=`) |

### Organização

| Método | Endpoint | Descrição |
|---|---|---|
| `GET/POST/PATCH/DELETE` | `/api/command-room/categories` | CRUD de categorias |
| `GET` | `/api/command-room/browse` | File browser de diretórios |
| `GET` | `/api/command-room/agents` | Lista agentes AIOX detectados no projeto |
| `GET` | `/api/command-room/maestri-agents` | Lista agentes Maestri conectados |

### Body de spawn (referência)

```typescript
POST /api/command-room/spawn
{
  agentName: string           // obrigatório
  agentDisplayName?: string
  projectPath?: string        // fallback para cwd
  cols?: number               // 1–500, padrão 120
  rows?: number               // 1–500, padrão 30
  initialPrompt?: string      // ex: 'claude --dangerously-skip-permissions'
  aiox_agent?: string         // ex: '@dev'
  category_id?: string
  description?: string
  is_chief?: boolean
}
```

Limites: `MAX_PROCESSES = 500` (global), `MAX_PROCESSES_PER_PROJECT = 20`.

---

## 7. Fluxo de Dados e WebSocket

### 7.1 Spawn e conexão inicial

```
UI handleSpawn()
    │
    ▼
POST /api/command-room/spawn
    │
    ├── ProcessManager.spawn()  → node-pty → processo no OS
    └── insertTerminal()        → SQLite command_room_terminals
    │
    ▼
Response: { id, wsUrl, createdAt }
    │
    ▼
UI adiciona terminal ao state
    │
    ▼
usePtySocket conecta: ws://host/pty?id={id}
    │
    ├── → solicita scrollback (reconexão)
    └── ← recebe stdout em binário → terminal.write()
```

### 7.2 Escrita no PTY (input do usuário ou broadcast)

```
TerminalPanel (xterm onData)
    │
    ▼
usePtySocket → WebSocket.send(data: Uint8Array)
    │
    ▼
PTY WebSocket Server → ProcessManager.write(id, data)
    │
    ▼
node-pty stdin
```

**Via API** (usado para broadcast e comandos programáticos):

```
POST /api/command-room/{id}  { data: string, submit?: boolean }
    │
    ├── ProcessManager.write(id, data + '\r')   → PTY stdin
    └── ChatMessageStore.addChiefMessage()       → store de chat
```

### 7.3 Recebimento de output do agente

```
node-pty stdout
    │
    ▼
PTY WebSocket Server
    │
    ├── → WebSocket binary frame → usePtySocket → xterm.write()
    │                                           → onOutput(text) → ChatView
    │
    └── → ChatCollector.feed()
              │ (após 2.5s de silêncio)
              ▼
         ClaudeOutputParser.parse()
              │
              ▼
         ChatMessageStore.addAgentMessage({ content, artifacts })
              │
              ▼
         WebSocket event: { type: 'chat-message', message }
              │
              ▼
         ChatView renderiza balão incoming
```

### 7.4 Broadcast para terminais vinculados

```
UI handleBroadcast(text)
    │
    ▼
startIdleWatch() em cada terminal vinculado
    │
    ▼
Promise.all([
  POST /api/command-room/{linkedId1}  { data: text, submit: true },
  POST /api/command-room/{linkedId2}  { data: text, submit: true },
  ...
])
```

### 7.5 Cross-agent mention (@agente no initialPrompt)

```
handleCustomSquadSpawn()
    │
    ▼
initialPrompt = `claude --dangerously-skip-permissions\n${agentCommand}`
    │
    ▼
POST /api/command-room/spawn { initialPrompt }
    │
    ▼
ProcessManager.spawn() → write(initialPrompt) ao PTY logo após spawn
```

> **Atenção:** O `\n` literal pode fazer o segundo comando (`/AIOX:agents:...`) ser perdido se o Claude não estiver pronto para recebê-lo. Está documentado como BUG-06 na auditoria.

---

## 8. Persistência — Banco de Dados

Duas tabelas SQLite gerenciadas por `src/lib/command-room-repository.ts`:

### `command_room_terminals`

```sql
id TEXT PRIMARY KEY,               -- UUID gerado no spawn
agent_name TEXT,                   -- nome do agente
agent_display_name TEXT,           -- nome de exibição
project_path TEXT,                 -- diretório do projeto
cols INTEGER, rows INTEGER,        -- dimensões do terminal
pty_status TEXT DEFAULT 'active',  -- active|idle|crashed|closed
created_at DATETIME,
last_active DATETIME,
category_id TEXT REFERENCES terminal_categories(id) ON DELETE SET NULL,
description TEXT,
is_chief INTEGER DEFAULT 0,        -- 1 se Chief
linked_terminal_ids TEXT           -- JSON: ["id1","id2"]
```

### `terminal_categories`

```sql
id TEXT PRIMARY KEY,
name TEXT UNIQUE,
description TEXT,
display_order INTEGER,
color TEXT                         -- hex, ex: '#FF4400'
```

### Estratégia de reconciliação no startup

`markCrashedTerminals(activeIds)` deveria ser chamada no startup do ProcessManager para marcar como `crashed` todos os terminais que o DB acredita estar ativos mas o ProcessManager não conhece (processo morreu com o servidor). **A chamada não está implementada no startup atual** — documentado como BUG-02 na auditoria.

---

## 9. Servidor PTY

**Path:** `src/server/command-room/process-manager.ts`

Singleton (`ProcessManager.getInstance()`). Mantém `Map<string, PtyProcess>` em memória.

Limites e timeouts:

| Constante | Valor |
|---|---|
| `MAX_PROCESSES` | 500 |
| `MAX_PROCESSES_PER_PROJECT` | 20 |
| `MAX_SCROLLBACK` | 5000 linhas |
| `IDLE_TIMEOUT_MS` | 60.000 ms (1 min) |
| `CLOSED_RETENTION_MS` | 30.000 ms (30s após fechar) |

### Chat infrastructure no servidor

| Arquivo | Responsabilidade |
|---|---|
| `chat-store.ts` | In-memory store de mensagens. Max 500 por terminal. Emite `chat-event`. |
| `chat-collector.ts` | Acumula output PTY e faz flush após 2.5s de silêncio. |
| `claude-output-parser.ts` | Strip ANSI + extração de artifacts (arquivos, comandos). |
| `types.ts` | `PtyStatus`, `SpawnOptions`, `PtyProcess` |
| `chat-types.ts` | `ChatMessage`, `ChatArtifact`, `ChatEvent` |

---

## 10. Equipes Preset

A página define o preset **AIOX Standard** (13 terminais) hardcoded:

| Label | `aiox_agent` | Persona |
|---|---|---|
| MASTER | `@aiox-master` | Orion — orquestração central |
| DEV 1–4 | `@dev` | Dex — desenvolvimento (4 instâncias) |
| UX | `@ux-design-expert` | Uma — design/UI |
| QA | `@qa` | Quinn — testes |
| DATA | `@data-engineer` | Dara — banco de dados |
| PM | `@pm` | Morgan — product management |
| SM | `@sm` | River — scrum |
| ANALYST | `@analyst` | Alex — pesquisa |
| ARCHITECT | `@architect` | Aria — arquitetura |
| DEV OPS | `@devops` | Gage — git/deploy |

O spawn do preset:
1. Chama `ensure-chief` primeiro.
2. Itera os terminais sequencialmente com `POST /api/command-room/spawn`.
3. Atualiza `teamProgress.current` a cada spawn.
4. Cada terminal recebe `initialPrompt: 'claude --dangerously-skip-permissions'`.

---

*Documentação gerada por Luke (Dev Alpha) — baseada exclusivamente no código-fonte existente.*
