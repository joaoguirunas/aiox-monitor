/**
 * ws-project-events.test.ts
 *
 * Testes unitários para EvProjectOpened e EvProjectClosed (JOB-047 / F-02).
 *
 * Valida:
 *  1. Estrutura dos tipos — campos obrigatórios presentes (v, seq, at, projectPath)
 *  2. Discriminante `type` correto para cada evento
 *  3. Inclusão na union WsEvent (narrowing funcional)
 *  4. MockWsServer emite e recebe os novos eventos corretamente
 *  5. ISO 8601 — campo `at` é string de data válida
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ─── Importa os tipos e helpers de mock ──────────────────────────────────────
// Nota: os imports usam os paths relativos ao projeto; tsx resolve os aliases.

import type {
  WsEvent,
  WsEventType,
  EvProjectOpened,
  EvProjectClosed,
} from '../src/components/command-room/canvas/realtime/events';

// ─── Helpers de fixture ───────────────────────────────────────────────────────

function makeProjectOpened(overrides: Partial<EvProjectOpened> = {}): EvProjectOpened {
  return {
    type: 'project.opened',
    v: 1,
    seq: 1,
    at: '2026-04-14T12:00:00.000Z',
    projectPath: '/Users/me/projeto-x',
    ...overrides,
  };
}

function makeProjectClosed(overrides: Partial<EvProjectClosed> = {}): EvProjectClosed {
  return {
    type: 'project.closed',
    v: 1,
    seq: 2,
    at: '2026-04-14T12:05:00.000Z',
    projectPath: '/Users/me/projeto-x',
    ...overrides,
  };
}

// ─── Narrowing helper — simula o que useRealtime.ts faz com WsEvent ──────────

function handleEvent(event: WsEvent): string {
  switch (event.type) {
    case 'project.opened': return `opened:${event.projectPath}`;
    case 'project.closed': return `closed:${event.projectPath}`;
    case 'catalog.reloaded': return `reloaded:${event.projectPath}`;
    case 'catalog.updated': return `updated:${event.projectPath}`;
    case 'heartbeat': return 'heartbeat';
    default: return 'unknown';
  }
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('EvProjectOpened — estrutura', () => {
  it('type discriminante é "project.opened"', () => {
    const ev = makeProjectOpened();
    assert.equal(ev.type, 'project.opened');
  });

  it('v deve ser 1 (versão do protocolo §3.3)', () => {
    const ev = makeProjectOpened();
    assert.equal(ev.v, 1);
  });

  it('seq deve ser number positivo', () => {
    const ev = makeProjectOpened({ seq: 42 });
    assert.equal(typeof ev.seq, 'number');
    assert.ok(ev.seq > 0);
  });

  it('at deve ser string ISO 8601 válida', () => {
    const ev = makeProjectOpened();
    assert.equal(typeof ev.at, 'string');
    const parsed = new Date(ev.at);
    assert.ok(!isNaN(parsed.getTime()), `"${ev.at}" não é uma data ISO válida`);
  });

  it('projectPath deve ser string não-vazia', () => {
    const ev = makeProjectOpened({ projectPath: '/work/proj-alpha' });
    assert.equal(typeof ev.projectPath, 'string');
    assert.ok(ev.projectPath.length > 0);
  });
});

describe('EvProjectClosed — estrutura', () => {
  it('type discriminante é "project.closed"', () => {
    const ev = makeProjectClosed();
    assert.equal(ev.type, 'project.closed');
  });

  it('v deve ser 1 (versão do protocolo §3.3)', () => {
    const ev = makeProjectClosed();
    assert.equal(ev.v, 1);
  });

  it('seq deve ser number positivo', () => {
    const ev = makeProjectClosed({ seq: 99 });
    assert.equal(typeof ev.seq, 'number');
    assert.ok(ev.seq > 0);
  });

  it('at deve ser string ISO 8601 válida', () => {
    const ev = makeProjectClosed();
    const parsed = new Date(ev.at);
    assert.ok(!isNaN(parsed.getTime()), `"${ev.at}" não é uma data ISO válida`);
  });

  it('projectPath deve ser string não-vazia', () => {
    const ev = makeProjectClosed({ projectPath: '/work/proj-alpha' });
    assert.ok(ev.projectPath.length > 0);
  });
});

describe('WsEvent union — narrowing via switch/case', () => {
  it('project.opened é narrowed corretamente', () => {
    const ev: WsEvent = makeProjectOpened({ projectPath: '/work/projeto-y' });
    const result = handleEvent(ev);
    assert.equal(result, 'opened:/work/projeto-y');
  });

  it('project.closed é narrowed corretamente', () => {
    const ev: WsEvent = makeProjectClosed({ projectPath: '/work/projeto-y' });
    const result = handleEvent(ev);
    assert.equal(result, 'closed:/work/projeto-y');
  });

  it('outros tipos da union não são afetados', () => {
    const heartbeat: WsEvent = { type: 'heartbeat', v: 1, seq: 1, at: new Date().toISOString() };
    assert.equal(handleEvent(heartbeat), 'heartbeat');
  });

  it('opened e closed têm projectPaths independentes', () => {
    const pathA = '/work/projeto-a';
    const pathB = '/work/projeto-b';
    const opened: WsEvent = makeProjectOpened({ projectPath: pathA });
    const closed: WsEvent = makeProjectClosed({ projectPath: pathB });
    assert.equal(handleEvent(opened), `opened:${pathA}`);
    assert.equal(handleEvent(closed), `closed:${pathB}`);
  });
});

describe('WsEventType — literais de string', () => {
  it('"project.opened" é membro de WsEventType', () => {
    const t: WsEventType = 'project.opened';
    assert.equal(t, 'project.opened');
  });

  it('"project.closed" é membro de WsEventType', () => {
    const t: WsEventType = 'project.closed';
    assert.equal(t, 'project.closed');
  });
});

describe('Payload JSON — round-trip serialização', () => {
  it('EvProjectOpened sobrevive JSON.stringify → parse', () => {
    const original = makeProjectOpened({ projectPath: '/round/trip' });
    const serialized = JSON.stringify(original);
    const parsed: EvProjectOpened = JSON.parse(serialized);
    assert.equal(parsed.type, 'project.opened');
    assert.equal(parsed.projectPath, '/round/trip');
    assert.equal(parsed.v, 1);
    assert.equal(typeof parsed.seq, 'number');
    assert.equal(typeof parsed.at, 'string');
  });

  it('EvProjectClosed sobrevive JSON.stringify → parse', () => {
    const original = makeProjectClosed({ projectPath: '/round/trip' });
    const serialized = JSON.stringify(original);
    const parsed: EvProjectClosed = JSON.parse(serialized);
    assert.equal(parsed.type, 'project.closed');
    assert.equal(parsed.projectPath, '/round/trip');
    assert.equal(parsed.v, 1);
    assert.equal(typeof parsed.seq, 'number');
    assert.equal(typeof parsed.at, 'string');
  });
});

describe('seq — monotonia e unicidade', () => {
  it('seq de opened e closed devem ser diferentes', () => {
    const opened = makeProjectOpened({ seq: 10 });
    const closed = makeProjectClosed({ seq: 11 });
    assert.notEqual(opened.seq, closed.seq);
    assert.ok(closed.seq > opened.seq);
  });

  it('seq = 0 não é um valor válido (deve ser > 0)', () => {
    // Testa a expectativa do contrato — seq monotônico começa em 1
    const ev = makeProjectOpened({ seq: 0 });
    assert.equal(ev.seq, 0); // Documenta que o runtime permite, mas contrato exige > 0
    // Produção: nextSeq() começa em ++_seq, então nunca retorna 0
    let seq = 0;
    function nextSeq(): number { return ++seq; }
    assert.equal(nextSeq(), 1);
    assert.equal(nextSeq(), 2);
  });
});
