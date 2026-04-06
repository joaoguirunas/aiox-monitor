'use client';

import { useEffect, useRef, useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatArtifact {
  type: 'file' | 'command';
  label: string;
  content: string;
}

export interface ChatMessage {
  id: string;
  role: 'chief' | 'agent';
  content: string;
  timestamp: Date;
  artifacts?: ChatArtifact[];
}

interface ChatViewProps {
  messages: ChatMessage[];
  agentName: string;
  onSend: (text: string) => void;
  disabled?: boolean;
}

// ─── ANSI strip ─────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)|\x1b[()][A-B0-2]|\r/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

// ─── Artifact extraction ────────────────────────────────────────────────────

const TOOL_HEADER_RE = /^(?:⏺\s*)?(?:Read|Write|Edit|Bash|Grep|Glob|Agent|Skill)\s*[:(]/i;
const FILE_PATH_RE = /^\s+(?:\/[\w./-]+|src\/[\w./-]+)/;
const BASH_CMD_RE = /^\s*\$\s+(.+)/;

export function extractArtifacts(raw: string): { clean: string; artifacts: ChatArtifact[] } {
  const lines = raw.split('\n');
  const artifacts: ChatArtifact[] = [];
  const clean: string[] = [];
  let inTool = false;
  let toolBuf: string[] = [];
  let toolLabel = '';

  const flushTool = () => {
    if (toolLabel && toolBuf.length > 0) {
      const isCmd = /^bash/i.test(toolLabel);
      artifacts.push({
        type: isCmd ? 'command' : 'file',
        label: toolLabel,
        content: toolBuf.join('\n').trim(),
      });
    }
    toolBuf = [];
    toolLabel = '';
    inTool = false;
  };

  for (const line of lines) {
    if (TOOL_HEADER_RE.test(line)) {
      flushTool();
      inTool = true;
      toolLabel = line.replace(/^⏺\s*/, '').trim();
      toolBuf.push(line);
      continue;
    }
    if (inTool) {
      if (line.trim() === '' && toolBuf.length > 0 && toolBuf[toolBuf.length - 1].trim() === '') {
        flushTool();
        clean.push(line);
      } else {
        toolBuf.push(line);
      }
      continue;
    }

    const bashMatch = line.match(BASH_CMD_RE);
    if (bashMatch) {
      artifacts.push({ type: 'command', label: 'Bash', content: bashMatch[1] });
    }
    const fileMatch = line.match(FILE_PATH_RE);
    if (fileMatch && !bashMatch) {
      // lone file path — keep in text but also note as artifact
    }

    clean.push(line);
  }
  flushTool();

  return {
    clean: clean.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    artifacts,
  };
}

// ─── Collapsible Artifact ───────────────────────────────────────────────────

function ArtifactBlock({ artifact }: { artifact: ChatArtifact }) {
  const [open, setOpen] = useState(false);
  const isCmd = artifact.type === 'command';

  return (
    <div
      className="mt-1.5 rounded overflow-hidden"
      style={{
        border: '1px solid rgba(156,156,156,0.12)',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-left transition-colors hover:bg-white/[0.03]"
      >
        <svg
          width="6" height="6" viewBox="0 0 24 24" fill="currentColor"
          className="shrink-0 transition-transform"
          style={{
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            color: isCmd ? '#f59e0b' : '#0099FF',
          }}
        >
          <polygon points="6 3 20 12 6 21" />
        </svg>
        <span
          className="font-mono text-[0.55rem] font-medium truncate"
          style={{ color: isCmd ? '#f59e0b' : '#0099FF' }}
        >
          {isCmd ? '$ ' : ''}{artifact.label}
        </span>
      </button>
      {open && (
        <pre
          className="px-2 py-1.5 font-mono text-[0.55rem] leading-relaxed overflow-x-auto border-t"
          style={{
            color: 'rgba(244,244,232,0.6)',
            borderColor: 'rgba(156,156,156,0.08)',
            maxHeight: '200px',
          }}
        >
          {artifact.content}
        </pre>
      )}
    </div>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({ message, agentName }: { message: ChatMessage; agentName: string }) {
  const isChief = message.role === 'chief';
  const time = message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex gap-2 ${isChief ? 'justify-start' : 'justify-end'}`}>
      {/* Chief avatar (left) */}
      {isChief && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1"
          style={{ background: 'rgba(255,68,0,0.15)', border: '1px solid rgba(255,68,0,0.3)' }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="#FF4400">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
      )}

      <div style={{ maxWidth: '80%' }}>
        {/* Sender label */}
        <div className={`flex items-center gap-2 mb-0.5 ${isChief ? '' : 'justify-end'}`}>
          <span className="font-mono text-[0.45rem] font-medium uppercase tracking-[0.06em]"
            style={{ color: isChief ? '#FF6B35' : 'rgba(244,244,232,0.4)' }}>
            {isChief ? 'CHIEF' : agentName}
          </span>
          <span className="font-mono text-[0.4rem]" style={{ color: 'rgba(244,244,232,0.2)' }}>
            {time}
          </span>
        </div>

        {/* Bubble */}
        <div
          className="rounded-lg px-3 py-2 font-mono text-[0.65rem] leading-relaxed whitespace-pre-wrap break-words"
          style={isChief ? {
            background: '#1A1A1A',
            border: '1px solid #2D2D2D',
            color: '#F4F4E8',
          } : {
            background: 'rgba(255,68,0,0.08)',
            border: '1px solid rgba(255,68,0,0.2)',
            color: '#F4F4E8',
          }}
        >
          {message.content}

          {/* Artifacts */}
          {message.artifacts && message.artifacts.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.artifacts.map((a, i) => (
                <ArtifactBlock key={i} artifact={a} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent avatar (right) */}
      {!isChief && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1"
          style={{ background: 'rgba(244,244,232,0.06)', border: '1px solid rgba(244,244,232,0.12)' }}
        >
          <span className="font-mono text-[0.5rem] font-bold" style={{ color: 'rgba(244,244,232,0.5)' }}>
            {agentName.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-text-muted">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-[0.6rem] text-text-muted">
        Nenhuma mensagem ainda
      </span>
      <span className="font-mono text-[0.5rem] text-text-muted/60">
        Envie um comando para iniciar o chat
      </span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ChatView({ messages, agentName, onSend, disabled = false }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || disabled) return;
    onSend(text);
    setInput('');
    // Re-focus
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#0A0A0A' }}>
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,68,0,0.2) transparent',
        }}
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} agentName={agentName} />
          ))
        )}
      </div>

      {/* Input area */}
      <div
        className="shrink-0 border-t px-3 py-2"
        style={{ borderColor: 'rgba(156,156,156,0.1)', background: '#0C0C0E' }}
      >
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enviar mensagem..."
            disabled={disabled}
            rows={1}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg font-mono text-[0.65rem] outline-none resize-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(156,156,156,0.15)',
              color: '#F4F4E8',
              maxHeight: '100px',
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 100) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || disabled}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all"
            style={{
              background: input.trim() ? 'rgba(255,68,0,0.15)' : 'rgba(255,255,255,0.03)',
              color: input.trim() ? '#FF6B35' : 'rgba(244,244,232,0.15)',
              border: `1px solid ${input.trim() ? 'rgba(255,68,0,0.3)' : 'rgba(156,156,156,0.1)'}`,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
