# Sistema de Configurações — aiox-monitor

Documentação técnica baseada no código-fonte. Cobre as estruturas de dados, APIs e fluxos de configuração do aiox-monitor.

---

## 1. Gestão de Projetos

### Estrutura de um Projeto

```typescript
interface Project {
  id: number;           // PK autoincrement
  name: string;         // Nome exibido
  path: string;         // Caminho absoluto no filesystem (UNIQUE)
  detected_at: string;  // datetime ISO — quando foi detectado pela primeira vez
  last_active: string;  // datetime ISO — última atividade registrada
}
```

### Operações disponíveis

| Operação | Função | Comportamento |
|----------|--------|---------------|
| Criar/atualizar | `upsertProject(path, name)` | INSERT OR UPDATE — retorna `{ project, isNew }` |
| Listar todos | `getProjects()` | Ordenado por `last_active DESC` |
| Buscar por ID | `getProjectById(id)` | Retorna `null` se não encontrado |
| Detalhes completos | `getProjectWithDetails(id)` | Inclui `agents[]` e `terminals[]` |
| Remover | `deleteProject(id)` | CASCADE em todas as tabelas filhas (ver abaixo) |
| Limpar eventos | `clearProjectEvents(id)` | Apaga `events` e `sessions` do projeto |
| Estatísticas | `getProjectStats(id)` | Retorna `{ events, agents, sessions }` |

### API REST

```
GET  /api/projects              → lista projetos
GET  /api/projects?stats=1      → lista com contagem de eventos/agentes/sessões
GET  /api/projects/:id          → detalhes completos (agents + terminals)
DELETE /api/projects/:id        → remove projeto + processos PTY ativos
DELETE /api/projects/:id/events → limpa histórico de eventos sem remover o projeto
```

### Cascata na exclusão de um projeto

Ao deletar um projeto:
1. Todos os processos PTY ativos associados são encerrados via `ProcessManager`
2. Terminais da `command_room_terminals` (sem FK para `projects`) são deletados por `project_path`
3. `DELETE FROM projects` dispara CASCADE automático em: `agents`, `terminals`, `sessions`, `events`, `autopilot_log`, `ganga_log`
4. Categorias órfãs (sem terminais referenciando-as) são removidas

---

## 2. Gestão de Agentes e Categorias

### Estrutura de um Agente

```typescript
interface Agent {
  id: number;
  project_id: number;       // FK → projects.id (CASCADE)
  name: string;             // Identificador técnico (ex: "@dev", "@qa")
  display_name?: string;    // Nome de exibição opcional
  role?: string;            // Papel/função descritivo
  team?: string;            // Time ao qual pertence
  status: AgentStatus;      // 'idle' | 'working' | 'break' | 'offline'
  current_tool?: string;    // Tool sendo executada no momento
  last_active: string;      // datetime ISO
}
```

Restrição de unicidade: `UNIQUE(project_id, name)` — o mesmo agente não aparece duplicado por projeto.

### Operações disponíveis

| Operação | Função | Comportamento |
|----------|--------|---------------|
| Criar/atualizar | `upsertAgent(projectId, name, opts?)` | INSERT OR UPDATE; `role`/`team`/`display_name` preservados se já preenchidos |
| Atualizar status | `updateAgentStatus(projectId, name, status, tool)` | Atualiza `status`, `current_tool`, `last_active` |
| Atualizar campos | `updateAgentFields(id, fields)` | Atualiza `display_name`, `role`, `team` dinamicamente |
| Listar | `getAgents(filters?)` | Com contagem de terminais ativos |
| Instâncias | `getAgentInstances(filters?)` | Uma linha por terminal ativo com agente (permite mesmo `@dev` em N terminais) |

### Instâncias de Agentes

`getAgentInstances` retorna uma visão desnormalizada: um agente pode aparecer múltiplas vezes se estiver rodando em terminais diferentes. Usa `-(terminal.id)` como ID para evitar colisão com IDs reais de agentes.

Mapeamento de status terminal → agente:
- `processing` → `working`
- `active` → `idle`
- qualquer outro → `offline`

### Catálogo de Agentes de um Projeto (`/api/command-room/agents`)

```
GET /api/command-room/agents?path=/caminho/projeto
```

Detecta automaticamente agentes disponíveis para um projeto:

1. Se `path` não informado → retorna lista padrão com 10 agentes AIOX
2. Se o diretório não tem `.aiox-core/development/agents/` → retorna lista padrão
3. Se encontrar arquivos `.md`/`.yaml`/`.yml` nesse diretório → lê e extrai `name:` do conteúdo

**Agentes padrão** (com cores e personas fixas):

| Nome | Persona | Cor |
|------|---------|-----|
| `@dev` | Dex | `#34d399` |
| `@qa` | Quinn | `#fbbf24` |
| `@architect` | Aria | `#a78bfa` |
| `@pm` | Morgan | `#22d3ee` |
| `@po` | Pax | `#fb923c` |
| `@sm` | River | `#60a5fa` |
| `@analyst` | Alex | `#c084fc` |
| `@data-engineer` | Dara | `#2dd4bf` |
| `@ux-design-expert` | Uma | `#f472b6` |
| `@devops` | Gage | `#f87171` |

### API REST de Agentes

```
GET   /api/agents                          → lista agentes (todos os projetos)
GET   /api/agents?project_id=N             → filtra por projeto
GET   /api/agents?project_id=N&expand=terminals → retorna instâncias por terminal
PATCH /api/agents                          → atualiza { id, role?, team?, display_name? }
```

### Categorias de Terminais

Categorias agrupam terminais na Sala de Comando.

```typescript
interface TerminalCategory {
  id: string;           // UUID gerado no servidor
  name: string;         // UNIQUE
  description: string | null;
  display_order: number; // Ordenação na UI (ASC)
  color: string | null; // Cor de identificação visual
}
```

**API REST:**

```
GET    /api/command-room/categories          → lista todas as categorias
POST   /api/command-room/categories          → cria categoria { name, description?, color? }
PATCH  /api/command-room/categories          → atualiza { id, name?, description?, color?, display_order? }
DELETE /api/command-room/categories?id=UUID  → remove (terminais vinculados ficam sem categoria via ON DELETE SET NULL)
```

Ao remover um projeto, categorias sem nenhum terminal restante são limpas automaticamente.

---

## 3. Schema do Banco de Dados

**Engine:** SQLite via `node:sqlite` (Node.js nativo)
**Arquivo:** `data/monitor.db` (relativo ao CWD do servidor)
**PRAGMAs ativos:** `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000ms`

### Diagrama de Tabelas

```
projects
  ├── agents          (project_id FK CASCADE)
  ├── terminals       (project_id FK CASCADE)
  │     └── sessions  (terminal_id FK SET NULL)
  ├── sessions        (project_id FK CASCADE)
  │     └── events    (session_id FK SET NULL)
  ├── events          (project_id FK CASCADE)
  ├── autopilot_log   (project_id FK CASCADE)
  └── ganga_log       (project_id FK CASCADE)

terminal_categories
  └── command_room_terminals  (category_id FK SET NULL)

company_config              (singleton, id = 1)
```

### Tabela: `projects`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `name` | TEXT NOT NULL | Nome do projeto |
| `path` | TEXT NOT NULL UNIQUE | Caminho absoluto |
| `detected_at` | TEXT | datetime('now') — detecção inicial |
| `last_active` | TEXT | datetime('now') — atualizado em cada evento |

### Tabela: `agents`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `project_id` | INTEGER FK → projects | CASCADE DELETE |
| `name` | TEXT NOT NULL | Identificador (ex: `@dev`) |
| `display_name` | TEXT | Nome de exibição |
| `role` | TEXT | Papel descritivo |
| `team` | TEXT | Time |
| `status` | TEXT | `idle` \| `working` \| `break` \| `offline` |
| `current_tool` | TEXT | Tool ativa no momento |
| `last_active` | TEXT | Timestamp da última atividade |

Constraint: `UNIQUE(project_id, name)`

### Tabela: `terminals`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `project_id` | INTEGER FK → projects | CASCADE DELETE |
| `pid` | INTEGER NOT NULL | PID do processo no SO |
| `session_id` | TEXT | ID de sessão Claude Code |
| `status` | TEXT | `processing` \| `active` \| `inactive` |
| `agent_name` | TEXT | Agente detectado no terminal |
| `agent_display_name` | TEXT | Nome de exibição do agente |
| `current_tool` | TEXT | Tool sendo usada |
| `current_input` | TEXT | Input atual resumido |
| `window_title` | TEXT | Título da janela |
| `current_tool_detail` | TEXT | Detalhe enriquecido da tool |
| `waiting_permission` | INTEGER | `0`\|`1` — aguardando confirmação |
| `autopilot` | INTEGER | `0`\|`1` — autopilot habilitado |
| `first_seen_at` | TEXT | Primeira detecção |
| `last_active` | TEXT | Última atividade |

Constraint: `UNIQUE(project_id, pid)`

### Tabela: `sessions`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `project_id` | INTEGER FK → projects | CASCADE DELETE |
| `agent_id` | INTEGER FK → agents | SET NULL on delete |
| `terminal_id` | INTEGER FK → terminals | SET NULL on delete |
| `started_at` | TEXT | Início da sessão |
| `ended_at` | TEXT | Fim (null = sessão ativa) |
| `event_count` | INTEGER | Contador de eventos (incrementado em cada insert) |
| `status` | TEXT | `active` \| `completed` \| `interrupted` |

### Tabela: `events`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `project_id` | INTEGER FK → projects | CASCADE DELETE |
| `agent_id` | INTEGER FK → agents | SET NULL |
| `session_id` | INTEGER FK → sessions | SET NULL |
| `terminal_id` | INTEGER FK → terminals | SET NULL |
| `type` | TEXT | `PreToolUse` \| `PostToolUse` \| `UserPromptSubmit` \| `Stop` \| `SubagentStop` |
| `tool` | TEXT | Nome da tool usada |
| `input_summary` | TEXT | Resumo do input |
| `output_summary` | TEXT | Resumo do output |
| `duration_ms` | INTEGER | Duração da operação |
| `raw_payload` | TEXT | Payload bruto (JSON serializado) |
| `created_at` | TEXT | Timestamp do evento |

### Tabela: `company_config` (singleton)

Linha única com `id = 1`. Ver seção 4.

### Tabela: `command_room_terminals`

Terminais abertos na Sala de Comando (PTY gerenciados pelo servidor).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | TEXT PK | UUID gerado no spawn |
| `agent_name` | TEXT NOT NULL | Identificador do agente |
| `agent_display_name` | TEXT | Nome de exibição |
| `project_path` | TEXT NOT NULL | Caminho do projeto |
| `cols` | INTEGER | Colunas do terminal (padrão 220) |
| `rows` | INTEGER | Linhas do terminal (padrão 50) |
| `pty_status` | TEXT | `active` \| `idle` \| `closed` \| `crashed` |
| `category_id` | TEXT FK → terminal_categories | SET NULL on delete |
| `description` | TEXT | Descrição livre do terminal |
| `is_chief` | INTEGER | `0`\|`1` — terminal Chief do projeto |
| `linked_terminal_ids` | TEXT | JSON array de IDs vinculados |
| `created_at` | TEXT | Criação |
| `last_active` | TEXT | Última atividade |

Constraint: `UNIQUE INDEX (project_path, is_chief) WHERE is_chief = 1` — apenas um Chief por projeto.

### Tabela: `terminal_categories`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL UNIQUE | Nome da categoria |
| `description` | TEXT | Descrição |
| `display_order` | INTEGER | Ordem de exibição (ASC) |
| `color` | TEXT | Cor visual |

### Tabela: `autopilot_log`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER PK | |
| `terminal_id` | INTEGER FK → terminals | CASCADE DELETE |
| `project_id` | INTEGER FK → projects | CASCADE DELETE |
| `window_title` | TEXT | Título do terminal |
| `agent_name` | TEXT | Agente envolvido |
| `action` | TEXT | `permission_approve` \| `idle_skip` \| `error` |
| `detail` | TEXT | Detalhe da ação |
| `created_at` | TEXT | Timestamp |

### Tabela: `ganga_log`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER PK | |
| `terminal_id` | INTEGER FK → terminals | SET NULL |
| `project_id` | INTEGER FK → projects | CASCADE DELETE |
| `prompt_text` | TEXT NOT NULL | Texto do prompt recebido |
| `response` | TEXT NOT NULL | Resposta gerada |
| `classification` | TEXT | `safe` \| `blocked` \| `ambiguous` |
| `action` | TEXT | `auto-responded` \| `skipped` \| `blocked` |
| `created_at` | TEXT | Timestamp |

---

## 4. Configurações Globais do Sistema

Todas as configurações globais ficam em uma única linha na tabela `company_config` (id = 1, sempre presente por seed).

```typescript
interface CompanyConfig {
  id: 1;
  name: string;                    // Nome da empresa/organização
  logo_path: string | null;        // Caminho para o logo
  theme: ThemeName;                // Tema visual
  ambient_music: 0 | 1;           // Música ambiente ativa
  idle_timeout_lounge: number;     // Segundos até entrar no Lounge (60–1800, padrão 300)
  idle_timeout_break: number;      // Segundos até entrar em Break (300–3600, padrão 300)
  event_retention_days: number;    // Dias de retenção de eventos (padrão 30)
  ganga_enabled: 0 | 1;           // Ganga Ativo habilitado
  ganga_scope: GangaScope;         // Escopo do Ganga
  updated_at: string;              // Última atualização
}
```

### Temas disponíveis

`ThemeName`: `'espacial'` | `'moderno'` | `'oldschool'` | `'cyberpunk'`

### Escopo do Ganga

`GangaScope`: `'safe-only'` | `'safe-and-ambiguous'`

- `safe-only` — Ganga responde automaticamente apenas prompts classificados como seguros
- `safe-and-ambiguous` — Ganga também responde prompts ambíguos

### API REST

```
GET /api/company-config    → retorna configuração atual
PUT /api/company-config    → atualiza campos (body parcial)
GET /api/ganga             → retorna { enabled, scope, logs[50], stats }
```

**Validações do PUT:**

| Campo | Restrição |
|-------|-----------|
| `theme` | Deve ser um dos 4 temas válidos |
| `idle_timeout_lounge` | Inteiro entre 60 e 1800 |
| `idle_timeout_break` | Inteiro entre 300 e 3600 |
| `ganga_enabled` | `0` ou `1` |
| `ganga_scope` | `'safe-only'` ou `'safe-and-ambiguous'` |

**Efeitos colaterais ao atualizar:**
- Mudança de `theme` → broadcast WebSocket `theme:change` para todos os clientes
- Mudança de `ganga_enabled` → broadcast WebSocket `ganga:toggle`

---

## 5. Fluxo de Configuração

### 5.1 Novo Projeto

Projetos não são criados manualmente pela UI — são detectados automaticamente quando um evento chega do Claude Code CLI via webhook.

**Fluxo:**

```
Claude Code (hook) → POST /api/events → upsertProject(path, name)
                                       → upsertAgent(projectId, name)
                                       → upsertTerminal(projectId, pid)
                                       → createSession(...)
                                       → insertEvent(...)
```

A função `upsertProject` usa `INSERT OR CONFLICT(path) DO UPDATE`, garantindo que projetos existentes apenas tenham `last_active` atualizado, sem duplicação.

**Resultado:** Um projeto aparece na lista automaticamente após o primeiro evento.

### 5.2 Novo Agente (monitor passivo)

Agentes no monitor passivo (`agents`) também são criados via eventos:

```
Evento recebido com agent_name → upsertAgent(projectId, agentName, opts)
                                → updateAgentStatus(projectId, name, status, tool)
```

Campos editáveis manualmente pela API:
- `display_name` — nome de exibição personalizado
- `role` — papel/função
- `team` — time

```
PATCH /api/agents  →  { id: N, role: "Backend Lead", team: "Core" }
```

### 5.3 Novo Terminal na Sala de Comando

Terminais na Sala de Comando são criados explicitamente pelo usuário:

```
POST /api/command-room/spawn
Body: {
  agentName: "@dev",          // obrigatório
  agentDisplayName: "Dex",   // opcional
  projectPath: "/path/to/project",  // obrigatório (deve existir e ser diretório)
  cols: 220,                  // opcional (1–500)
  rows: 50,                   // opcional (1–500)
  initialPrompt: "...",       // texto enviado ao terminal no spawn
  aiox_agent: "@dev",         // agente AIOX a ativar
  category_id: "uuid",        // categoria (opcional)
  description: "...",         // descrição (opcional)
  is_chief: false             // se é o terminal Chief do projeto
}
```

**Fluxo interno:**
1. `ProcessManager.spawn()` cria processo PTY
2. `insertTerminal()` persiste no banco (`command_room_terminals`)
3. Se `is_chief = true`, qualquer Chief anterior do mesmo projeto perde o status
4. Retorna `{ id, agentName, pid, status, wsUrl }` — WebSocket disponível em `/pty?id={id}`

**Limite de processos:** Definido por `MAX_PROCESSES` em `src/server/command-room/types.ts`. Ao atingir o limite, retorna HTTP 503.

### 5.4 Nova Categoria

```
POST /api/command-room/categories
Body: { name: "Frontend", description: "...", color: "#34d399" }
```

- `id` é gerado como UUID pelo servidor
- `name` deve ser único (retorna 409 em conflito)
- `display_order` padrão = 0

Para reordenar categorias:

```
PATCH /api/command-room/categories
Body: { id: "uuid", display_order: 2 }
```

### 5.5 Configuração Global Inicial

A tabela `company_config` é populada automaticamente com valores padrão no `initSchema`:

```
name = 'Minha Empresa'
theme = 'moderno'
ambient_music = 0
idle_timeout_lounge = 300
idle_timeout_break = 300
event_retention_days = 30
ganga_enabled = 0
ganga_scope = 'safe-only'
```

Para personalizar:

```
PUT /api/company-config
Body: {
  "name": "Synkra",
  "theme": "espacial",
  "idle_timeout_lounge": 600,
  "ganga_enabled": 1,
  "ganga_scope": "safe-and-ambiguous"
}
```

---

## Referências de Código

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/lib/db.ts` | Singleton do banco SQLite; singleton global para hot-reload em dev |
| `src/lib/schema.ts` | DDL de todas as tabelas; migrations inline com try/catch |
| `src/lib/queries.ts` | Todas as queries de leitura e escrita (projects, agents, terminals, sessions, events, config) |
| `src/lib/types.ts` | Interfaces TypeScript para todas as entidades |
| `src/lib/command-room-repository.ts` | Queries específicas da Sala de Comando (terminals PTY, categories) |
| `src/app/api/projects/` | API REST de projetos |
| `src/app/api/agents/route.ts` | API REST de agentes |
| `src/app/api/company-config/route.ts` | API REST de configuração global |
| `src/app/api/command-room/categories/route.ts` | CRUD de categorias |
| `src/app/api/command-room/spawn/route.ts` | Criação de terminais PTY |
| `src/app/api/command-room/agents/route.ts` | Catálogo de agentes por projeto |
