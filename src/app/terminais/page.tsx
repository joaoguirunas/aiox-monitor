'use client';

import { useState, useMemo } from 'react';
import { useTerminals } from '@/hooks/useTerminals';
import { useProjects } from '@/hooks/useProjects';
import { TerminalKanban } from '@/components/terminais/TerminalKanban';

export default function TerminaisPage() {
  const { terminals, loading, refresh } = useTerminals();
  const { projects } = useProjects();
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);

  const toggleProject = (id: number) => {
    setSelectedProjectIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id],
    );
  };

  const filtered = useMemo(() => {
    if (selectedProjectIds.length === 0) return terminals;
    return terminals.filter(t => selectedProjectIds.includes(t.project_id));
  }, [terminals, selectedProjectIds]);

  const processing = filtered.filter(t => t.status === 'processing');
  const active = filtered.filter(t => t.status === 'active');
  const inactive = filtered.filter(t => t.status === 'inactive');

  return (
    <main className="w-full px-4 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold text-text-primary font-display tracking-tight">Terminais</h1>
          <span className="text-[11px] text-text-muted">
            {loading ? 'A carregar...' : (
              <>
                {filtered.length} total
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

      {/* Project filter bar */}
      {projects.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-widest shrink-0">Projetos:</span>
          {projects.map(p => {
            const isSelected = selectedProjectIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleProject(p.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  isSelected
                    ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                    : 'bg-surface-2/40 text-text-muted border-border/30 hover:border-border/60'
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl bg-surface-1/30 border border-border/40 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr] divide-x divide-border/20">
            {[0, 1, 2].map(i => (
              <div key={i} className="px-4 py-3 min-h-[120px]">
                <div className="h-3 w-16 rounded bg-surface-2/30 shimmer mb-3" />
                <div className="h-20 rounded bg-surface-2/20 shimmer" />
              </div>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-text-secondary font-medium">Nenhum terminal rastreado</p>
          <p className="text-[11px] text-text-muted mt-1.5">
            {selectedProjectIds.length > 0
              ? 'Nenhum terminal nos projetos selecionados'
              : 'Terminais aparecem aqui quando o hook do monitor recebe eventos'}
          </p>
        </div>
      ) : (
        <section className="rounded-xl bg-surface-1/30 border border-border/40 overflow-hidden">
          <TerminalKanban terminals={filtered} />
        </section>
      )}
    </main>
  );
}
