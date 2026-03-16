'use client';

import { useTerminals } from '@/hooks/useTerminals';
import { useProjectContext } from '@/contexts/ProjectContext';
import { TrackedTerminalCard } from '@/components/terminais/TerminalCard';

export default function TerminaisPage() {
  const { selectedProjectId } = useProjectContext();
  const { terminals, loading, refresh } = useTerminals(selectedProjectId);

  const processing = terminals.filter(t => t.status === 'processing');
  const active = terminals.filter(t => t.status === 'active');
  const inactive = terminals.filter(t => t.status === 'inactive');

  const hasData = terminals.length > 0;

  return (
    <main className="w-full px-4 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold text-text-primary font-display tracking-tight">Terminais</h1>
          <span className="text-[11px] text-text-muted">
            {loading ? 'A carregar...' : (
              <>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-36 rounded-lg bg-surface-1/30 border border-border/40 shimmer" />
          ))}
        </div>
      ) : !hasData ? (
        <div className="py-12 text-center">
          <p className="text-sm text-text-secondary font-medium">Nenhum terminal rastreado</p>
          <p className="text-[11px] text-text-muted mt-1.5">Terminais aparecem aqui quando o hook do monitor recebe eventos</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Processando */}
          {processing.length > 0 && (
            <TerminalSection label="Processando" count={processing.length} dot="bg-accent-blue">
              {processing.map(t => (
                <TrackedTerminalCard key={t.id} pid={t.pid} status={t.status} projectName={t.project_name} windowTitle={t.window_title} agentName={t.agent_name} agentDisplayName={t.agent_display_name} currentTool={t.current_tool} currentInput={t.current_input} firstSeen={t.first_seen_at} lastActive={t.last_active} />
              ))}
            </TerminalSection>
          )}

          {/* Ativos */}
          {active.length > 0 && (
            <TerminalSection label="Ativos" count={active.length} dot="bg-emerald-400">
              {active.map(t => (
                <TrackedTerminalCard key={t.id} pid={t.pid} status={t.status} projectName={t.project_name} windowTitle={t.window_title} agentName={t.agent_name} agentDisplayName={t.agent_display_name} currentTool={t.current_tool} currentInput={t.current_input} firstSeen={t.first_seen_at} lastActive={t.last_active} />
              ))}
            </TerminalSection>
          )}

          {/* Inativos */}
          {inactive.length > 0 && (
            <TerminalSection label="Inativos" count={inactive.length} dot="bg-zinc-500">
              {inactive.map(t => (
                <TrackedTerminalCard key={t.id} pid={t.pid} status={t.status} projectName={t.project_name} windowTitle={t.window_title} agentName={t.agent_name} agentDisplayName={t.agent_display_name} currentTool={t.current_tool} currentInput={t.current_input} firstSeen={t.first_seen_at} lastActive={t.last_active} />
              ))}
            </TerminalSection>
          )}
        </div>
      )}
    </main>
  );
}

function TerminalSection({ label, count, dot, children }: { label: string; count: number; dot: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
          <h2 className="text-[13px] font-semibold text-text-primary font-display">{label}</h2>
        </div>
        <div className="h-px flex-1 bg-border/60" />
        <span className="text-[11px] tabular-nums text-text-muted">{count}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        {children}
      </div>
    </section>
  );
}
