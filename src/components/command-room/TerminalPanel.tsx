'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { usePtySocket } from '@/hooks/usePtySocket';
import { AvatarImage, AvatarPicker, AIOX_AGENT_TO_AVATAR, type AvatarId } from './AvatarPicker';
import '@xterm/xterm/css/xterm.css';

// ─── AIOX Brandbook Terminal Theme ───────────────────────────────────────────
const AIOX_TERMINAL_THEME = {
  background: '#0A0A0A',
  foreground: '#F4F4E8',
  cursor: '#FF4400',
  cursorAccent: '#0A0A0A',
  selectionBackground: 'rgba(255,68,0,0.25)',
  selectionForeground: '#FFFFFF',
  black: '#161618', red: '#EF4444', green: '#34d399', yellow: '#f59e0b',
  blue: '#0099FF', magenta: '#8B5CF6', cyan: '#06B6D4', white: '#F4F4E8',
  brightBlack: 'rgba(244,244,232,0.4)', brightRed: '#fca5a5',
  brightGreen: '#6ee7b7', brightYellow: '#fde68a', brightBlue: '#79c0ff',
  brightMagenta: '#c4b5fd', brightCyan: '#67e8f9', brightWhite: '#FFFFFF',
};

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  connecting: { color: '#0099FF', label: 'Conectando' },
  spawning:   { color: '#0099FF', label: 'Iniciando' },
  active:     { color: '#34d399', label: 'Ativo' },
  idle:       { color: '#f59e0b', label: 'Idle' },
  error:      { color: '#EF4444', label: 'Erro' },
  closed:     { color: '#3D3D3D', label: 'Fechado' },
};

const AGENT_COMMANDS: Record<string, string> = {
  '@dev':              '/AIOX:agents:dev',
  '@qa':               '/AIOX:agents:qa',
  '@architect':        '/AIOX:agents:architect',
  '@pm':               '/AIOX:agents:pm',
  '@po':               '/AIOX:agents:po',
  '@sm':               '/AIOX:agents:sm',
  '@analyst':          '/AIOX:agents:analyst',
  '@data-engineer':    '/AIOX:agents:data-engineer',
  '@ux-design-expert': '/AIOX:agents:ux-design-expert',
  '@devops':           '/AIOX:agents:devops',
  '@aiox-master':      '/AIOX:agents:aiox-master',
};

export interface LinkedTerminalEntry {
  id: string;
  agentName: string;
}

interface TerminalPanelProps {
  terminalId: string;
  agentName: string;
  projectPath?: string;
  aiox_agent?: string;
  avatar?: AvatarId;
  linkedTerminalIds: string[];
  otherTerminals?: LinkedTerminalEntry[];
  onClose: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onLink?: (id: string, targetId: string) => void;
  onAvatarChange?: (id: string, avatar: AvatarId) => void;
  autopilot?: boolean;
  onAutopilotToggle?: (id: string) => void;
  onTaskDone?: (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  /** True when terminal was restored from DB after server restart */
  isCrashed?: boolean;
  /** True when terminal was loaded from DB (not freshly spawned) */
  isRestored?: boolean;
  /** Optional description displayed in info panel */
  description?: string;
}

export function TerminalPanel({
  terminalId,
  agentName,
  projectPath,
  aiox_agent,
  linkedTerminalIds,
  otherTerminals = [],
  onClose,
  onRename,
  onLink,
  autopilot = false,
  onAutopilotToggle,
  onTaskDone,
  dragHandleProps,
  isCrashed = false,
  isRestored = false,
  description,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const disposedRef = useRef(false);
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);

  // Header name editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(agentName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Info panel
  const [infoOpen, setInfoOpen] = useState(false);
  const [actionState, setActionState] = useState<'idle'|'sending'|'sent'>('idle');
  const [showResponseBadge, setShowResponseBadge] = useState(false);

  // Broadcast input
  const [broadcastInput, setBroadcastInput] = useState('');
  const broadcastInputRef = useRef<HTMLInputElement>(null);

  const mountedAtRef = useRef(Date.now());

  const linkedTerminals = otherTerminals.filter((t) => linkedTerminalIds.includes(t.id));
  const isLinked = linkedTerminals.length > 0;

  const shortPath = projectPath
    ? projectPath.split('/').filter(Boolean).slice(-2).join('/')
    : '';

  // ── xterm init ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;
    disposedRef.current = false;

    const term = new Terminal({
      cursorBlink: true, cursorStyle: 'bar',
      fontSize: 13, fontFamily: '"Roboto Mono", "SF Mono", Menlo, Monaco, monospace',
      fontWeight: '400', fontWeightBold: '600', lineHeight: 1.3, letterSpacing: 0,
      theme: AIOX_TERMINAL_THEME, allowProposedApi: true, scrollback: 5000, tabStopWidth: 4,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    try { term.open(containerRef.current); } catch (err) {
      console.error('[TerminalPanel] term.open() failed:', err);
      term.dispose(); return;
    }

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    const rafId = requestAnimationFrame(() => {
      if (disposedRef.current) return;
      try { fitAddon.fit(); } catch { /* ignore */ }
      if (!disposedRef.current) setIsTerminalReady(true);
    });

    term.writeln(`\x1b[2mConnecting to process...\x1b[0m`);

    return () => {
      disposedRef.current = true;
      cancelAnimationFrame(rafId);
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Refs estáveis para callbacks (evita recrear o hook) ──────────────────
  const onTaskDoneRef = useRef(onTaskDone);
  onTaskDoneRef.current = onTaskDone;

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const { status, sendResize, startIdleWatch } = usePtySocket({
    terminalId: isTerminalReady ? terminalId : null,
    terminal: terminalRef.current,
    isRestored,
    onStatusChange: () => {},
    onExit: (code, signal) => {
      setExitCode(code);
      const term = terminalRef.current;
      if (term) {
        term.writeln('');
        term.writeln(`\x1b[2m─────────────────────────────────────\x1b[0m`);
        term.writeln(`\x1b[${code === 0 ? '32' : '31'}mProcess exited (code ${code}${signal ? `, ${signal}` : ''})\x1b[0m`);
      }
    },
    onError: (message) => {
      if (message.includes('Terminal not found')) {
        if (Date.now() - mountedAtRef.current > 5000) onClose(terminalId);
        return;
      }
      terminalRef.current?.writeln(`\x1b[31mError: ${message}\x1b[0m`);
    },
    onIdle: () => {
      onTaskDoneRef.current?.(terminalId);
      setShowResponseBadge(true);
      setTimeout(() => setShowResponseBadge(false), 4000);
    },
  });

  // ── Auto-fit ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isTerminalReady) return;
    const observer = new ResizeObserver(() => {
      const fit = fitAddonRef.current;
      const term = terminalRef.current;
      if (fit && term) {
        try {
          fit.fit();
          sendResize(term.cols, term.rows);
          // Persist dimensions to DB (Task 5.4)
          fetch('/api/command-room/resize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: terminalId, cols: term.cols, rows: term.rows }),
          }).catch((err) => console.error('[TerminalPanel] Failed to persist resize:', err));
        } catch { /* ignore */ }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [sendResize, isTerminalReady, terminalId]);

  // ── Name editing ──────────────────────────────────────────────────────────
  const commitName = useCallback(() => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== agentName && onRename) onRename(terminalId, trimmed);
  }, [nameValue, agentName, onRename, terminalId]);

  // ── Write to self ─────────────────────────────────────────────────────────
  const sendToSelf = useCallback(async (cmd: string) => {
    await fetch(`/api/command-room/${terminalId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: cmd.endsWith('\n') ? cmd : cmd + '\n' }),
    }).catch(() => {});
  }, [terminalId]);

  // ── Activate agent ────────────────────────────────────────────────────────
  const handleActivate = useCallback(async () => {
    if (!aiox_agent) return;
    const cmd = AGENT_COMMANDS[aiox_agent] ?? `/AIOX:agents:${aiox_agent.replace('@', '')}`;
    setActionState('sending');
    await sendToSelf(cmd);
    startIdleWatch();
    setActionState('sent');
    setTimeout(() => setActionState('idle'), 2500);
  }, [aiox_agent, sendToSelf, startIdleWatch]);

  // ── Send context ──────────────────────────────────────────────────────────
  const handleSendContext = useCallback(async () => {
    if (!projectPath) return;
    setActionState('sending');

    // Use client-side names from otherTerminals prop (reflects renames)
    let terminalList = '';
    if (otherTerminals.length > 0) {
      terminalList = '\n\nTerminais ativos no AIOX Monitor:\n' +
        otherTerminals.map((p) => `  • ${p.agentName} (id: ${p.id})`).join('\n') +
        '\n\nPara enviar comando a outro terminal:\n' +
        `  curl -s -X POST http://localhost:8888/api/command-room/<ID> -H "Content-Type: application/json" -d \'{"data":"comando"}\'`;
    }

    const activationCmd = aiox_agent
      ? (AGENT_COMMANDS[aiox_agent] ?? `/AIOX:agents:${aiox_agent.replace('@', '')}`)
      : null;

    const msg = [
      `# Contexto AIOX Monitor`,
      `Projeto: ${projectPath}`,
      `Você é: ${agentName}${aiox_agent ? ` (${aiox_agent})` : ''}`,
      activationCmd ? `Ativar persona: ${activationCmd}` : null,
      `Diretório: cd ${projectPath}`,
      terminalList,
    ].filter(Boolean).join('\n');

    await sendToSelf(msg);
    startIdleWatch();
    setActionState('sent');
    setTimeout(() => setActionState('idle'), 2500);
  }, [projectPath, agentName, aiox_agent, otherTerminals, sendToSelf, startIdleWatch]);

  // ── Broadcast to linked terminals ─────────────────────────────────────────
  const handleBroadcast = useCallback(async () => {
    const cmd = broadcastInput.trim();
    if (!cmd || linkedTerminalIds.length === 0) return;
    setBroadcastInput('');
    // Start idle watch so we get notified when they finish
    startIdleWatch();
    await Promise.all(
      linkedTerminalIds.map((id) =>
        fetch(`/api/command-room/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: cmd }),
        }).catch(() => {})
      )
    );
  }, [broadcastInput, linkedTerminalIds, startIdleWatch]);

  const statusInfo = STATUS_MAP[status] ?? STATUS_MAP.connecting;

  return (
    <div
      className="flex flex-col h-full rounded-lg overflow-hidden border"
      style={{
        borderColor: isLinked ? 'rgba(255,68,0,0.4)' : 'rgba(156,156,156,0.15)',
        background: '#0A0A0A',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 px-2 h-9 shrink-0 border-b select-none"
        style={{ background: '#0F0F11', borderColor: 'rgba(156,156,156,0.1)' }}
      >
        {/* Drag handle */}
        <div
          {...dragHandleProps}
          className="flex items-center justify-center w-4 h-4 cursor-grab active:cursor-grabbing shrink-0"
          style={{ color: 'rgba(244,244,232,0.2)' }}
        >
          <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor">
            <circle cx="2" cy="2" r="1" /><circle cx="6" cy="2" r="1" />
            <circle cx="2" cy="5" r="1" /><circle cx="6" cy="5" r="1" />
            <circle cx="2" cy="8" r="1" /><circle cx="6" cy="8" r="1" />
          </svg>
        </div>

        {/* Status dot */}
        <div className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: statusInfo.color }} />

        {/* Linked badge */}
        {isLinked && (
          <span
            className="font-mono text-[0.45rem] font-medium uppercase tracking-[0.06em] px-1 py-0.5 rounded shrink-0"
            style={{ background: 'rgba(255,68,0,0.12)', color: '#FF6B35' }}
          >
            ↔{linkedTerminals.length}
          </span>
        )}

        {/* Crashed badge */}
        {isCrashed && (
          <span
            className="font-mono text-[0.45rem] font-medium uppercase tracking-[0.06em] px-1 py-0.5 rounded shrink-0"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            Reconectando...
          </span>
        )}

        {/* AIOX Agent badge */}
        {aiox_agent && (
          <span
            className="font-mono text-[0.45rem] font-medium uppercase tracking-[0.06em] px-1 py-0.5 rounded shrink-0"
            style={{ background: 'rgba(0,153,255,0.12)', color: '#0099FF', border: '1px solid rgba(0,153,255,0.25)' }}
            title={`Agente AIOX: ${aiox_agent}`}
          >
            {aiox_agent}
          </span>
        )}

        {/* Name — click to edit */}
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
            className="flex-1 min-w-0 bg-transparent border-b text-[#F4F4E8] font-mono text-[0.65rem] font-semibold outline-none px-0"
            style={{ borderColor: '#FF4400' }}
            autoFocus
          />
        ) : (
          <span
            onClick={() => onRename && setEditingName(true)}
            className="font-mono text-[0.65rem] font-semibold truncate flex-1 min-w-0"
            style={{
              color: '#F4F4E8',
              cursor: onRename ? 'text' : 'default',
            }}
            title={onRename ? 'Clique para renomear' : agentName}
          >
            {agentName}
          </span>
        )}

        {/* Status */}
        <span className="font-mono text-[0.45rem] uppercase tracking-[0.08em] shrink-0" style={{ color: 'rgba(244,244,232,0.3)' }}>
          {statusInfo.label}
        </span>

        {exitCode !== null && (
          <span className={`font-mono text-[0.45rem] shrink-0 ${exitCode === 0 ? 'text-accent-emerald' : 'text-error'}`}>
            :{exitCode}
          </span>
        )}

        {shortPath && (
          <span className="font-mono text-[0.45rem] truncate max-w-[80px] shrink-0" style={{ color: 'rgba(244,244,232,0.2)' }} title={projectPath}>
            {shortPath}
          </span>
        )}

        {showResponseBadge && (
          <span
            className="font-mono text-[0.45rem] font-medium shrink-0 px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e' }}
          >
            ✓ respondeu
          </span>
        )}

        {/* Expand info panel */}
        <button
          onClick={() => setInfoOpen((v) => !v)}
          className="w-5 h-5 flex items-center justify-center rounded transition-colors shrink-0"
          style={{
            color: infoOpen ? '#FF4400' : 'rgba(244,244,232,0.25)',
            background: infoOpen ? 'rgba(255,68,0,0.1)' : 'transparent',
          }}
          title="Info / vínculos / contexto"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points={infoOpen ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={() => onClose(terminalId)}
          className="w-5 h-5 flex items-center justify-center rounded transition-colors shrink-0"
          style={{ color: 'rgba(244,244,232,0.25)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#EF4444'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(244,244,232,0.25)'; }}
          title="Fechar"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── Info Panel ─────────────────────────────────────────────────── */}
      {infoOpen && (
        <div
          className="shrink-0 border-b px-3 py-2.5 space-y-2.5"
          style={{ background: '#0C0C0E', borderColor: 'rgba(255,68,0,0.15)' }}
        >
          {/* Actions */}
          <div className="flex items-center gap-2">
            {aiox_agent && (
              <button
                onClick={handleActivate}
                disabled={actionState === 'sending'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[0.55rem] font-mono font-medium transition-all"
                style={{
                  background: actionState === 'sent' ? 'rgba(52,211,153,0.1)' : 'rgba(255,68,0,0.1)',
                  color: actionState === 'sent' ? '#34d399' : '#FF6B35',
                  border: `1px solid ${actionState === 'sent' ? 'rgba(52,211,153,0.3)' : 'rgba(255,68,0,0.2)'}`,
                }}
              >
                <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                {actionState === 'sent' ? 'Enviado!' : actionState === 'sending' ? '...' : 'Ativar Agente'}
              </button>
            )}
            {projectPath && (
              <button
                onClick={handleSendContext}
                disabled={actionState === 'sending'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[0.55rem] font-mono font-medium transition-all"
                style={{
                  background: actionState === 'sent' ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)',
                  color: actionState === 'sent' ? '#34d399' : 'rgba(244,244,232,0.55)',
                  border: '1px solid rgba(156,156,156,0.12)',
                }}
              >
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Enviar Contexto
              </button>
            )}
          </div>

          {/* Links */}
          {onLink && otherTerminals.length > 0 && (
            <div>
              <span className="font-mono text-[0.44rem] uppercase tracking-[0.1em] block mb-1.5" style={{ color: 'rgba(244,244,232,0.25)' }}>
                Vincular com
              </span>
              <div className="flex flex-wrap gap-1">
                {otherTerminals.map((t) => {
                  const active = linkedTerminalIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => onLink(terminalId, t.id)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[0.55rem] font-mono transition-all"
                      style={{
                        background: active ? 'rgba(255,68,0,0.12)' : 'rgba(255,255,255,0.03)',
                        color: active ? '#FF6B35' : 'rgba(244,244,232,0.4)',
                        border: `1px solid ${active ? 'rgba(255,68,0,0.3)' : 'rgba(156,156,156,0.1)'}`,
                      }}
                    >
                      <span className="w-[4px] h-[4px] rounded-full" style={{ background: active ? '#FF4400' : 'rgba(156,156,156,0.3)' }} />
                      {t.agentName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Description */}
          {description && (
            <div className="terminal-description pt-1">
              <p
                className="text-[0.6rem] leading-snug line-clamp-2 font-mono"
                style={{ color: 'rgba(244,244,232,0.45)' }}
              >
                {description}
              </p>
            </div>
          )}

          {/* Broadcast input — only when linked */}
          {isLinked && (
            <div className="flex gap-1.5">
              <input
                ref={broadcastInputRef}
                value={broadcastInput}
                onChange={(e) => setBroadcastInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleBroadcast(); }}
                placeholder={`Enviar para ${linkedTerminals.map((t) => t.agentName).join(', ')}...`}
                className="flex-1 min-w-0 px-2 py-1 rounded text-[0.6rem] font-mono outline-none"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(156,156,156,0.15)',
                  color: '#F4F4E8',
                }}
              />
              <button
                onClick={handleBroadcast}
                disabled={!broadcastInput.trim()}
                className="px-2 py-1 rounded text-[0.55rem] font-mono font-medium transition-all"
                style={{
                  background: broadcastInput.trim() ? 'rgba(255,68,0,0.15)' : 'rgba(255,255,255,0.03)',
                  color: broadcastInput.trim() ? '#FF6B35' : 'rgba(244,244,232,0.2)',
                  border: `1px solid ${broadcastInput.trim() ? 'rgba(255,68,0,0.3)' : 'rgba(156,156,156,0.1)'}`,
                }}
              >
                ↗
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Terminal ───────────────────────────────────────────────────── */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{ backgroundColor: AIOX_TERMINAL_THEME.background }}
      >
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%', overflow: 'hidden' }}
        />
      </div>

      {/* ── Footer — vínculo apenas ────────────────────────────────────── */}
      {isLinked && (
        <div
          className="shrink-0 flex items-center gap-1.5 px-2 h-6 border-t"
          style={{ background: '#080808', borderColor: 'rgba(255,68,0,0.2)' }}
        >
          <span className="w-[4px] h-[4px] rounded-full shrink-0" style={{ background: '#FF4400' }} />
          <span className="font-mono text-[0.45rem] truncate" style={{ color: 'rgba(244,244,232,0.3)' }}>
            → {linkedTerminals.map((t) => t.agentName).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
