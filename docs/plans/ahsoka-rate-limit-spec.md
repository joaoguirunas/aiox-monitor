# Ahsoka — Rate Limit Spec para o Agent Bus Dispatcher

> **Audiência:** Han Solo (@dev) — consumir durante a implementação da Story 9.9 (guard-rails).
> **Contexto:** O `dispatcher.ts` (Story 9.3) roteia mensagens entre `agent_cards`. O risco §9 do Plano Mestre classifica "custo de modelo em chat-only (agentes viram chatterbots)" como **Alto**. Este documento especifica o sistema de rate-limit que será o guardrail financeiro e qualitativo do Agent Bus.
> **Job:** JOB-041 · **Consumidor:** Han Solo (Story 9.9) · **Branch:** `feature/sala-comando-v2`
> **Data:** 2026-04-14 · **Autora:** Ahsoka (Pesquisa Técnica)

---

## 1. Estratégias Possíveis

### 1.1 Estratégia A — Token Bucket por `conversation_id`

O Token Bucket é o algoritmo de rate-limiting mais aplicado em APIs de mensagem. Cada `conversation_id` tem um bucket próprio com capacidade `burst_capacity` e uma taxa de reposição `refill_rate` (tokens por segundo).

**Como funciona:**

```
bucket[conv_id] = {
  tokensRemaining: burst_capacity,   // começa cheio
  refillAt: now() + refill_interval  // quando começa a repor
}

ao receber mensagem:
  if tokensRemaining > 0 → deixa passar, decrementa 1
  else → retorna 429, Retry-After: (refillAt - now()) / 1000
  
a cada refill_interval:
  tokensRemaining = min(burst_capacity, tokensRemaining + tokens_per_interval)
```

**Configuração default recomendada:**
- `burst_capacity` = 5 mensagens (permite rajada curta de brainstorm)
- `refill_rate` = 2 mensagens/min (10 mensagens em 5 min de conversa sustentada)
- `refill_interval` = 30 segundos (repõe 1 token a cada 30s)

**Prós:**
- Implementação simples — pode ser in-memory com fallback SQLite
- Previsível para o usuário: "você pode enviar 5 mensagens rapidamente, depois 1 a cada 30 segundos"
- Zero latência no caminho feliz — apenas decremento atômico
- Sem necessidade de conhecer o custo por token do modelo

**Contras:**
- Não controla custo real — uma mensagem curta (`$0.001`) e uma mensagem com 200k tokens de contexto (`$0.50`) consomem igualmente 1 token do bucket
- Em cenários de contexto longo (conversas com muitos agentes no canvas), o limite de mensagens é um proxy impreciso do limite de custo
- Estado por conversa: com N conversas simultâneas, N buckets em memória (aceitável — limit de 50 nodes no canvas = máximo ~50 conversas ativas)

**Implementação — in-memory vs SQLite-backed:**

In-memory é suficiente para o caso de uso (single-process, single-user). O estado do bucket é perdido em restart, o que é aceitável — o usuário recomeça com o bucket cheio, equivalente a uma janela nova.

SQLite-backed é necessário apenas se:
- Precisar persistir estado entre restarts (comportamento mais conservador)
- Multi-process (improvável no escopo atual)

Recomendação: in-memory com `WeakMap`-like descarte quando a conversa encerra. Se optar por SQLite, a tabela `rate_limit_buckets` proposta em §2 é suficiente.

---

### 1.2 Estratégia B — Cost Budget por `agent_card_id`

Em vez de contar mensagens, rastrear o custo real em USD por card, acumulado numa janela de tempo (ex: 1 hora).

**Como funciona:**

Cada chamada ao modelo retorna `usage.input_tokens` e `usage.output_tokens`. Com a tabela de preços da Anthropic, calcula-se `cost_usd`:

```
cost_usd = (input_tokens * price_input_per_1M / 1_000_000) 
         + (output_tokens * price_output_per_1M / 1_000_000)
```

O custo é somado na tabela `cost_ledger` por `agent_card_id`. Antes de cada dispatch, verifica se o card atingiu seu budget:

```
SELECT SUM(cost_usd) FROM cost_ledger
  WHERE agent_card_id = ? 
    AND ts > (unixepoch('now') - 3600) * 1000
```

Se `SUM > budget_usd` → 429.

**Configuração default recomendada:**
- `budget_usd` = $0.50/hora por card (razoável para uso intenso de desenvolvimento)
- `budget_usd` para Chief = $2.00/hora (ele orquestra broadcasts, tem mais latitude)
- Reset: janela deslizante de 1 hora (não reseta à meia-noite — mais justo)

**Prós:**
- Controle real de custo — alinha diretamente ao billing da API Anthropic
- Agnóstico ao modelo: funciona com claude-3-5-haiku (barato) e claude-3-7-sonnet (caro) sem ajuste de configuração
- Permite orçamentos diferenciados por card (Chief, especialistas, agentes genéricos)
- Audit trail financeiro embutido na tabela `cost_ledger`

**Contras:**
- Requer conhecer o preço por token de cada modelo — tabela de preços precisa ser mantida atualizada ou consultada via API
- Latência adicional: query no SQLite antes de cada dispatch (mitigável com cache in-memory do total acumulado, invalidado a cada novo registro)
- Custo de `kind='terminal'` (PTY via Maestri) é opaco — o token count não é exposto pelo Claude Code CLI, apenas por chamadas diretas ao SDK
- Mais complexo de implementar e testar

**Preços Anthropic (referência 2026-04-14):**

| Modelo | Input ($/1M tokens) | Output ($/1M tokens) |
|--------|--------------------|-----------------------|
| claude-3-5-haiku | $0.80 | $4.00 |
| claude-3-5-sonnet | $3.00 | $15.00 |
| claude-3-7-sonnet | $3.00 | $15.00 |
| claude-opus-4 | $15.00 | $75.00 |

> **Nota:** preços mudam. Implementar como tabela de configuração (`MODEL_PRICES` em `config.ts`), não hardcoded no middleware.

---

### 1.3 Estratégia C — Chief como Aprovador de Broadcasts

Broadcasts (`kind='broadcast'`) são despachos 1→N: uma mensagem do sender vai para múltiplos targets simultaneamente. É o cenário de maior custo potencial — uma única mensagem pode acionar N agentes em paralelo.

**Como funciona:**

Antes de um dispatch com múltiplos targets (ou `connection.kind = 'broadcast'`), o middleware intercepta e aguarda aprovação explícita do Chief:

```
1. Dispatcher detecta: targets.length > 1 OU connection.kind = 'broadcast'
2. Cria BroadcastApprovalRequest com { sender, targets, messagePreview, estimatedCost }
3. Emite WS event: chief.approval_required { requestId, payload }
4. Chief card recebe notificação e exibe card de aprovação na UI
5. Chief aprova (timeout: 30s) → dispatch prossegue
6. Chief rejeita OU timeout → dispatch cancelado com 423 Locked
```

O Chief aqui não é o agente AIOX Yoda — é o card marcado com `is_chief=1` na tabela `agent_cards`. Se não houver Chief no canvas, a lógica de aprovação é ignorada (broadcasts fluem livremente).

**Prós:**
- Controle qualitativo, não apenas quantitativo — o Chief decide se o broadcast faz sentido no contexto
- Aumenta a consciência situacional: Chief sempre sabe o que está sendo distribuído
- Alinha com o papel do Chief como orquestrador central (§3.2b do Plano Mestre)
- Não requer cálculo de custo — é uma decisão humana-like

**Contras:**
- Adiciona latência ao path de broadcast — o dispatch fica bloqueado até aprovação (30s timeout)
- Chief pode ser bottleneck em cenários de alta automação
- Requer novo evento WS e lógica de UI no card Chief
- Aumenta a carga cognitiva do usuário se broadcasts forem frequentes
- Inaplicável para unicast (1→1) — precisa de outra camada para custo

**Quando usar exclusivamente:**
Apenas em broadcasts, nunca em unicast. O custo de uma mensagem unicast raramente justifica aprovação manual.

---

### 1.4 Estratégia D — Combinação das 3 Camadas

As três estratégias não são mutuamente exclusivas — elas cobrem dimensões diferentes do problema:

| Camada | O que controla | Granularidade | Latência |
|--------|---------------|--------------|----------|
| A — Token Bucket | Frequência de mensagens | Por conversa | Zero (in-memory) |
| B — Cost Budget | Custo financeiro real | Por card | ~1ms (SQLite query) |
| C — Chief Approval | Qualidade + broadcasts | Por request | 0-30s (humano) |

**Fluxo com as 3 camadas no middleware:**

```
POST /api/conversations/:id/messages
         │
         ▼
  ┌─ Layer A: Token Bucket ─────────────────────────────────┐
  │  check bucket[conversation_id]                          │
  │  ├─ tokens > 0 → decrement, prosseguir                  │
  │  └─ tokens = 0 → 429 { retryAfter, remaining: 0 }       │
  └──────────────────────────────────────────────────────────┘
         │
         ▼
  ┌─ Layer B: Cost Budget ──────────────────────────────────┐
  │  query cost_ledger WHERE agent_card_id = sender         │
  │  ├─ sum < budget → prosseguir                           │
  │  └─ sum ≥ budget → 429 { reason: 'budget_exceeded' }    │
  └──────────────────────────────────────────────────────────┘
         │
         ▼
  ┌─ Layer C: Chief Approval (só para broadcasts) ──────────┐
  │  if targets.length > 1 OR kind = 'broadcast':           │
  │    ├─ is_chief no canvas? → emitir approval_required    │
  │    │   ├─ aprovado → prosseguir                          │
  │    │   └─ timeout/rejeição → 423                         │
  │    └─ sem Chief no canvas → prosseguir diretamente       │
  └──────────────────────────────────────────────────────────┘
         │
         ▼
  MessageDispatcher.resolveVerdict() → dispatch
```

**Curto-circuito:** as camadas são checadas em ordem. Uma falha em A não checa B ou C, economizando queries desnecessárias.

---

## 2. Schema SQLite

As tabelas a seguir **não duplicam** nenhuma tabela existente nas migrations `001_sala_de_comando_v2.sql` ou `002_pty_fk_and_triggers.sql`. A tabela `audit_log` (definida em `ahsoka-audit-log-pattern.md`) é estendida via eventos de rate-limit, não duplicada.

### 2.1 DDL Completo

```sql
-- ============================================================
-- Migration 003 — Rate Limit & Cost Ledger
-- Story: 9.9 · JOB-041
-- Date:  2026-04-14
-- Schema ref: docs/plans/ahsoka-rate-limit-spec.md §2
-- Depende de: 001_sala_de_comando_v2.sql (agent_cards, conversations)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- ----------------------------------------------------------
-- 1. rate_limit_buckets
--    Estado do token bucket por conversa.
--    Soft ref em conversation_id (não FK): o audit log de uma
--    conversa deletada ainda pode existir — preserva histórico.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  conversation_id    TEXT    NOT NULL PRIMARY KEY,       -- soft ref → conversations.id
  tokens_remaining   INTEGER NOT NULL DEFAULT 5,         -- tokens disponíveis agora
  burst_capacity     INTEGER NOT NULL DEFAULT 5,         -- capacidade máxima do bucket
  refill_rate        INTEGER NOT NULL DEFAULT 1,         -- tokens adicionados por refill
  refill_interval_ms INTEGER NOT NULL DEFAULT 30000,     -- ms entre refills (default: 30s)
  last_refill_at     INTEGER NOT NULL,                   -- Unix timestamp ms do último refill
  created_at         INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

-- Índice para limpeza (DELETE WHERE last_refill_at < cutoff)
CREATE INDEX IF NOT EXISTS idx_rl_bucket_last_refill
  ON rate_limit_buckets(last_refill_at);

-- ----------------------------------------------------------
-- 2. cost_ledger
--    Registro de custo por chamada ao modelo.
--    Soft ref em agent_card_id: card pode ser deletado sem
--    perder o histórico financeiro.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS cost_ledger (
  id             TEXT    NOT NULL PRIMARY KEY,           -- UUID v4
  agent_card_id  TEXT    NOT NULL,                       -- soft ref → agent_cards.id
  conversation_id TEXT   NOT NULL,                       -- soft ref → conversations.id
  message_id     TEXT,                                   -- soft ref → messages.id
  model          TEXT    NOT NULL,                       -- ex: 'claude-3-7-sonnet-20250219'
  tokens_in      INTEGER NOT NULL DEFAULT 0,             -- input tokens consumidos
  tokens_out     INTEGER NOT NULL DEFAULT 0,             -- output tokens gerados
  cost_usd       REAL    NOT NULL DEFAULT 0.0,           -- custo calculado em USD
  ts             INTEGER NOT NULL,                       -- Unix timestamp ms do evento
  user_id        TEXT    NOT NULL DEFAULT 'local'
);

-- Query primária: custo total de um card na janela de 1h
-- SELECT SUM(cost_usd) FROM cost_ledger WHERE agent_card_id = ? AND ts > ?
CREATE INDEX IF NOT EXISTS idx_cost_card_ts
  ON cost_ledger(agent_card_id, ts);

-- Query secundária: custo por conversa (debug/audit)
CREATE INDEX IF NOT EXISTS idx_cost_conv_ts
  ON cost_ledger(conversation_id, ts);

-- Limpeza rolling: DELETE WHERE ts < cutoff
CREATE INDEX IF NOT EXISTS idx_cost_ts
  ON cost_ledger(ts);

-- ----------------------------------------------------------
-- 3. broadcast_approval_requests
--    Requisições de aprovação de broadcast pendentes.
--    Ciclo de vida curto: expiram em 30s e são deletadas.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcast_approval_requests (
  id              TEXT    NOT NULL PRIMARY KEY,          -- UUID v4
  conversation_id TEXT    NOT NULL,                      -- soft ref → conversations.id
  sender_card_id  TEXT    NOT NULL,                      -- soft ref → agent_cards.id
  chief_card_id   TEXT    NOT NULL,                      -- card com is_chief=1 no canvas
  target_card_ids TEXT    NOT NULL,                      -- JSON array de agent_card IDs
  message_preview TEXT    NOT NULL,                      -- primeiros 140 chars (não conteúdo completo)
  estimated_cost_usd REAL,                               -- estimativa (nullable se indisponível)
  status          TEXT    NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','approved','rejected','timed_out')),
  created_at      INTEGER NOT NULL,                      -- Unix timestamp ms
  expires_at      INTEGER NOT NULL,                      -- created_at + 30000
  resolved_at     INTEGER,                               -- quando status mudou de pending
  user_id         TEXT    NOT NULL DEFAULT 'local'
);

-- Limpeza de aprovações expiradas
CREATE INDEX IF NOT EXISTS idx_approval_expires
  ON broadcast_approval_requests(expires_at);

-- Lookup por conversa (para o Chief card carregar aprovações pendentes)
CREATE INDEX IF NOT EXISTS idx_approval_chief_status
  ON broadcast_approval_requests(chief_card_id, status);

-- ============================================================
-- END of migration 003
-- ============================================================
```

### 2.2 Relação com Schema Existente

```
agent_cards (001) ←── cost_ledger.agent_card_id        (soft ref)
conversations (001) ←── rate_limit_buckets.conversation_id (soft ref)
conversations (001) ←── cost_ledger.conversation_id     (soft ref)
messages (001) ←── cost_ledger.message_id               (soft ref)
agent_cards (001) ←── broadcast_approval_requests.chief_card_id (soft ref)

audit_log (002) ← estender com eventos rate.limit.triggered, cost.budget.exceeded
```

**Soft refs em vez de FKs:** seguindo o mesmo padrão da `audit_log` (definido em `ahsoka-audit-log-pattern.md` §3.1), todas as referências são soft. Cards e conversas podem ser deletados sem cascade-deletar o histórico financeiro.

### 2.3 Extensão da `audit_log` — novos eventos

Adicionar ao `CHECK(event IN (...))` da tabela `audit_log`:

```sql
-- Novos valores para o campo event na audit_log:
-- 'rate.limit.triggered'  — bucket esgotado, mensagem bloqueada
-- 'cost.budget.exceeded'  — budget de custo atingido
-- 'broadcast.pending'     — aguardando aprovação do Chief
-- 'broadcast.approved'    — Chief aprovou
-- 'broadcast.rejected'    — Chief rejeitou
-- 'broadcast.timed_out'   — aprovação expirou
```

Esses eventos usam os campos existentes da `audit_log` sem alteração de schema. Campo `reason` carrega o motivo específico. Não é necessária uma migration de ALTER TABLE — adicionar novos valores ao `CHECK` constraint requer recriar a tabela (SQLite não suporta ALTER COLUMN). Implementar via migration de upgrade se necessário, ou usar campo `TEXT` sem constraint explícita para o event (já é possível na definição atual usando `reason` como campo extensível).

---

## 3. Implementação: Middleware no MessageDispatcher

### 3.1 Posição no Pipeline

O rate-limit intercepta **antes** do `resolveVerdict()` do dispatcher, que é o ponto onde a autorização por connection é verificada. A ordem é:

```
[1] Auth check (connection exists?)         ← dispatcher.ts existente
[2] Rate limit: Token Bucket                ← NOVO (rate-limiter.ts)
[3] Rate limit: Cost Budget                 ← NOVO (rate-limiter.ts)
[4] Rate limit: Chief Approval (broadcast)  ← NOVO (rate-limiter.ts)
[5] resolveVerdict() → dispatch             ← dispatcher.ts existente
```

A auth check permanece em [1] porque não faz sentido verificar rate-limit para uma mensagem que seria rejeitada por falta de conexão.

### 3.2 Contrato TypeScript do Middleware

```typescript
// src/server/agent-bus/rate-limiter/rate-limiter.types.ts

/** Resultado de uma verificação de rate-limit */
export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; reason: RateLimitReason; retryAfterMs: number; detail: string };

/** Motivos de bloqueio */
export type RateLimitReason =
  | 'token_bucket_exhausted'   // Estratégia A: bucket vazio
  | 'cost_budget_exceeded'     // Estratégia B: budget atingido
  | 'broadcast_pending'        // Estratégia C: aguardando Chief
  | 'broadcast_rejected'       // Estratégia C: Chief rejeitou
  | 'broadcast_timed_out';     // Estratégia C: aprovação expirou

/** Contexto passado para o middleware */
export interface RateLimitContext {
  conversationId: string;
  senderCardId: string;
  targetCardIds: string[];      // 1 item = unicast; N itens = broadcast
  connectionKind: ConnectionKind;
  messagePreview: string;       // primeiros 140 chars (sem content real)
}

/** Contrato do middleware de rate-limit */
export interface RateLimiter {
  /**
   * Verifica se o dispatch pode prosseguir.
   * Chamado ANTES do resolveVerdict() do dispatcher.
   * Idempotente: não modifica estado — use `consume()` para deduzir tokens.
   */
  check(ctx: RateLimitContext): Promise<RateLimitVerdict>;

  /**
   * Efetua o consumo dos recursos (deduz token do bucket).
   * Chamado APÓS check() retornar { allowed: true } e ANTES do dispatch real.
   * Separado de check() para permitir dry-run em testes.
   */
  consume(ctx: RateLimitContext): Promise<void>;

  /**
   * Registra custo real após dispatch completado.
   * Chamado com os dados de usage retornados pelo SDK do modelo.
   * No-op para kind='terminal' (custo opaco).
   */
  recordCost(params: RecordCostParams): Promise<void>;

  /**
   * Retorna o estado atual do bucket de uma conversa.
   * Usado pela UI para o contador visual (§4).
   */
  getBucketState(conversationId: string): Promise<BucketState>;
}

export interface RecordCostParams {
  agentCardId: string;
  conversationId: string;
  messageId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface BucketState {
  conversationId: string;
  tokensRemaining: number;
  burstCapacity: number;
  refillIntervalMs: number;
  refillsAt: number;     // Unix timestamp ms do próximo refill
}
```

### 3.3 Response 429 com Headers HTTP

O dispatcher deve retornar HTTP 429 com os seguintes headers quando o rate-limit é acionado:

```typescript
// Exemplo de resposta 429 do dispatcher
Response.json(
  {
    error: 'rate_limited',
    reason: 'token_bucket_exhausted',  // ou outro RateLimitReason
    retryAfter: 28,                    // segundos até poder tentar novamente
    remaining: 0,                      // tokens restantes no bucket
    resetAt: 1744656181432,            // Unix timestamp ms do próximo refill
    message: 'Rate limit exceeded for conversation conv_abc123. Bucket refills in 28s.'
  },
  {
    status: 429,
    headers: {
      'Retry-After': '28',
      'X-RateLimit-Limit': '5',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '1744656181',      // Unix timestamp segundos (padrão de mercado)
      'X-RateLimit-Reset-Ms': '1744656181432', // ms (precisão extra para UX)
      'X-RateLimit-Reason': 'token_bucket_exhausted',
    }
  }
)
```

**Para `cost_budget_exceeded`:**
```typescript
headers: {
  'Retry-After': '3600',                    // budget reseta em 1h
  'X-RateLimit-Reason': 'cost_budget_exceeded',
  'X-Cost-Budget-USD': '0.50',             // budget total do card
  'X-Cost-Used-USD': '0.51',               // custo acumulado na janela
  'X-Cost-Window-Seconds': '3600',          // janela de 1h
}
```

**Para `broadcast_pending` (423 Locked, não 429):**
```typescript
Response.json(
  {
    error: 'broadcast_pending',
    requestId: 'req_xyz789',
    message: 'Broadcast is awaiting Chief approval. Timeout in 30s.',
    expiresAt: 1744656211432
  },
  { status: 423 }
)
```

---

## 4. UI Feedback

### 4.1 Badge "Rate Limited" no AgentCard

Quando o ChatNode recebe uma resposta 429 ao enviar mensagem:

```typescript
// No AgentCardData (canvasStore.ts), adicionar:
rateLimitState?: {
  isLimited: boolean;
  reason: RateLimitReason;
  retryAfterMs: number;
  resetAt: number;           // Unix timestamp ms
};
```

**Comportamento visual:**
- Badge vermelho `Rate limited` aparece no header do card (ao lado do status dot)
- Input do chat fica desabilitado com placeholder: `Rate limited — próximo refill em {X}s`
- Countdown decrementando em tempo real (via `setInterval` local)
- Badge desaparece quando `Date.now() >= resetAt` (sem polling — timer local)
- Cor do badge: `rose-500` (alinha com paleta de error do design system §5.3)

### 4.2 Contador Visual na Aresta

Sobre a aresta (edge) do React Flow, exibir o consumo atual do bucket:

```
conv_yoda_luke  [3/5 msgs/min]
```

**Implementação:** o `ConnectionData` (canvasStore.ts) pode ser estendido com:

```typescript
// Extensão de ConnectionData para rate-limit visual
rateLimitSnapshot?: {
  tokensRemaining: number;
  burstCapacity: number;
  updatedAt: number;
};
```

A aresta renderiza o contador em `ConnectionLine.tsx` — estilo sutil (fonte 10px, cor `zinc-400`), visível ao hover. Vermelho quando `tokensRemaining <= 1`.

O snapshot é atualizado pelo WS client quando recebe evento `rate.limit.updated` (novo tipo de evento WS a adicionar ao protocolo §3.4 do Plano Mestre).

### 4.3 Estado no Zustand — onde adicionar `rateLimitState`

O estado de rate-limit não pertence ao `canvasStore` (que armazena topologia) nem ao `conversationsStore` (que armazena mensagens). Pertence a um slice dedicado, ou, pragmaticamente para Story 9.9, como extensão leve do `conversationsStore`:

```typescript
// Adicionar em conversationsStore.ts

/** Estado de rate-limit por conversa */
export interface ConversationRateLimitState {
  isLimited: boolean;
  reason?: RateLimitReason;
  retryAfterMs: number;
  resetAt: number;
  tokensRemaining: number;
  burstCapacity: number;
}

// Adicionar ao ConversationsState:
rateLimits: Record<string, ConversationRateLimitState>;  // conversationId → state

// Adicionar ao ConversationsActions:
setRateLimit: (conversationId: string, state: ConversationRateLimitState) => void;
clearRateLimit: (conversationId: string) => void;
```

**Quando `clearRateLimit` é chamado:**
- Quando o timer local detecta `Date.now() >= resetAt` (ChatNode usa `useEffect` com `setTimeout`)
- Quando uma mensagem é enviada com sucesso após o período de throttle

**Quando `setRateLimit` é chamado:**
- No `catch` do `fetch` da mensagem, ao detectar status 429 na resposta
- Via WS event `rate.limit.triggered` (se o servidor emitir proativamente)

---

## 5. Comparativo de Bibliotecas

### 5.1 Candidatas

Três bibliotecas foram avaliadas para substituir uma implementação custom do token bucket:

| Critério | **p-ratelimit** | **bottleneck** | **rate-limiter-flexible** |
|---------|----------------|---------------|--------------------------|
| **Distributed state** | Não | Não nativo (Redis plugin descontinuado) | Sim — Redis, MongoDB, Memcached, MySQL, PostgreSQL |
| **SQLite backend** | Não | Não | Não nativo, mas implementável via adapter custom |
| **TypeScript types** | Bundled (100%) | `@types/bottleneck` (community) | Bundled (100%) |
| **Bundle size** | ~4KB (minzipped) | ~18KB (minzipped) | ~14KB (minzipped) |
| **Última release** | 2023-06 (inativo) | 2024-01 | 2024-11 (ativo) |
| **Weekly downloads** | ~45k | ~2.1M | ~1.3M |
| **API ergonomia** | Alta — `rateLimitFn(fn)` wrapper | Alta — `schedule()` + `wrap()` | Média — mais verbosa, mais flexível |
| **Algoritmos** | Token bucket fixo | Leaky bucket | Token bucket, Fixed window, Sliding window |
| **Cluster/multi-process** | Não | Via Bottleneck.Group | Sim (múltiplos backends) |
| **Callbacks on throttle** | Sim (`onQueued`) | Sim (`on('queued')`) | Não (retorna Promise reject) |
| **Suporte a SQLite** | Não | Não | Via `RateLimiterMemory` → export state → custom persistence |

### 5.2 Análise Detalhada

**p-ratelimit:**
```typescript
import { pRateLimit } from 'p-ratelimit';
const limit = pRateLimit({ interval: 60_000, rate: 10, concurrency: 1 });
await limit(() => dispatch(message));
```
Simples e elegante, mas inativo desde 2023 e sem SQLite. Descartado.

**bottleneck:**
```typescript
import Bottleneck from 'bottleneck';
const limiter = new Bottleneck({ reservoir: 5, reservoirRefreshAmount: 5, reservoirRefreshInterval: 60_000 });
await limiter.schedule(() => dispatch(message));
```
Popular (2.1M/semana), mas o `reservoir` refaz o bucket inteiro a cada intervalo — sem suporte a refill incremental. Não suporta persistência em SQLite sem código custom significativo.

**rate-limiter-flexible:**
```typescript
import { RateLimiterMemory } from 'rate-limiter-flexible';
const limiter = new RateLimiterMemory({ points: 5, duration: 60 });
try {
  await limiter.consume(conversationId, 1);
} catch (rateLimiterRes) {
  throw new RateLimitError(rateLimiterRes.msBeforeNext);
}
```
Mais verbosa, mas a mais completa: sliding window, múltiplos backends, TypeScript nativo, ativa. Implementar persistência SQLite via `RateLimiterRes` export + `rate_limit_buckets` table é viável.

### 5.3 Recomendação de Biblioteca

Para o escopo atual (single-process, single-user, SQLite), **nenhuma das três** oferece suporte nativo a SQLite com a ergonomia ideal. A recomendação é **implementação custom** com os seguintes argumentos:

1. O token bucket para este caso é ~60 linhas de TypeScript (sem dependência externa)
2. A lógica precisa integrar com a tabela `rate_limit_buckets` já definida no schema
3. `rate-limiter-flexible` é a melhor das três se você preferir usar uma lib — use `RateLimiterMemory` para in-memory e persista o estado na `rate_limit_buckets` via hook pós-consume

Se no futuro o sistema for multi-process (múltiplas instâncias do servidor), migrar para `rate-limiter-flexible` com backend Redis/Memcached.

---

## 6. Recomendação Final

### 6.1 Qual Estratégia Adotar

**Estratégia D — Combinação das 3 camadas**, com as seguintes prioridades de implementação:

| Prioridade | Camada | Motivo |
|-----------|--------|--------|
| **1ª** | A — Token Bucket | Bloqueia o chatbot trivial (agentes respondendo infinitamente uns aos outros). Implementação simples, zero dependência. Entrega 80% do valor de proteção. |
| **2ª** | B — Cost Budget | Adiciona controle financeiro real. Necessário para cenários onde mensagens curtas passam pelo bucket mas o contexto acumulado é massivo. Implementar após A estar estável. |
| **3ª** | C — Chief Approval | Implementar por último. Adiciona UX complexidade e latência. Só vale se o sistema de broadcasts for usado frequentemente. |

### 6.2 Por Quê (dados, não opinião)

O risco documentado no §9 do Plano Mestre é: *"Custo de modelo em chat-only (agentes viram chatterbots)"*. O cenário concreto é:

- Agente A envia `/ask @B` → B responde → B envia `/ask @C` → C responde → C envia `/ask @A` → loop
- O `depth-guard` (max_depth=3) quebra ciclos A→B→A, mas não previne A→B→C→D→E→... em conversas lineares longas
- Sem rate-limit, um agente mal instruído pode gerar 50 mensagens/minuto × $0.01/mensagem = $30/hora por conversa

A Estratégia A interrompe esse loop em no máximo `burst_capacity` mensagens por `refill_interval`. Com defaults `5 msgs / 30s`, o custo máximo em chat-only é:

```
5 msgs/30s × 60s/min = 10 msgs/min
10 msgs/min × $0.01/msg = $0.10/min = $6/hora (worst case)
```

Redução de 5× vs sem rate-limit, com o burst de 5 permitindo interação natural de brainstorm.

### 6.3 Impacto na DX

O que o usuário vê e sente com os defaults recomendados:

- **Conversa normal** (1-2 mensagens trocadas, depois pausa): nunca vê o badge. O bucket tem 5 tokens e refila a cada 30s — para conversas naturais com pausa para leitura, o bucket está sempre cheio.
- **Brainstorm rápido** (5 mensagens em 10 segundos): os 5 tokens são consumidos. 6ª mensagem bloqueada. Badge aparece. Countdown de ~25s. Depois continua.
- **Loop de agentes** (A→B→C→A): bloqueado na 6ª mensagem automática. Chief recebe notificação de rate-limit. Usuário pode ajustar o prompt do agente.
- **Broadcast grande** (1→10 agentes): Chief vê card de aprovação. Aprova → todos os 10 dispatches ocorrem. O budget por card previne que esses 10 virem loops.

### 6.4 Configuração Default Recomendada

| Parâmetro | Default | Descrição |
|-----------|---------|-----------|
| `bucket.burstCapacity` | `5` | Tokens iniciais e máximos por conversa |
| `bucket.refillRate` | `1` | Tokens reposto por intervalo |
| `bucket.refillIntervalMs` | `30_000` | 30 segundos entre refills |
| `budget.defaultUsd` | `0.50` | Budget padrão por card por hora |
| `budget.chiefMultiplier` | `4.0` | Chief tem `$2.00/hora` (4× padrão) |
| `budget.windowMs` | `3_600_000` | Janela deslizante de 1 hora |
| `broadcast.approvalTimeoutMs` | `30_000` | Timeout de aprovação do Chief |
| `broadcast.minTargetsForApproval` | `3` | Só exige aprovação para broadcasts com 3+ targets |
| `retention.bucketInactiveDays` | `1` | Deletar buckets inativos há mais de 1 dia |
| `retention.ledgerDays` | `30` | Deletar cost_ledger com mais de 30 dias |

### 6.5 O Que NÃO Fazer — Anti-Patterns

**1. Rate-limit global por IP ou user_id.**
O sistema é single-user local. Rate-limit por `user_id='local'` bloquearia o usuário inteiro. O limite correto é por `conversation_id` (Estratégia A) e por `agent_card_id` (Estratégia B).

**2. Bloquear no middleware de forma síncrona com `sleep()`.**
Nunca usar `await sleep(retryAfterMs)` no middleware — isso trava o event loop do servidor Node.js. Retornar 429 imediatamente e deixar o cliente gerenciar o retry.

**3. Chief Approval para unicast.**
Unicast (1→1) nunca deve exigir aprovação. A latência de aprovação manual destrói a fluidez do chat normal. Chief Approval é exclusivo para broadcasts 1→N com N≥3.

**4. Resetar bucket ao trocar de conversa.**
Cada `conversation_id` tem seu bucket independente. Trocar de conversa na UI não reseta o bucket da conversa anterior — estado persiste até o `refillIntervalMs` natural.

**5. Usar `fixed_window` em vez de token bucket.**
Fixed window cria o "thundering herd" problem: todos os agentes que atingiram o limite na janela anterior disparam simultaneamente na virada. Token bucket distribui naturalmente via refill incremental.

**6. Calcular custo do modelo hardcoded.**
Os preços da Anthropic mudam. Nunca: `const COST = 0.003`. Sempre: `MODEL_PRICES[model] ?? DEFAULT_PRICE` com a tabela de preços em configuração externa (`config.ts` ou env var).

**7. Logar o conteúdo da mensagem no audit event de rate-limit.**
Seguindo o princípio da `audit_log` (ahsoka-audit-log-pattern.md §5), eventos de rate-limit registram apenas `conversationId`, `senderCardId`, `reason`, `tokensRemaining` — nunca o texto da mensagem bloqueada.

---

## Quick Reference

| Parâmetro | Default | Override via |
|-----------|---------|-------------|
| Token bucket capacity | 5 msgs | `RATE_LIMIT_BURST_CAPACITY` env |
| Refill rate | 1 token/30s | `RATE_LIMIT_REFILL_INTERVAL_MS` env |
| Cost budget (padrão) | $0.50/hora | `RATE_LIMIT_BUDGET_USD` env |
| Cost budget (Chief) | $2.00/hora | `RATE_LIMIT_CHIEF_BUDGET_USD` env |
| Budget window | 1 hora (sliding) | `RATE_LIMIT_BUDGET_WINDOW_MS` env |
| Broadcast approval threshold | 3+ targets | `RATE_LIMIT_BROADCAST_MIN_TARGETS` env |
| Broadcast approval timeout | 30s | `RATE_LIMIT_BROADCAST_TIMEOUT_MS` env |
| Migration file | `003_rate_limit.sql` | — |
| Middleware position | Pós-auth, pré-resolveVerdict | — |
| HTTP status (bucket/budget) | `429 Too Many Requests` | — |
| HTTP status (broadcast pending) | `423 Locked` | — |
| Zustand slice | extensão de `conversationsStore` | — |
| Libs recomendadas | custom (60 linhas) | `rate-limiter-flexible` se multi-process |

---

*Research: JOB-041 | Consumidor: Han Solo (Story 9.9) | Branch: feature/sala-comando-v2*

— Ahsoka, the truth is out there 🔍⚔️
