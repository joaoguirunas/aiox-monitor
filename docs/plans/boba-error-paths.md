# Boba Fett Error Paths Catalog — Epic 9 / Story 9.9

> **Autor:** Boba Fett (Dev Delta — Integration & Hardening)  
> **Story:** 9.9 — Guard-rails: depth limit, lock per-node, WS backpressure, purge agressivo  
> **Dependências:** 9.3 (AgentBus + MessageDispatcher), 9.4 (protocolo WS estendido)  
> **Consumidor direto:** Han Solo (implementa 9.9) + Mace Windu (valida QA)  
> **Referências:** SALA-DE-COMANDO-v2-MASTER-PLAN.md §3.2b, §7.3, §9

---

## Índice

1. [EP-01: Ciclo A→B→A (loop de agentes)](#ep-01-ciclo-a--b--a)
2. [EP-02: Race `/ask` enquanto agente streama](#ep-02-race-ask-enquanto-agente-streama)
3. [EP-03: PTY zumbi em disconnect](#ep-03-pty-zumbi-em-disconnect)
4. [EP-04: Limite 500 PTYs estourado](#ep-04-limite-500-ptys-estourado)
5. [EP-05: WS backpressure / buffer overflow](#ep-05-ws-backpressure--buffer-overflow)
6. [EP-06: DatabaseSync lock em WAL](#ep-06-databasesync-lock-em-wal)
7. [EP-07: Conexão adicionada/removida durante turn ativo](#ep-07-conexão-adicionadaremovida-durante-turn-ativo)
8. [EP-08: Depth-guard false positives em broadcasts do Chief](#ep-08-depth-guard-false-positives-em-broadcasts-do-chief)

---

## EP-01: Ciclo A→B→A

### Descrição
Agente A instrui B via `POST /api/conversations/:id/messages`. B, ao responder, inclui `/ask @A` no output. A recebe, inclui `/ask @B` na resposta. Loop infinito de mensagens, estouro de contexto, custo de modelo descontrolado.

### Gatilho
- Dois agentes com arestas bidirecionais, ambos com instrução de sistema que inclui "responda ao remetente"
- Prompt mal formulado que cria echo-loop
- Bug em `stdout-parser` que re-emite `/ask` já processado

### Sintoma
- `messages` crescendo sem parar numa mesma `conversation_id`
- CPU do `MessageDispatcher` em 100%
- WS spammando `message.new` em loop
- Custo de API disparando

### Detecção (onde colocar o código)
```typescript
// src/server/agent-bus/depth-guard.ts
interface DepthGuardState {
  visited: Set<string>;   // agent_card.id visitados nesta cadeia
  depth: number;          // hops acumulados
  rootConversationId: string;
}

// Chave de lookup: conversation_id → DepthGuardState
// Limpar estado quando depth-guard expira (TTL = 60s após último hop)
```

**Regra de detecção:**
1. Cada `POST /api/conversations/:id/messages` que vem de agente (não de usuário humano) carrega `X-Agent-Origin: <agent_card_id>` no header interno
2. `depth-guard` lê `visited` da conversa
3. Se `agent_card_id ∈ visited` → ciclo detectado → **retornar 409 imediatamente**
4. Se `depth >= 3` → profundidade máxima → **retornar 409**
5. Caso contrário: adicionar ao `visited`, incrementar `depth`, prosseguir

### Mitigação
```
4º hop (ou ciclo) → HTTP 409 Conflict
Body: { error: 'DEPTH_LIMIT', depth: 4, max: 3, cycle: ['a-uuid', 'b-uuid', 'a-uuid'] }
```

**O que fazer com o 409:**
- `MessageDispatcher` loga warning com `conversation_id`, `depth`, `visited[]`
- Persiste mensagem de sistema na conversa: `"[guard-rails] Ciclo detectado. Cadeia encerrada."`
- Broadcast WS: `{ type: 'agent.guard_blocked', reason: 'cycle_detected', conversation_id }`
- **NÃO** propagar o erro de volta ao agente remetente (evita retry storm)
- `depth-guard` estado limpo após TTL de 60s (permite nova conversa legítima)

**Visited set por `conversation_id`, não global:** conversas diferentes entre A e B são independentes.

### Teste de Regressão
```typescript
// tests/agent-bus/depth-guard.test.ts
it('bloqueia no 4º hop (A→B→A→B)', async () => {
  // setup: A e B com conexões bidirecionais
  // A envia para B (depth=1)
  // B responde para A (depth=2)
  // A responde para B (depth=3, último permitido)
  // B tenta responder para A: expect(status).toBe(409)
  // expect(body.error).toBe('DEPTH_LIMIT')
});

it('bloqueia ciclo imediato A→B→A mesmo com depth=2', async () => {
  // A→B (depth=1), B→A (depth=2): A está em visited → 409
  // Garante que visited check precede depth check
});

it('reseta após TTL de 60s, conversa nova não é bloqueada', async () => {
  // simular TTL expirado, nova troca A→B deve passar
});

it('Chief broadcast NÃO aciona depth-guard para respostas dos filhos', async () => {
  // ver EP-08
});
```

---

## EP-02: Race `/ask` enquanto agente streama

### Descrição
Agente A está no meio de um stream SSE (status=`thinking` ou `speaking`). Um segundo trigger chega para A (outro agente B, ou o usuário, ou um `/broadcast`). Se processado em paralelo: contexto de A fica corrompido, dois streams escrevem na mesma `conversation_id`, mensagens fora de ordem no DB.

### Gatilho
- Usuário clica "Enviar" duas vezes rápido no card de A
- B despacha para A enquanto A ainda processa resposta anterior de C
- `/broadcast` do Chief chega durante turn ativo de A
- Reconexão WS que re-aciona buffered messages

### Sintoma
- Mensagens duplicadas ou intercaladas na UI do card
- `seq` numbers fora de ordem no WS
- `agent_cards.status` oscilando entre `thinking` e `idle` sem completar
- Erro de constraint UNIQUE no SQLite se `message_id` colidir

### Detecção
```typescript
// src/server/agent-bus/dispatcher.ts
// Lock per-card em memória (não precisa ser persistido, é runtime)
const cardLocks = new Map<string, Promise<void>>();  // card_id → promise do turn ativo

async function acquireCardLock(cardId: string): Promise<() => void> {
  // Se já existe lock: enfileirar ou rejeitar dependendo da política
  // Retorna função de release
}
```

**Verificar antes de despachar:**
```typescript
const currentStatus = await db.prepare(
  'SELECT status FROM agent_cards WHERE id = ?'
).get(cardId);

if (currentStatus === 'thinking' || currentStatus === 'speaking') {
  // DECISÃO: enfileirar ou rejeitar?
}
```

### Mitigação

**Política padrão (recomendada): rejeitar com 409**
```
HTTP 409 Conflict
Body: { error: 'AGENT_BUSY', agent_id: 'uuid', status: 'thinking', retry_after_ms: 2000 }
```

**Política alternativa para broadcasts do Chief: enfileirar (max queue=5)**
```typescript
// Fila por card, drena após turn completar
// Se queue.length > 5: drop mais antigo + log warning
```

**Qual política quando:**

| Origem | Política |
|--------|----------|
| Usuário humano clicando | 409 (UI desabilita botão quando status≠idle) |
| Outro agente via `/ask` | 409 (remetente recebe erro, não retenta automaticamente) |
| Chief via `/broadcast` | Enfileirar (max=5, TTL=30s na fila) |
| Reconexão WS com buffer | Drop mensagens antigas (timestamp > 5s) |

**Estado `status` como fonte de verdade:**
- `idle` → aceita nova mensagem
- `thinking` → lock ativo, rejeita/enfileira
- `speaking` → lock ativo, rejeita/enfileira
- `waiting` → aceita (agente aguardando input explicitamente)
- `error` → aceita (permite recovery)
- `offline` → rejeita com 503

### Teste de Regressão
```typescript
it('rejeita segunda mensagem com 409 quando agent status=thinking', async () => {
  // iniciar turn longo em agente A
  // enviar segunda mensagem antes de completar
  // expect(status).toBe(409)
  // expect(body.error).toBe('AGENT_BUSY')
});

it('broadcast do Chief é enfileirado e processado após turn ativo', async () => {
  // A em thinking, Chief faz broadcast
  // verificar que broadcast entra na fila
  // após A completar (mock), broadcast é processado
  // fila limpa
});

it('fila drena em ordem FIFO após turn completar', async () => {
  // enfileirar 3 broadcasts, verificar que saem em ordem de chegada
});

it('fila com >5 itens descarta o mais antigo e loga warning', async () => {
  // enfileirar 6 mensagens, verificar que 1ª foi dropada
});
```

---

## EP-03: PTY zumbi em disconnect

### Descrição
Cliente WS desconecta (aba fechada, rede caiu, reload). O processo `node-pty` continua rodando em background, consumindo memória e CPU. Se o Claude Code dentro do PTY estiver aguardando input, o processo fica preso indefinidamente.

### Gatilho
- Usuário fecha aba do browser
- Perda de conexão de rede (timeout WS)
- Crash do frontend
- Reload do Next.js dev server

### Sintoma
- `ps aux | grep claude` mostra processos órfãos acumulando
- `ProcessManager.activeProcesses` crescendo sem parar
- RAM consumida por processos Claude Code idle
- `maestri list` mostrando terminais que não respondem

### Detecção
```typescript
// src/server/process-manager.ts — já existe, estender

// 1. No evento WS 'close': matar PTY imediatamente (já mencionado no plan)
wss.on('connection', (ws, req) => {
  const terminalId = extractTerminalId(req);
  ws.on('close', () => {
    processManager.killProcess(terminalId);  // child.kill()
  });
});

// 2. Reaper por inatividade (NOVO em 9.9)
// Intervalo: a cada 30s, verificar processos com lastActivity > 5min
setInterval(() => {
  processManager.reapStaleProcesses({
    maxIdleMs: 5 * 60 * 1000,  // 5 min sem output nem input
    excludeKinds: ['chat'],     // chat não tem PTY, ignorar
  });
}, 30_000);
```

**Threshold de inatividade por kind:**

| Kind | Max idle antes do reap |
|------|----------------------|
| `terminal` (Claude Code) | 5 minutos |
| `transient` (maestri ask) | 60 segundos após completar |
| `hybrid` (promovido) | 10 minutos |

### Mitigação
```typescript
// ProcessManager.killProcess(id: string)
// Já existe — garantir que é chamado em TODOS os caminhos:

// Path 1: disconnect WS (client fechou)
ws.on('close', code => processManager.killProcess(id));
ws.on('error', err => processManager.killProcess(id));

// Path 2: reaper automático
// Path 3: card deletado via DELETE /api/agents/:id
// Path 4: projeto fechado (EP-07)
// Path 5: server shutdown (graceful + SIGTERM handler)

// Após kill:
// 1. UPDATE agent_cards SET status='offline', pty_terminal_id=NULL WHERE id=?
// 2. Broadcast WS: { type: 'agent.status', agent_id, status: 'offline' }
// 3. Remover de processManager.activeProcesses
```

**Transient PTYs (`maestri ask`):**
- Marcar `transient: true` no spawn
- Matar imediatamente quando stdout receber sinal de fim de turno (linha `\n✅` ou timeout de 30s)
- NÃO esperar WS disconnect para transients

### Teste de Regressão
```typescript
it('mata PTY imediatamente quando WS fecha', async () => {
  // spawn PTY, conectar WS, fechar WS
  // verificar que child.killed === true em <100ms
});

it('reaper remove PTY idle há >5min', async () => {
  // spawn PTY, simular inatividade de 5min (mock Date.now)
  // executar reaper
  // verificar que processo foi morto e status='offline' no DB
});

it('transient PTY mata em <30s após fim do turn', async () => {
  // spawn transient, simular output completo
  // verificar kill em <30s
});

it('reaper NÃO mata agentes chat (sem PTY)', async () => {
  // criar agent kind='chat', executar reaper
  // verificar que nenhuma operação de kill foi chamada
});

it('server shutdown mata todos os PTYs ativos', async () => {
  // spawn 3 PTYs, disparar SIGTERM handler
  // verificar que todos foram mortos em <2s
});
```

---

## EP-04: Limite 500 PTYs estourado

### Descrição
Sistemas Linux têm limite de PTYs simultâneos (geralmente 500 via `/proc/sys/kernel/pty/max`). Se todos os agentes forem do kind `terminal`, e o sistema criar muitos projetos/conversas, o limite é estourado. `node-pty` lança exceção, Claude Code falha no spawn.

### Gatilho
- Usuário cria muitos cards com kind=`terminal` sem deletar
- Vazamento do EP-03 (zumbis acumulados) + novos spawns
- Ambientes com limite de PTY menor (containers, CI)

### Sintoma
- `Error: spawn /dev/ptmx EMFILE` no log do ProcessManager
- Novos cards aparecem em status=`error` na UI
- `maestri list` para de mostrar novos agentes

### Detecção
```typescript
// Antes de spawnar PTY, verificar capacidade:
const PTY_HARD_LIMIT = 450;  // margem de 50 abaixo do max do SO

function canSpawnPTY(): boolean {
  return processManager.activeProcesses.size < PTY_HARD_LIMIT;
}

// Também: monitorar /proc/sys/kernel/pty/nr (unix) para count real
```

### Mitigação

**Camada 1 — Design (previne o problema):**
- `kind='chat'` é o default ao invocar agente
- PTY só é criado quando usuário explicitamente escolhe kind=`terminal` ou `hybrid` é promovido
- UI: badge de contagem `X/500 PTYs ativos` visível no header da Sala de Comando

**Camada 2 — Soft cap em código:**
```typescript
// dispatcher.ts / invoke-agent.ts
if (!canSpawnPTY()) {
  throw new AgentBusError('PTY_LIMIT_REACHED', {
    active: processManager.activeProcesses.size,
    limit: PTY_HARD_LIMIT,
    suggestion: 'Use kind=chat ou feche terminais inativos',
  });
}
// HTTP 503 para o cliente
```

**Camada 3 — Auto-purge de transients:**
- Transients são TTL=60s, reduzem pressão automaticamente
- Reaper (EP-03) remove idle, liberando slots

**Camada 4 — Degradação graciosa:**
- Se limite atingido e usuário insiste em terminal: UI mostra modal "Limite de terminais atingido. Fechar um terminal existente ou usar modo chat."
- Listar terminais idle mais antigos com botão "Fechar"

### Teste de Regressão
```typescript
it('rejeita spawn quando activeProcesses >= PTY_HARD_LIMIT', async () => {
  // mock processManager.activeProcesses.size = 450
  // tentar spawn de novo PTY
  // expect(error.code).toBe('PTY_LIMIT_REACHED')
});

it('kind=chat não consome slot de PTY', async () => {
  // criar 100 agentes kind=chat
  // verificar que processManager.activeProcesses.size === 0
});

it('transient liberado após TTL não conta para o limite', async () => {
  // spawn transient, aguardar TTL, verificar slot liberado
});
```

---

## EP-05: WS backpressure / buffer overflow

### Descrição
PTY produz output muito rápido (ex: Claude Code compilando, rodando tests, `find /`). O WebSocket não consegue drenar rápido o suficiente. `ws._socket.bufferedAmount` cresce indefinidamente. Se ultrapassar ~1MB, o processo Node.js pode OOM ou o cliente recebe mensagens corrompidas.

### Gatilho
- Claude Code rodando `npm install` ou `npm run build` dentro do PTY (muito output rápido)
- Múltiplos PTYs em paralelo todos transmitindo simultaneamente
- Rede lenta do cliente (throttled connection)
- Cliente em background tab (browser throttla WebSocket)

### Sintoma
- `ws.bufferedAmount` crescendo monotonicamente
- Latência UI aumentando (frames atrasados)
- `Error: write after end` no WS handler
- Mensagens chegando fora de ordem no frontend
- Browser reportando "WebSocket connection dropped"

### Detecção
```typescript
// src/server/pty-websocket-server.ts — estender handler existente

const WS_BUFFER_WARN  = 512 * 1024;   // 512 KB — começar a coalescing
const WS_BUFFER_HARD  = 1024 * 1024;  // 1 MB — drop + reconnect

// Verificar antes de cada write:
function sendWithBackpressure(ws: WebSocket, data: Buffer): void {
  if (ws.bufferedAmount > WS_BUFFER_HARD) {
    // Drop + força reconexão
    ws.close(1008, 'buffer_overflow');
    metrics.increment('ws.buffer_overflow');
    return;
  }

  if (ws.bufferedAmount > WS_BUFFER_WARN) {
    // Não enviar agora — agendar para próximo tick (coalescing)
    scheduleCoalesced(ws, data);
    return;
  }

  ws.send(data);
}
```

**Coalescing de frames PTY (<10ms):**
```typescript
// Agrupar chunks PTY que chegam em rajada em <10ms num único frame WS
const pendingChunks = new Map<WebSocket, Buffer[]>();
const COALESCE_WINDOW_MS = 10;

function scheduleCoalesced(ws: WebSocket, chunk: Buffer): void {
  if (!pendingChunks.has(ws)) {
    pendingChunks.set(ws, []);
    setTimeout(() => {
      const chunks = pendingChunks.get(ws) ?? [];
      pendingChunks.delete(ws);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(Buffer.concat(chunks));
      }
    }, COALESCE_WINDOW_MS);
  }
  pendingChunks.get(ws)!.push(chunk);
}
```

### Mitigação

**Drop + reconnect (hard limit):**
```typescript
ws.close(1008, 'buffer_overflow');
// Frontend recebe 'close' event com code 1008
// Frontend exibe toast: "Conexão perdida · reconectando..."
// Frontend inicia reconnect automático (backoff exponencial: 1s, 2s, 4s, max 30s)
// Ao reconectar: GET /api/conversations/:id/messages?limit=50 para recuperar histórico
```

**Throttle de PTY output:**
```typescript
// Opção nuclear: parar de ler do PTY quando WS buffer alto
// pty.pause() quando bufferedAmount > WS_BUFFER_WARN
// pty.resume() quando bufferedAmount < WS_BUFFER_WARN / 2
```

**Frontend: reconnect inteligente:**
```typescript
// packages/web/hooks/useAgentWebSocket.ts
// Ao receber close(1008): não mostrar "erro", mostrar "reconectando"
// Ao reconectar com sucesso: recarregar últimas N mensagens do DB (não do WS buffer)
```

### Teste de Regressão
```typescript
it('faz drop + fecha WS quando bufferedAmount > 1MB', async () => {
  // mock ws.bufferedAmount = 1.1MB
  // tentar enviar mensagem
  // expect(ws.close).toHaveBeenCalledWith(1008, 'buffer_overflow')
});

it('coalescing agrupa chunks em janela de 10ms', async () => {
  // enviar 50 chunks em <10ms
  // verificar que ws.send foi chamado apenas 1x (ou poucas vezes)
});

it('pausa PTY quando buffer alto, retoma quando drena', async () => {
  // mock bufferedAmount high → pty.pause called
  // mock bufferedAmount low → pty.resume called
});

it('frontend reconecta e recupera histórico após 1008', async () => {
  // E2E: simular buffer overflow, verificar toast + reconnect + mensagens restauradas
});
```

---

## EP-06: DatabaseSync lock em WAL

### Descrição
`node:sqlite` com WAL mode permite múltiplos leitores concorrentes mas **apenas 1 escritor por vez**. Se múltiplos handlers do AgentBus tentam escrever simultaneamente (streams de N agentes ao mesmo tempo), escritas conflitam. `DatabaseSync` não é thread-safe — é chamado no event loop, mas operações síncronas longas bloqueiam outras callbacks.

### Gatilho
- N agentes respondendo em paralelo (ex: Chief faz broadcast para 10 agentes, todos respondem simultâneamente)
- `setImmediate` callbacks de múltiplos streams SSE chegando no mesmo tick
- Migration sendo aplicada enquanto servidor responde a requests

### Sintoma
- `SQLITE_BUSY: database is locked` nos logs
- Mensagens dropadas silenciosamente se o erro não for tratado
- `INSERT INTO messages` falhando intermitentemente
- Test flakiness por race condition

### Detecção
```typescript
// O risco real não é thread (Node.js é single-threaded), é:
// 1. Operações síncronas MUITO longas bloqueando o event loop
// 2. Tentativas de write dentro de outro write (via callbacks aninhadas incorretas)
// 3. WAL checkpoint bloqueando temporariamente

// Detectar: wrapper de timing em volta de todas as writes
function timedWrite<T>(label: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  if (elapsed > 50) {
    logger.warn(`[DB] Slow write: ${label} took ${elapsed.toFixed(1)}ms`);
  }
  return result;
}
```

### Mitigação

**Regra fundamental: 1 writer, serializado:**
```typescript
// src/server/database/write-queue.ts
// Todas as writes passam por uma fila serializada
class WriteQueue {
  private queue: Array<() => void> = [];
  private running = false;

  enqueue(fn: () => void): void {
    this.queue.push(fn);
    this.drain();
  }

  private drain(): void {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    const task = this.queue.shift()!;
    // Executar de forma síncrona (DatabaseSync), mas no próximo tick
    setImmediate(() => {
      try { task(); } finally {
        this.running = false;
        this.drain();
      }
    });
  }
}
```

**Padrão correto para chat.chunk (alta frequência):**
```typescript
// NÃO: fazer INSERT para cada chunk individual (caro)
// SIM: acumular deltas em memória, flush a cada 500ms ou no fim do turn
let pendingDelta = '';
onChunk(delta => { pendingDelta += delta; });
onTurnComplete(() => {
  writeQueue.enqueue(() => {
    db.prepare('UPDATE messages SET content = ? WHERE id = ?')
      .run(pendingDelta, messageId);
  });
});
```

**WAL checkpoint:** não bloquear server durante checkpoint manual. Deixar auto-checkpoint do SQLite trabalhar (padrão: a cada 1000 páginas).

### Teste de Regressão
```typescript
it('serializa writes concorrentes sem perder nenhuma', async () => {
  // disparar 50 writes "simultâneas" via writeQueue
  // verificar que todas chegaram ao DB sem erro
  // verificar que count final = 50
});

it('loga warning quando write demora >50ms', async () => {
  // mock write síncrona que dura 100ms
  // verificar que logger.warn foi chamado
});

it('flush de deltas acumula e escreve 1x por turn, não por chunk', async () => {
  // simular 200 chunks no mesmo turn
  // verificar que INSERT/UPDATE foi chamado apenas 1x ao fim do turn
});
```

---

## EP-07: Conexão adicionada/removida durante turn ativo

### Descrição
Durante um turn (agente está `thinking` ou `speaking`), o usuário adiciona ou remove uma aresta no canvas (via drag-and-drop no React Flow). Se o dispatcher usa uma referência live ao grafo de conexões, o contexto injetado no agente pode incluir vizinhos que não existiam quando o turn começou, ou excluir vizinhos que foram removidos.

Pior: se a conexão removida era o target de um `/ask` em andamento, o dispatcher recebe um 403/404 no meio do turn.

### Gatilho
- Usuário faz drag-and-drop para adicionar aresta enquanto agente responde
- Usuário deleta conexão enquanto mensagem está sendo processada
- `DELETE /api/connections/:id` durante turn ativo

### Sintoma
- Bloco `"Seus vizinhos:"` no prompt do agente lista agente que acabou de ser desconectado
- `/ask @X` falha com 403 porque conexão foi removida mid-turn
- `POST /api/connections` cria nova aresta que agente "vê" sem ter sido contextualizado sobre ela
- Inconsistência entre o que o agente "pensa" que pode fazer e o que o sistema permite

### Detecção
```typescript
// No início de cada turn, o dispatcher captura snapshot das conexões:
interface TurnContext {
  conversationId: string;
  sourceAgentId: string;
  connectionSnapshot: Connection[];  // congelado no momento do dispatch
  startedAt: Date;
}

// Snapshot é imutável durante o turn
// Modificações ao vivo no DB não afetam o turn atual
```

### Mitigação

**Snapshot imutável por turn (regra do master plan §3.2b):**
```typescript
// dispatcher.ts
async function startTurn(conversationId: string, agentId: string): Promise<TurnContext> {
  const snapshot = db.prepare(`
    SELECT * FROM connections 
    WHERE (source_agent_id = ? OR target_agent_id = ?)
    AND deleted_at IS NULL
  `).all(agentId, agentId);

  const ctx: TurnContext = {
    conversationId,
    sourceAgentId: agentId,
    connectionSnapshot: snapshot,
    startedAt: new Date(),
  };

  activeTurns.set(conversationId, ctx);
  return ctx;
}
```

**Re-injeção no próximo turn (não no atual):**
```typescript
// Context injector usa connectionSnapshot, não query live
function buildNeighborsBlock(ctx: TurnContext): string {
  return ctx.connectionSnapshot
    .map(c => `- ${c.target_name} (${c.kind})`)
    .join('\n');
}

// Ao fim do turn, activeTurns.delete(conversationId)
// Próxima mensagem vai capturar novo snapshot (já reflete mudanças do canvas)
```

**Se conexão é deletada e um `/ask` em andamento aponta para ela:**
```typescript
// dispatcher.ts — ao tentar executar /ask @X durante turn
const conn = ctx.connectionSnapshot.find(c => c.target_agent_id === targetId);
if (!conn) {
  // Conexão estava no snapshot mas foi deletada? Isso não deveria acontecer.
  // Conexão nunca esteve no snapshot?
  return {
    error: 'CONNECTION_NOT_IN_SNAPSHOT',
    message: 'Agente não estava conectado no início deste turn',
  };
}
// Persistir no DB mesmo que conexão seja deletada depois — snapshot garante que era válida
```

**Notificação ao usuário:**
```typescript
// Quando conexão é deletada durante turn ativo:
// WS event: { type: 'connection.deleted_during_turn', 
//             connection_id, affected_conversations: [conversationId] }
// UI: toast warning "Conexão removida. Agente será notificado no próximo turn."
```

### Teste de Regressão
```typescript
it('snapshot congela conexões no início do turn', async () => {
  // iniciar turn com agente A conectado a B e C
  // deletar conexão A→C durante o turn
  // verificar que promptBuilder ainda inclui C no bloco de vizinhos
});

it('próximo turn (após o atual) usa snapshot atualizado sem C', async () => {
  // após turn completar, iniciar novo turn
  // verificar que C não está mais no snapshot
});

it('retorna CONNECTION_NOT_IN_SNAPSHOT se /ask aponta para agente fora do snapshot', async () => {
  // turn ativo sem conexão para D
  // tentar /ask @D
  // expect(error.code).toBe('CONNECTION_NOT_IN_SNAPSHOT')
});

it('nova conexão adicionada durante turn aparece no próximo turn', async () => {
  // turn ativo; adicionar aresta A→D durante turn
  // turn completa; iniciar novo turn
  // verificar D presente no snapshot
});
```

---

## EP-08: Depth-guard false positives em broadcasts do Chief

### Descrição
Chief (`is_chief=1`) tem conexão implícita com **todos** os agentes. Quando Chief faz `/broadcast <msg>`, o `MessageDispatcher` despacha para N agentes em paralelo. Se cada um desses agentes eventualmente responde ao Chief (que é o remetente natural), o `depth-guard` pode interpretar isso como ciclo: Chief→A, A→Chief (Chief está em `visited`), bloqueado com 409 — mas é um padrão legítimo, não um ciclo malicioso.

### Gatilho
- Chief faz `/broadcast` para squad de 5+ agentes
- Um ou mais agentes respondem diretamente ao Chief após processar o broadcast
- `visited set` do depth-guard contém Chief como nó visitado

### Sintoma
- Agentes respondem ao Chief com 409
- Logs cheios de `DEPTH_LIMIT` warnings para conversas legítimas
- Chief pensa que enviou broadcast mas não recebe confirmações/respostas

### Detecção
```typescript
// O problema: depth-guard trata Chief→A→Chief como ciclo
// A realidade: A→Chief é "reply ao supervisor", não ciclo malicioso

// Diferenciar pela direção da aresta + flag is_chief:
interface DispatchContext {
  conversationId: string;
  chainOriginAgentId: string;  // quem iniciou a CADEIA (não o hop atual)
  visited: Set<string>;
  depth: number;
  isChiefBroadcast: boolean;   // NOVO: flag para broadcasts do Chief
}
```

### Mitigação

**Regra especial para respostas ao Chief:**
```typescript
// depth-guard.ts
function checkDepth(ctx: DispatchContext, targetAgentId: string): DepthGuardResult {
  // Exceção 1: se o alvo É o Chief e o remetente é filho do Chief
  // "Resposta ao supervisor" — não é ciclo
  const targetIsChief = isChief(targetAgentId);
  const sourceIsChiefChild = ctx.isChiefBroadcast && !isChief(ctx.chainOriginAgentId);

  if (targetIsChief && sourceIsChiefChild) {
    // PERMITIR: agente respondendo ao Chief que iniciou o broadcast
    return { allowed: true, reason: 'chief_reply_exempt' };
  }

  // Regra normal: visited set check
  if (ctx.visited.has(targetAgentId)) {
    return { allowed: false, reason: 'cycle_detected', cycle: [...ctx.visited, targetAgentId] };
  }

  // Depth check
  if (ctx.depth >= 3) {
    return { allowed: false, reason: 'max_depth', depth: ctx.depth };
  }

  return { allowed: true };
}
```

**Broadcasts do Chief não incrementam `depth` para os replies diretos:**
```typescript
// Filosofia: Chief→A é depth=1; A→Chief é "reply" (não conta como hop adicional)
// A→B (encadeado a partir do broadcast) SIM conta como depth=2
// A→B→C conta como depth=3 e é bloqueado normalmente

if (ctx.isChiefBroadcast && targetIsChief) {
  // Não incrementar depth ao retornar para Chief
  return { ...ctx, depth: ctx.depth };  // depth sem alteração
}
```

**Limite de replies ao Chief por broadcast:**
```typescript
// Guardrail extra: um broadcast com 20 agentes não deve gerar 20 respostas simultâneas ao Chief
// Cap: maxRepliesPerBroadcast = 10 (respostas extras enfileiradas)
const broadcastReplies = getBroadcastReplyCount(ctx.conversationId);
if (broadcastReplies > MAX_BROADCAST_REPLIES) {
  // Enfileirar ao invés de bloquear
  enqueueBroadcastReply(ctx);
  return { allowed: false, reason: 'broadcast_reply_queued' };
}
```

### Teste de Regressão
```typescript
it('Chief broadcast → A responde ao Chief: NÃO é 409', async () => {
  // Chief faz broadcast para A
  // A processa e responde ao Chief
  // expect: resposta processada com sucesso (não 409)
});

it('A→B→A ainda é bloqueado mesmo com flag isChiefBroadcast', async () => {
  // Chief faz broadcast para A
  // A→B, B→A: isso É ciclo — deve ser bloqueado
  // expect(status).toBe(409)
});

it('A→B→C é bloqueado normalmente (depth=3 atingido)', async () => {
  // Chief broadcast → A (depth=1) → B (depth=2) → C (depth=3, limite) → attempt D
  // expect(status).toBe(409) com reason=max_depth
});

it('replies ao Chief além do cap são enfileirados', async () => {
  // broadcast para 15 agentes, todos respondem simultaneamente
  // expect: primeiro 10 passam, restantes enfileirados
});

it('broadcasts independentes (novas conversas) têm visited sets isolados', async () => {
  // 2 broadcasts independentes Chief→A
  // visited set da conversa 1 não contamina conversa 2
});
```

---

## Resumo: Mapa de Implementação para Han Solo

| EP | Arquivo principal | Prioridade | Notas |
|----|------------------|-----------|-------|
| EP-01 | `src/server/agent-bus/depth-guard.ts` | **P0** | Criar do zero; chave é visited set por `conversation_id` |
| EP-02 | `src/server/agent-bus/dispatcher.ts` | **P0** | Lock per-card; já existe dispatcher, adicionar lock map |
| EP-03 | `src/server/process-manager.ts` | **P0** | Já tem `child.kill()` em WS close; adicionar reaper setInterval |
| EP-04 | `src/server/agent-bus/invoke-agent.ts` | **P1** | `canSpawnPTY()` guard antes de cada spawn |
| EP-05 | `src/server/pty-websocket-server.ts` | **P1** | `sendWithBackpressure()` wrapper + coalescing |
| EP-06 | `src/server/database/write-queue.ts` | **P1** | Serializar writes; flush de deltas por turn |
| EP-07 | `src/server/agent-bus/dispatcher.ts` | **P1** | `connectionSnapshot` por turn; re-injeção no próximo |
| EP-08 | `src/server/agent-bus/depth-guard.ts` | **P2** | Extensão do EP-01; `isChiefBroadcast` flag |

**Ordem de implementação sugerida:** EP-01 → EP-02 → EP-03 → EP-08 (extensão do 01) → EP-04 → EP-05 → EP-06 → EP-07

**Todos os testes vivem em:** `tests/agent-bus/` (novo diretório para 9.9)

---

> Catalog preparado por Boba Fett. Nenhuma presa escapa — nem os edge cases.  
> — 💻🎯
