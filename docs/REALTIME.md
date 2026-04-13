# Sistema de Comunicação em Tempo Real — AIOX Monitor

Documentação técnica do subsistema de realtime do AIOX Monitor, cobrindo a arquitetura de WebSocket, gerenciamento de processos PTY, endpoints da Sala de Comando e o fluxo completo de mensagens do chat até a interface.

---

## 1. Arquitetura de Comunicação em Tempo Real

O AIOX Monitor opera com **dois canais WebSocket distintos** servidos pelo mesmo servidor Node.js (`server.ts`):

```
┌─────────────────────────────────────────────────────────────┐
│                        server.ts                            │
│                                                             │
│  HTTP Server                                                │
│    ├── Next.js handler (todas as rotas /api/*)              │
│    │                                                        │
│    ├── WebSocketServer  ──→ /ws   (broadcast global)        │
│    │     setBroadcaster(wss)                                │
│    │                                                        │
│    └── PtyWebSocketServer ──→ /pty?id=<terminalId>          │
│          (bridge PTY ↔ browser por terminal)                │
└─────────────────────────────────────────────────────────────┘
```

### Canal `/ws` — Broadcast Global

Responsável por eventos de sistema que todos os clientes precisam receber:

| Tipo de mensagem      | Origem                  | Significado                          |
|-----------------------|-------------------------|--------------------------------------|
| `event:new`           | EventProcessor          | Novo hook do Claude Code capturado   |
| `agent:update`        | EventProcessor          | Status de agente mudou               |
| `terminal:update`     | EventProcessor          | Estado de terminal mudou             |
| `terminal:removed`    | EventProcessor          | Terminal removido                    |
| `project:update`      | EventProcessor          | Novo projeto detectado               |
| `agent-completed`     | EventProcessor (Stop)   | Agente finalizou execução            |
| `ganga:heartbeat`     | GangaEngine             | Auto-responder ativo                 |
| `ping`                | Server                  | Keep-alive                           |

### Canal `/pty?id=<terminalId>` — PTY por Terminal

Canal dedicado por terminal, com protocolo misto (binário + JSON):

**Server → Client:**
- **Frames binários:** stdout bruto do processo PTY (para xterm.js)
- **Frames JSON:** `scrollback`, `status`, `exit`, `error`, `pong`, `chat-message`

**Client → Server:**
- **Frames binários:** stdin do usuário para o PTY
- **Frames JSON:** `resize`, `ping`, requisições de status

### Subsistemas Inicializados no Boot

O `server.ts` inicia na seguinte ordem:

1. Next.js handler
2. HTTP server
3. WebSocketServer principal (`/ws`)
4. PtyWebSocketServer (`/pty`)
5. Upgrade handlers para `/ws` e `/pty`
6. `setBroadcaster()` — disponibiliza o broadcaster para as rotas de API
7. `idleDetector`, `cleanupOldEvents`, `syncSystemTerminals`
8. `startJsonlWatcher` — parseia transcrições do Claude Code (delay de 5s)
9. `startGangaEngine` — auto-responder (se habilitado, ciclo de 30s)
10. Autopilot engine
11. Handlers de shutdown gracioso

---

## 2. ProcessManager e PTY — Ciclo de Vida, Cleanup e Eventos

### Localização

`src/server/command-room/process-manager.ts`

### Visão Geral

`ProcessManager` é um **singleton** que gerencia todos os processos PTY ativos. Usa `node-pty` para spawnar shells reais e emite eventos via `EventEmitter`.

### Limites Globais

```typescript
MAX_PROCESSES = 500            // processos simultâneos totais
MAX_PROCESSES_PER_PROJECT = 20 // por projeto
MAX_SCROLLBACK = 5000          // linhas no buffer de scrollback
```

### Ciclo de Vida de um Processo PTY

```
spawn()
  │
  ├── Validação: projectPath existe?
  ├── Verificação: limits atingidos?
  ├── pty.spawn(shell, args, { cols, rows, cwd, env })
  ├── Status → 'spawning'
  │
  ├── onData listener:
  │     ├── Acumula em scrollback[] (máx 5000 linhas)
  │     ├── Reseta idle timer
  │     └── Emite ProcessEvent { type: 'data', id, data }
  │
  ├── onExit listener:
  │     ├── Status → 'closed'
  │     ├── Emite ProcessEvent { type: 'exit', id, exitCode, signal }
  │     └── Agenda cleanup (CLOSED_RETENTION_MS = 30s)
  │
  └── Status → 'active' (após spawn bem-sucedido)
```

### Idle Detection e Timers

```typescript
IDLE_TIMEOUT_MS = 60_000       // 60s sem output → status 'idle'
CLOSED_RETENTION_MS = 30_000   // 30s após exit → remove da memória
KILL_GRACE_MS = 3_000          // 3s entre SIGTERM e SIGKILL
```

Quando o timer de idle dispara:
1. Status muda para `'idle'`
2. Emite `ProcessEvent { type: 'status', status: 'idle' }`

### Terminação Graciosa

```
kill(id)
  │
  ├── Envia SIGTERM ao processo
  ├── Aguarda KILL_GRACE_MS (3s)
  └── Se ainda vivo → SIGKILL
```

### Tipos Centrais (src/server/command-room/types.ts)

```typescript
type PtyStatus = 'spawning' | 'active' | 'idle' | 'error' | 'closed';

interface PtyProcess {
  id: string;
  agentName: string;
  projectPath: string;
  pid: number;
  status: PtyStatus;
  cols: number;
  rows: number;
  createdAt: string;
  scrollback: string[];
  pty: IPty;                              // instância node-pty
  idleTimer: ReturnType<typeof setTimeout> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

interface ProcessEvent {
  type: 'data' | 'status' | 'exit';
  id: string;
  data?: string;
  status?: PtyStatus;
  exitCode?: number;
  signal?: string;
}
```

### Evento Emitido pelo ProcessManager

O ProcessManager emite um único tipo de evento:

```typescript
processManager.on('process-event', (event: ProcessEvent) => { ... });
```

Consumidores deste evento:
- `PtyWebSocketServer` — reencaminha para clientes WebSocket do terminal
- `ChatCollector` — processa output para chat

---

## 3. WebSocket Server e Eventos

### PtyWebSocketServer

`src/server/command-room/pty-websocket-server.ts`

Faz a ponte entre o `ProcessManager` e os clientes browser para cada terminal individual.

#### Conexão de um cliente

```
Client conecta em /pty?id=<terminalId>
  │
  ├── Busca PtyProcess no ProcessManager
  ├── Envia scrollback completo (JSON: { type: 'scrollback', data: string[] })
  ├── Envia status atual (JSON: { type: 'status', status: PtyStatus })
  ├── Registra listener no ProcessManager para events deste id
  └── Inicia ping/keep-alive a cada 30s
```

#### Mensagens recebidas do cliente

| Tipo (JSON) | Ação                                     |
|-------------|------------------------------------------|
| `resize`    | `processManager.resize(id, cols, rows)`  |
| `ping`      | Responde com `{ type: 'pong' }`          |
| `status`    | Responde com status atual do processo    |
| (binário)   | Escreve no stdin do PTY                  |

#### Mensagens enviadas ao cliente

| Tipo (JSON)      | Conteúdo                                    |
|------------------|---------------------------------------------|
| `scrollback`     | `{ data: string[] }` — buffer histórico     |
| `status`         | `{ status: PtyStatus }` — mudança de estado |
| `exit`           | `{ exitCode, signal }` — processo encerrou  |
| `error`          | `{ message }` — erro de PTY                 |
| `pong`           | Resposta ao ping                            |
| `chat-message`   | `{ message: ChatMessage }` — nova mensagem  |
| (binário)        | Stdout bruto do PTY para o xterm.js         |

#### Multi-client por terminal

Múltiplos browsers podem conectar no mesmo `?id=`. Todos recebem o mesmo broadcast de eventos do ProcessManager.

### WebSocket Broadcaster Global

`src/server/ws-broadcaster.ts`

```typescript
export function setBroadcaster(server: WebSocketServer): void;
export function broadcast(message: WsMessage): void;
export function getClientCount(): number;
```

Fire-and-forget: falhas de envio são logadas mas nunca bloqueiam o processamento.

### WebSocketContext (client-side)

`src/contexts/WebSocketContext.tsx`

Gerencia a conexão `/ws` no browser com reconexão automática:

- Exponential backoff até 30s entre tentativas
- Máximo de 20 tentativas de reconexão
- API de subscrição via listeners (evita problemas de batching do React)

```typescript
interface WebSocketContextValue {
  connected: boolean;
  reconnectCount: number;
  subscribe: (listener: MessageListener) => () => void;
}
```

### Hook useWebSocket

`src/hooks/useWebSocket.ts`

```typescript
const { connected, lastMessage, reconnectCount } = useWebSocket();
// lastMessage: WsIncomingMessage | null
```

### Hook usePtySocket

`src/hooks/usePtySocket.ts`

Gerencia a conexão `/pty?id=<terminalId>` para um terminal específico:

```typescript
export function usePtySocket({
  terminalId: string | null,
  terminal: Terminal | null,          // instância xterm.js
  onStatusChange?: (status: PtyStatus) => void,
  onExit?: (code: number, signal?: string) => void,
  onError?: (message: string) => void,
  onIdle?: () => void,
  onOutput?: (text: string) => void,
  isRestored?: boolean,
}): {
  status: PtyStatus,
  sendResize: (cols: number, rows: number) => void,
  isConnected: boolean,
  startIdleWatch: () => void,
}
```

Comportamentos:
- Reconexão automática com exponential backoff
- Frames binários → `terminal.write()` (xterm.js)
- Idle watch: callback após 2s sem output

---

## 4. Endpoints de API da Sala de Comando

Todos os endpoints estão em `src/app/api/command-room/`.

### POST `/api/command-room/spawn`

Spawna um novo processo PTY.

**Body:**
```typescript
{
  agentName: string;           // ex: "CHIEF", "@dev"
  agentDisplayName?: string;
  projectPath?: string;        // default: process.cwd()
  cols?: number;               // 1-500, default 120
  rows?: number;               // 1-500, default 30
  initialPrompt?: string;      // comando(s) executados ao spawnar
  aiox_agent?: string;
  category_id?: string;
  description?: string;
  is_chief?: boolean;
}
```

**Response:**
```json
{
  "id": "uuid",
  "agentName": "string",
  "pid": 12345,
  "status": "spawning",
  "wsUrl": "/pty?id=uuid",
  "createdAt": "ISO8601"
}
```

### GET `/api/command-room/list`

Lista todos os terminais ativos com metadados de categoria.

Merge logic: DB é source of truth; campos de runtime do ProcessManager (cols, rows, status, pid) sobrescrevem.

**Response:**
```json
{
  "terminals": [
    {
      "id": "uuid",
      "agentName": "string",
      "projectPath": "/path",
      "cols": 120,
      "rows": 30,
      "status": "active|idle|closed",
      "pid": 12345,
      "createdAt": "ISO8601",
      "category_id": "uuid|null",
      "category": { "id", "name", "color" },
      "description": "string|null",
      "is_chief": false,
      "linked_terminal_ids": []
    }
  ],
  "categories": [{ "id", "name", "description", "display_order", "color" }],
  "count": 0,
  "maxTerminals": 500
}
```

### GET|POST|DELETE|PATCH `/api/command-room/[id]`

**GET** — Detalhes de um terminal.

**POST** — Escreve no stdin do PTY e registra como mensagem do Chief no ChatMessageStore:
```json
{
  "data": "comando",
  "submit": true    // adiciona \r automaticamente
}
```

**DELETE** — Mata o terminal e marca como `closed` no DB.

**PATCH** — Atualiza metadados:
```json
{
  "linked_terminal_ids": ["uuid1", "uuid2"]
}
```

### GET `/api/command-room/[id]/messages`

Histórico de chat do terminal.

```
?after=<message-id>   // mensagens mais novas que este ID
?limit=<n>            // máx 500, default 100
```

**Response:**
```json
{
  "terminalId": "uuid",
  "messages": [ChatMessage],
  "count": 0,
  "hasMore": false
}
```

### DELETE|GET `/api/command-room/kill`

- `DELETE ?project=<path>&purge=true` — Mata todos os terminais do projeto
- `DELETE ?all=true` — Mata todos os processos globalmente
- `GET` — Lista processos ativos com total e contagem

### POST `/api/command-room/ensure-chief`

Garante que existe um terminal Chief para o projeto. Usa lock em memória para evitar race conditions.

```json
{ "projectPath": "/path/to/project" }
```

Comportamento:
1. Se Chief existe (active/idle) → retorna o existente
2. Se não existe → spawna `claude --dangerously-skip-permissions`

**Response:**
```json
{
  "created": true,
  "terminal": {
    "id": "uuid",
    "agentName": "CHIEF",
    "is_chief": true,
    "status": "spawning"
  }
}
```

### POST `/api/command-room/resize`

```json
{
  "id": "uuid",
  "cols": 150,
  "rows": 40
}
```

### CRUD `/api/command-room/categories`

- `GET` — Lista categorias
- `POST` — Cria categoria (`name`, `description?`, `color?`)
- `PATCH` — Atualiza (`id`, `name`, `description`, `color`, `display_order`)
- `DELETE` — Remove (terminais fazem `SET NULL` via FK)

### GET `/api/command-room/browse`

Navega no filesystem para seleção de projeto.

```
?path=<dir>    // default: ~/Desktop
```

**Response:**
```json
{
  "currentPath": "/path",
  "parentPath": "/parent|null",
  "folders": [
    { "name": "folder", "path": "/full/path", "hasSubfolders": true }
  ]
}
```

### GET `/api/command-room/agents`

Lista agentes disponíveis para um projeto.

```
?path=<project-path>
```

Detecção:
1. Se `.aiox-core/development/agents/` existe → lê arquivos YAML/Markdown
2. Caso contrário → lista padrão (`@dev`, `@qa`, `@architect`, `@pm`, `@po`, `@sm`, `@analyst`, `@data-engineer`, `@ux-design-expert`, `@devops`)

---

## 5. Fluxo de Mensagens: Chat → PTY → WebSocket → UI

### 5.1 Fluxo: Usuário envia instrução ao Chief

```
UI (Sala de Comando)
  │  Usuário digita instrução e clica Enviar
  │
  └─→ POST /api/command-room/{id}
        { data: "instrução", submit: true }
          │
          ├─→ ChatMessageStore.addChiefMessage(terminalId, "instrução")
          │     └─→ Emite 'chat-event' { type: 'chat-message', role: 'chief' }
          │
          └─→ ProcessManager.write(id, "instrução\r")
                └─→ node-pty recebe stdin
```

### 5.2 Fluxo: Output do PTY → Chat → UI

```
node-pty (processo Claude Code)
  │  Produz saída (texto, tool calls, resultados)
  │
  └─→ ProcessManager.onData(data)
        │
        ├─→ Acumula em scrollback[]
        ├─→ Emite ProcessEvent { type: 'data', id, data }
        │
        └─→ [PtyWebSocketServer ouve 'process-event']
              │
              ├─→ Broadcast binário para todos os clientes /pty?id=<terminalId>
              │     └─→ browser: usePtySocket → terminal.write() → xterm.js renderiza
              │
              └─→ [ChatCollector ouve 'process-event']
                    │
                    └─→ ClaudeOutputParser.feed(data)
                          │
                          ├── Acumula output
                          ├── Strip ANSI sequences
                          ├── Detecta blocos de tool calls (⏺ Bash, Read, Write...)
                          └── Idle 2.5s sem output → flush()
                                │
                                └─→ ChatMessageStore.addAgentMessage(terminalId, text, artifacts)
                                      │
                                      └─→ Emite 'chat-event' { type: 'chat-message', role: 'agent' }
                                            │
                                            └─→ [PtyWebSocketServer ouve 'chat-event']
                                                  │
                                                  └─→ Broadcast JSON { type: 'chat-message', message }
                                                        │
                                                        └─→ browser: usePtySocket.onOutput
                                                              └─→ UI de chat renderiza mensagem
```

### 5.3 Fluxo: Hook Python → Eventos globais → UI

```
Claude Code (processo externo)
  │  Hook Python dispara (PreToolUse, PostToolUse, Stop, etc.)
  │
  └─→ POST /api/events
        { hook_type, project_path, agent_name, tool_name, ... }
          │
          └─→ EventProcessor.process(payload)
                │
                ├─→ upsertProject()
                ├─→ detectAgent()  (com múltiplos fallbacks)
                ├─→ updateAgentStatus()
                ├─→ updateTerminalStatus()
                ├─→ createOrFindSession()
                ├─→ insertEvent() → SQLite
                │
                └─→ broadcast({ type: 'event:new', ... })
                      │
                      └─→ ws-broadcaster → todos os /ws clients
                            │
                            └─→ browser: useWebSocket → lastMessage
                                  └─→ componentes React re-renderizam
```

### 5.4 Diagrama de Componentes

```
┌──────────────────────────────────────────────────────────────────┐
│                         server.ts                                │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐                    │
│  │  ProcessManager  │    │  ws-broadcaster   │                   │
│  │  (singleton)     │    │  (singleton)      │                   │
│  │                  │    │                   │                   │
│  │  Map<id, Pty>   │    │  broadcast(msg)   │                   │
│  │  EventEmitter    │    └──────────────────┘                    │
│  └────────┬─────────┘             ↑                              │
│           │ 'process-event'       │ broadcast                    │
│           ├───────────────────────┼──────────────────────────┐  │
│           │                       │                           │  │
│  ┌────────▼─────────┐  ┌─────────┴──────────┐               │  │
│  │ PtyWebSocketServer│  │  EventProcessor    │               │  │
│  │ /pty?id=<id>      │  │  POST /api/events  │               │  │
│  │                   │  └────────────────────┘               │  │
│  │  Binary: stdout   │                                        │  │
│  │  JSON: control    │  ┌────────────────────────────────┐   │  │
│  └────────┬──────────┘  │  WebSocketServer /ws           │   │  │
│           │             │  ← usa ws-broadcaster          │   │  │
│  ┌────────▼─────────┐   └─────────────────┬──────────────┘   │  │
│  │  ChatCollector   │                      │                  │  │
│  │  → OutputParser  │                      │                  │  │
│  │  → ChatStore     │                      │                  │  │
│  └──────────────────┘                      │                  │  │
│                                            │                  │  │
└────────────────────────────────────────────┼──────────────────┘  │
                                             │                     │
                ┌────────────────────────────┼─────────────────┐   │
                │           Browser          │                 │   │
                │                           ▼                 │   │
                │  useWebSocket()    ← /ws connection         │   │
                │  usePtySocket()    ← /pty?id=<id> connection│   │
                │  xterm.js          ← binary frames          │   │
                │  Chat UI           ← chat-message events    │   │
                └─────────────────────────────────────────────┘   │
```

---

## Padrões Arquiteturais Relevantes

### Singleton com Hot-Reload Safety

`ProcessManager`, `ChatMessageStore` e `ChatCollector` usam o padrão singleton com guard global para sobreviver ao hot-reload do Next.js em desenvolvimento.

### DB como Source of Truth para Terminais

O `command-room-repository` persiste terminais no SQLite. O `ProcessManager` adiciona campos de runtime (status, pid, cols, rows). O endpoint `/list` faz merge, com o ProcessManager sobrescrevendo os campos voláteis.

### Agent Detection com Múltiplos Fallbacks

O `EventProcessor` detecta o agente na seguinte ordem:
1. `payload.agent_name` (do hook Python)
2. Parse do input de tools Skill/Agent
3. Cache por PID de terminal (sticky na sessão)
4. Fallback no DB
5. Limpa cache em nova sessão Claude Code (evita "agente stale em todo lugar")

### Fire-and-Forget no Broadcast

`ws-broadcaster.broadcast()` nunca bloqueia. Erros de envio são logados. O endpoint `POST /api/events` sempre retorna 200 para não bloquear os hooks Python do Claude Code.

### Protocolo Misto no Canal PTY

O canal `/pty` usa frames **binários** para stdout (performance máxima para xterm.js) e frames **JSON** para mensagens de controle (resize, status, chat). O `PtyWebSocketServer` e o `usePtySocket` detectam o tipo pelo `instanceof ArrayBuffer`.
