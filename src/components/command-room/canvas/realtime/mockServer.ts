/**
 * mockServer — stub de mock WebSocket server para testes unitários.
 *
 * NÃO é um servidor real — é um utilitário de teste que:
 *  1. Substitui window.WebSocket por uma implementação controlada
 *  2. Expõe uma API para emitir eventos sintéticos no lado "servidor"
 *  3. Permite verificar mensagens enviadas pelo cliente
 *
 * Uso em testes (Jest/Vitest):
 *
 *   import { createMockWsServer, MockWsServer } from './mockServer';
 *
 *   let server: MockWsServer;
 *
 *   beforeEach(() => {
 *     server = createMockWsServer();
 *   });
 *
 *   afterEach(() => {
 *     server.restore();
 *   });
 *
 *   it('deve processar agent.status', () => {
 *     server.emit({ type: 'agent.status', v: 1, seq: 1, at: new Date().toISOString(), cardId: 'x', status: 'thinking' });
 *     // ... assert store
 *   });
 */

import type { WsEvent } from './events';

/** Omit distribuído sobre unions — preserva os discriminantes de cada membro */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// ---------------------------------------------------------------------------
// Implementação MockWebSocket (segue a API do WebSocket nativo)
// ---------------------------------------------------------------------------

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = MockWebSocket.CONNECTING;
  readonly OPEN = MockWebSocket.OPEN;
  readonly CLOSING = MockWebSocket.CLOSING;
  readonly CLOSED = MockWebSocket.CLOSED;

  readyState: number = MockWebSocket.CONNECTING;

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  private _sentMessages: unknown[] = [];
  private _server: MockWsServer;

  constructor(url: string, server: MockWsServer) {
    this._server = server;
    // Simula abertura assíncrona (comportamento real do WebSocket)
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
    // Registra no servidor
    server._registerSocket(this);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('MockWebSocket: cannot send on non-open socket');
    }
    try {
      this._sentMessages.push(JSON.parse(data));
    } catch {
      this._sentMessages.push(data);
    }
  }

  close(_code?: number): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      const ev = new CloseEvent('close', { wasClean: true, code: _code ?? 1000 });
      this.onclose?.(ev);
      this._server._unregisterSocket(this);
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // API interna — usada pelo MockWsServer para injetar mensagens
  // ---------------------------------------------------------------------------

  /** @internal */
  _receiveMessage(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) return;
    const ev = new MessageEvent('message', { data });
    this.onmessage?.(ev);
  }

  /** @internal */
  _forceClose(code = 1006): void {
    this.readyState = MockWebSocket.CLOSED;
    const ev = new CloseEvent('close', { wasClean: false, code });
    this.onclose?.(ev);
    this._server._unregisterSocket(this);
  }

  /** Retorna cópia das mensagens enviadas pelo cliente */
  getSentMessages(): unknown[] {
    return [...this._sentMessages];
  }
}

// ---------------------------------------------------------------------------
// MockWsServer — gerencia os sockets mocados
// ---------------------------------------------------------------------------

export class MockWsServer {
  private _sockets: MockWebSocket[] = [];
  private _originalWebSocket: typeof WebSocket | undefined;
  private _seq = 0;

  constructor() {
    // Substitui window.WebSocket globalmente
    if (typeof window !== 'undefined') {
      this._originalWebSocket = window.WebSocket;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).WebSocket = (url: string) => new MockWebSocket(url, this);
    }
  }

  /** Restaura window.WebSocket original */
  restore(): void {
    if (typeof window !== 'undefined' && this._originalWebSocket) {
      window.WebSocket = this._originalWebSocket;
    }
    this._sockets = [];
  }

  /** Emite um evento WS para todos os clientes conectados */
  emit(event: DistributiveOmit<WsEvent, 'seq'> & { seq?: number }): void {
    const payload = JSON.stringify({ seq: ++this._seq, ...event });
    for (const socket of this._sockets) {
      socket._receiveMessage(payload);
    }
  }

  /** Simula desconexão abrupta do servidor */
  disconnectAll(code = 1006): void {
    for (const socket of [...this._sockets]) {
      socket._forceClose(code);
    }
  }

  /** Retorna as mensagens enviadas por todos os clientes */
  allReceivedMessages(): unknown[] {
    return this._sockets.flatMap((s) => s.getSentMessages());
  }

  /** Número de clientes conectados */
  get connectionCount(): number {
    return this._sockets.length;
  }

  /** @internal */
  _registerSocket(socket: MockWebSocket): void {
    this._sockets.push(socket);
  }

  /** @internal */
  _unregisterSocket(socket: MockWebSocket): void {
    this._sockets = this._sockets.filter((s) => s !== socket);
  }
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/**
 * Cria e instala um MockWsServer no ambiente de teste.
 * Lembre-se de chamar server.restore() no afterEach.
 */
export function createMockWsServer(): MockWsServer {
  return new MockWsServer();
}

// ---------------------------------------------------------------------------
// Eventos sintéticos pré-fabricados (helpers de teste)
// ---------------------------------------------------------------------------

let _syntheticSeq = 0;

function nextSeq(): number {
  return ++_syntheticSeq;
}

function now(): string {
  return new Date().toISOString();
}

/** Emite sequência de eventos sintéticos para demo/smoke test */
export function emitSyntheticDemo(server: MockWsServer): void {
  // Heartbeat
  server.emit({ type: 'heartbeat', v: 1, seq: nextSeq(), at: now() });

  // Agente ficou pensando
  server.emit({
    type: 'agent.status', v: 1, seq: nextSeq(), at: now(),
    cardId: 'card-demo-1', status: 'thinking',
  });

  // Nova mensagem em streaming (3 chunks)
  const msgId = 'msg-demo-1';
  const convId = 'conv-demo-1';
  const chunks = ['Olá, ', 'como ', 'posso ajudar?'];
  for (const delta of chunks) {
    server.emit({
      type: 'chat.chunk', v: 1, seq: nextSeq(), at: now(),
      messageId: msgId, conversationId: convId, delta,
    });
  }

  // Mensagem finalizada
  server.emit({
    type: 'message.new', v: 1, seq: nextSeq(), at: now(),
    conversationId: convId,
    message: {
      id: msgId,
      conversationId: convId,
      senderRole: 'agent',
      content: 'Olá, como posso ajudar?',
      userId: 'local',
      createdAt: now(),
      streaming: false,
    },
  });

  // Agente voltou para idle
  server.emit({
    type: 'agent.status', v: 1, seq: nextSeq(), at: now(),
    cardId: 'card-demo-1', status: 'idle',
  });

  // Nova conexão entre cards
  server.emit({
    type: 'connection.added', v: 1, seq: nextSeq(), at: now(),
    connection: {
      edgeId: 'edge-demo-1',
      source: 'card-demo-1',
      target: 'card-demo-2',
      connectionId: 'conn-uuid-1',
      directed: true,
      kind: 'chat',
      userId: 'local',
      createdAt: now(),
    },
  });

  // Catálogo recarregado
  server.emit({
    type: 'catalog.reloaded', v: 1, seq: nextSeq(), at: now(),
    projectPath: '/demo/project',
    full: [
      {
        skill_path: '/demo:agents:dev',
        squad: 'demo',
        agent_id: 'dev',
        display_name: 'Dev Demo',
        source: 'project',
        definition_path: '.claude/commands/demo/agents/dev.md',
      },
    ],
  });
}
