import type { AgentWithStats, Project, Terminal } from '@/lib/types';
import { SessionRow } from './SessionRow';
import type { SessionGroup } from './SessionRow';

interface SessionTableProps {
  sessions: SessionGroup[];
  loading: boolean;
  agents: AgentWithStats[];
  projects: Project[];
  terminals: Terminal[];
  onRowClick: (session: SessionGroup) => void;
}

const COLUMNS = ['Timestamp', 'Projeto', 'Agente', 'Terminal', 'COD', 'Prompt / Resposta', 'Tools', 'Status'];

export function SessionTable({ sessions, loading, agents, projects, terminals, onRowClick }: SessionTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/40 bg-surface-1/30 w-full">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/30 bg-surface-1/40">
            {COLUMNS.map((col) => (
              <th
                key={col}
                className="px-4 py-2.5 text-[11px] font-medium text-text-muted tracking-wide whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/20">
                  {COLUMNS.map((col) => (
                    <td key={col} className="px-4 py-2.5">
                      <div className="h-3 shimmer rounded w-full max-w-[100px]" />
                    </td>
                  ))}
                </tr>
              ))}
            </>
          )}

          {!loading && sessions.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-4 py-12 text-center">
                <p className="text-sm text-text-secondary font-medium">Nenhuma sessão registada</p>
                <p className="text-[11px] text-text-muted mt-1.5">Inicie o Claude Code para monitorizar</p>
              </td>
            </tr>
          )}

          {!loading &&
            sessions.map((session, i) => (
              <SessionRow
                key={session.sessionId ?? `s-${i}`}
                session={session}
                agents={agents}
                projects={projects}
                terminals={terminals}
                onClick={() => onRowClick(session)}
              />
            ))}
        </tbody>
      </table>
    </div>
  );
}
