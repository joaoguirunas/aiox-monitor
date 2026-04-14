# JOB-011 — Viabilidade Backend — Redesign Sala de Comando

**Autor:** Han Solo (dev-beta) — themaestridev
**Escopo:** Análise técnica, SEM implementação.

---

## Contexto atual (pra calibrar recomendações)

O backend já tem a maior parte da infraestrutura que esse redesign precisa:

- **WS nativo** (`ws` 8.18.0) com dois upgrade paths — `/ws` (broadcast) e `/pty` (streaming PTY por terminal). `server.ts:52-77`
- **ProcessManager singleton** com EventEmitter, scrollback 5000 linhas, reconnect 30s. `src/server/command-room/process-manager.ts:29-480`
- **DatabaseSync** (node:sqlite nativo, NÃO better-sqlite3) com WAL + checkpoint 5min. `src/lib/db.ts:6`, `src/lib/schema.ts:5`
- **ChatMessageStore + WsBroadcaster** já fazem pub/sub in-memory.
- **Maestri**: só leitura via `execSync('maestri list')`. Nenhum `maestri ask` ainda. `maestri-resolver.ts:20-54`
- Custom `server.ts` (Node runtime, NÃO edge). Sem auth.

Isso muda tudo: não é "o que escolher", é "o que reaproveitar".

---

## 1. Stream realtime: SSE vs socket.io vs WS atual

**Recomendação: manter WS. Não mexer.**

- **SSE via ReadableStream**: Funciona no App Router, mas é unidirecional (server→client). Vocês precisam de input do usuário (teclas, resize, /ask), então teriam que manter um canal POST paralelo. Pior ergonomia. Também sofre com buffering de proxies e limite de 6 conexões HTTP/1.1 por origem.
- **socket.io**: Requer server separado, reconnection magic que conflita com custom `server.ts`, e adiciona ~40KB ao client. Regressão frente ao que já existe.
- **ws nativo (atual)**: Bidirecional, binary frames, já integrado ao `ProcessManager.emit('process-event')`. Edge runtime está fora de cogitação porque `node-pty` é nativo — mas isso já está decidido.

**Ação:** estender o `/ws` broadcast existente com tipos de mensagem novos (`chat:message`, `node:connected`, `ask:stream`). Sem nova stack.

**Ressalva SSE:** se quiser expor mensagens de chat para clientes read-only (ex: dashboard externo), SSE faz sentido aí. Mas não como canal primário do canvas.

---

## 2. Orquestração A→B: injeção de contexto vs prompt enriquecido

**Recomendação: prompt enriquecido via `maestri ask`. Sem estado compartilhado entre agentes.**

- **Injetar contexto de A na próxima invocação de B (state server-side)**: exige rastrear "última resposta de A", invalidação, TTL, e cria acoplamento invisível. Race condition clássica: A ainda respondendo quando B é chamado.
- **Enriquecer prompt e disparar `maestri ask B`**: stateless, idempotente, auditável. O prompt carrega tudo. B não sabe que existe A — só vê contexto.

**Formato sugerido:**
```
maestri ask {B} "{conexão A→B declarada}

Contexto de A:
{última_mensagem_de_A ou resumo}

{pergunta_do_usuário}"
```

**Confiabilidade vem de três coisas:**
1. Snapshot do contexto no momento do `/ask` (não live reference).
2. Limite de profundidade de cascata (ver risco §7).
3. Registrar no SQLite antes de spawnar: `(message_id, from_node, to_node, trigger)` — idempotência por `message_id`.

---

## 3. Maestri CLI: subprocess vs IPC vs HTTP

**Recomendação: `child_process.spawn` com stream. Ou melhor: reusar `node-pty`.**

- **HTTP**: Maestri não expõe HTTP. Inviável sem PR upstream.
- **IPC**: Maestri é CLI standalone sem protocolo IPC. Inviável.
- **`child_process.spawn`**: Stream de stdout/stderr linha-a-linha. Simples, testado, sem deps.
- **`node-pty` para `maestri ask`**: MELHOR OPÇÃO. Vocês já têm toda a infra de PTY com scrollback, reconnect, WS broadcast. Tratar "ask" como mais um processo no `ProcessManager` (com flag `transient: true` e cleanup agressivo pós-exit) reaproveita tudo.

**Diferença prática:** com `spawn` cru você escreve parser de output + buffer + broadcast. Com node-pty + ProcessManager você ganha isso de graça e o canvas renderiza o stream do `/ask` do mesmo jeito que renderiza um terminal normal — coerência conceitual.

**Cuidado:** `maestri ask` pode ser interativo (TTY detection). `node-pty` dá TTY real; `spawn` não. Mais uma razão para PTY.

---

## 4. Persistência: 100 msgs/min é bottleneck?

**Não. Nem perto.**

- node:sqlite `DatabaseSync` em WAL mode faz ~50k inserts/s em batch, ~5-10k/s em transações individuais sem fsync forçado. 100 msgs/min = 1.67/s. Folga de 3000x.
- Bottleneck real aparece em:
  - **Leituras concorrentes durante checkpoint** (5min atual) — mitigado por WAL.
  - **Large rows** (scrollback inteiro em coluna TEXT). Se mensagens carregam anexos/outputs de PTY, aí sim pode doer. Recomendo `messages` (texto curto) e `message_artifacts` (blob ou path) em tabelas separadas.
  - **Fan-out de reads** quando 20 terminais fazem `SELECT * WHERE conversation_id` simultâneo. Índice composto `(conversation_id, created_at)` resolve.

**Schema mínimo sugerido (só estrutura):**
```
conversations(id, created_at, root_node_id)
messages(id, conversation_id, node_id, role, content, created_at)
node_connections(from_node, to_node, conversation_id, created_at)
```

Não migre para Postgres por causa de 100 msgs/min. Migre se e quando multi-user remoto entrar em jogo.

---

## 5. Auth/session: preparar multi sem implementar

**Recomendação: single-user agora, mas com `user_id` em toda tabela nova desde o dia 1.**

- Adote `user_id TEXT NOT NULL DEFAULT 'local'` em `conversations`, `messages`, `node_connections`.
- Toda query filtra por `user_id`. Hoje é sempre `'local'`; amanhã vira `session.user.id`.
- WS upgrade já aceita query params — prever `?userId=` ignorado hoje, validado depois.
- NÃO adicione NextAuth/Clerk agora. Custo sem retorno. Mas a coluna é barata e evita migração dolorosa.

---

## 6. Eventos pra broadcast: EventEmitter vs Redis vs polling

**Recomendação: manter EventEmitter + WsBroadcaster. Redis só se e quando for multi-processo.**

- Polling está descartado — vocês já têm push.
- Redis pub/sub só ganha valor quando:
  - Rodar múltiplas instâncias do server (horizontal scale).
  - PM2 cluster mode com workers.
  - Hoje: single process via `server.ts`. Redis = complexidade zero retorno.
- EventEmitter atual tem um risco: leak se listeners não forem removidos no disconnect. Vale auditar `removeListener` no path de WS close. (Não precisa mexer agora, mas fica no radar.)

---

## 7. Riscos — os de verdade

| Risco | Mitigação |
|---|---|
| **Ciclo A→B→A** | Depth limit por cadeia (`max_depth: 3`) + visited set por `conversation_id`. Dispara erro no 4º hop. Sem isso, um loop mata o box. |
| **Race: /ask enquanto A ainda streama** | Lock per-node: enquanto `node.status === 'streaming'`, enfileirar ou rejeitar novos `/ask` com 409. Stateless no protocolo, não no runtime. |
| **Backpressure WS** | Clientes lentos acumulam buffer em `ws`. `ws` não aplica backpressure por padrão. Precisa: (a) cap de `ws._socket.bufferedAmount` (ex: 1MB → drop + reconnect), ou (b) coalescing de PTY frames (agrupar <10ms). |
| **ProcessManager 500 processes limit** | Se cada `/ask` spawna PTY transient, limite estoura rápido. Precisa GC agressivo (`transient: true` → purge imediato pós-exit, não 30s). |
| **DatabaseSync lock em writes concorrentes** | WAL permite 1 writer. Com EventEmitter síncrono, tudo bem. Se introduzir `setImmediate` no handler, cuidado com batching. |
| **Maestri process zombies** | `child.kill()` em disconnect do cliente. Senão `maestri ask` roda forever com ninguém ouvindo. |

---

## TL;DR — o que fazer (e não fazer)

**FAZER:**
- Estender `/ws` + `WsBroadcaster` com novos tipos de evento.
- Tratar `maestri ask` como PTY transient no `ProcessManager` existente.
- Schema novo `conversations` / `messages` / `node_connections` com `user_id` desde o dia 1.
- Depth limit de cascata + visited set por conversation.
- Lock per-node durante streaming.
- Cap de `bufferedAmount` no WS + coalescing de frames.

**NÃO FAZER:**
- SSE, socket.io, Redis, Postgres, NextAuth. Nada disso resolve problema real hoje.
- Estado compartilhado entre agentes. Prompt enriquecido é o caminho.
- Migrar de node:sqlite. Está ótimo.

Reaproveita 80% do que já existe. O resto é schema + protocolo de mensagens + limites defensivos.

— Han Solo, never tell me the odds
