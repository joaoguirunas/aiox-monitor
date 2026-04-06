'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Project } from '@/lib/types';

interface PtyProcess {
  id: string;
  agentName: string;
  projectPath?: string;
  pid: number | null;
  status: string;
  pty_status?: string;
  createdAt: string;
  cols?: number;
  rows?: number;
}

const PTY_STATUS_MAP: Record<string, { color: string; label: string }> = {
  spawning: { color: '#0099FF', label: 'Iniciando' },
  active:   { color: '#34d399', label: 'Ativo' },
  idle:     { color: '#f59e0b', label: 'Idle' },
  error:    { color: '#EF4444', label: 'Erro' },
  crashed:  { color: '#EF4444', label: 'Crashed' },
  closed:   { color: '#3D3D3D', label: 'Fechado' },
};

interface ProjectWithStats extends Project {
  events: number;
  agents: number;
  sessions: number;
}

interface TabProjectsProps {
  projects: ProjectWithStats[];
  onProjectsReload: () => void;
  showToast: (type: 'success' | 'error', message: string) => void;
}

export function TabProjects({ projects, onProjectsReload, showToast }: TabProjectsProps) {
  const [confirmAction, setConfirmAction] = useState<{ projectId: number; action: 'delete' | 'clear'; name: string } | null>(null);
  const [ptyProcesses, setPtyProcesses] = useState<PtyProcess[]>([]);
  const [ptyLoading, setPtyLoading] = useState(false);
  const [ptyKillingId, setPtyKillingId] = useState<string | null>(null);
  const [ptyKillingAll, setPtyKillingAll] = useState(false);
  const ptyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPtyProcesses = useCallback(async () => {
    setPtyLoading(true);
    try {
      const res = await fetch('/api/command-room/list');
      if (res.ok) {
        const data = await res.json();
        setPtyProcesses(data.terminals ?? []);
      }
    } catch { /* ignore */ } finally {
      setPtyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPtyProcesses();
    ptyIntervalRef.current = setInterval(loadPtyProcesses, 10000);
    return () => { if (ptyIntervalRef.current) clearInterval(ptyIntervalRef.current); };
  }, [loadPtyProcesses]);

  const handleKillPty = useCallback(async (id: string) => {
    setPtyKillingId(id);
    try {
      await fetch(`/api/command-room/${id}`, { method: 'DELETE' });
      await loadPtyProcesses();
    } catch { /* ignore */ } finally {
      setPtyKillingId(null);
    }
  }, [loadPtyProcesses]);

  const handleKillAllPty = useCallback(async () => {
    setPtyKillingAll(true);
    try {
      await fetch('/api/command-room/kill?all=true', { method: 'DELETE' });
      await loadPtyProcesses();
    } catch { /* ignore */ } finally {
      setPtyKillingAll(false);
    }
  }, [loadPtyProcesses]);

  async function handleProjectAction() {
    if (!confirmAction) return;
    const { projectId, action } = confirmAction;
    try {
      if (action === 'delete') {
        const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        showToast('success', 'Projeto apagado com sucesso');
      } else {
        const res = await fetch(`/api/projects/${projectId}/events`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        const data = await res.json();
        showToast('success', `${data.events} eventos e ${data.sessions} sessões limpos`);
      }
      onProjectsReload();
    } catch {
      showToast('error', 'Erro ao executar ação');
    } finally {
      setConfirmAction(null);
    }
  }

  const activePty = ptyProcesses.filter(p => p.status !== 'closed');

  return (
    <div className="space-y-6">
      {/* Projects */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-medium text-text-secondary">Projetos Registrados</span>
          <div className="h-px flex-1 bg-border/60" />
          <span className="text-[11px] tabular-nums text-text-muted">{projects.length}</span>
        </div>

        {projects.length === 0 ? (
          <p className="text-[11px] text-text-muted py-4">Nenhum projeto registrado</p>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-surface-1/30 px-4 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-text-primary truncate">{p.name}</div>
                  <div className="text-[11px] text-text-muted truncate mt-0.5">{p.path}</div>
                  <div className="flex gap-3 mt-1 text-[11px] text-text-muted">
                    <span>{p.events} eventos</span>
                    <span>{p.agents} agentes</span>
                    <span>{p.sessions} sessões</span>
                  </div>
                </div>
                <div className="flex gap-2 ml-3 shrink-0">
                  <button
                    onClick={() => setConfirmAction({ projectId: p.id, action: 'clear', name: p.name })}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    Limpar
                  </button>
                  <button
                    onClick={() => setConfirmAction({ projectId: p.id, action: 'delete', name: p.name })}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    Apagar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PTY Processes */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-medium text-text-secondary">Processos PTY Ativos</span>
          <div className="h-px flex-1 bg-border/60" />
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-text-muted">{activePty.length}</span>
            {activePty.length > 0 && (
              <button
                onClick={handleKillAllPty}
                disabled={ptyKillingAll}
                className="px-2 py-0.5 text-[10px] font-medium rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
              >
                {ptyKillingAll ? 'Matando...' : 'Matar Todos'}
              </button>
            )}
          </div>
        </div>

        {ptyLoading && activePty.length === 0 ? (
          <div className="h-8 shimmer rounded w-full" />
        ) : activePty.length === 0 ? (
          <p className="text-[11px] text-text-muted py-4">Nenhum processo PTY ativo</p>
        ) : (
          <div className="space-y-1.5">
            {activePty.map((proc) => {
              const statusInfo = PTY_STATUS_MAP[proc.status] || PTY_STATUS_MAP.closed;
              return (
                <div
                  key={proc.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-surface-1/30 px-3 py-2 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: statusInfo.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-text-primary truncate">
                        {proc.agentName}
                        <span className="text-text-muted/50 ml-1.5 font-normal">PID {proc.pid}</span>
                      </div>
                      <div className="text-[10px] text-text-muted truncate">{proc.projectPath}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className="text-[10px] font-medium" style={{ color: statusInfo.color }}>
                      {statusInfo.label}
                    </span>
                    <button
                      onClick={() => handleKillPty(proc.id)}
                      disabled={ptyKillingId === proc.id}
                      className="px-2 py-0.5 text-[10px] font-medium rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
                    >
                      {ptyKillingId === proc.id ? '...' : 'Kill'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirmAction && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40" onClick={() => setConfirmAction(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-surface-1 border border-border rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
              <h3 className="text-[13px] font-semibold text-text-primary font-display">
                {confirmAction.action === 'delete' ? 'Apagar Projeto' : 'Limpar Eventos'}
              </h3>
              <p className="text-[12px] text-text-secondary leading-relaxed">
                {confirmAction.action === 'delete'
                  ? `Tem certeza que deseja apagar "${confirmAction.name}" e TODOS os dados associados (eventos, agentes, sessões, terminais)? Esta ação é irreversível.`
                  : `Tem certeza que deseja limpar todos os eventos e sessões de "${confirmAction.name}"? Os agentes e o projeto serão mantidos.`
                }
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-3 py-1.5 text-[11px] font-medium rounded-md border border-border/50 text-text-secondary hover:bg-white/[0.03] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleProjectAction}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded-md text-white transition-colors ${
                    confirmAction.action === 'delete'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >
                  {confirmAction.action === 'delete' ? 'Apagar Tudo' : 'Limpar Eventos'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
