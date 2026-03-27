import type { AgentWithStats, Project, Terminal, SessionWithSummary } from '@/lib/types';
import { SessionRow } from './SessionRow';

interface SessionTableProps {
  sessions: SessionWithSummary[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  agents: AgentWithStats[];
  projects: Project[];
  terminals: Terminal[];
  onRowClick: (session: SessionWithSummary) => void;
  onLoadMore?: () => void;
  /** Compact mode for side panel — fewer columns */
  compact?: boolean;
}

const COLUMNS = ['Timestamp', 'Projeto', 'Agente / Skill', 'Terminal', 'COD', 'Prompt / Resposta', 'Tools', 'Duração', 'Status'];
const COMPACT_COLUMNS = ['Agente', 'Prompt', 'Tools', 'Status'];

export function SessionTable({ sessions, loading, loadingMore, hasMore, agents, projects, terminals, onRowClick, onLoadMore, compact }: SessionTableProps) {
  const cols = compact ? COMPACT_COLUMNS : COLUMNS;
  return (
    <div className={`${compact ? '' : 'overflow-x-auto rounded-lg border border-border/40'} bg-surface-1/30 w-full`}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/30 bg-surface-1/40">
            {cols.map((col) => (
              <th
                key={col}
                className={`${compact ? 'px-2 py-2' : 'px-4 py-2.5'} text-[11px] font-medium text-text-muted tracking-wide whitespace-nowrap`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <>
              {Array.from({ length: compact ? 4 : 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/20">
                  {cols.map((col) => (
                    <td key={col} className={compact ? 'px-2 py-2' : 'px-4 py-2.5'}>
                      <div className="h-3 shimmer rounded w-full max-w-[100px]" />
                    </td>
                  ))}
                </tr>
              ))}
            </>
          )}

          {!loading && sessions.length === 0 && (
            <tr>
              <td colSpan={cols.length} className={`${compact ? 'px-3 py-8' : 'px-4 py-12'} text-center`}>
                <p className="text-sm text-text-secondary font-medium">Nenhuma sessao registada</p>
                <p className="text-[11px] text-text-muted mt-1.5">Inicie o Claude Code para monitorizar</p>
              </td>
            </tr>
          )}

          {!loading &&
            sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                agents={agents}
                projects={projects}
                terminals={terminals}
                onClick={() => onRowClick(session)}
                compact={compact}
              />
            ))}
        </tbody>
      </table>

      {/* Load more button */}
      {hasMore && !loading && (
        <div className="flex justify-center py-3 border-t border-border/20">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-4 py-1.5 text-[11px] font-medium text-text-muted hover:text-text-secondary rounded-md border border-border/50 hover:border-border transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-text-muted/40 border-t-text-muted rounded-full animate-spin" />
                A carregar...
              </span>
            ) : (
              'Carregar mais'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
