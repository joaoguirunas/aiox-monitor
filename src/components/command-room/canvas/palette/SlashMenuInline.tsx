'use client';

/**
 * SlashMenuInline — Story 9.7
 *
 * Menu de slash commands inline, aparece quando o usuário digita '/' no início
 * do input do AgentChatNode. Posicionado acima da barra de input.
 *
 * Comandos disponíveis: /ask, /task, /broadcast, /clear, /rename, /mute, /unmute, /history
 *
 * Integração no AgentChatNode:
 *  - Renderizar quando input.startsWith('/') && input.length > 0
 *  - Passar onKeyDown para o <input> do AgentChatNode enquanto ativo
 *  - onSelect: preenche input com o comando selecionado
 */

import { useState, useEffect, useCallback, useRef, memo, forwardRef, useImperativeHandle } from 'react';
import styles from './palette.module.css';

// ─── Catálogo de slash commands ───────────────────────────────────────────────

export const SLASH_COMMANDS = [
  {
    id:    '/ask',
    label: '/ask',
    hint:  'Fazer uma pergunta direta ao agente',
  },
  {
    id:    '/task',
    label: '/task',
    hint:  'Enviar uma tarefa para o agente executar',
  },
  {
    id:    '/broadcast',
    label: '/broadcast',
    hint:  'Transmitir mensagem para todos os agentes conectados',
  },
  {
    id:    '/clear',
    label: '/clear',
    hint:  'Limpar histórico da conversa',
  },
  {
    id:    '/rename',
    label: '/rename',
    hint:  'Renomear este agente no canvas',
  },
  {
    id:    '/mute',
    label: '/mute',
    hint:  'Silenciar notificações deste agente',
  },
  {
    id:    '/unmute',
    label: '/unmute',
    hint:  'Reativar notificações deste agente',
  },
  {
    id:    '/history',
    label: '/history',
    hint:  'Ver histórico completo da conversa',
  },
] as const;

export type SlashCommandId = (typeof SLASH_COMMANDS)[number]['id'];

// ─── Props & Handle ───────────────────────────────────────────────────────────

export interface SlashMenuInlineProps {
  /** Tudo depois do '/'; ex: query='ta' filtra para /task */
  query: string;
  /** Chamado ao selecionar um comando — retorna label + espaço */
  onSelect: (command: string) => void;
  /** Chamado ao pressionar Esc ou quando não há resultados */
  onClose: () => void;
}

/** Handle exposto via ref para o parent delegar eventos de teclado */
export interface SlashMenuHandle {
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SlashMenuInline = memo(
  forwardRef<SlashMenuHandle, SlashMenuInlineProps>(function SlashMenuInline(
    { query, onSelect, onClose },
    ref,
  ) {
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = SLASH_COMMANDS.filter(
    (c) =>
      !query ||
      c.label.startsWith('/' + query) ||
      c.hint.toLowerCase().includes(query.toLowerCase()),
  );

  // Reset seleção quando filtro muda
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Rola o item ativo para dentro da view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  /**
   * Expose keyboard handler — AgentChatNode chama isto no onKeyDown do <input>
   * quando SlashMenuInline está visível.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setActiveIdx((i) => (i + 1) % filtered.length);
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (filtered[activeIdx]) {
            onSelect(filtered[activeIdx].label + ' ');
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
        // Tab fecha o menu e deixa o foco no input
        case 'Tab':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, activeIdx, onSelect, onClose],
  );

  // Expõe handleKeyDown para o parent via ref (integração AgentChatNode)
  useImperativeHandle(ref, () => ({ handleKeyDown }), [handleKeyDown]);

  if (filtered.length === 0) return null;

  return (
    <div
      className={styles.slashMenu}
      role="listbox"
      aria-label="Slash commands disponíveis"
      data-slash-menu="true"
    >
      <ul ref={listRef} id="slash-menu-list" className={styles.slashList}>
        {filtered.map((cmd, i) => (
          <li
            key={cmd.id}
            id={`slash-cmd-${cmd.id.slice(1)}`}
            role="option"
            aria-selected={i === activeIdx}
            className={`${styles.slashItem} ${i === activeIdx ? styles.slashItemActive : ''}`}
            onPointerDown={(e) => {
              // preventDefault: não tira foco do input
              e.preventDefault();
              onSelect(cmd.label + ' ');
            }}
            onMouseEnter={() => setActiveIdx(i)}
          >
            <span className={styles.slashLabel}>{cmd.label}</span>
            <span className={styles.slashHint}>{cmd.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}),
);

/**
 * Hook auxiliar para facilitar a integração no AgentChatNode.
 * Retorna: isOpen, query, handlers para o <input> e o <SlashMenuInline>.
 */
export function useSlashMenu(inputValue: string) {
  const isOpen = inputValue.startsWith('/') && inputValue.length > 1;
  const query  = isOpen ? inputValue.slice(1) : '';

  return { isOpen, query };
}
