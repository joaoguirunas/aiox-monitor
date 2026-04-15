'use client';

/**
 * CommandPaletteGlobal — Story 9.7
 *
 * Paleta de comandos global ⌘K para a Sala de Comando v2.
 *
 * Modos:
 *  - Ações (default): 7 ações nativas com fuzzy search (fuse.js)
 *  - Agentes (/):    catálogo do projeto aberto, agrupado por squad
 *  - Comandos (>):   subconjunto de comandos de canvas
 *
 * Keyboard: ⌘K abre/fecha · ↑↓ navega · ↵ executa · Tab muda modo · Esc fecha
 * A11y: role="dialog" · role="listbox" · role="option" · aria-activedescendant
 *       aria-live="polite" no preview · focus trap · devolve foco ao fechar
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';
import Fuse, { type IFuseOptions } from 'fuse.js';
import {
  Plus,
  Link,
  Save,
  FolderOpen,
  FolderInput,
  FolderMinus,
  Sun,
  Moon,
} from 'lucide-react';

import { useCanvasStore } from '../store/canvasStore';
import type { AgentCatalogEntry } from '@/lib/types';
import styles from './palette.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type PaletteMode = 'actions' | 'agents' | 'commands';

const MODE_ORDER: PaletteMode[] = ['actions', 'agents', 'commands'];

interface BaseItem {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  group: string;
  disabled?: boolean;
  execute: () => void | Promise<void>;
}

interface ActionItem extends BaseItem {
  kind: 'action';
  icon: ReactNode;
}

interface AgentItem extends BaseItem {
  kind: 'agent';
  icon: string;
  entry: AgentCatalogEntry;
}

type PaletteItem = ActionItem | AgentItem;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fuse config alinhada com a spec Rey §6 */
// IFuseOptions<unknown> permite reutilizar para ActionItem e AgentItem sem cast
const FUSE_OPTIONS: IFuseOptions<unknown> = {
  keys: [
    { name: 'label',       weight: 0.5  },
    { name: 'description', weight: 0.25 },
    { name: 'keywords',    weight: 0.25 },
  ],
  threshold:      0.4,
  distance:       100,
  includeScore:   true,
  ignoreLocation: true,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPaletteGlobal() {
  const [open, setOpen]           = useState(false);
  const [mode, setMode]           = useState<PaletteMode>('actions');
  const [query, setQuery]         = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme]         = useState<'dark' | 'light'>('dark');
  const lastFocusRef              = useRef<Element | null>(null);

  const { agentCatalog, currentProjectPath, nodes } = useCanvasStore();

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const openPalette = useCallback(() => {
    lastFocusRef.current = document.activeElement;
    setQuery('');
    setSelectedId(null);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    // Devolve foco ao elemento anterior (§ Acessibilidade)
    const el = lastFocusRef.current;
    if (el instanceof HTMLElement) {
      setTimeout(() => el.focus(), 0);
    }
  }, []);

  // ⌘K no document — capture phase para interceptar antes do ReactFlow
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => {
          if (prev) {
            const el = lastFocusRef.current;
            if (el instanceof HTMLElement) setTimeout(() => el.focus(), 0);
            return false;
          }
          lastFocusRef.current = document.activeElement;
          setQuery('');
          setSelectedId(null);
          return true;
        });
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // Transição automática de modo via prefixo no query (spec §Três Modos)
  useEffect(() => {
    if (mode === 'actions') {
      if (query.startsWith('/')) setMode('agents');
      else if (query.startsWith('>')) setMode('commands');
    }
  }, [query, mode]);

  // Inicializar tema a partir do localStorage
  useEffect(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null;
    if (stored === 'light' || stored === 'dark') setTheme(stored);
  }, []);

  // ─── Actions catalog ───────────────────────────────────────────────────────

  const actions: ActionItem[] = useMemo(
    () => [
      {
        id:          'action.invoke-agent',
        kind:        'action',
        label:       'Invocar agente',
        description: 'Adiciona um agente do catálogo ao canvas ativo',
        icon:        <Plus size={14} />,
        keywords:    ['add', 'agent', 'spawn', 'create'],
        group:       'Ações',
        execute:     () => { setMode('agents'); setQuery('/'); },
      },
      {
        id:          'action.create-connection',
        kind:        'action',
        label:       'Criar conexão',
        description: 'Liga dois agentes para que troquem contexto',
        icon:        <Link size={14} />,
        keywords:    ['link', 'connect', 'edge', 'wire'],
        group:       'Ações',
        execute:     () => { setMode('commands'); setQuery('> connect @'); },
      },
      {
        id:          'action.scenario-save',
        kind:        'action',
        label:       'Salvar cenário',
        description: 'Persiste o layout atual com um nome',
        icon:        <Save size={14} />,
        keywords:    ['save', 'layout', 'snapshot'],
        group:       'Ações',
        disabled:    !currentProjectPath || nodes.length === 0,
        execute:     () => { setMode('commands'); setQuery('> scenario save '); },
      },
      {
        id:          'action.scenario-load',
        kind:        'action',
        label:       'Carregar cenário',
        description: 'Restaura layout de um cenário salvo',
        icon:        <FolderOpen size={14} />,
        keywords:    ['load', 'restore', 'apply', 'scene'],
        group:       'Ações',
        execute:     () => { setMode('commands'); setQuery('> scenario load '); },
      },
      {
        id:          'action.open-project',
        kind:        'action',
        label:       'Abrir projeto',
        description: 'Troca o projeto ativo — catálogo e canvas mudam',
        icon:        <FolderInput size={14} />,
        keywords:    ['open', 'folder', 'project', 'path'],
        group:       'Ações',
        execute:     async () => {
          closePalette();
          try {
            if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
              const dir = await (window as typeof window & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
              await fetch('/api/projects/open', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ projectPath: dir.name }),
              });
            }
          } catch (err) {
            console.error('[CommandPaletteGlobal] open-project:', err);
          }
        },
      },
      {
        id:          'action.close-project',
        kind:        'action',
        label:       'Fechar projeto',
        description: `Libera watchers e limpa o canvas${
          currentProjectPath ? ` (${currentProjectPath.split('/').pop()})` : ''
        }`,
        icon:        <FolderMinus size={14} />,
        keywords:    ['close', 'remove', 'exit'],
        group:       'Ações',
        disabled:    !currentProjectPath,
        execute:     async () => {
          if (!currentProjectPath) return;
          try {
            await fetch('/api/projects/close', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ projectPath: currentProjectPath }),
            });
            closePalette();
          } catch (err) {
            console.error('[CommandPaletteGlobal] close-project:', err);
          }
        },
      },
      {
        id:          'action.toggle-theme',
        kind:        'action',
        label:       'Alternar tema',
        description: `Cicla entre dark e light mode (atual: ${theme})`,
        icon:        theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
        keywords:    ['dark', 'light', 'mode', 'color'],
        group:       'Ações',
        execute:     () => {
          const next = theme === 'dark' ? 'light' : 'dark';
          setTheme(next);
          document.documentElement.classList.toggle('dark', next === 'dark');
          localStorage.setItem('theme', next);
          closePalette();
        },
      },
    ] as ActionItem[],
    [currentProjectPath, nodes.length, theme, closePalette],
  );

  // ─── Agent items ────────────────────────────────────────────────────────────

  const agentItems: AgentItem[] = useMemo(
    () =>
      agentCatalog.map(
        (entry): AgentItem => ({
          id:          `agent.${entry.skill_path}`,
          kind:        'agent',
          label:       entry.display_name,
          description: entry.description ?? `${entry.squad} · ${entry.source}`,
          icon:        entry.icon ?? '🤖',
          keywords:    [entry.squad, entry.agent_id, entry.role ?? ''].filter(Boolean),
          group:       entry.squad,
          entry,
          execute:     async () => {
            if (!currentProjectPath) return;
            try {
              await fetch('/api/agents/invoke', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                  skill_path:  entry.skill_path,
                  projectPath: currentProjectPath,
                  kind:        'chat',
                }),
              });
              closePalette();
            } catch (err) {
              console.error('[CommandPaletteGlobal] invoke-agent:', err);
            }
          },
        }),
      ),
    [agentCatalog, currentProjectPath, closePalette],
  );

  // ─── Fuzzy search ─────────────────────────────────────────────────────────

  const actionFuse = useMemo(
    () => new Fuse(actions, FUSE_OPTIONS),
    [actions],
  );

  const agentFuse = useMemo(
    () => new Fuse(agentItems, FUSE_OPTIONS),
    [agentItems],
  );

  /** Query sem prefixo de modo */
  const rawQuery = query.replace(/^[/>]/, '').trim();

  const filteredActions = useMemo((): ActionItem[] => {
    if (!rawQuery) return actions;
    return actionFuse.search(rawQuery).map((r) => r.item);
  }, [rawQuery, actions, actionFuse]);

  const filteredAgents = useMemo((): AgentItem[] => {
    if (!rawQuery) return agentItems;
    return agentFuse.search(rawQuery).map((r) => r.item);
  }, [rawQuery, agentItems, agentFuse]);

  // Item selecionado (para preview)
  const currentItems: PaletteItem[] =
    mode === 'agents' ? filteredAgents : filteredActions;

  const selectedItem = useMemo(
    () =>
      (selectedId ? currentItems.find((i) => i.id === selectedId) : null) ??
      currentItems[0] ??
      null,
    [selectedId, currentItems],
  );

  // ─── Keyboard ────────────────────────────────────────────────────────────

  const cycleMode = useCallback(
    (dir: 1 | -1) => {
      const idx  = MODE_ORDER.indexOf(mode);
      const next = MODE_ORDER[(idx + dir + MODE_ORDER.length) % MODE_ORDER.length];
      setMode(next);
      setQuery('');
    },
    [mode],
  );

  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        cycleMode(1);
        return;
      }
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        cycleMode(-1);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        closePalette();
        return;
      }
      // Backspace com query vazia fora do modo Ações → volta para Ações
      if (e.key === 'Backspace' && !rawQuery && mode !== 'actions') {
        setMode('actions');
        setQuery('');
      }
    },
    [closePalette, cycleMode, rawQuery, mode],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!open || typeof document === 'undefined') return null;

  const commandsData = [
    { id: 'cmd.connect',       label: '> connect @A @B',        hint: 'Cria aresta entre dois agentes' },
    { id: 'cmd.scenario-save', label: '> scenario save <nome>', hint: 'Salva layout como cenário' },
    { id: 'cmd.scenario-load', label: '> scenario load <nome>', hint: 'Aplica cenário salvo' },
    { id: 'cmd.theme',         label: '> theme',                 hint: 'Alterna dark/light mode' },
  ].filter((c) =>
    !rawQuery ||
    c.label.toLowerCase().includes(rawQuery.toLowerCase()) ||
    c.hint.toLowerCase().includes(rawQuery.toLowerCase()),
  );

  const squadGroups = Array.from(new Set(filteredAgents.map((a) => a.group)));

  const content = (
    <div
      className={styles.overlay}
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
    >
      <div
        role="dialog"
        aria-label="Paleta de comandos"
        aria-modal="true"
        className={styles.dialog}
        onKeyDown={handleDialogKeyDown}
      >
        {/* ── Mode tabs ──────────────────────────────────────────── */}
        <div
          role="tablist"
          aria-label="Modo da paleta"
          className={styles.modeTabs}
        >
          {MODE_ORDER.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={`${styles.modeTab} ${mode === m ? styles.modeTabActive : ''}`}
              onClick={() => { setMode(m); setQuery(''); }}
              type="button"
            >
              {m === 'actions' && 'Ações'}
              {m === 'agents'  && 'Agentes (/)'}
              {m === 'commands' && 'Comandos (>)'}
            </button>
          ))}
        </div>

        {/* ── cmdk Command shell ──────────────────────────────────── */}
        <Command
          className={styles.command}
          shouldFilter={false}
        >
          {/* Search input */}
          <div className={styles.searchRow}>
            <span className={styles.searchIcon} aria-hidden="true">🔎</span>
            <Command.Input
              className={styles.searchInput}
              value={query}
              onValueChange={setQuery}
              placeholder={
                mode === 'agents'   ? '/ Buscar agente…' :
                mode === 'commands' ? '> comando…'        :
                                      'Buscar ações, agentes, comandos…'
              }
              aria-label="Buscar na paleta de comandos"
              autoFocus
            />
            <kbd className={styles.escHint} aria-label="Pressione Escape para fechar">Esc</kbd>
          </div>

          {/* Body: list + preview */}
          <div className={styles.body}>
            {/* ── Results list ──────────────────────────────────── */}
            <Command.List
              className={styles.resultsList}
              aria-label="Resultados"
            >
              <Command.Empty className={styles.empty}>
                Nenhum resultado para &ldquo;{rawQuery}&rdquo;
              </Command.Empty>

              {/* ── Modo Ações ─────────────────────────────────── */}
              {mode === 'actions' && (
                <Command.Group
                  heading="Ações"
                  className={styles.group}
                >
                  {filteredActions.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.id}
                      className={styles.item}
                      disabled={item.disabled}
                      onSelect={() => {
                        setSelectedId(item.id);
                        void item.execute();
                      }}
                      aria-selected={selectedItem?.id === item.id}
                    >
                      <span className={styles.itemIcon} aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className={styles.itemLabel}>{item.label}</span>
                      {item.disabled && (
                        <span className={styles.itemDisabledHint} aria-hidden="true">
                          {!currentProjectPath ? '— sem projeto' : '— canvas vazio'}
                        </span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* ── Modo Agentes ─────────────────────────────────── */}
              {mode === 'agents' && !currentProjectPath && (
                <div className={styles.stateMsg} role="status">
                  Nenhum projeto aberto — use &lsquo;Abrir projeto&rsquo; para começar
                </div>
              )}

              {mode === 'agents' && currentProjectPath && filteredAgents.length === 0 && (
                <div className={styles.stateMsg} role="status">
                  Nenhum agente encontrado em <code>{currentProjectPath}</code>
                </div>
              )}

              {mode === 'agents' && currentProjectPath && squadGroups.map((squad) => (
                <Command.Group
                  key={squad}
                  heading={squad}
                  className={styles.group}
                >
                  {filteredAgents
                    .filter((a) => a.group === squad)
                    .map((item) => (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        className={styles.item}
                        onSelect={() => {
                          setSelectedId(item.id);
                          void item.execute();
                        }}
                        aria-selected={selectedItem?.id === item.id}
                      >
                        <span className={styles.itemIcon} aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className={styles.itemLabel}>{item.label}</span>
                        <span
                          className={`${styles.sourceBadge} ${
                            styles[`source_${item.entry.source}` as keyof typeof styles]
                          }`}
                        >
                          {item.entry.source}
                        </span>
                      </Command.Item>
                    ))}
                </Command.Group>
              ))}

              {/* ── Modo Comandos ───────────────────────────────────── */}
              {mode === 'commands' && (
                <Command.Group
                  heading="Comandos"
                  className={styles.group}
                >
                  {commandsData.map((cmd) => (
                    <Command.Item
                      key={cmd.id}
                      value={cmd.id}
                      className={styles.item}
                      onSelect={() => setQuery(cmd.label.replace(/<[^>]+>/, '').trimEnd() + ' ')}
                    >
                      <span className={styles.itemLabel}>{cmd.label}</span>
                      <span className={styles.itemHint}>{cmd.hint}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>

            {/* ── Preview panel ──────────────────────────────────── */}
            {selectedItem && (
              <div
                key={selectedItem.id}
                className={styles.preview}
                role="region"
                aria-label="Descrição do item selecionado"
                aria-live="polite"
              >
                <div className={styles.previewIcon} aria-hidden="true">
                  {selectedItem.kind === 'agent'
                    ? selectedItem.icon
                    : selectedItem.icon}
                </div>
                <p className={styles.previewTitle}>{selectedItem.label}</p>
                <p className={styles.previewDesc}>{selectedItem.description}</p>
                {selectedItem.kind === 'agent' && (
                  <div className={styles.previewMeta}>
                    <span
                      className={`${styles.sourceBadge} ${
                        styles[`source_${selectedItem.entry.source}` as keyof typeof styles]
                      }`}
                    >
                      {selectedItem.entry.source}
                    </span>
                    {selectedItem.entry.squad && (
                      <span className={styles.previewSquad}>
                        {selectedItem.entry.squad}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Footer hints ─────────────────────────────────────── */}
          <div className={styles.footer} aria-hidden="true">
            <span>↑↓ navegar</span>
            <span>↵ executar</span>
            <span>Tab muda modo</span>
            <span>Esc fechar</span>
            {!currentProjectPath && (
              <span className={styles.offlineHint}>⚠ sem projeto</span>
            )}
          </div>
        </Command>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
