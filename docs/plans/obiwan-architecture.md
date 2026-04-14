# JOB-009 — ADR: Redesign Sala de Comando (Canvas de Chats Conectados)

**Autor:** Obi-Wan (Architect — themaestridev)
**Escopo:** APENAS design arquitetural. Não implementa.
**Contexto lido:** src/app/command-room/page.tsx, src/components/command-room/{canvas/*, ChatView.tsx, TerminalPanel.tsx}, src/app/api/command-room/[id]/{route.ts, messages/}, src/server/command-room/{process-manager, chat-store, chat-types}, src/lib/schema.ts, src/app/api/events/route.ts. Não existe src/lib/maestri — integração Maestri hoje = PTY spawnando Claude CLI + ChatMessageStore parseando output.

---

## 1. Modelo de Dados

### Estado atual
- command_room_terminals (id TEXT, agent_name, project_path, pty_status, category_id, is_chief, linked_terminal_ids TEXT JSON)
- terminal_categories
- ChatMessageStore (in-memory, não persiste) com roles chief|agent

### Proposta — SQLite, mantendo WAL

```sql
CREATE TABLE agent_cards (
  id                TEXT PRIMARY KEY,
  kind              TEXT NOT NULL DEFAULT 'chat'
                    CHECK(kind IN ('chat','terminal','hybrid')),
  display_name      TEXT NOT NULL,
  aiox_agent        TEXT,
  project_path      TEXT,
  pty_terminal_id   TEXT REFERENCES command_room_terminals(id) ON DELETE SET NULL,
  category_id       TEXT REFERENCES terminal_categories(id) ON DELETE SET NULL,
  is_chief          INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'idle'
                    CHECK(status IN ('idle','thinking','speaking','waiting','offline','error')),
  system_prompt     TEXT,
  model             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_active       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_agent_cards_unique_chief
  ON agent_cards(project_path, is_chief) WHERE is_chief = 1;

CREATE TABLE connections (
  id            TEXT PRIMARY KEY,
  source_id     TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
  target_id     TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
  directed      INTEGER NOT NULL DEFAULT 1,
  kind          TEXT NOT NULL DEFAULT 'chat'
                CHECK(kind IN ('chat','broadcast','supervise','context-share')),
  label         TEXT,
  metadata      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, kind)
);
CREATE INDEX idx_conn_source ON connections(source_id);
CREATE INDEX idx_conn_target ON connections(target_id);

CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'peer'
              CHECK(kind IN ('peer','group','broadcast','chief-thread')),
  title       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_message_at TEXT
);

CREATE TABLE conversation_participants (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_card_id   TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member'
                  CHECK(role IN ('member','owner','observer')),
  joined_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(conversation_id, agent_card_id)
);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT REFERENCES agent_cards(id) ON DELETE SET NULL,
  sender_role     TEXT NOT NULL
                  CHECK(sender_role IN ('chief','agent','system','tool')),
  content         TEXT NOT NULL,
  artifacts       TEXT,
  in_reply_to     TEXT REFERENCES messages(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_msg_conv_created ON messages(conversation_id, created_at);

CREATE TABLE canvas_layouts (
  project_path   TEXT PRIMARY KEY,
  viewport       TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
  node_positions TEXT NOT NULL DEFAULT '{}',
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Delta vs atual
| Hoje | Proposta |
|---|---|
| command_room_terminals mistura card-de-canvas com PTY-process | Separa em agent_cards (card) × command_room_terminals (PTY backing opcional) |
| linked_terminal_ids JSON embutido | connections tabela 1ª classe, direcionada, com kind |
| ChatMessageStore em memória (perdido em restart) | conversations + messages persistidos |
| Posição calculada no cliente (useCanvasLayout) | canvas_layouts.node_positions persistido |

Migração: agent_cards seed 1-pra-1 a partir de command_room_terminals existentes; linked_terminal_ids vira N rows em connections (directed=0, kind='chat').

---

## 2. Event Flow — /ask de A conectado a B

Regra de ouro: o canvas é um grafo de autorização + contexto, não roteador mágico. B só "sabe falar com A" se a mensagem for explicitamente endereçada OU se B observa a conversation.

```
Cliente (ChatView de A)
  POST /api/conversations/{conv_AB}/messages
  { sender_id: A, content: "/ask @B x", addressed_to: [B] }
  ▼
API route
  ├─ persiste message (sender=A, conv=A↔B)
  ├─ resolve connection A→B (deve existir, kind='chat') — senão 403
  ├─ enfileira job para B (MessageDispatcher)
  └─ emite realtime: message.new + conversation.updated

MessageDispatcher (server, in-process)
  ├─ monta contexto p/ B = últimas N msgs conv_AB + system_prompt de B
  ├─ se B.kind === 'terminal'|'hybrid'+promovido:
  │     → pty.write(renderTurnForClaude(context, "x"))
  ├─ se B.kind === 'chat':
  │     → chamada direta ao modelo (sem PTY)
  └─ B.status = 'thinking' → realtime agent.status
```

**Explicit message passing vs prompt injection:** use explicit message passing como fronteira (DB = verdade) e prompt injection apenas como transporte para agentes PTY-backed. Parser extrai output do PTY e re-persiste via messages. DB sempre é fonte única — evita o problema "B esqueceu contexto".

**Autorização:** sem connection(A→B, kind='chat') → 403. Chief tem conexão implícita com todos.

---

## 3. Integração Maestri CLI / Modo Híbrido

Recomendação: modo híbrido explícito via agent_cards.kind

| kind | PTY? | Raciocínio |
|---|---|---|
| chat | não | API direta ao modelo; rápido, barato, não toca fs |
| terminal | sim | Maestri/Claude CLI no PTY; tool-use real |
| hybrid | lazy | Nasce chat; é promovido a PTY sob demanda |

- Chat-only resolve 90% das interações do Chief (brainstorm, planning, routing).
- PTY-backed é inevitável para Dev/QA/DevOps (fs, tools).
- Promoção lazy preserva contexto: histórico `messages` vira `initialPrompt` injetado no PTY.

ProcessManager já suporta — basta desacoplar: card existe sem PTY; pty_terminal_id é opcional.

---

## 4. Camada Realtime — Contratos

**Transporte:** SSE para canal principal. WS só no existente pty-websocket-server.ts (bytes PTY, alta freq, bidirecional). SSE reconecta com Last-Event-ID, atravessa proxies bem, tráfego de canvas é baixo/médio.

**Canais:**
- /api/realtime?scope=canvas&project=/abs/path — tudo do canvas daquele projeto
- /api/realtime?scope=conversation&id={convId} — firehose de uma conversa
- /api/realtime?scope=agent&id={cardId} — status fino

**Eventos (versioned):**
```ts
type RealtimeEvent =
  | { type:'agent.status';         v:1; cardId:string; status:AgentStatus; at:string }
  | { type:'agent.added';          v:1; card:AgentCard }
  | { type:'agent.removed';        v:1; cardId:string }
  | { type:'connection.added';     v:1; connection:Connection }
  | { type:'connection.removed';   v:1; id:string }
  | { type:'conversation.updated'; v:1; conversationId:string; lastMessageAt:string }
  | { type:'message.new';          v:1; conversationId:string; message:Message }
  | { type:'layout.patch';         v:1; patches:Array<{cardId,x,y}> }
  | { type:'heartbeat';            v:1; at:string };
```
Heartbeat a cada 25s. Cada evento tem `seq` monotônico por canal.

---

## 5. APIs — Novas e Modificadas

| Método | Rota | Propósito |
|---|---|---|
| POST | /api/agents | Criar agent_card |
| GET | /api/agents?project=… | Listar cards |
| PATCH | /api/agents/:id | Rename, change kind, promote to PTY |
| DELETE | /api/agents/:id | Remove card |
| POST | /api/connections | Criar aresta |
| DELETE | /api/connections/:id | Remover aresta |
| GET | /api/connections?project=… | Listar arestas |
| POST | /api/conversations | Criar conversa |
| GET | /api/conversations/:id/messages | Histórico paginado |
| POST | /api/conversations/:id/messages | Envia msg (dispatcher + realtime) |
| GET | /api/realtime?scope=… | SSE stream |
| PATCH | /api/canvas/layout | Salvar viewport/positions (debounced) |

**Depreciar:**
- PATCH /api/command-room/[id] com linked_terminal_ids → traduz para /api/connections
- POST /api/command-room/[id] → fica só como transporte PTY bruto; mensagens estruturadas vão por /api/conversations/:id/messages

---

## 6. Módulos Frontend

```
src/components/command-room/canvas/
├── CanvasView.tsx          → orquestra ReactFlow; consome store
├── nodes/
│   ├── AgentChatNode.tsx   → card com mini-chat inline (kind=chat)
│   ├── TerminalNode.tsx    → modo PTY (existe; kind=terminal)
│   └── NodeHeader.tsx      → comum: avatar, status, menu
├── edges/
│   └── ConnectionLine.tsx  → custom edge com label/kind/remoção
├── palette/
│   └── CommandPalette.tsx  → ⌘K: criar agente, conectar, /ask @X
├── realtime/
│   ├── RealtimeClient.ts   → EventSource wrapper; reconnect + Last-Event-ID
│   └── useRealtime.ts      → hook popula Zustand/Jotai store
├── store/
│   └── canvasStore.ts      → estado normalizado (agents, connections, conversations, messages)
└── useCanvasLayout.ts      → posicionamento (existe; refatorar p/ ler layout persistido)
```

Regra de dependência: CanvasView não conhece realtime, consome store. RealtimeClient só escreve no store. Troca SSE↔WS sem tocar UI.

---

## 7. Riscos e Trade-offs

| Risco | Impacto | Mitigação |
|---|---|---|
| Estado duplicado (PTY scrollback + messages) | Médio | Parser extrai agent messages do PTY e persiste; scrollback é raw view opcional |
| Custo de modelo em chat-only | Alto se agentes virarem chatterbots | Rate-limit por conversa; indicador de tokens; Chief aprova broadcasts |
| SSE atrás de proxy Next | Médio — conexões caem | Heartbeat 25s + reconnect Last-Event-ID |
| Promoção chat→PTY com contexto grande | Médio | Sumarizar histórico antes de injetar; full em DB |
| Autorização implícita via connection | Alto se aresta indevida | UI sempre mostra arestas; audit inclui connection_id |
| Migração linked_terminal_ids | Baixo | Script idempotente; coexistência 1-2 releases com leitura dupla |
| React Flow c/ N>50 nodes | Médio | onlyRenderVisibleElements; colapsar por category_id |
| Ordering SSE | Médio | seq monotônico por canal |

### Decisões-chave a tomar
1. **Direcionadas vs não-direcionadas por default?** → Recomendo direcionadas (broadcast é kind separado).
2. **Conversation por connection vs ad-hoc?** → Recomendo auto-cria ao conectar, permite extras (grupos).
3. **Persistir scrollback PTY no DB?** → Não. Só messages estruturadas persistem.
4. **Chief como card ou overlay?** → Card (is_chief=1); overlay é feature UX.

---

## Stories derivadas (se aprovada)

- 9.1 Schema migration (agent_cards, connections, conversations, messages, canvas_layouts)
- 9.2 API /api/agents + /api/connections (CRUD) com tradução dos legados
- 9.3 API /api/conversations/:id/messages + dispatcher
- 9.4 SSE /api/realtime + RealtimeClient
- 9.5 AgentChatNode (chat-only) + store normalizado
- 9.6 Promoção chat→PTY (hybrid)
- 9.7 CanvasLayout persistente + CommandPalette

— Obi-Wan, the high ground is structure 🏛️⭐
