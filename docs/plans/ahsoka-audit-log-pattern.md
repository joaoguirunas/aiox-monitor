# Ahsoka — Audit Log Pattern para o Agent Bus Dispatcher

> **Audiência:** Han Solo (@dev) — consumir durante a implementação da Story 9.3 (AgentBus completo).
> **Contexto:** O `dispatcher.ts` roteia mensagens entre agent_cards via connection graph, aplica depth-guard (max 3 hops) e adquire lock por card durante streaming. Cada etapa desse fluxo precisa de rastreabilidade operacional sem jamais expor o conteúdo das mensagens.
> **Data:** 2026-04-14 · **Autora:** Ahsoka (Pesquisa Técnica)

---

## 1. Quais Eventos Logar

A regra é simples: **logar decisões e transições de controle, nunca conteúdo**. O dispatcher é uma state machine — cada mudança de estado é um evento auditável.

### 1.1 Catálogo de Eventos

| Evento | Quando ocorre | Severo se ausente? |
|--------|--------------|-------------------|
| `dispatch.attempt` | Entrada do dispatcher — antes de qualquer validação | Sim — ponto de rastreabilidade inicial |
| `dispatch.authorized` | Connection graph validou A→B | Sim — prova de autorização |
| `dispatch.denied` | Connection graph bloqueou A→B | Sim — pista de ataque ou bug |
| `message.persisted` | Mensagem salva no SQLite com sucesso | Sim — confirmação de durabilidade |
| `depth_exceeded` | Hop count ≥ 4 (acima do limite de 3) | Sim — indica ciclo ou cascata fora de controle |
| `lock_acquired` | Lock per-card adquirido antes do streaming | Moderado — diagnóstico de concorrência |
| `lock_released` | Lock liberado após turno concluído | Moderado — detectar locks zumbis |
| `chief_bypass` | Chief (`is_chief=1`) envia sem passar pelo connection check | Alto — auditoria de privilégio |

### 1.2 Exemplos Concretos de Cada Evento

#### `dispatch.attempt`
```json
{
  "ts": "2026-04-14T18:23:01.432Z",
  "event": "dispatch.attempt",
  "conversationId": "conv_abc123",
  "senderId": "card_yoda",
  "targetId": "card_luke",
  "hopCount": 0,
  "triggerSource": "user_input",
  "latencyMs": null
}
```

#### `dispatch.authorized`
```json
{
  "ts": "2026-04-14T18:23:01.441Z",
  "event": "dispatch.authorized",
  "conversationId": "conv_abc123",
  "senderId": "card_yoda",
  "targetId": "card_luke",
  "connectionId": "conn_yoda_luke",
  "connectionKind": "chat",
  "hopCount": 0,
  "latencyMs": 9
}
```

#### `dispatch.denied`
```json
{
  "ts": "2026-04-14T18:23:55.100Z",
  "event": "dispatch.denied",
  "conversationId": "conv_abc123",
  "senderId": "card_han",
  "targetId": "card_obi",
  "hopCount": 0,
  "verdict": 403,
  "reason": "no_connection",
  "latencyMs": 3
}
```

Valores possíveis para `reason`:
- `no_connection` — aresta não existe no grafo
- `connection_disabled` — aresta existe mas está desativada (futura feature)
- `target_offline` — card alvo com `status='offline'`
- `target_busy_no_queue` — card com lock ativo e sem fila

#### `message.persisted`
```json
{
  "ts": "2026-04-14T18:23:01.460Z",
  "event": "message.persisted",
  "conversationId": "conv_abc123",
  "messageId": "msg_xyz789",
  "senderId": "card_yoda",
  "targetId": "card_luke",
  "senderRole": "chief",
  "hopCount": 0,
  "latencyMs": 19
}
```

#### `depth_exceeded`
```json
{
  "ts": "2026-04-14T18:25:10.202Z",
  "event": "depth_exceeded",
  "conversationId": "conv_abc123",
  "senderId": "card_luke",
  "targetId": "card_rey",
  "hopCount": 4,
  "visitedPath": ["card_yoda", "card_luke", "card_han", "card_rey"],
  "reason": "max_depth_3_exceeded",
  "latencyMs": 2
}
```

#### `lock_acquired`
```json
{
  "ts": "2026-04-14T18:23:01.450Z",
  "event": "lock_acquired",
  "conversationId": "conv_abc123",
  "targetId": "card_luke",
  "lockKey": "agent_lock:card_luke",
  "latencyMs": 1
}
```

#### `lock_released`
```json
{
  "ts": "2026-04-14T18:23:08.991Z",
  "event": "lock_released",
  "conversationId": "conv_abc123",
  "targetId": "card_luke",
  "lockKey": "agent_lock:card_luke",
  "durationMs": 7541,
  "latencyMs": 0
}
```

#### `chief_bypass`
```json
{
  "ts": "2026-04-14T18:30:00.000Z",
  "event": "chief_bypass",
  "conversationId": "conv_chief_direct",
  "senderId": "card_yoda",
  "targetId": "card_obi",
  "bypassReason": "is_chief_flag",
  "hopCount": 0,
  "latencyMs": 2
}
```

---

## 2. Schema Completo do Log Entry

### 2.1 Definição TypeScript

```typescript
// src/server/agent-bus/audit/audit-log.types.ts

export type AuditEventType =
  | 'dispatch.attempt'
  | 'dispatch.authorized'
  | 'dispatch.denied'
  | 'message.persisted'
  | 'depth_exceeded'
  | 'lock_acquired'
  | 'lock_released'
  | 'chief_bypass';

export type DenyReason =
  | 'no_connection'
  | 'connection_disabled'
  | 'target_offline'
  | 'target_busy_no_queue';

export type TriggerSource = 'user_input' | 'agent_cascade' | 'chief_direct';

export type AgentKind = 'chat' | 'terminal' | 'hybrid';

export type ConnectionKind = 'chat' | 'broadcast' | 'supervise' | 'context-share';

/**
 * Entrada canônica do audit log.
 * NENHUM campo de conteúdo de mensagem é incluído — apenas metadata.
 */
export interface AuditLogEntry {
  // ── Identidade do evento ──────────────────────────────────────
  id: string;                    // UUID v4 do próprio log entry
  ts: string;                    // ISO 8601 UTC (ex: "2026-04-14T18:23:01.432Z")
  event: AuditEventType;

  // ── Contexto da conversa ──────────────────────────────────────
  conversationId: string;        // FK → conversations.id
  senderId: string;              // FK → agent_cards.id
  targetId: string;              // FK → agent_cards.id

  // ── Resultado da decisão ──────────────────────────────────────
  verdict: 200 | 403 | 409 | 507 | null;  // HTTP-like; null se não aplicável
  reason: DenyReason | string | null;      // string para extensibilidade

  // ── Rastreio de roteamento ────────────────────────────────────
  hopCount: number;              // 0 = mensagem original; 1,2,3 = cascata
  visitedPath: string[] | null;  // agent_card IDs neste ciclo (preenchido em depth_exceeded)
  triggerSource: TriggerSource | null;

  // ── Contexto do agente ────────────────────────────────────────
  senderKind: AgentKind | null;  // 'chat' | 'terminal' | 'hybrid'
  targetKind: AgentKind | null;

  // ── Contexto da conexão ───────────────────────────────────────
  connectionId: string | null;   // FK → connections.id (null se negado antes de resolver)
  connectionKind: ConnectionKind | null;

  // ── Referência à mensagem (se persistida) ────────────────────
  messageId: string | null;      // FK → messages.id; null em eventos pre-persist

  // ── Lock de concorrência ──────────────────────────────────────
  lockKey: string | null;        // ex: "agent_lock:card_luke"
  durationMs: number | null;     // duração do lock (só em lock_released)

  // ── Performance ───────────────────────────────────────────────
  latencyMs: number | null;      // tempo desde dispatch.attempt até este evento

  // ── Metadados de runtime ──────────────────────────────────────
  userId: string;                // 'local' (multi-user ready, alinhado ao schema)
  schemaVersion: 1;              // para migrações futuras do log
}
```

### 2.2 Campos opcionais por tipo de evento

| Evento | Campos exclusivos |
|--------|------------------|
| `dispatch.attempt` | `triggerSource`, `senderKind`, `targetKind` |
| `dispatch.authorized` | `connectionId`, `connectionKind` |
| `dispatch.denied` | `reason`, `verdict: 403` |
| `message.persisted` | `messageId`, `senderRole` (adicionar se necessário) |
| `depth_exceeded` | `visitedPath`, `reason: 'max_depth_3_exceeded'` |
| `lock_acquired` | `lockKey` |
| `lock_released` | `lockKey`, `durationMs` |
| `chief_bypass` | `reason: 'is_chief_flag'` |

---

## 3. Destino de Armazenamento

### 3.1 Tabela `audit_log` em SQLite

**DDL:**

```sql
-- src/server/db/migrations/002_audit_log.sql

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS audit_log (
  id               TEXT    NOT NULL PRIMARY KEY,         -- UUID v4
  ts               TEXT    NOT NULL,                     -- ISO 8601 UTC
  event            TEXT    NOT NULL CHECK(event IN (
                     'dispatch.attempt',
                     'dispatch.authorized',
                     'dispatch.denied',
                     'message.persisted',
                     'depth_exceeded',
                     'lock_acquired',
                     'lock_released',
                     'chief_bypass'
                   )),
  conversation_id  TEXT    NOT NULL,                     -- soft ref → conversations.id
  sender_id        TEXT    NOT NULL,                     -- soft ref → agent_cards.id
  target_id        TEXT    NOT NULL,                     -- soft ref → agent_cards.id
  verdict          INTEGER,                              -- 200 | 403 | 409 | 507 | NULL
  reason           TEXT,                                 -- deny reason ou descritivo
  hop_count        INTEGER NOT NULL DEFAULT 0,
  visited_path     TEXT,                                 -- JSON array de agent_card IDs
  trigger_source   TEXT,                                 -- 'user_input' | 'agent_cascade' | 'chief_direct'
  sender_kind      TEXT,                                 -- 'chat' | 'terminal' | 'hybrid'
  target_kind      TEXT,                                 -- 'chat' | 'terminal' | 'hybrid'
  connection_id    TEXT,                                 -- soft ref → connections.id
  connection_kind  TEXT,                                 -- 'chat' | 'broadcast' | etc
  message_id       TEXT,                                 -- soft ref → messages.id
  lock_key         TEXT,
  duration_ms      INTEGER,
  latency_ms       INTEGER,
  user_id          TEXT    NOT NULL DEFAULT 'local',
  schema_version   INTEGER NOT NULL DEFAULT 1
);

-- ── Índices ──────────────────────────────────────────────────────────────────

-- Query primária: listar eventos de uma conversa em ordem cronológica
CREATE INDEX IF NOT EXISTS idx_audit_conversation_ts
  ON audit_log(conversation_id, ts);

-- Filtrar por tipo de evento (dashboard de erros/negações)
CREATE INDEX IF NOT EXISTS idx_audit_event_ts
  ON audit_log(event, ts);

-- Detectar padrões por agente (quem mais gera depth_exceeded?)
CREATE INDEX IF NOT EXISTS idx_audit_sender_event
  ON audit_log(sender_id, event);

-- Limpeza rolling: DELETE WHERE ts < ? — precisa de índice em ts
CREATE INDEX IF NOT EXISTS idx_audit_ts
  ON audit_log(ts);

-- ── Retenção automática via trigger (rolling 30 dias) ────────────────────────
-- Executar via job externo — ver §4 para estratégia completa.
```

**Soft refs em vez de FKs:** `conversation_id`, `sender_id`, `target_id`, `connection_id` e `message_id` são referências deliberadamente sem `FOREIGN KEY` constraint. O audit log é um registro imutável — se um card for deletado, o histórico não pode ser cascade-deletado junto. O dado histórico sempre prevalece sobre o estado atual.

### 3.2 Arquivo `.jsonl` Rotacionado

Formato de linha (1 entry = 1 linha JSON sem quebras):

```jsonl
{"id":"01HX...","ts":"2026-04-14T18:23:01.432Z","event":"dispatch.attempt","conversationId":"conv_abc","senderId":"card_yoda","targetId":"card_luke","hopCount":0,"verdict":null,"reason":null,"latencyMs":null,"userId":"local","schemaVersion":1}
{"id":"01HX...","ts":"2026-04-14T18:23:01.441Z","event":"dispatch.authorized","conversationId":"conv_abc","senderId":"card_yoda","targetId":"card_luke","connectionId":"conn_yoda_luke","connectionKind":"chat","hopCount":0,"verdict":200,"reason":null,"latencyMs":9,"userId":"local","schemaVersion":1}
```

**Naming convention:**
```
.aiox-monitor/audit/
├── audit-2026-04-14.jsonl          # arquivo do dia atual (append)
├── audit-2026-04-13.jsonl.gz       # dias anteriores comprimidos
├── audit-2026-04-12.jsonl.gz
└── ...
```

**Rotation strategy:**
- Rotacionar diariamente à meia-noite (cron ou lazy-on-first-write do dia seguinte)
- Comprimir com `gzip` imediatamente após rotação
- Arquivo corrente: `audit-{YYYY-MM-DD}.jsonl` (plain text, append-only)
- Arquivos históricos: `.jsonl.gz` (comprimido, read-only)
- Manter 30 dias; deletar `*.jsonl.gz` com mais de 30 dias

### 3.3 Tabela Comparativa

| Critério | SQLite (`audit_log`) | JSONL rotacionado |
|---|---|---|
| **Query ad-hoc** | Excelente — SQL completo, JOINs possíveis | Difícil — grep ou parse manual |
| **Integração com schema existente** | Perfeita — mesma DB, mesma `DatabaseSync` | Paralelo — arquivo externo |
| **Overhead de I/O** | Baixo — WAL mode, batch writes | Muito baixo — append sequencial puro |
| **Limpeza de retenção** | `DELETE FROM audit_log WHERE ts < ?` + VACUUM | `rm audit-*.jsonl.gz` por data |
| **Dump/exportação** | `.dump` ou `SELECT * → CSV` | `cat *.jsonl | jq` direto |
| **Legibilidade em debug** | Requer cliente SQLite | `cat audit-hoje.jsonl | jq .` |
| **Complexidade operacional** | Zero — usa infra existente | Requer job de rotação + cleanup |
| **Busca por correlação** | `WHERE conversation_id = ?` — índice | grep por campo: lento sem índice |
| **Espaço em disco (1M entries/mês)** | ~80-120 MB (sem compressão) | ~15-25 MB (gzip) |
| **Backups** | Incluído no backup da DB | Requer backup de arquivos separado |
| **Multiprocess safety** | Garantido pelo SQLite WAL | Race condition em append paralelo |

### 3.4 Recomendação Final

**Usar tabela SQLite `audit_log`.**

Justificativas:

1. **Coerência arquitetural.** O projeto já usa `node:sqlite` (`DatabaseSync`) com WAL. Adicionar uma segunda infraestrutura (filesystem rotacionado) aumenta superfície operacional sem benefício claro num sistema local single-user.

2. **Query operacional.** O caso de uso mais frequente em debug é "mostre-me todos os eventos da conversa X" ou "quais dispatches foram negados nas últimas 2 horas" — perguntas SQL triviais, impossíveis eficientemente no JSONL.

3. **Correlação cross-table.** Um `JOIN audit_log ON connections.id = audit_log.connection_id` identifica quais conexões geram mais negações — insight impossível em JSONL sem ETL.

4. **Retenção trivial.** Um cron semanal `DELETE FROM audit_log WHERE ts < datetime('now', '-30 days')` + `PRAGMA incremental_vacuum` é suficiente.

5. **JSONL como complemento opcional.** Se quiser debug em terminal sem cliente SQLite, implemente um `AuditLogger` que escreve em SQLite E em um arquivo de desenvolvimento (`audit-dev.jsonl`) controlado por env var `AIOX_AUDIT_JSONL=true`. Nunca como destino primário em produção.

---

## 4. Estratégia de Retenção (30 dias rolling)

### 4.1 DELETE direto (recomendado)

```typescript
// src/server/agent-bus/audit/audit-retention.ts

import { db } from '@/server/db';

/**
 * Remove entradas com mais de 30 dias do audit_log.
 * Executar via cron semanal ou no startup da app.
 */
export function runAuditRetention(daysToKeep = 30): { deleted: number } {
  const stmt = db.prepare(`
    DELETE FROM audit_log
    WHERE ts < datetime('now', '-' || ? || ' days')
  `);

  const result = stmt.run(daysToKeep);
  const deleted = result.changes as number;

  if (deleted > 0) {
    // Logar a própria retenção como evento de sistema (sem passar pelo AuditLogger normal)
    console.log(`[AuditRetention] Deleted ${deleted} entries older than ${daysToKeep} days`);
    db.exec('PRAGMA incremental_vacuum');
  }

  return { deleted };
}
```

**Onde chamar:** `src/server/startup.ts` ou via `setInterval` no servidor com período de 24h.

```typescript
// Executar na inicialização e depois a cada 24h
runAuditRetention();
setInterval(() => runAuditRetention(), 24 * 60 * 60 * 1000);
```

### 4.2 Arquivamento comprimido (alternativa, se quiser histórico além de 30 dias)

Não recomendado para v2.0 — adicionar complexidade sem uso imediato. Se no futuro precisar de histórico além de 30 dias:

1. Antes do DELETE, fazer `SELECT * WHERE ts < cutoff` → gzip → salvar em `.aiox-monitor/audit-archive/YYYY-MM.jsonl.gz`
2. O DELETE principal permanece igual

---

## 5. Privacy: Conteúdo Nunca é Logado

### 5.1 Regra absoluta

O audit log registra **metadata de controle**, nunca payload de mensagens. Isso inclui:

- `content` de `messages` — NUNCA
- `system_prompt` de `agent_cards` — NUNCA
- `artifacts` JSON de mensagens — NUNCA
- Qualquer texto digitado pelo usuário — NUNCA

### 5.2 `AuditSanitizer` — função de sanitização

```typescript
// src/server/agent-bus/audit/audit-sanitizer.ts

import type { AuditLogEntry } from './audit-log.types';

/**
 * Campos que NUNCA devem aparecer no audit log.
 * Proteção defense-in-depth: mesmo que código upstream
 * tente incluir um desses campos, o sanitizer os remove.
 */
const FORBIDDEN_FIELDS = [
  'content',
  'system_prompt',
  'artifacts',
  'body',
  'text',
  'prompt',
  'message',
  'input',
  'output',
  'response',
  'payload',
] as const;

type ForbiddenField = (typeof FORBIDDEN_FIELDS)[number];

/**
 * Garante que um objeto candidato a log entry não contém campos
 * de conteúdo. Lança erro se encontrado (fail-fast em dev,
 * strip silencioso em prod).
 */
export function sanitizeAuditEntry(
  raw: Partial<AuditLogEntry> & Record<string, unknown>
): AuditLogEntry {
  const isProd = process.env.NODE_ENV === 'production';

  for (const field of FORBIDDEN_FIELDS) {
    if (field in raw) {
      const msg = `[AuditSanitizer] FORBIDDEN field "${field}" detected in audit entry. Strip applied.`;

      if (!isProd) {
        // Fail-fast em desenvolvimento — bug visível imediatamente
        throw new Error(msg);
      } else {
        // Strip silencioso em produção — não vazar dados, não quebrar
        console.error(msg);
        delete (raw as Record<string, unknown>)[field];
      }
    }
  }

  // Validar campos obrigatórios
  const required: (keyof AuditLogEntry)[] = [
    'id', 'ts', 'event', 'conversationId', 'senderId', 'targetId',
    'hopCount', 'userId', 'schemaVersion',
  ];

  for (const field of required) {
    if (raw[field] === undefined || raw[field] === null) {
      throw new Error(`[AuditSanitizer] Required field "${field}" is missing in audit entry.`);
    }
  }

  return raw as AuditLogEntry;
}

/**
 * Helper para construir um entry com defaults seguros.
 * Uso: buildAuditEntry({ event: 'dispatch.attempt', ... })
 */
export function buildAuditEntry(
  partial: Omit<AuditLogEntry, 'id' | 'ts' | 'userId' | 'schemaVersion'> &
    Partial<Pick<AuditLogEntry, 'userId' | 'schemaVersion'>>
): AuditLogEntry {
  const raw = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    userId: 'local',
    schemaVersion: 1 as const,
    verdict: null,
    reason: null,
    hopCount: 0,
    visitedPath: null,
    triggerSource: null,
    senderKind: null,
    targetKind: null,
    connectionId: null,
    connectionKind: null,
    messageId: null,
    lockKey: null,
    durationMs: null,
    latencyMs: null,
    ...partial,
  };

  return sanitizeAuditEntry(raw);
}
```

### 5.3 Uso do sanitizer no dispatcher

```typescript
// Dentro de dispatcher.ts — exemplo ao logar dispatch.authorized

const entry = buildAuditEntry({
  event: 'dispatch.authorized',
  conversationId: ctx.conversationId,
  senderId: ctx.senderId,
  targetId: ctx.targetId,
  connectionId: connection.id,
  connectionKind: connection.kind,
  hopCount: ctx.hopCount,
  verdict: 200,
  latencyMs: Date.now() - ctx.startTime,
});

await auditLogger.write(entry);
// Nunca: { ...entry, content: message.content } — o sanitizer bloquearia isso
```

---

## 6. Como 3 Sistemas Reais Implementam Audit Log

### 6.1 Temporal — Workflow Event History

**Referência:** [Temporal Event History](https://docs.temporal.io/workflows#event-history)

Temporal armazena cada passo de workflow como um **evento imutável** num log append-only. Cada evento tem:

```json
{
  "eventId": 5,
  "eventTime": "2023-11-01T10:00:00Z",
  "eventType": "ActivityTaskScheduled",
  "taskId": "4505397239963647",
  "activityTaskScheduledEventAttributes": {
    "activityId": "send-email",
    "activityType": { "name": "SendEmailActivity" },
    "workflowTaskCompletedEventId": 4,
    "scheduleToCloseTimeout": "300s",
    "scheduleToStartTimeout": "60s",
    "input": { "payloads": [] }   // ← inputs são serializados opcionalmente; podem ser omitidos
  }
}
```

**Padrões relevantes para o dispatcher:**

1. **Event ID sequencial por workflow** (equivalente: event ID sequencial por `conversationId`). Permite replay determinístico e correlação precisa.
2. **Tipos de evento são o vocabulário do sistema** — `ActivityTaskScheduled`, `ActivityTaskStarted`, `ActivityTaskCompleted`, `ActivityTaskFailed`. O dispatcher usa o mesmo padrão: `dispatch.attempt`, `dispatch.authorized`, `dispatch.denied`.
3. **Sem truncamento** — Temporal retém o histórico completo por padrão, com compressão opcional. Estratégia de retenção configurável por namespace.
4. **Inputs separados do evento de controle** — `input.payloads` pode ser vazio ou codificado separadamente, nunca inline obrigatório. O dispatcher deve seguir o mesmo princípio: `messageId` referencia o conteúdo sem copiá-lo.

**O que o dispatcher vai "emprestar" do Temporal:**
- Modelo de eventos como linguagem de domínio do sistema
- Separação entre evento de controle (o que aconteceu) e payload (o que foi processado)
- Imutabilidade do log — nunca UPDATE, só INSERT

---

### 6.2 Airflow — TaskInstance State Log

**Referência:** [Airflow TaskInstance model](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html#task-instances)

O Airflow registra cada transição de estado de uma `TaskInstance` numa tabela `task_instance` com os campos:

```sql
-- Simplificado do schema real do Airflow
task_instance (
  dag_id        VARCHAR,
  task_id       VARCHAR,
  run_id        VARCHAR,
  state         VARCHAR,   -- 'queued', 'running', 'success', 'failed', 'up_for_retry'
  start_date    TIMESTAMP,
  end_date      TIMESTAMP,
  duration      FLOAT,     -- segundos
  try_number    INT,
  max_tries     INT,
  log_url       VARCHAR,   -- link para log externo, nunca inline
  executor_config TEXT      -- JSON com config do executor
)
```

O Airflow também mantém um `TaskInstanceHistory` separado — cada vez que uma task é re-tentada, o estado anterior vai para o histórico, preservando imutabilidade.

**Padrões relevantes:**

1. **`log_url` em vez de `log_content`** — o audit registra a referência, não o conteúdo. O dispatcher deve usar `messageId` (referência) em vez de `content` (dado bruto).
2. **`try_number` para rastreio de retry** — equivale ao `hopCount` no dispatcher: quantas vezes um agente foi acionado dentro de uma mesma conversa.
3. **`state` como vocabulário explícito** — o enum `state` é a linguagem do sistema. O dispatcher usa `event` com o mesmo propósito.
4. **`duration` separado de `latencyMs`** — Airflow distingue duração de execução (quanto tempo a task rodou) de latência de scheduling (quanto tempo ficou na fila). O dispatcher deve seguir: `durationMs` = tempo com lock ativo; `latencyMs` = tempo desde o dispatch.attempt.

**O que o dispatcher vai "emprestar" do Airflow:**
- Separação entre latência de roteamento (`latencyMs`) e duração de execução (`durationMs`)
- Referência ao log externo em vez de inline (equivale a `messageId` apontando para `messages.id`)
- Histórico de retentativas como campo numérico (`hopCount`)

---

### 6.3 NATS JetStream — Message Delivery & Ack Tracking

**Referência:** [NATS JetStream Consumer API](https://docs.nats.io/nats-concepts/jetstream/consumers)

O NATS JetStream rastreia entrega e acknowledgment de cada mensagem por consumer. O estado interno de um consumer inclui:

```json
{
  "stream_name": "ORDERS",
  "name": "processor-1",
  "config": {
    "durable_name": "processor-1",
    "max_deliver": 3,
    "ack_wait": "30s"
  },
  "delivered": {
    "consumer_seq": 5,
    "stream_seq": 100,
    "last_active": "2026-04-14T18:23:01Z"
  },
  "ack_floor": {
    "consumer_seq": 4,
    "stream_seq": 99
  },
  "num_pending": 10,
  "num_redelivered": 2
}
```

Cada mensagem tem seu `Nats-Sequence` (ID imutável no stream), `Nats-Timestamp`, e headers de delivery como `Nats-Num-Delivered` (quantas vezes foi entregue, equivale a tentativas).

**Padrões relevantes:**

1. **Sequence number por stream** — cada mensagem tem um ID monotônico imutável. O dispatcher pode usar `crypto.randomUUID()` como ID de log, mas garantir que a ordem em `ts` seja sempre crescente por `conversationId`.
2. **`num_redelivered` para detect ciclos** — NATS conta re-entregas; o dispatcher usa `hopCount` + `visitedPath` para o mesmo fim (detectar cascata e ciclo A→B→A).
3. **`ack_floor` e `num_pending`** — NATS sabe exatamente o que foi processado vs. o que está pendente. O dispatcher pode derivar o mesmo com `lock_acquired` sem correspondente `lock_released` (lock zumbi detectável por query).
4. **`max_deliver` como circuit breaker** — equivale ao `max_depth=3` do depth-guard. NATS rejeita após N tentativas; o dispatcher rejeita após N hops.
5. **Headers de metadata em vez de body enrichment** — NATS nunca modifica o payload; adiciona metadata em headers separados. O dispatcher segue: `audit_log` é o "header store"; `messages` é o "body store" — nunca misturar.

**O que o dispatcher vai "emprestar" do NATS:**
- Lock zumbi detectável via query: `SELECT * FROM audit_log WHERE event='lock_acquired' AND conversation_id=? AND NOT EXISTS (SELECT 1 FROM audit_log WHERE event='lock_released' AND lock_key=al.lock_key)`
- `hopCount` como análogo ao `Nats-Num-Delivered`
- Circuit breaker numérico (`max_depth`) como análogo ao `max_deliver`

---

## 7. Implementação Sugerida — `AuditLogger`

```typescript
// src/server/agent-bus/audit/audit-logger.ts

import { db } from '@/server/db';
import type { AuditLogEntry } from './audit-log.types';
import { sanitizeAuditEntry } from './audit-sanitizer';

export class AuditLogger {
  private readonly stmt = db.prepare(`
    INSERT INTO audit_log (
      id, ts, event, conversation_id, sender_id, target_id,
      verdict, reason, hop_count, visited_path, trigger_source,
      sender_kind, target_kind, connection_id, connection_kind,
      message_id, lock_key, duration_ms, latency_ms,
      user_id, schema_version
    ) VALUES (
      $id, $ts, $event, $conversationId, $senderId, $targetId,
      $verdict, $reason, $hopCount, $visitedPath, $triggerSource,
      $senderKind, $targetKind, $connectionId, $connectionKind,
      $messageId, $lockKey, $durationMs, $latencyMs,
      $userId, $schemaVersion
    )
  `);

  write(entry: AuditLogEntry): void {
    const safe = sanitizeAuditEntry({ ...entry });

    this.stmt.run({
      ...safe,
      visitedPath: safe.visitedPath ? JSON.stringify(safe.visitedPath) : null,
    });
  }
}

export const auditLogger = new AuditLogger();
```

---

## 8. Resumo para Han Solo

| Decisão | Escolha | Motivo em 1 linha |
|---|---|---|
| Destino primário | SQLite `audit_log` | Mesma infra, queries SQL, correlação com schema existente |
| Soft refs (não FK) | Sim | Audit é imutável; deleção de card não apaga histórico |
| Conteúdo de mensagem | Jamais | `messageId` aponta para `messages.id`; conteúdo fica lá |
| Sanitizer | Fail-fast em dev, strip em prod | Bug visível em dev; resiliente em prod |
| Retenção | DELETE + VACUUM semanal | Simples, zero dependência externa |
| Índices | `(conversation_id, ts)`, `(event, ts)`, `(sender_id, event)`, `(ts)` | Cobrem todos os query patterns operacionais |
| Lock zumbi | Query: `lock_acquired` sem `lock_released` correspondente | Detectável sem infraestrutura adicional |
| Referência | Temporal (event model) + Airflow (latency vs duration) + NATS (circuit breaker) | Padrões validados em produção de alta escala |

**Arquivo de migração a criar:** `src/server/db/migrations/002_audit_log.sql`

**Arquivos novos a criar em `src/server/agent-bus/audit/`:**
- `audit-log.types.ts` — tipos TypeScript
- `audit-sanitizer.ts` — sanitizer + builder
- `audit-logger.ts` — instância singleton
- `audit-retention.ts` — retenção rolling 30 dias

— Ahsoka, the truth is out there 🔍⚔️
