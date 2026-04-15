# Ahsoka: Agent Bus Dispatcher — Test Patterns

> **Contexto:** Research para Story 9.9 (Guard-rails: depth limit, lock per-node, WS backpressure, purge agressivo).
> Consumidor primário: **Mace Windu (QA)**.
> Dispatcher implementado na Story 9.3 em `src/server/agent-bus/dispatcher.ts`.
>
> **Test framework do projeto:** Node.js native `node:test` + `node:assert/strict` + `tsx --test`.
> Nenhuma dependência extra de Jest/Vitest — mantém paridade com `tests/queries.test.ts`.

---

## Índice

1. [Test Pyramid para Dispatchers](#1-test-pyramid-para-dispatchers)
2. [Unit Tests — Verdict Table](#2-unit-tests--verdict-table)
3. [Integration Tests — Race Conditions](#3-integration-tests--race-conditions)
4. [Property-Based Tests](#4-property-based-tests)
5. [Fuzzing — Depth-Guard Invariant](#5-fuzzing--depth-guard-invariant)
6. [Referências Reais com Snippets](#6-referências-reais-com-snippets)
7. [Test Coverage Targets](#7-test-coverage-targets)

---

## 1. Test Pyramid para Dispatchers

```
                     ┌──────────────┐
                     │   E2E / WS   │  ~5%  (Playwright ou WS client manual)
                    /│  flow completo│\
                   / └──────────────┘ \
                  /  ┌──────────────┐  \
                 /   │ Integration  │   \
                /    │ Race+concurr.│    \
               /     └──────────────┘    \
              /      ┌──────────────┐     \
             /       │  Property-   │      \
            /        │  Based +Fuzz │       \
           /         └──────────────┘        \
          /──────────────────────────────────\
         │           Unit Tests               │  ~60%
         │  (verdict table · depth · lock)    │
         └────────────────────────────────────┘
```

| Camada | Quantidade alvo | O que cobre |
|---|---|---|
| Unit | ~50 testes | Verdict engine, depth-guard edge cases, lock state machine |
| Property-based | ~15 propriedades | Invariants do grafo, transitividade do depth limit |
| Integration | ~20 testes | Race conditions, nested ask, timeout do lock |
| Fuzzing | corpus ~500 seeds | Nunca deixa >3 hops passar, nunca deadlock |
| E2E | ~5 flows | Happy-path Chief→Agent→respond WS round-trip |

**Princípio:** o dispatcher é um **estado finito determinístico** — toda entrada tem um resultado previsível. Testes de tabela (truth table) são a espinha dorsal, não testes de integração pesados.

---

## 2. Unit Tests — Verdict Table

### 2.1 Interface do Dispatcher (referência)

O dispatcher deve exportar uma função pura para o verdict engine — desacoplada do efeito colateral (PTY write, WS broadcast). Isso é o que torna o teste de tabela possível:

```typescript
// src/server/agent-bus/dispatcher.ts

export type Verdict = 'authorized' | 'denied';

export interface DispatchContext {
  graph: ConnectionGraph;   // grafo direcionado de arestas permitidas
  senderId: string;         // UUID do agent_card remetente
  targetId: string;         // UUID do agent_card destinatário
  senderIsChief: boolean;   // is_chief=1 no banco
  depth: number;            // hop count atual (0-based)
  visitedSet: Set<string>;  // IDs visitados neste conversation_id
}

export function resolveVerdict(ctx: DispatchContext): Verdict {
  if (ctx.senderIsChief) return 'authorized';              // Chief bypass
  if (ctx.senderId === ctx.targetId) return 'denied';      // self-message
  if (ctx.depth >= 3) return 'denied';                     // depth guard
  if (ctx.visitedSet.has(ctx.targetId)) return 'denied';   // ciclo detectado
  if (!ctx.graph.hasEdge(ctx.senderId, ctx.targetId)) return 'denied';
  return 'authorized';
}

export interface ConnectionGraph {
  hasEdge(from: string, to: string): boolean;
  neighbors(nodeId: string): string[];
}
```

### 2.2 Tabela de Casos — Truth Table

| # | Grafo (arestas) | senderId | targetId | senderIsChief | depth | visitedSet | Expected |
|---|---|---|---|---|---|---|---|
| T01 | A→B | A | B | false | 0 | {} | **authorized** |
| T02 | A→B | B | A | false | 0 | {} | **denied** (aresta não existe em sentido inverso) |
| T03 | A→B, B→A | B | A | false | 1 | {B} | **authorized** (aresta bidirecional explícita) |
| T04 | A→B | A | C | false | 0 | {} | **denied** (A→C não existe) |
| T05 | (vazio) | A | B | false | 0 | {} | **denied** (grafo sem arestas) |
| T06 | A→B | A | A | false | 0 | {} | **denied** (self-message) |
| T07 | A→B | A | B | **true** | 0 | {} | **authorized** (Chief bypass, mesmo sem aresta) |
| T08 | (vazio) | Chief | B | **true** | 0 | {} | **authorized** (Chief bypass no grafo vazio) |
| T09 | A→B→C | A | B | false | 0 | {} | **authorized** |
| T10 | A→B→C | B | C | false | 1 | {A,B} | **authorized** |
| T11 | A→B→C→D | C | D | false | **3** | {A,B,C} | **denied** (depth limit hit) |
| T12 | A→B→C→D | C | D | false | 2 | {A,B,C} | **authorized** (depth=2 ainda ok) |
| T13 | A→B→A | B | A | false | 1 | {A,B} | **denied** (A já visitado — ciclo) |
| T14 | A→B | A | B | false | 0 | {B} | **denied** (target já visitado) |

### 2.3 Implementação do Teste de Tabela

```typescript
// tests/dispatcher-verdict.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVerdict, type Verdict, type DispatchContext } from '../src/server/agent-bus/dispatcher.js';

// ── Grafo de teste simples ──────────────────────────────────────────────────

class TestGraph {
  private edges: Set<string>;

  constructor(edges: Array<[string, string]>) {
    this.edges = new Set(edges.map(([f, t]) => `${f}→${t}`));
  }

  hasEdge(from: string, to: string): boolean {
    return this.edges.has(`${from}→${to}`);
  }

  neighbors(nodeId: string): string[] {
    return [...this.edges]
      .filter(e => e.startsWith(`${nodeId}→`))
      .map(e => e.split('→')[1]);
  }
}

// ── Tabela de casos ─────────────────────────────────────────────────────────

type TestCase = {
  name: string;
  edges: Array<[string, string]>;
  senderId: string;
  targetId: string;
  senderIsChief: boolean;
  depth: number;
  visited: string[];
  expected: Verdict;
};

const TABLE: TestCase[] = [
  { name: 'T01 aresta existe',              edges: [['A','B']],                 senderId:'A', targetId:'B', senderIsChief:false, depth:0, visited:[],        expected:'authorized' },
  { name: 'T02 aresta inversa inexistente', edges: [['A','B']],                 senderId:'B', targetId:'A', senderIsChief:false, depth:0, visited:[],        expected:'denied'     },
  { name: 'T03 bidirecional explícito',     edges: [['A','B'],['B','A']],        senderId:'B', targetId:'A', senderIsChief:false, depth:1, visited:['B'],     expected:'authorized' },
  { name: 'T04 alvo sem aresta',            edges: [['A','B']],                 senderId:'A', targetId:'C', senderIsChief:false, depth:0, visited:[],        expected:'denied'     },
  { name: 'T05 grafo vazio',                edges: [],                          senderId:'A', targetId:'B', senderIsChief:false, depth:0, visited:[],        expected:'denied'     },
  { name: 'T06 self-message',               edges: [['A','B']],                 senderId:'A', targetId:'A', senderIsChief:false, depth:0, visited:[],        expected:'denied'     },
  { name: 'T07 Chief com aresta',           edges: [['A','B']],                 senderId:'A', targetId:'B', senderIsChief:true,  depth:0, visited:[],        expected:'authorized' },
  { name: 'T08 Chief sem aresta',           edges: [],                          senderId:'C', targetId:'B', senderIsChief:true,  depth:0, visited:[],        expected:'authorized' },
  { name: 'T09 hop 1 ok',                  edges: [['A','B'],['B','C']],        senderId:'A', targetId:'B', senderIsChief:false, depth:0, visited:[],        expected:'authorized' },
  { name: 'T10 hop 2 ok',                  edges: [['A','B'],['B','C']],        senderId:'B', targetId:'C', senderIsChief:false, depth:1, visited:['A','B'], expected:'authorized' },
  { name: 'T11 depth=3 bloqueado',          edges: [['C','D']],                 senderId:'C', targetId:'D', senderIsChief:false, depth:3, visited:['A','B','C'], expected:'denied' },
  { name: 'T12 depth=2 permitido',          edges: [['C','D']],                 senderId:'C', targetId:'D', senderIsChief:false, depth:2, visited:['A','B','C'], expected:'authorized' },
  { name: 'T13 ciclo detectado',            edges: [['A','B'],['B','A']],        senderId:'B', targetId:'A', senderIsChief:false, depth:1, visited:['A','B'], expected:'denied'     },
  { name: 'T14 target já visitado',         edges: [['A','B']],                 senderId:'A', targetId:'B', senderIsChief:false, depth:0, visited:['B'],     expected:'denied'     },
];

describe('Dispatcher — Verdict Table', () => {
  for (const tc of TABLE) {
    it(tc.name, () => {
      const ctx: DispatchContext = {
        graph: new TestGraph(tc.edges),
        senderId: tc.senderId,
        targetId: tc.targetId,
        senderIsChief: tc.senderIsChief,
        depth: tc.depth,
        visitedSet: new Set(tc.visited),
      };
      assert.equal(resolveVerdict(ctx), tc.expected, `${tc.name} falhou`);
    });
  }
});
```

### 2.4 Testes de Estado do Lock

O lock de concorrência é uma máquina de estado separada. Testar as transições de estado é mais importante do que testar o I/O:

```typescript
// tests/dispatcher-lock.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AgentLock } from '../src/server/agent-bus/dispatcher.js';

describe('AgentLock — state machine', () => {
  let lock: AgentLock;

  beforeEach(() => {
    lock = new AgentLock();
  });

  it('agente começa idle', () => {
    assert.equal(lock.statusOf('agent-1'), 'idle');
  });

  it('acquire muda status para streaming', () => {
    lock.acquire('agent-1', 'conv-A');
    assert.equal(lock.statusOf('agent-1'), 'streaming');
  });

  it('acquire duplo no mesmo agente retorna false (409 semântica)', () => {
    lock.acquire('agent-1', 'conv-A');
    const second = lock.acquire('agent-1', 'conv-B');
    assert.equal(second, false);
  });

  it('release volta para idle', () => {
    lock.acquire('agent-1', 'conv-A');
    lock.release('agent-1');
    assert.equal(lock.statusOf('agent-1'), 'idle');
  });

  it('release de agente não locked não lança exceção', () => {
    assert.doesNotThrow(() => lock.release('agent-not-locked'));
  });

  it('acquire em agente idle retorna true', () => {
    const ok = lock.acquire('agent-1', 'conv-A');
    assert.equal(ok, true);
  });

  it('agentes distintos têm locks independentes', () => {
    lock.acquire('agent-1', 'conv-A');
    const ok = lock.acquire('agent-2', 'conv-A');
    assert.equal(ok, true);
    assert.equal(lock.statusOf('agent-1'), 'streaming');
    assert.equal(lock.statusOf('agent-2'), 'streaming');
  });
});
```

---

## 3. Integration Tests — Race Conditions

### 3.1 Dois agentes fazem `/ask` simultâneo no mesmo target

**Cenário:** Agent A e Agent B enviam mensagens para o Agent C simultaneamente. Apenas um deve processar por vez — o segundo deve receber 409.

```typescript
// tests/dispatcher-race.test.ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AgentBus } from '../src/server/agent-bus/dispatcher.js';

describe('Race condition — concurrent ask on same target', () => {
  let bus: AgentBus;

  before(() => {
    bus = new AgentBus({
      graph: buildTestGraph([['A','C'], ['B','C']]),
      lockTimeoutMs: 5000,
    });
    bus.register('A', { isChief: false, kind: 'chat' });
    bus.register('B', { isChief: false, kind: 'chat' });
    bus.register('C', { isChief: false, kind: 'chat' });
  });

  it('apenas um ask processa quando dois chegam simultâneos', async () => {
    // Simular target C com latência de 100ms para processar
    bus.mockTargetLatency('C', 100);

    const [result1, result2] = await Promise.all([
      bus.dispatch({ senderId: 'A', targetId: 'C', conversationId: 'conv-1', content: 'hello', depth: 0, visited: new Set() }),
      bus.dispatch({ senderId: 'B', targetId: 'C', conversationId: 'conv-2', content: 'hello', depth: 0, visited: new Set() }),
    ]);

    const statuses = [result1.status, result2.status];
    assert.ok(statuses.includes(200), 'Um deve ter 200');
    assert.ok(statuses.includes(409), 'Um deve ter 409 (locked)');
  });

  it('após o primeiro terminar, o segundo consegue processar', async () => {
    bus.mockTargetLatency('C', 50);

    // Primeiro request
    const r1 = bus.dispatch({ senderId: 'A', targetId: 'C', conversationId: 'conv-3', content: 'first', depth: 0, visited: new Set() });
    await new Promise(res => setTimeout(res, 10)); // Deixa r1 iniciar

    // Agora C está locked — r2 deve receber 409
    const r2 = await bus.dispatch({ senderId: 'B', targetId: 'C', conversationId: 'conv-4', content: 'second', depth: 0, visited: new Set() });
    assert.equal(r2.status, 409);

    // Aguarda r1 terminar
    await r1;
    assert.equal(bus.statusOf('C'), 'idle');

    // Agora r3 deve passar
    const r3 = await bus.dispatch({ senderId: 'B', targetId: 'C', conversationId: 'conv-5', content: 'third', depth: 0, visited: new Set() });
    assert.equal(r3.status, 200);
  });
});
```

### 3.2 Nested Ask — Depth Tracking

**Cenário:** A→B, B→C (ask dentro de um ask). O dispatcher deve rastrear o depth através da chain.

```typescript
describe('Nested ask — depth tracking', () => {
  it('A→B→C passa (depth 0→1→2)', async () => {
    const bus = new AgentBus({ graph: buildTestGraph([['A','B'],['B','C']]) });
    bus.register('A', { isChief: false, kind: 'chat' });
    bus.register('B', { isChief: false, kind: 'chat', onMessage: async (msg, ctx) => {
      // B recebe de A e re-despacha para C
      return bus.dispatch({ senderId: 'B', targetId: 'C', conversationId: ctx.conversationId, content: 'cascata', depth: ctx.depth + 1, visited: new Set([...ctx.visited, 'B']) });
    }});
    bus.register('C', { isChief: false, kind: 'chat' });

    const result = await bus.dispatch({ senderId: 'A', targetId: 'B', conversationId: 'conv-nested', content: 'start', depth: 0, visited: new Set() });
    assert.equal(result.status, 200);
    assert.equal(result.cascadeDepth, 2); // A(0)→B(1)→C(2)
  });

  it('A→B→C→D bloqueado no 4º hop (depth=3)', async () => {
    const bus = new AgentBus({ graph: buildTestGraph([['A','B'],['B','C'],['C','D']]) });
    // ... setup similar
    // C tenta despachar D com depth=3
    const result = await bus.dispatch({ senderId: 'C', targetId: 'D', conversationId: 'conv-deep', content: 'too deep', depth: 3, visited: new Set(['A','B','C']) });
    assert.equal(result.status, 409);
    assert.equal(result.reason, 'depth_limit_exceeded');
  });
});
```

### 3.3 Timeout de Lock — Fake Timers com Node:test

O Node.js native test runner não tem fake timers built-in como Jest, mas você pode usar `--experimental-test-coverage` + mock de `Date.now`:

```typescript
// tests/dispatcher-lock-timeout.test.ts
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { AgentLock } from '../src/server/agent-bus/dispatcher.js';

describe('AgentLock — timeout', () => {
  it('lock expira após lockTimeoutMs se não for released', async () => {
    const TIMEOUT_MS = 200;
    const lock = new AgentLock({ lockTimeoutMs: TIMEOUT_MS });

    lock.acquire('agent-slow', 'conv-A');
    assert.equal(lock.statusOf('agent-slow'), 'streaming');

    // Aguardar expiração natural (teste real — sem fake timer)
    await new Promise(res => setTimeout(res, TIMEOUT_MS + 50));

    assert.equal(lock.statusOf('agent-slow'), 'idle', 'lock deve expirar automaticamente');
  });

  it('lock expirado emite evento lockExpired', async () => {
    const TIMEOUT_MS = 100;
    const lock = new AgentLock({ lockTimeoutMs: TIMEOUT_MS });
    const events: string[] = [];

    lock.on('lockExpired', (agentId: string) => events.push(agentId));
    lock.acquire('agent-zombie', 'conv-B');

    await new Promise(res => setTimeout(res, TIMEOUT_MS + 30));

    assert.deepEqual(events, ['agent-zombie']);
  });
});
```

**Nota:** Para timeouts longos em produção, extraia a lógica de expiração em uma função pura testável separada — não misture `setTimeout` no coração do lock. O `setInterval` do reaper é testado pelo evento, não pelo wall-clock.

---

## 4. Property-Based Tests

O projeto usa `node:test` nativo. Para property-based testing, adicione `fast-check` como dev dependency (não tem impacto em runtime):

```bash
npm install --save-dev fast-check
```

### 4.1 Invariant: Sem aresta → sempre denied

Para **todo** grafo válido com N nodes e M arestas, se a aresta A→B não existe no grafo, o verdict **deve** ser `denied`.

```typescript
// tests/dispatcher-properties.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { resolveVerdict } from '../src/server/agent-bus/dispatcher.js';
import { TestGraph, randomGraphArbitrary } from './helpers/graph-generators.js';

describe('Property-Based — Dispatcher Invariants', () => {

  it('P01: sem aresta A→B sempre retorna denied', () => {
    fc.assert(
      fc.property(
        randomGraphArbitrary({ minNodes: 2, maxNodes: 10, maxEdges: 15 }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        (graphData, senderIdx, targetIdx) => {
          const { nodes, edges } = graphData;
          if (nodes.length < 2) return true; // pré-condição: mínimo 2 nodes

          const sender = nodes[senderIdx % nodes.length];
          const target = nodes[targetIdx % nodes.length];
          if (sender === target) return true; // self-message já é denied por outra regra

          const graph = new TestGraph(edges);

          // Se a aresta não existe, verdict deve ser denied
          if (!graph.hasEdge(sender, target)) {
            const verdict = resolveVerdict({
              graph,
              senderId: sender,
              targetId: target,
              senderIsChief: false,
              depth: 0,
              visitedSet: new Set(),
            });
            return verdict === 'denied';
          }

          return true; // se aresta existe, não testamos aqui (P02 cobre)
        }
      ),
      { numRuns: 500 }
    );
  });

  it('P02: aresta A→B com depth<3 e sem ciclo sempre retorna authorized', () => {
    fc.assert(
      fc.property(
        randomGraphArbitrary({ minNodes: 2, maxNodes: 8, maxEdges: 10 }),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 2 }), // depth 0-2
        (graphData, senderIdx, targetIdx, depth) => {
          const { nodes, edges } = graphData;
          if (nodes.length < 2) return true;

          const sender = nodes[senderIdx % nodes.length];
          const target = nodes[targetIdx % nodes.length];
          if (sender === target) return true;

          const graph = new TestGraph(edges);
          if (!graph.hasEdge(sender, target)) return true;

          const verdict = resolveVerdict({
            graph,
            senderId: sender,
            targetId: target,
            senderIsChief: false,
            depth,
            visitedSet: new Set(), // sem visitados = sem ciclo
          });

          return verdict === 'authorized';
        }
      ),
      { numRuns: 300 }
    );
  });

  it('P03: depth>=3 sempre retorna denied (independente do grafo)', () => {
    fc.assert(
      fc.property(
        randomGraphArbitrary({ minNodes: 2, maxNodes: 10, maxEdges: 20 }),
        fc.integer({ min: 3, max: 100 }), // depth >= 3
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        (graphData, depth, senderIdx, targetIdx) => {
          const { nodes, edges } = graphData;
          if (nodes.length < 2) return true;

          const sender = nodes[senderIdx % nodes.length];
          const target = nodes[targetIdx % nodes.length];
          if (sender === target) return true;

          const graph = new TestGraph(edges);
          const verdict = resolveVerdict({
            graph,
            senderId: sender,
            targetId: target,
            senderIsChief: false,
            depth,
            visitedSet: new Set(),
          });

          return verdict === 'denied';
        }
      ),
      { numRuns: 300 }
    );
  });

  it('P04: Chief sempre recebe authorized (grafo qualquer, depth qualquer)', () => {
    fc.assert(
      fc.property(
        randomGraphArbitrary({ minNodes: 0, maxNodes: 10, maxEdges: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0, max: 100 }),
        (graphData, senderId, targetId, depth) => {
          if (senderId === targetId) return true;

          const graph = new TestGraph(graphData.edges);
          const verdict = resolveVerdict({
            graph,
            senderId,
            targetId,
            senderIsChief: true, // Chief bypass
            depth,
            visitedSet: new Set(),
          });

          return verdict === 'authorized';
        }
      ),
      { numRuns: 200 }
    );
  });

  it('P05: visitedSet contendo targetId sempre retorna denied', () => {
    fc.assert(
      fc.property(
        randomGraphArbitrary({ minNodes: 2, maxNodes: 10, maxEdges: 15 }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        (graphData, senderIdx, targetIdx) => {
          const { nodes, edges } = graphData;
          if (nodes.length < 2) return true;

          const sender = nodes[senderIdx % nodes.length];
          const target = nodes[targetIdx % nodes.length];
          if (sender === target) return true;

          const graph = new TestGraph(edges);
          const verdict = resolveVerdict({
            graph,
            senderId: sender,
            targetId: target,
            senderIsChief: false,
            depth: 0,
            visitedSet: new Set([target]), // target já visitado = ciclo
          });

          return verdict === 'denied';
        }
      ),
      { numRuns: 300 }
    );
  });
});
```

### 4.2 Graph Generator Helpers

```typescript
// tests/helpers/graph-generators.ts
import * as fc from 'fast-check';

export interface GraphData {
  nodes: string[];
  edges: Array<[string, string]>;
}

export function randomGraphArbitrary(opts: {
  minNodes?: number;
  maxNodes?: number;
  maxEdges?: number;
}): fc.Arbitrary<GraphData> {
  const { minNodes = 0, maxNodes = 10, maxEdges = 20 } = opts;

  return fc
    .integer({ min: minNodes, max: maxNodes })
    .chain(nodeCount => {
      const nodes = Array.from({ length: nodeCount }, (_, i) => `node-${i}`);

      // Gera arestas aleatórias sem auto-loops
      const possibleEdges: Array<[string, string]> = [];
      for (const a of nodes) {
        for (const b of nodes) {
          if (a !== b) possibleEdges.push([a, b]);
        }
      }

      const edgeCount = Math.min(maxEdges, possibleEdges.length);
      return fc
        .shuffledSubarray(possibleEdges, { minLength: 0, maxLength: edgeCount })
        .map(edges => ({ nodes, edges }));
    });
}

export class TestGraph {
  private edgeSet: Set<string>;

  constructor(edges: Array<[string, string]>) {
    this.edgeSet = new Set(edges.map(([a, b]) => `${a}→${b}`));
  }

  hasEdge(from: string, to: string): boolean {
    return this.edgeSet.has(`${from}→${to}`);
  }

  neighbors(nodeId: string): string[] {
    return [...this.edgeSet]
      .filter(e => e.startsWith(`${nodeId}→`))
      .map(e => e.split('→')[1]);
  }
}
```

---

## 5. Fuzzing — Depth-Guard Invariant

### 5.1 Objetivo do Fuzzing

O depth-guard é um invariant de segurança crítico: **o dispatcher NUNCA deve deixar passar uma mensagem que já está no hop 3 ou além**. Fuzzing injeta inputs maliciosos/inesperados para tentar violar esse invariant.

### 5.2 Corpus de Seeds

```typescript
// tests/fuzzing/dispatcher-fuzz.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVerdict } from '../../src/server/agent-bus/dispatcher.js';
import { TestGraph } from '../helpers/graph-generators.js';

/**
 * Corpus de inputs fuzz: combinações que poderiam confundir o depth-guard.
 * Cada entry: [description, senderId, targetId, depth, visitedSet, senderIsChief]
 */
const FUZZ_CORPUS: Array<{
  desc: string;
  senderId: string;
  targetId: string;
  depth: number;
  visited: string[];
  isChief: boolean;
  edges: Array<[string, string]>;
  mustNotPass: boolean; // true = invariant requer 'denied'
}> = [
  // Injeção de depth negativo (edge case de deserialização)
  { desc: 'depth negativo', senderId: 'A', targetId: 'B', depth: -1, visited: [], isChief: false, edges: [['A','B']], mustNotPass: false },

  // Depth exatamente 3 (boundary — deve bloquear)
  { desc: 'depth=3 boundary', senderId: 'A', targetId: 'B', depth: 3, visited: [], isChief: false, edges: [['A','B']], mustNotPass: true },

  // Depth muito alto (overflow tentativa)
  { desc: 'depth=999', senderId: 'A', targetId: 'B', depth: 999, visited: [], isChief: false, edges: [['A','B']], mustNotPass: true },

  // IDs com caracteres especiais
  { desc: 'UUID com hifens', senderId: 'a1b2-c3d4', targetId: 'e5f6-g7h8', depth: 0, visited: [], isChief: false, edges: [['a1b2-c3d4','e5f6-g7h8']], mustNotPass: false },

  // ID vazio
  { desc: 'senderId vazio', senderId: '', targetId: 'B', depth: 0, visited: [], isChief: false, edges: [['','B']], mustNotPass: false },

  // visitedSet enorme (stress de memória)
  { desc: 'visited set com 1000 entries', senderId: 'A', targetId: 'B', depth: 2,
    visited: Array.from({length: 1000}, (_, i) => `node-${i}`),
    isChief: false, edges: [['A','B']], mustNotPass: false },

  // Target no visited set mesmo com depth<3
  { desc: 'target no visited mesmo depth=1', senderId: 'A', targetId: 'B', depth: 1, visited: ['B'], isChief: false, edges: [['A','B']], mustNotPass: true },

  // Chief com depth=999 (bypass deve prevalecer)
  { desc: 'Chief bypass depth=999', senderId: 'Chief', targetId: 'B', depth: 999, visited: [], isChief: true, edges: [], mustNotPass: false },

  // Grafo com centenas de arestas (stress do hasEdge)
  { desc: 'grafo denso 50 nodes', senderId: 'node-0', targetId: 'node-49', depth: 0, visited: [],
    isChief: false,
    edges: Array.from({length: 50}, (_, i) => Array.from({length: 50}, (_, j) => i !== j ? [`node-${i}`, `node-${j}`] as [string,string] : null).filter(Boolean) as Array<[string,string]>).flat(),
    mustNotPass: false },
];

describe('Fuzzing — Depth-Guard Invariant', () => {
  for (const seed of FUZZ_CORPUS) {
    it(`fuzz: ${seed.desc}`, () => {
      const graph = new TestGraph(seed.edges);
      let verdict: string;

      // O sistema NUNCA deve lançar exceção — inputs maliciosos são rejected, não crashed
      assert.doesNotThrow(() => {
        verdict = resolveVerdict({
          graph,
          senderId: seed.senderId,
          targetId: seed.targetId,
          senderIsChief: seed.isChief,
          depth: seed.depth,
          visitedSet: new Set(seed.visited),
        });
      }, `Exceção inesperada para seed: ${seed.desc}`);

      // Invariant crítico: se mustNotPass=true, verdict DEVE ser 'denied'
      if (seed.mustNotPass) {
        assert.equal(verdict!, 'denied', `Depth-guard violado para seed: ${seed.desc}`);
      }
    });
  }
});
```

### 5.3 Deadlock Detection

O dispatcher não deve travar. Testar que operações concorrentes sempre terminam em tempo finito:

```typescript
describe('Fuzzing — Deadlock Detection', () => {
  it('N dispatches concorrentes terminam em tempo finito', async () => {
    const bus = new AgentBus({ graph: buildFullMesh(['A','B','C','D']), lockTimeoutMs: 500 });
    ['A','B','C','D'].forEach(id => bus.register(id, { isChief: false, kind: 'chat' }));

    const N = 20;
    const TIMEOUT_MS = 5000; // 5 segundos é mais do que suficiente

    const dispatches = Array.from({ length: N }, (_, i) => {
      const agents = ['A','B','C','D'];
      const sender = agents[i % 4];
      const target = agents[(i + 1) % 4];
      return bus.dispatch({
        senderId: sender,
        targetId: target,
        conversationId: `conv-fuzz-${i}`,
        content: `fuzz-message-${i}`,
        depth: 0,
        visited: new Set(),
      });
    });

    // Promise.race com timeout — se passar, não há deadlock
    const allDone = Promise.all(dispatches);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DEADLOCK DETECTADO: operações não terminaram')), TIMEOUT_MS)
    );

    await assert.doesNotReject(Promise.race([allDone, timeout]));
  });
});

function buildFullMesh(nodes: string[]): ConnectionGraph {
  const edges: Array<[string, string]> = [];
  for (const a of nodes) {
    for (const b of nodes) {
      if (a !== b) edges.push([a, b]);
    }
  }
  return new TestGraph(edges);
}
```

---

## 6. Referências Reais com Snippets

### 6.1 gRPC Interceptor Chain Testing

O dispatcher do Ahsoka é análogo a um **gRPC interceptor** — uma cadeia de validações antes de encaminhar a chamada. O padrão de teste de interceptors em gRPC é: testar cada interceptor isolado com um `next()` mockado.

**Referência:** [grpc/grpc-node](https://github.com/grpc/grpc-node/tree/master/test/interceptors)

```typescript
// Padrão de teste de interceptor gRPC — adaptado para o dispatcher

type NextFn = (ctx: DispatchContext) => Promise<DispatchResult>;

interface Interceptor {
  name: string;
  intercept(ctx: DispatchContext, next: NextFn): Promise<DispatchResult>;
}

// Interceptor de autorização (análogo ao AuthInterceptor do gRPC)
const authInterceptor: Interceptor = {
  name: 'auth',
  intercept(ctx, next) {
    if (!ctx.graph.hasEdge(ctx.senderId, ctx.targetId) && !ctx.senderIsChief) {
      return Promise.resolve({ status: 403, reason: 'no_connection' });
    }
    return next(ctx);
  },
};

// Interceptor de depth-guard
const depthInterceptor: Interceptor = {
  name: 'depth-guard',
  intercept(ctx, next) {
    if (ctx.depth >= 3) {
      return Promise.resolve({ status: 409, reason: 'depth_limit_exceeded' });
    }
    if (ctx.visitedSet.has(ctx.targetId)) {
      return Promise.resolve({ status: 409, reason: 'cycle_detected' });
    }
    return next({ ...ctx, visitedSet: new Set([...ctx.visitedSet, ctx.senderId]) });
  },
};

// TESTE: cada interceptor isolado com next() mockado
it('authInterceptor bloqueia quando aresta inexiste', async () => {
  const mockNext = mock.fn(async () => ({ status: 200 }));
  const result = await authInterceptor.intercept({
    graph: new TestGraph([]),
    senderId: 'A', targetId: 'B',
    senderIsChief: false, depth: 0, visitedSet: new Set(),
  }, mockNext);

  assert.equal(result.status, 403);
  assert.equal(mockNext.mock.callCount(), 0, 'next() não deve ser chamado quando denied');
});

it('authInterceptor passa para next quando autorizado', async () => {
  const mockNext = mock.fn(async () => ({ status: 200 }));
  await authInterceptor.intercept({
    graph: new TestGraph([['A','B']]),
    senderId: 'A', targetId: 'B',
    senderIsChief: false, depth: 0, visitedSet: new Set(),
  }, mockNext);

  assert.equal(mockNext.mock.callCount(), 1, 'next() deve ser chamado uma vez');
});

// TESTE: chain completa (composição de interceptors)
function buildChain(interceptors: Interceptor[], finalHandler: NextFn): NextFn {
  return interceptors.reduceRight<NextFn>(
    (next, interceptor) => (ctx) => interceptor.intercept(ctx, next),
    finalHandler
  );
}

it('chain completa executa auth → depth → handler', async () => {
  const log: string[] = [];
  const handler: NextFn = async (ctx) => { log.push('handler'); return { status: 200 }; };
  const chain = buildChain([authInterceptor, depthInterceptor], handler);

  await chain({
    graph: new TestGraph([['A','B']]),
    senderId: 'A', targetId: 'B',
    senderIsChief: false, depth: 0, visitedSet: new Set(),
  });

  assert.deepEqual(log, ['handler']);
});
```

**Por que é relevante:** O padrão de interceptor chain garante que cada guard seja testável isoladamente. Se o dispatcher for implementado como chain (auth → depth → lock → dispatch), cada interceptor tem sua truth table própria, e o compose é testado por integração.

---

### 6.2 Temporal Workflow Testing — Activity Routing e Retry Logic

O dispatcher com lock por agente é análogo a um **Temporal workflow** com `mutex` de atividade: apenas uma atividade por worker de cada vez. O padrão de teste do Temporal é usar `TestWorkflowEnvironment` para testar sem o servidor real.

**Referência:** [temporalio/sdk-typescript/packages/test](https://github.com/temporalio/sdk-typescript/tree/main/packages/test/src)

```typescript
// Padrão Temporal adaptado — test environment para o AgentBus

// Em Temporal, você testa o routing de atividades assim:
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

// O equivalente no nosso dispatcher:
// Não usamos Temporal, mas o padrão de "test environment" é o mesmo

class AgentBusTestEnvironment {
  private bus: AgentBus;
  private processingLog: Array<{ agentId: string; convId: string; timestamp: number }> = [];

  constructor(graph: ConnectionGraph) {
    this.bus = new AgentBus({
      graph,
      lockTimeoutMs: 10_000,
      onDispatch: (agentId, convId) => {
        this.processingLog.push({ agentId, convId, timestamp: Date.now() });
      },
    });
  }

  async dispatch(params: DispatchParams): Promise<DispatchResult> {
    return this.bus.dispatch(params);
  }

  getLog() { return this.processingLog; }
  cleanup() { this.bus.destroy(); }
}

// Teste: ordering garantido (análogo ao test de mutex em Temporal)
it('Temporal-style: garante ordering sequencial de atividades por agente', async () => {
  const env = new AgentBusTestEnvironment(
    new TestGraph([['A','B'], ['C','B']])
  );

  // Simular B com 50ms de processamento
  env.bus.register('B', { kind: 'chat', latencyMs: 50 });

  const start = Date.now();

  // Dispatch sequencial esperado mesmo com sends simultâneos
  await Promise.allSettled([
    env.dispatch({ senderId: 'A', targetId: 'B', conversationId: 'c1', content: '1', depth: 0, visited: new Set() }),
    env.dispatch({ senderId: 'C', targetId: 'B', conversationId: 'c2', content: '2', depth: 0, visited: new Set() }),
  ]);

  const log = env.getLog().filter(e => e.agentId === 'B');

  // Se ordering é garantido, as timestamps devem ser pelo menos 50ms apart
  if (log.length === 2) {
    const gap = Math.abs(log[1].timestamp - log[0].timestamp);
    assert.ok(gap >= 45, `Gap esperado ≥50ms, got ${gap}ms`); // 5ms de margem
  } else {
    // Uma delas foi rejeitada (409) — também é comportamento correto
    assert.equal(log.length, 1);
  }

  env.cleanup();
});
```

**Por que é relevante:** A análise de retry logic do Temporal é diretamente aplicável ao comportamento de enfileiramento vs. rejeição 409 do dispatcher. O padrão de `TestWorkflowEnvironment` inspira o `AgentBusTestEnvironment` — um wrapper de teste que adiciona observabilidade sem mudar a implementação.

---

### 6.3 Apache Camel — Message Router Testing

O dispatcher com connection graph é análogo ao **Content-Based Router** do Apache Camel, onde cada mensagem é encaminhada baseada em predicados. O padrão de teste do Camel usa `CamelTestSupport` com rotas definidas por DSL.

**Referência:** [apache/camel — RouterTest](https://github.com/apache/camel/blob/main/core/camel-core/src/test/java/org/apache/camel/processor/ChoiceTest.java)

```typescript
// Equivalente TypeScript ao padrão Camel Choice/Router

// Em Camel:
// from("direct:start")
//   .choice()
//     .when(header("target").isEqualTo("B")).to("direct:agentB")
//     .when(header("target").isEqualTo("C")).to("direct:agentC")
//     .otherwise().to("direct:denied")

// No nosso dispatcher — router puro:
type RouteResult = { destination: string } | { error: string; code: number };

function routeMessage(
  ctx: DispatchContext
): RouteResult {
  const verdict = resolveVerdict(ctx);
  if (verdict === 'denied') return { error: 'unauthorized', code: 403 };
  return { destination: ctx.targetId };
}

// TESTE: cada "when" clause do router
describe('Router — Camel-style predicate tests', () => {
  it('choice: aresta válida → roteia para target correto', () => {
    const result = routeMessage({
      graph: new TestGraph([['A','B']]),
      senderId: 'A', targetId: 'B',
      senderIsChief: false, depth: 0, visitedSet: new Set(),
    });
    assert.deepEqual(result, { destination: 'B' });
  });

  it('choice: sem aresta → roteia para denied', () => {
    const result = routeMessage({
      graph: new TestGraph([]),
      senderId: 'A', targetId: 'B',
      senderIsChief: false, depth: 0, visitedSet: new Set(),
    });
    assert.deepEqual(result, { error: 'unauthorized', code: 403 });
  });

  it('choice: Chief bypassa todos os predicados → roteia para target', () => {
    const result = routeMessage({
      graph: new TestGraph([]), // grafo vazio
      senderId: 'Chief', targetId: 'Any',
      senderIsChief: true, depth: 99, visitedSet: new Set(), // depth alto ignorado
    });
    // Chief bypass: mesmo com grafo vazio e depth alto, roteia
    assert.deepEqual(result, { destination: 'Any' });
  });

  it('choice: depth limite → roteia para denied mesmo com aresta válida', () => {
    const result = routeMessage({
      graph: new TestGraph([['A','B']]),
      senderId: 'A', targetId: 'B',
      senderIsChief: false, depth: 3, visitedSet: new Set(),
    });
    assert.deepEqual(result, { error: 'unauthorized', code: 403 });
  });
});
```

**Por que é relevante:** O Camel Content-Based Router é o padrão canônico para testar predicados de roteamento. A estrutura "when/otherwise" mapeia diretamente para a truth table do verdict engine — cada `when` clause é um caso de teste unitário.

---

## 7. Test Coverage Targets

### 7.1 Métricas Relevantes para um Dispatcher

Dispatchers têm um perfil de coverage diferente de código CRUD: a **branch coverage** importa mais do que line coverage, porque o código é denso em condicionais de segurança.

| Métrica | Target | Justificativa |
|---|---|---|
| **Line Coverage** | ≥ 85% | Baseline aceitável |
| **Branch Coverage** | ≥ 95% | Cada `if` de segurança DEVE ser testado nos dois lados |
| **Function Coverage** | 100% | Funções não testadas em um dispatcher são riscos de segurança |
| **Statement Coverage** | ≥ 90% | Derivado de branch + line |

### 7.2 Branch Coverage — Verdict Engine

O `resolveVerdict` tem exatamente **5 branches**. Todos devem ser cobertos:

```
resolveVerdict branches:
├── [1] senderIsChief === true    → authorized   (T07, T08, P04)
├── [2] senderId === targetId     → denied       (T06)
├── [3] depth >= 3                → denied       (T11, P03)
├── [4] visitedSet.has(targetId)  → denied       (T13, T14, P05)
└── [5] !graph.hasEdge(A→B)       → denied       (T02, T04, T05, P01)
     └── [else]                   → authorized   (T01, T09, T10, T12)
```

Para verificar com o runner nativo do Node.js:

```bash
# Node 22+ tem coverage nativo
node --experimental-test-coverage --test-reporter=tap tests/dispatcher-verdict.test.ts | tap-parser
```

Para output mais detalhado (instalar `c8`):

```bash
npm install --save-dev c8
npx c8 --include='src/server/agent-bus/dispatcher.ts' tsx --test tests/dispatcher-*.test.ts
```

Target de saída esperada:
```
File                              | % Stmts | % Branch | % Funcs | % Lines
----------------------------------|---------|----------|---------|--------
src/server/agent-bus/dispatcher.ts|   92.3  |   95.8   |  100.0  |   91.8
```

### 7.3 Mutation Testing — Depth-Guard

Mutation testing verifica se os testes realmente detectam bugs. Para o depth-guard, os mutantes mais perigosos são:

| Mutante | Original | Mutado | Teste que mata |
|---|---|---|---|
| M01 | `depth >= 3` | `depth > 3` | T11 (depth=3 deve ser denied) |
| M02 | `depth >= 3` | `depth >= 4` | T11 |
| M03 | `visitedSet.has(target)` | `!visitedSet.has(target)` | T13, T14 |
| M04 | `!graph.hasEdge(A,B)` | `graph.hasEdge(A,B)` | T01 (authorized vira denied) |
| M05 | `return 'authorized'` (final) | `return 'denied'` | T01, T09 |
| M06 | `senderIsChief` check removido | — | T08 (Chief sem aresta) |

Para rodar mutation testing com [Stryker](https://stryker-mutator.io/) (suporta TypeScript):

```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/typescript-checker

# stryker.config.mjs
export default {
  testRunner: 'command',
  commandRunner: { command: 'tsx --test tests/dispatcher-verdict.test.ts' },
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  mutate: ['src/server/agent-bus/dispatcher.ts'],
  thresholds: { high: 90, low: 80, break: 70 },
};

npx stryker run
```

Target: **Mutation Score ≥ 90%** para `dispatcher.ts` (especialmente `resolveVerdict` e `AgentLock`).

### 7.4 Execução dos Testes

```bash
# Todos os testes do dispatcher
npm run test -- tests/dispatcher-*.test.ts

# Com coverage (Node 22+)
node --experimental-test-coverage --test tests/dispatcher-*.test.ts

# Property-based isolado (mais lento)
tsx --test tests/dispatcher-properties.test.ts

# Fuzzing corpus
tsx --test tests/fuzzing/dispatcher-fuzz.test.ts

# Mutation testing (demorado — rodar pré-PR)
npx stryker run
```

### 7.5 CI Gate Recomendado para Story 9.9

```yaml
# .github/workflows/qa-gate-9.9.yml (referência — @devops configura)
dispatcher-tests:
  runs-on: ubuntu-latest
  steps:
    - name: Unit + Integration (verdict table + race conditions)
      run: npm run test -- tests/dispatcher-*.test.ts
    - name: Property-Based (fast-check invariants)
      run: tsx --test tests/dispatcher-properties.test.ts
    - name: Fuzzing corpus
      run: tsx --test tests/fuzzing/dispatcher-fuzz.test.ts
    - name: Coverage check (branch ≥ 95%)
      run: node --experimental-test-coverage --test tests/dispatcher-*.test.ts
    - name: Mutation score (≥ 90%) — pré-merge only
      if: github.event_name == 'pull_request'
      run: npx stryker run
```

---

## Apêndice: Arquivos de Teste a Criar

| Arquivo | Cobertura |
|---|---|
| `tests/dispatcher-verdict.test.ts` | Truth table completa (14 casos) |
| `tests/dispatcher-lock.test.ts` | State machine do AgentLock |
| `tests/dispatcher-race.test.ts` | Race conditions, concurrent ask |
| `tests/dispatcher-properties.test.ts` | 5 propriedades fast-check |
| `tests/fuzzing/dispatcher-fuzz.test.ts` | Corpus fuzz + deadlock detection |
| `tests/helpers/graph-generators.ts` | TestGraph + randomGraphArbitrary |

**Nota para @dev (Han Solo):** O `resolveVerdict` deve ser exportado como função pura separada da lógica de I/O. Se o verdict engine misturar efeitos colaterais (WS broadcast, DB write), os testes de tabela tornam-se impossíveis. Ver seção 2.1 para a interface esperada.

---

*Research por Ahsoka — the truth is out there* ⚔️
*Documento para Story 9.9 / Mace Windu (QA gate final do Epic 9)*
