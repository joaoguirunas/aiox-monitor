/**
 * WsClient — wrapper sobre WebSocket nativo para o protocolo estendido da Sala de Comando v2.
 *
 * Responsabilidades:
 *  - Conexão/desconexão gerenciada com auto-reconnect (backoff exponencial, max 30s)
 *  - Heartbeat de 25s (responde ao servidor e detecta conexão morta)
 *  - Last-Event-ID por scope (canvas|conversation|agent|pty) enviado no query-string
 *    no momento da reconexão, para que o servidor possa replay eventos perdidos
 *  - Bus de assinantes (pub/sub interno): subscribe(handler) → unsub fn
 *  - send() para enviar mensagens ao servidor
 *
 * Design:
 *  - Sem React, sem Zustand — side-effect puro, testável em Node.js
 *  - WsClient só recebe eventos; quem decide o que fazer é useRealtime
 *  - Suporta múltiplos scopes independentes (cada scope tem seu Last-Event-ID)
 *
 * Uso esperado:
 *   const client = new WsClient({ endpoint: '/ws', scope: 'canvas' });
 *   client.connect();
 *   const unsub = client.subscribe((event) => { ... });
 *   client.disconnect();
 *
 * Reuso do padrão existente em WebSocketContext.tsx:
 *  - MAX_DELAY_MS = 30_000
 *  - backoff exponencial com BASE_DELAY_MS = 1_000
 *  - MAX_RETRIES = 20 antes de desistir
 */

import type { WsEvent, WsScope } from './events';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type WsClientStatus = 'connecting' | 'connected' | 'disconnected' | 'failed';

export type WsEventHandler = (event: WsEvent) => void;
export type WsStatusHandler = (status: WsClientStatus) => void;

export interface WsClientOptions {
  /** Endpoint relativo ou absoluto, ex: '/ws' */
  endpoint: string;
  /** Scope desse cliente — determina Last-Event-ID prefix */
  scope: WsScope;
  /** Máximo de tentativas de reconexão antes de desistir (default: 20) */
  maxRetries?: number;
  /** Delay base do backoff (ms). Default: 1000 */
  baseDelayMs?: number;
  /** Delay máximo de reconexão (ms). Default: 30_000 */
  maxDelayMs?: number;
  /** Intervalo do heartbeat local (ms). Default: 25_000 */
  heartbeatIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Constantes padrão
// ---------------------------------------------------------------------------

const DEFAULT_MAX_RETRIES = 20;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 25_000;

// ---------------------------------------------------------------------------
// Classe WsClient
// ---------------------------------------------------------------------------

export class WsClient {
  private readonly endpoint: string;
  private readonly scope: WsScope;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly heartbeatIntervalMs: number;

  private ws: WebSocket | null = null;
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private _status: WsClientStatus = 'disconnected';

  /**
   * Last-Event-ID por scope — persistido entre reconexões.
   * Enviado como query param `?lastEventId=<seq>` ao reconectar,
   * permitindo que o servidor faça replay de eventos perdidos.
   */
  private lastEventId: number | null = null;

  private eventHandlers = new Set<WsEventHandler>();
  private statusHandlers = new Set<WsStatusHandler>();

  constructor(options: WsClientOptions) {
    this.endpoint = options.endpoint;
    this.scope = options.scope;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /** Status atual da conexão */
  get status(): WsClientStatus {
    return this._status;
  }

  /** Conecta (ou reconecta) ao servidor */
  connect(): void {
    if (this.destroyed) return;
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return;
    this._doConnect();
  }

  /** Desconecta permanentemente (sem reconectar) */
  disconnect(): void {
    this.destroyed = true;
    this._cleanup();
    this._setStatus('disconnected');
  }

  /**
   * Inscreve um handler para receber eventos WS tipados.
   * Retorna a função de cancelamento de inscrição.
   */
  subscribe(handler: WsEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => { this.eventHandlers.delete(handler); };
  }

  /**
   * Inscreve um handler para receber mudanças de status da conexão.
   * Retorna a função de cancelamento de inscrição.
   */
  onStatusChange(handler: WsStatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => { this.statusHandlers.delete(handler); };
  }

  /**
   * Envia dados ao servidor.
   * Silencioso se a conexão não estiver aberta.
   */
  send(data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(data));
    } catch (err) {
      console.error('[WsClient] send error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private _doConnect(): void {
    if (this.destroyed) return;

    const url = this._buildUrl();
    this._setStatus('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.error('[WsClient] failed to create WebSocket:', err);
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.destroyed) { ws.close(); return; }
      this.retries = 0;
      this._setStatus('connected');
      this._startHeartbeat();
    };

    ws.onmessage = (e: MessageEvent) => {
      this._handleMessage(e.data as string);
    };

    ws.onclose = () => {
      if (this.destroyed) return;
      this._stopHeartbeat();
      this._setStatus('disconnected');
      this._scheduleReconnect();
    };

    ws.onerror = () => {
      // onerror sempre precede onclose — apenas fecha para disparar onclose
      ws.close();
    };
  }

  private _handleMessage(raw: string): void {
    let event: WsEvent;
    try {
      event = JSON.parse(raw) as WsEvent;
    } catch {
      return; // ignora payload malformado
    }

    // Atualiza Last-Event-ID se o evento trouxer `seq`
    if ('seq' in event && typeof event.seq === 'number') {
      this.lastEventId = event.seq;
    }

    // Silencia heartbeat — não repassa para os subscribers
    if (event.type === 'heartbeat') {
      this._onHeartbeatReceived();
      return;
    }

    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('[WsClient] handler error:', err);
      }
    }
  }

  private _onHeartbeatReceived(): void {
    // O servidor enviou heartbeat — conexão está viva.
    // Reinicia o timer local para evitar false-positive de timeout.
    this._startHeartbeat();
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Envia pong ao servidor para manter a conexão viva do lado do proxy/load-balancer.
        // O servidor ignora mensagens desconhecidas — sem protocolo formal de pong.
        this.send({ type: 'pong', scope: this.scope });
      }
    }, this.heartbeatIntervalMs);
  }

  private _stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.retries >= this.maxRetries) {
      this._setStatus('failed');
      return;
    }
    const delay = Math.min(
      this.baseDelayMs * Math.pow(2, this.retries),
      this.maxDelayMs,
    );
    this.retries++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._doConnect();
    }, delay);
  }

  private _cleanup(): void {
    this._stopHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch { /* já fechado */ }
      this.ws = null;
    }
  }

  private _setStatus(status: WsClientStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const handler of this.statusHandlers) {
      try { handler(status); } catch { /* isolate */ }
    }
  }

  private _buildUrl(): string {
    if (typeof window === 'undefined') {
      // SSR/Node — constrói URL base fixa
      return `ws://localhost:8888${this.endpoint}?scope=${this.scope}${this._lastEventIdParam()}`;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = `${proto}//${window.location.host}${this.endpoint}`;
    return `${base}?scope=${this.scope}${this._lastEventIdParam()}`;
  }

  private _lastEventIdParam(): string {
    return this.lastEventId !== null ? `&lastEventId=${this.lastEventId}` : '';
  }
}
