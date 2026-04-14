'use client';

/**
 * CommandRoomProjectSelector — Sala de Comando v2 · Story 9.1c
 *
 * Dropdown de seleção de projeto para a Sala de Comando.
 * Exibe projeto atual, MRU, projetos conhecidos e input para path manual.
 *
 * Tokens: packages/ui/tokens.css (Padmé JOB-016)
 * Hook: useCommandRoomProject (estado + API calls)
 * Integrado: /command-room page (não /spike)
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { useCommandRoomProject } from './useCommandRoomProject';
import type { RecentProject } from '../canvas/store/canvasStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function projectBaseName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

function truncatePath(path: string, maxLen = 48): string {
  if (path.length <= maxLen) return path;
  const parts = path.split('/');
  if (parts.length <= 2) return '…/' + parts.at(-1);
  return '…/' + parts.slice(-2).join('/');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectOption {
  path: string;
  name: string;
  badge?: 'recent' | 'project';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandRoomProjectSelector() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [showPathInput, setShowPathInput] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pathRef = useRef<HTMLInputElement>(null);

  const {
    currentProjectPath,
    recentProjects,
    catalogLoading,
    openProject,
  } = useCommandRoomProject();

  const { projects: legacyProjects } = useProjects();

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowPathInput(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Foca o search input ao abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 40);
    }
  }, [open]);

  // Foca o path input quando mostrado
  useEffect(() => {
    if (showPathInput) {
      setTimeout(() => pathRef.current?.focus(), 40);
    }
  }, [showPathInput]);

  // Monta lista unificada (legacyProjects + recentProjects, sem duplicatas)
  const allOptions = useMemo((): ProjectOption[] => {
    const seen = new Set<string>();
    const result: ProjectOption[] = [];

    for (const r of recentProjects) {
      if (seen.has(r.path)) continue;
      seen.add(r.path);
      result.push({ path: r.path, name: r.name, badge: 'recent' });
    }

    for (const p of legacyProjects) {
      if (!p.path || seen.has(p.path)) continue;
      seen.add(p.path);
      result.push({ path: p.path, name: p.name || projectBaseName(p.path), badge: 'project' });
    }

    return result;
  }, [recentProjects, legacyProjects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allOptions;
    const q = search.toLowerCase();
    return allOptions.filter(
      (o) => o.name.toLowerCase().includes(q) || o.path.toLowerCase().includes(q),
    );
  }, [allOptions, search]);

  const handleSelect = useCallback(
    (opt: ProjectOption) => {
      openProject(opt.path);
      setOpen(false);
      setSearch('');
    },
    [openProject],
  );

  const handlePathSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const p = pathInput.trim();
      if (!p) return;
      openProject(p);
      setPathInput('');
      setShowPathInput(false);
      setOpen(false);
    },
    [pathInput, openProject],
  );

  const currentName = currentProjectPath ? projectBaseName(currentProjectPath) : null;

  return (
    <div
      ref={dropdownRef}
      style={{ position: 'relative', userSelect: 'none' }}
    >
      {/* ── Trigger pill ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title={currentProjectPath ?? 'Nenhum projeto aberto'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 28,
          padding: '0 10px 0 8px',
          background: open ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
          border: '1px solid var(--sc-surface-300, #262B36)',
          borderRadius: 8,
          color: currentName ? 'var(--sc-text-primary, #E8EAED)' : 'var(--sc-text-subtle, #6B7280)',
          fontSize: 12,
          fontWeight: currentName ? 500 : 400,
          cursor: 'pointer',
          transition: 'background var(--sc-duration-instant, 120ms)',
          minWidth: 0,
          maxWidth: 240,
        }}
      >
        {/* Ícone pasta */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke={currentName ? 'var(--sc-text-muted, #9BA1AD)' : 'var(--sc-text-subtle, #6B7280)'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <path d="M1.5 3.5h4l1.5 2h7.5v8.5h-13V3.5z" />
        </svg>

        {/* Texto */}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {currentName ?? 'Abrir projeto…'}
        </span>

        {/* Spinner ou chevron */}
        {catalogLoading ? (
          <SpinnerIcon />
        ) : (
          <ChevronIcon flipped={open} />
        )}
      </button>

      {/* ── Dropdown ──────────────────────────────────────────────────────── */}
      {open && (
        <div
          role="listbox"
          aria-label="Selecionar projeto"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: 280,
            maxWidth: 400,
            background: 'var(--sc-surface-100, #15181F)',
            border: '1px solid var(--sc-surface-300, #262B36)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'sc-palette-in var(--sc-duration-fast, 160ms) var(--sc-ease-spring, cubic-bezier(0.16,1,0.3,1)) both',
          }}
        >
          {/* ── Barra de busca ────────────────────────────────────────────── */}
          <div style={{ padding: '8px 8px 4px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--sc-surface-200, #1C2029)',
                border: '1px solid var(--sc-surface-300, #262B36)',
                borderRadius: 7,
                padding: '0 8px',
                height: 30,
              }}
            >
              <SearchIcon />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); } }}
                placeholder="Buscar projeto…"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--sc-text-primary, #E8EAED)',
                  fontSize: 12,
                  fontFamily: 'var(--sc-font-sans, inherit)',
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--sc-text-subtle, #6B7280)',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <XIcon />
                </button>
              )}
            </div>
          </div>

          {/* ── Lista de projetos ────────────────────────────────────────── */}
          <div
            style={{
              maxHeight: 280,
              overflowY: 'auto',
              padding: '4px 0',
            }}
          >
            {filtered.length === 0 && !showPathInput && (
              <div
                style={{
                  padding: '12px 14px',
                  color: 'var(--sc-text-subtle, #6B7280)',
                  fontSize: 12,
                  textAlign: 'center',
                }}
              >
                Nenhum projeto encontrado
              </div>
            )}

            {filtered.map((opt) => {
              const isActive = opt.path === currentProjectPath;
              return (
                <button
                  key={opt.path}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(opt)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 12px',
                    background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: isActive ? 'var(--sc-text-primary, #E8EAED)' : 'var(--sc-text-muted, #9BA1AD)',
                    fontSize: 12,
                    textAlign: 'left',
                    transition: 'background var(--sc-duration-instant, 120ms)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  {/* Ícone folder */}
                  <span style={{ fontSize: 13, flexShrink: 0 }}>📁</span>

                  {/* Nome + path truncado */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--sc-text-primary, #E8EAED)' : undefined,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {opt.name}
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: 'var(--sc-text-subtle, #6B7280)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: 1,
                      }}
                    >
                      {truncatePath(opt.path)}
                    </div>
                  </div>

                  {/* Badge source */}
                  {opt.badge && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: opt.badge === 'recent'
                          ? 'var(--sc-warning, #F59E0B)'
                          : 'var(--sc-text-subtle, #6B7280)',
                        flexShrink: 0,
                      }}
                    >
                      {opt.badge === 'recent' ? 'recente' : 'projeto'}
                    </span>
                  )}

                  {/* Check mark */}
                  {isActive && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M2 6l3 3 5-5" stroke="var(--sc-success, #10B981)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Divisor ──────────────────────────────────────────────────── */}
          <div style={{ height: 1, background: 'var(--sc-surface-300, #262B36)', margin: '0 8px' }} />

          {/* ── Abrir pasta… ─────────────────────────────────────────────── */}
          <div style={{ padding: '4px 0 8px' }}>
            {!showPathInput ? (
              <button
                onClick={() => setShowPathInput(true)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--sc-text-muted, #9BA1AD)',
                  fontSize: 12,
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 13 }}>🗂️</span>
                <span>Abrir pasta…</span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--sc-text-subtle, #6B7280)' }}>
                  cole o caminho
                </span>
              </button>
            ) : (
              <form onSubmit={handlePathSubmit} style={{ padding: '4px 8px 0' }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    background: 'var(--sc-surface-200, #1C2029)',
                    border: '1px solid var(--sc-surface-300, #262B36)',
                    borderRadius: 7,
                    padding: '0 6px 0 10px',
                    height: 32,
                  }}
                >
                  <input
                    ref={pathRef}
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setShowPathInput(false); }}
                    placeholder="/Users/me/projeto"
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--sc-text-primary, #E8EAED)',
                      fontSize: 12,
                      fontFamily: 'var(--sc-font-mono, monospace)',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!pathInput.trim()}
                    style={{
                      flexShrink: 0,
                      padding: '3px 8px',
                      background: pathInput.trim() ? 'var(--sc-success, #10B981)' : 'transparent',
                      border: `1px solid ${pathInput.trim() ? 'var(--sc-success, #10B981)' : 'var(--sc-surface-400, #353B48)'}`,
                      borderRadius: 5,
                      color: pathInput.trim() ? '#0c0e14' : 'var(--sc-text-subtle, #6B7280)',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: pathInput.trim() ? 'pointer' : 'default',
                      transition: 'all var(--sc-duration-instant, 120ms)',
                    }}
                  >
                    Abrir
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: 'var(--sc-text-subtle, #6B7280)',
                    padding: '4px 2px 0',
                  }}
                >
                  Cole o caminho absoluto do projeto · ↵ confirma · Esc cancela
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="var(--sc-text-muted, #9BA1AD)"
      strokeWidth="1.5"
      strokeLinecap="round"
      style={{
        flexShrink: 0,
        animation: 'spin 1s linear infinite',
      }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <path d="M6 1v2M6 9v2M1 6h2M9 6h2M2.3 2.3l1.4 1.4M8.3 8.3l1.4 1.4M2.3 9.7l1.4-1.4M8.3 3.7l1.4-1.4" />
    </svg>
  );
}

function ChevronIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        flexShrink: 0,
        transform: flipped ? 'rotate(180deg)' : 'none',
        transition: 'transform var(--sc-duration-instant, 120ms)',
      }}
    >
      <path d="M2 4l3 3 3-3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="var(--sc-text-subtle, #6B7280)"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11l3 3" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 2l6 6M8 2l-6 6" />
    </svg>
  );
}
