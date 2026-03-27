'use client';

import { useMemo } from 'react';
import { useTerminals } from '@/hooks/useTerminals';
import { useProjectContext } from '@/contexts/ProjectContext';
import { TerminalKanban } from '@/components/terminais/TerminalKanban';
import type { TerminalWithMeta } from '@/app/api/terminals/route';

export default function TerminaisPage() {
  const { selectedProjectId } = useProjectContext();
  const { terminals, loading, refresh } = useTerminals(selectedProjectId);

  // Group by project when no specific project is selected
  const projectGroups = useMemo(() => {
    if (selectedProjectId) return null;

    const groups = new Map<number, { name: string; terminals: TerminalWithMeta[] }>();
    for (const t of terminals) {
      const pid = t.project_id;
      if (!groups.has(pid)) {
        groups.set(pid, { name: t.project_name ?? `Projeto ${pid}`, terminals: [] });
      }
      groups.get(pid)!.terminals.push(t);
    }
    return groups.size > 1 ? groups : null;
  }, [terminals, selectedProjectId]);

  const processing = terminals.filter(t => t.status === 'processing');
  const active = terminals.filter(t => t.status === 'active');
  const inactive = terminals.filter(t => t.status === 'inactive');

  return (
    <main className="w-full px-4 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold text-text-primary font-display tracking-tight">Terminais</h1>
          <span className="text-[11px] text-text-muted">
            {loading ? 'A carregar...' : (
              <>
                {terminals.length} total
                {' · '}
                {processing.length} processando
                {' · '}
                {active.length} ativo{active.length !== 1 ? 's' : ''}
                {' · '}
                {inactive.length} inativo{inactive.length !== 1 ? 's' : ''}
              </>
            )}
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-2.5 py-1 text-[11px] font-medium text-text-muted hover:text-text-secondary rounded-md border border-border/50 hover:border-border transition-colors disabled:opacity-30"
        >
          Atualizar
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl bg-surface-1/30 border border-border/40 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr] divide-x divide-border/20">
            {[0, 1, 2].map(i => (
              <div key={i} className="px-4 py-3">
                <div className="h-4 w-20 rounded bg-surface-2/30 shimmer mb-3" />
                <div className="h-24 rounded bg-surface-2/20 shimmer" />
              </div>
            ))}
          </div>
        </div>
      ) : terminals.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-text-secondary font-medium">Nenhum terminal rastreado</p>
          <p className="text-[11px] text-text-muted mt-1.5">Terminais aparecem aqui quando o hook do monitor recebe eventos</p>
        </div>
      ) : projectGroups ? (
        /* Multiple projects — one Kanban block per project */
        <div className="space-y-4">
          {Array.from(projectGroups.entries()).map(([pid, group]) => (
            <section key={pid} aria-label={`Projeto ${group.name}`} className="rounded-xl bg-surface-1/30 border border-border/40 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-surface-1/40">
                <div className="flex items-center gap-3">
                  <h2 className="text-[13px] font-semibold text-text-primary font-display">{group.name}</h2>
                  <span className="text-[11px] text-text-muted">
                    {group.terminals.length} terminal{group.terminals.length !== 1 ? 'is' : ''}
                  </span>
                </div>
                {group.terminals.some(t => t.status === 'processing') && (
                  <span className="text-[11px] font-medium text-emerald-400/80">
                    {group.terminals.filter(t => t.status === 'processing').length} trabalhando
                  </span>
                )}
              </div>
              <TerminalKanban terminals={group.terminals} />
            </section>
          ))}
        </div>
      ) : (
        /* Single project or all in one — single Kanban block */
        <section className="rounded-xl bg-surface-1/30 border border-border/40 overflow-hidden">
          <TerminalKanban terminals={terminals} />
        </section>
      )}
    </main>
  );
}
