'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { usePtySocket, type PtyStatus } from '@/hooks/usePtySocket';
import '@xterm/xterm/css/xterm.css';

// ─── AIOX Brandbook Terminal Theme ───────────────────────────────────────────
const AIOX_TERMINAL_THEME = {
  background: '#0A0A0A',
  foreground: '#F4F4E8',
  cursor: '#FF4400',
  cursorAccent: '#0A0A0A',
  selectionBackground: 'rgba(255,68,0,0.25)',
  selectionForeground: '#FFFFFF',
  black: '#161618',
  red: '#EF4444',
  green: '#34d399',
  yellow: '#f59e0b',
  blue: '#0099FF',
  magenta: '#8B5CF6',
  cyan: '#06B6D4',
  white: '#F4F4E8',
  brightBlack: 'rgba(244,244,232,0.4)',
  brightRed: '#fca5a5',
  brightGreen: '#6ee7b7',
  brightYellow: '#fde68a',
  brightBlue: '#79c0ff',
  brightMagenta: '#c4b5fd',
  brightCyan: '#67e8f9',
  brightWhite: '#FFFFFF',
};

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  connecting: { color: '#0099FF', label: 'Conectando' },
  spawning:   { color: '#0099FF', label: 'Iniciando' },
  active:     { color: '#34d399', label: 'Ativo' },
  idle:       { color: '#f59e0b', label: 'Idle' },
  error:      { color: '#EF4444', label: 'Erro' },
  closed:     { color: '#3D3D3D', label: 'Fechado' },
};

// Map agent slug → activation command
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
  linkedTerminalIds: string[];
  otherTerminals?: LinkedTerminalEntry[];
  onClose: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onLink?: (id: string, targetId: string) => void;   // toggle
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
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
  dragHandleProps,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const disposedRef = useRef(false);
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(agentName);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [broadcastValue, setBroadcastValue] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [trainingState, setTrainingState] = useState<'idle'|'sending'|'sent'>('idle');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const broadcastRef = useRef<HTMLInputElement>(null);
  const mountedAtRef = useRef(Date.now());

  // Derived
  const shortPath = projectPath
    ? projectPath.split('/').filter(Boolean).slice(-2).join('/')
    : '';

  const linkedTerminals = otherTerminals.filter((t) => linkedTerminalIds.includes(t.id));
  const isLinked = linkedTerminals.length > 0;

  // Initialize xterm.js
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    disposedRef.current = false;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: '"Roboto Mono", "SF Mono", Menlo, Monaco, monospace',
      fontWeight: '400',
      fontWeightBold: '600',
      lineHeight: 1.3,
      letterSpacing: 0,
      theme: AIOX_TERMINAL_THEME,
      allowProposedApi: true,
      scrollback: 5000,
      tabStopWidth: 4,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    try {
      term.open(containerRef.current);
    } catch (err) {
      console.error('[TerminalPanel] term.open() failed:', err);
      term.dispose();
      return;
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

  // WebSocket connection
  const { status, sendResize } = usePtySocket({
    terminalId: isTerminalReady ? terminalId : null,
    terminal: terminalRef.current,
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
        const ageMs = Date.now() - mountedAtRef.current;
        if (ageMs > 5000) {
          onClose(terminalId);
        }
        return;
      }
      const term = terminalRef.current;
      if (term) {
        term.writeln(`\x1b[31mError: ${message}\x1b[0m`);
      }
    },
  });

  // Auto-fit on resize
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
        } catch { /* ignore */ }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [sendResize, isTerminalReady]);

  const handleClose = useCallback(() => {
    onClose(terminalId);
  }, [onClose, terminalId]);

  // Name editing
  const startEditing = useCallback(() => {
    if (!onRename) return;
    setEditingName(true);
    setNameValue(agentName);
    setTimeout(() => nameInputRef.current?.select(), 0);
  }, [onRename, agentName]);

  const commitName = useCallback(() => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== agentName && onRename) {
      onRename(terminalId, trimmed);
    }
  }, [nameValue, agentName, onRename, terminalId]);

  const handleLinkToggle = useCallback((targetId: string) => {
    if (onLink) onLink(terminalId, targetId);
  }, [onLink, terminalId]);

  const statusInfo = STATUS_MAP[status] ?? STATUS_MAP.connecting;

  // ── Send command to this terminal (self-write) ────────────────────────────
  const sendToSelf = useCallback(async (cmd: string) => {
    await fetch(`/api/command-room/${terminalId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: cmd }),
    }).catch(() => {});
  }, [terminalId]);

  // ── Activate agent persona ────────────────────────────────────────────────
  const handleActivateAgent = useCallback(async () => {
    if (!aiox_agent) return;
    const cmd = AGENT_COMMANDS[aiox_agent] ?? `/AIOX:agents:${aiox_agent.replace('@', '')}`;
    setTrainingState('sending');
    await sendToSelf(cmd);
    setTrainingState('sent');
    setTimeout(() => setTrainingState('idle'), 3000);
  }, [aiox_agent, sendToSelf]);

  // ── Send context (project path + agent role + live terminal list) ────────
  const handleSendContext = useCallback(async () => {
    if (!projectPath) return;
    setTrainingState('sending');

    // Fetch live terminal list from AIOX Monitor API
    let terminalList = '';
    try {
      const res = await fetch('/api/command-room/list');
      if (res.ok) {
        const data = await res.json();
        const procs: { id: string; agentName: string; status: string }[] = data.terminals ?? [];
        const active = procs.filter((p) => p.id !== terminalId && p.status !== 'closed');
        if (active.length > 0) {
          terminalList = '\n\nTerminais ativos no AIOX Monitor:\n' +
            active.map((p) => `  • ${p.agentName} (id: ${p.id})`).join('\n') +
            '\n\nPara enviar um comando a outro terminal use curl:' +
            `\n  curl -s -X POST http://localhost:8888/api/command-room/<ID> -H "Content-Type: application/json" -d '{"data":"seu comando"}'`;
        }
      }
    } catch { /* ignore */ }

    const activationCmd = aiox_agent
      ? (AGENT_COMMANDS[aiox_agent] ?? `/AIOX:agents:${aiox_agent.replace('@', '')}`)
      : null;

    const msg = [
      `# Contexto AIOX Monitor`,
      `Projeto: ${projectPath}`,
      `Você é: ${agentName}${aiox_agent ? ` (${aiox_agent})` : ''}`,
      ...(activationCmd ? [`Para ativar seu persona: ${activationCmd}`] : []),
      `Diretório: cd ${projectPath}`,
      terminalList,
    ].filter(Boolean).join('\n');

    await sendToSelf(msg);
    setTrainingState('sent');
    setTimeout(() => setTrainingState('idle'), 3000);
  }, [projectPath, agentName, aiox_agent, terminalId, sendToSelf]);

  // ── Broadcast to ALL linked terminals ─────────────────────────────────────
  const handleBroadcast = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !broadcastValue.trim() || linkedTerminalIds.length === 0) return;
    e.preventDefault();
    const cmd = broadcastValue.trim();
    setBroadcastValue('');
    setBroadcasting(true);
    try {
      await Promise.all(
        linkedTerminalIds.map((tid) =>
          fetch(`/api/command-room/${tid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: cmd }),
          }).catch(() => {})
        )
      );
    } finally {
      setBroadcasting(false);
      broadcastRef.current?.focus();
    }
  }, [broadcastValue, linkedTerminalIds]);

  return (
    <div
      className="flex flex-col h-full rounded-lg overflow-hidden border bg-surface-1"
      style={{ borderColor: isLinked ? 'rgba(255,68,0,0.35)' : 'rgba(156,156,156,0.15)' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-1.5 px-2 h-9 shrink-0 bg-surface-2 border-b border-border select-none">

        {/* Drag handle */}
        <div
          {...dragHandleProps}
          className="flex items-center justify-center w-5 h-5 cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary rounded transition-colors shrink-0"
          title="Arrastar"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <circle cx="3" cy="2" r="1" /><circle cx="7" cy="2" r="1" />
            <circle cx="3" cy="5" r="1" /><circle cx="7" cy="5" r="1" />
            <circle cx="3" cy="8" r="1" /><circle cx="7" cy="8" r="1" />
          </svg>
        </div>

        {/* Status dot */}
        <div
          className="w-[6px] h-[6px] rounded-full shrink-0"
          style={{ backgroundColor: statusInfo.color }}
        />

        {/* Linked count badge */}
        {isLinked && (
          <span
            className="font-mono text-[0.45rem] font-medium uppercase tracking-[0.06em] px-1.5 py-0.5 rounded shrink-0"
            style={{ background: 'rgba(255,68,0,0.15)', color: '#FF6B35' }}
          >
            ↔ {linkedTerminals.length}
          </span>
        )}

        {/* Name — double click opens config */}
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') setEditingName(false);
            }}
            className="flex-1 min-w-0 bg-transparent border-b border-accent-orange/50 text-text-primary font-mono text-[0.65rem] font-medium outline-none px-0 py-0"
            autoFocus
          />
        ) : (
          <span
            onDoubleClick={() => setConfigOpen((v) => !v)}
            className="font-mono text-[0.65rem] font-medium text-text-primary truncate cursor-default flex-1 min-w-0"
            title="Duplo clique para configurar"
          >
            {agentName}
          </span>
        )}

        {/* Status label */}
        <span className="font-mono text-[0.5rem] text-text-muted uppercase tracking-[0.08em] shrink-0">
          {statusInfo.label}
        </span>

        {/* Exit code */}
        {exitCode !== null && (
          <span className={`font-mono text-[0.5rem] shrink-0 ${exitCode === 0 ? 'text-accent-emerald' : 'text-error'}`}>
            exit {exitCode}
          </span>
        )}

        {/* CWD badge */}
        {shortPath && (
          <span className="font-mono text-[0.5rem] text-text-muted truncate max-w-[100px] shrink-0" title={projectPath}>
            {shortPath}
          </span>
        )}

        {/* Config toggle */}
        <button
          onClick={() => setConfigOpen((v) => !v)}
          className={`w-5 h-5 flex items-center justify-center rounded transition-colors shrink-0 ${
            configOpen ? 'text-[#FF4400] bg-[rgba(255,68,0,0.12)]' : 'text-text-muted hover:text-text-secondary hover:bg-white/5'
          }`}
          title="Configurar terminal"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-error hover:bg-error/10 transition-colors shrink-0"
          title="Fechar terminal"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── Config Panel (double-click) ── */}
      {configOpen && (
        <div
          className="shrink-0 border-b overflow-y-auto"
          style={{
            background: '#0C0C0E',
            borderColor: 'rgba(255,68,0,0.2)',
            maxHeight: '240px',
          }}
        >
          <div className="p-3 space-y-3">

            {/* Agent identity */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {onRename && (
                    <button
                      onClick={startEditing}
                      className="font-mono text-[0.7rem] font-semibold text-[#F4F4E8] hover:text-[#FF6B35] transition-colors"
                    >
                      {agentName}
                    </button>
                  )}
                  {aiox_agent && (
                    <span className="font-mono text-[0.5rem] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,68,0,0.12)', color: '#FF6B35' }}>
                      {aiox_agent}
                    </span>
                  )}
                </div>
                {shortPath && (
                  <span className="font-mono text-[0.5rem]" style={{ color: 'rgba(244,244,232,0.3)' }}>
                    /{shortPath}
                  </span>
                )}
              </div>
            </div>

            {/* Training buttons */}
            <div className="flex gap-1.5">
              {aiox_agent && (
                <button
                  onClick={handleActivateAgent}
                  disabled={trainingState === 'sending'}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[0.55rem] font-mono font-medium transition-colors"
                  style={{
                    background: trainingState === 'sent' ? 'rgba(52,211,153,0.12)' : 'rgba(255,68,0,0.12)',
                    color: trainingState === 'sent' ? '#34d399' : '#FF6B35',
                    border: `1px solid ${trainingState === 'sent' ? 'rgba(52,211,153,0.3)' : 'rgba(255,68,0,0.25)'}`,
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  {trainingState === 'sent' ? 'Ativado!' : trainingState === 'sending' ? '...' : 'Ativar Agente'}
                </button>
              )}
              {projectPath && (
                <button
                  onClick={handleSendContext}
                  disabled={trainingState === 'sending'}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[0.55rem] font-mono font-medium transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(244,244,232,0.6)',
                    border: '1px solid rgba(156,156,156,0.15)',
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                  Enviar Contexto
                </button>
              )}
            </div>

            {/* Links — multi-select */}
            {onLink && otherTerminals.length > 0 && (
              <div>
                <span className="font-mono text-[0.45rem] uppercase tracking-[0.1em] block mb-1.5" style={{ color: 'rgba(244,244,232,0.3)' }}>
                  Terminais vinculados (broadcast)
                </span>
                <div className="flex flex-wrap gap-1">
                  {otherTerminals.map((t) => {
                    const active = linkedTerminalIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleLinkToggle(t.id)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[0.55rem] font-mono transition-all"
                        style={{
                          background: active ? 'rgba(255,68,0,0.15)' : 'rgba(255,255,255,0.03)',
                          color: active ? '#FF6B35' : 'rgba(244,244,232,0.45)',
                          border: `1px solid ${active ? 'rgba(255,68,0,0.35)' : 'rgba(156,156,156,0.12)'}`,
                        }}
                      >
                        <span
                          className="w-[5px] h-[5px] rounded-full"
                          style={{ background: active ? '#FF4400' : 'rgba(156,156,156,0.35)' }}
                        />
                        {t.agentName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Terminal ── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 px-1 py-1"
        style={{ backgroundColor: AIOX_TERMINAL_THEME.background }}
      />

      {/* ── Connection Footer ── */}
      <div
        className="shrink-0 flex items-center gap-1.5 px-2 h-8 border-t relative"
        style={{
          borderColor: isLinked ? 'rgba(255,68,0,0.3)' : 'rgba(156,156,156,0.12)',
          background: '#080808',
        }}
      >
        {/* Link toggle button */}
        {onLink && (
          <button
            onClick={() => setLinkPickerOpen((v) => !v)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.5rem] font-mono uppercase tracking-[0.06em] transition-colors shrink-0"
            style={isLinked
              ? { color: '#FF6B35', background: 'rgba(255,68,0,0.15)' }
              : { color: 'rgba(244,244,232,0.35)', background: 'transparent' }
            }
            title="Gerenciar vínculos"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
            {isLinked ? `→ ${linkedTerminals.map(t => t.agentName).join(', ')}` : 'Vincular'}
          </button>
        )}

        {/* Broadcast input — only when linked */}
        {isLinked && (
          <>
            <span style={{ color: 'rgba(244,244,232,0.2)', fontSize: '0.5rem' }}>|</span>
            <input
              ref={broadcastRef}
              type="text"
              value={broadcastValue}
              onChange={(e) => setBroadcastValue(e.target.value)}
              onKeyDown={handleBroadcast}
              placeholder={`Enviar para ${linkedTerminals.length === 1 ? linkedTerminals[0].agentName : `${linkedTerminals.length} terminais`}...`}
              disabled={broadcasting}
              className="flex-1 min-w-0 bg-transparent text-[0.6rem] font-mono placeholder:opacity-30 outline-none disabled:opacity-50"
              style={{ color: '#F4F4E8' }}
            />
            {broadcasting && (
              <span className="text-[0.45rem] font-mono shrink-0 animate-pulse" style={{ color: '#FF6B35' }}>enviando</span>
            )}
          </>
        )}

        {/* Link picker dropdown */}
        {linkPickerOpen && onLink && (
          <div
            className="absolute bottom-full left-0 mb-1 z-50 rounded-lg border shadow-xl overflow-hidden min-w-[160px]"
            style={{ background: '#111', borderColor: 'rgba(255,68,0,0.25)' }}
          >
            <div className="px-2 py-1.5 border-b" style={{ borderColor: 'rgba(255,68,0,0.15)' }}>
              <span className="font-mono text-[0.45rem] uppercase tracking-[0.1em]" style={{ color: 'rgba(244,244,232,0.3)' }}>
                Toggle vínculos
              </span>
            </div>
            {otherTerminals.length === 0 ? (
              <div className="px-3 py-2 text-[0.6rem] font-mono" style={{ color: 'rgba(244,244,232,0.3)' }}>
                Nenhum outro terminal
              </div>
            ) : (
              otherTerminals.map((t) => {
                const active = linkedTerminalIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => handleLinkToggle(t.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[0.6rem] font-mono transition-colors hover:bg-white/5"
                    style={{ color: active ? '#FF6B35' : 'rgba(244,244,232,0.55)' }}
                  >
                    <span
                      className="w-[5px] h-[5px] rounded-full shrink-0"
                      style={{ background: active ? '#FF4400' : 'rgba(156,156,156,0.4)' }}
                    />
                    {t.agentName}
                    {active && <span className="ml-auto text-[0.45rem]" style={{ color: '#FF4400' }}>✓</span>}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
