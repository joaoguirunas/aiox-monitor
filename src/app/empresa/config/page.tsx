'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { setTheme } from '@/game/bridge/react-phaser-bridge';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  ALIEN_SKINS, ANIMAL_SKINS, HUMAN_SKINS,
  loadSkinConfig, saveSkinConfig,
  type SkinAssignment, type SkinDefinition,
} from '@/game/data/skin-config';
import { PIXELLAB_SPRITES } from '@/game/data/pixellab-sprites';
import type { CompanyConfig, ThemeName, Project, Agent } from '@/lib/types';

const THEMES: { value: ThemeName; label: string; description: string }[] = [
  { value: 'moderno', label: 'Moderno', description: 'Clean, minimal, cores neutras' },
  { value: 'espacial', label: 'Espacial', description: 'Azul profundo, estrelas, glow cyan' },
  { value: 'oldschool', label: 'Oldschool', description: 'Madeira, tons quentes, telas CRT verdes' },
  { value: 'cyberpunk', label: 'Cyberpunk', description: 'Neon, rosa/cyan, scanlines' },
];

interface ProjectWithStats extends Project {
  events: number;
  agents: number;
  sessions: number;
}

export default function CompanyConfigPage() {
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ projectId: number; action: 'delete' | 'clear'; name: string } | null>(null);
  const [skinConfig, setSkinConfig] = useState<SkinAssignment>({});
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const { lastMessage, reconnectCount } = useWebSocket();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAgents = useCallback(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((agents: Agent[]) => setAllAgents(agents))
      .catch(() => {});
  }, []);

  const loadProjects = useCallback(() => {
    fetch('/api/projects?stats=1')
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => {});
  }, []);

  const loadProjectsDebounced = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadProjects, 500);
  }, [loadProjects]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  useEffect(() => {
    fetch('/api/company-config')
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setToast({ type: 'error', message: 'Erro ao carregar configuração' }));
    setSkinConfig(loadSkinConfig());
    loadProjects();
    loadAgents();
  }, [loadProjects, loadAgents]);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'project:update') {
      loadProjectsDebounced();
    }
  }, [lastMessage, loadProjectsDebounced]);

  useEffect(() => {
    if (reconnectCount === 0) return;
    loadProjects();
  }, [reconnectCount, loadProjects]);

  function handleThemeChange(theme: ThemeName) {
    if (!config) return;
    setConfig({ ...config, theme });
    setTheme(theme);
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('/api/company-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          theme: config.theme,
          ambient_music: config.ambient_music,
          idle_timeout_lounge: config.idle_timeout_lounge,
          idle_timeout_break: config.idle_timeout_break,
        }),
      });
      if (!res.ok) throw new Error();
      saveSkinConfig(skinConfig);
      showToast('success', 'Configuração salva! Redirecionando...');
      setTimeout(() => { window.location.href = '/empresa'; }, 800);
    } catch {
      showToast('error', 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  function handleSkinChange(agentName: string, skinId: string) {
    setSkinConfig(prev => {
      const next = { ...prev };
      if (skinId === 'default') {
        delete next[agentName];
      } else {
        next[agentName] = skinId;
      }
      return next;
    });
  }

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
      loadProjects();
    } catch {
      showToast('error', 'Erro ao executar ação');
    } finally {
      setConfirmAction(null);
    }
  }

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  if (!config) {
    return (
      <main className="w-full px-4 py-5">
        <div className="max-w-3xl space-y-5">
          <div className="h-4 shimmer rounded w-48" />
          <div className="h-9 shimmer rounded w-full" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 shimmer rounded-lg" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="w-full px-4 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-sm font-semibold text-text-primary font-display tracking-tight">
          Configuração
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={loadProjects}
            className="px-2.5 py-1 text-[11px] font-medium text-text-muted hover:text-text-secondary rounded-md border border-border/50 hover:border-border transition-colors"
          >
            Atualizar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-[11px] font-medium text-white bg-accent-blue hover:bg-accent-blue/80 rounded-md transition-colors disabled:opacity-40"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8">
        {/* Left: Settings */}
        <div className="space-y-6">
          {/* Nome */}
          <SettingBlock label="Nome da Empresa">
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="w-full bg-surface-1/50 border border-border/50 rounded-md px-3 py-2 text-[13px] text-text-primary focus:border-accent-blue/40 focus:outline-none transition-colors"
            />
          </SettingBlock>

          {/* Tema */}
          <SettingBlock label="Tema Visual">
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => handleThemeChange(t.value)}
                  className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    config.theme === t.value
                      ? 'border-accent-blue/50 bg-accent-blue/[0.06] text-text-primary'
                      : 'border-border/40 bg-surface-1/30 text-text-secondary hover:border-border hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="text-[12px] font-medium">{t.label}</div>
                  <div className="text-[11px] text-text-muted mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
          </SettingBlock>

          {/* Timeouts */}
          <SettingBlock label="Timeouts de Inatividade">
            <p className="text-[11px] text-text-muted/70 mb-3 leading-relaxed">
              Controla o comportamento dos agentes no modo Empresa quando ficam sem atividade.
              Após o primeiro timeout, o agente vai para o lounge. Após o segundo, vai tomar café.
            </p>
            <div className="space-y-3">
              <RangeField
                label="Working → Lounge"
                hint="Tempo sem eventos até o agente ir descansar no lounge"
                value={config.idle_timeout_lounge}
                min={60} max={1800} step={60}
                display={`${Math.round(config.idle_timeout_lounge / 60)} min`}
                onChange={(v) => setConfig({ ...config, idle_timeout_lounge: v })}
              />
              <RangeField
                label="Lounge → Café"
                hint="Tempo adicional até o agente ir tomar café (pausa longa)"
                value={config.idle_timeout_break}
                min={300} max={3600} step={60}
                display={`${Math.round(config.idle_timeout_break / 60)} min`}
                onChange={(v) => setConfig({ ...config, idle_timeout_break: v })}
              />
            </div>
          </SettingBlock>

          {/* Music toggle */}
          <SettingBlock label="Música Ambiente">
            <button
              onClick={() => setConfig({ ...config, ambient_music: config.ambient_music ? 0 : 1 })}
              className="flex items-center gap-2.5"
            >
              <div className={`w-9 h-5 rounded-full transition-colors ${config.ambient_music ? 'bg-accent-blue' : 'bg-surface-3'}`}>
                <div className={`w-4 h-4 mt-0.5 rounded-full bg-white transition-transform ${config.ambient_music ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-[11px] text-text-muted">{config.ambient_music ? 'Ligada' : 'Desligada'}</span>
            </button>
          </SettingBlock>

          {/* Skins dos Agentes */}
          <SettingBlock label="Skins dos Agentes">
            <p className="text-[11px] text-text-muted/70 mb-3 leading-relaxed">
              Escolha uma aparência para cada agente. Use os presets por equipe para distribuir automaticamente, ou escolha individualmente.
            </p>

            {/* Agents grouped by project, each with own preset buttons */}
            {allAgents.length === 0 ? (
              <p className="text-[11px] text-text-muted/60 py-3">Nenhum agente registrado ainda.</p>
            ) : (
              <div className="space-y-5">
                {projects.map((project) => {
                  const projectAgents = allAgents.filter(a => a.project_id === project.id);
                  if (projectAgents.length === 0) return null;

                  const applyPresetToTeam = (skins: SkinDefinition[]) => {
                    setSkinConfig(prev => {
                      const next = { ...prev };
                      projectAgents.forEach((agent, i) => {
                        const key = agent.name.startsWith('@') ? agent.name : `@${agent.name}`;
                        next[key] = skins[i % skins.length].id;
                      });
                      return next;
                    });
                  };

                  const resetTeam = () => {
                    setSkinConfig(prev => {
                      const next = { ...prev };
                      projectAgents.forEach((agent) => {
                        const key = agent.name.startsWith('@') ? agent.name : `@${agent.name}`;
                        delete next[key];
                      });
                      return next;
                    });
                  };

                  return (
                    <div key={project.id} className="rounded-lg border border-border/30 bg-surface-1/20 p-3">
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-[10px] font-semibold text-accent-blue/80 uppercase tracking-widest">{project.name}</span>
                        <div className="h-px flex-1 bg-border/30" />
                        <span className="text-[10px] tabular-nums text-text-muted/50">{projectAgents.length}</span>
                      </div>

                      {/* Per-team preset buttons */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {[
                          { label: 'Humanos', icon: '🧑', skins: HUMAN_SKINS },
                          { label: 'Aliens', icon: '👽', skins: ALIEN_SKINS },
                          { label: 'Animais', icon: '🐾', skins: ANIMAL_SKINS },
                        ].map(({ label, icon, skins }) => (
                          <button
                            key={label}
                            onClick={() => applyPresetToTeam(skins)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-border/40 bg-surface-1/40 text-text-secondary hover:border-accent-blue/40 hover:text-text-primary hover:bg-accent-blue/[0.06] transition-colors"
                          >
                            <span>{icon}</span> {label}
                          </button>
                        ))}
                        <button
                          onClick={resetTeam}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-border/40 bg-surface-1/40 text-text-secondary hover:border-border hover:text-text-primary transition-colors"
                        >
                          <span>↺</span> Reset
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {projectAgents.map((agent) => {
                          const agentKey = agent.name.startsWith('@') ? agent.name : `@${agent.name}`;
                          const currentSkin = skinConfig[agentKey] || 'default';
                          const skinDef = [...HUMAN_SKINS, ...ALIEN_SKINS, ...ANIMAL_SKINS].find(s => s.id === currentSkin);
                          const spriteEntry = PIXELLAB_SPRITES[agentKey];
                          const displayLabel = agent.display_name || agent.name.replace(/^@/, '');
                          return (
                            <div key={agent.id} className="flex items-center gap-3">
                              <div className="flex items-center gap-2 min-w-[140px]">
                                {skinDef ? (
                                  <img
                                    src={`${skinDef.basePath}-south.png`}
                                    alt={skinDef.label}
                                    className="w-7 h-7 object-contain"
                                    style={{ imageRendering: 'pixelated' }}
                                  />
                                ) : spriteEntry ? (
                                  <img
                                    src={spriteEntry.directions.south}
                                    alt={displayLabel}
                                    className="w-7 h-7 object-contain"
                                    style={{ imageRendering: 'pixelated' }}
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-surface-3/60 flex items-center justify-center text-[10px] font-bold text-text-muted/60 uppercase">
                                    {displayLabel[0]}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <span className="text-[12px] font-medium text-text-primary truncate block">{displayLabel}</span>
                                  {agent.role && (
                                    <span className="text-[9px] text-text-muted/50 truncate block">{agent.role}</span>
                                  )}
                                </div>
                              </div>
                              <select
                                value={currentSkin}
                                onChange={(e) => handleSkinChange(agentKey, e.target.value)}
                                className="flex-1 bg-surface-1/50 border border-border/50 rounded-md px-2 py-1.5 text-[11px] text-text-primary focus:border-accent-blue/40 focus:outline-none transition-colors appearance-none cursor-pointer"
                              >
                                <option value="default">{spriteEntry ? 'Default (AIOX)' : 'Sem skin'}</option>
                                <optgroup label="Humanos">
                                  {HUMAN_SKINS.map(s => (
                                    <option key={s.id} value={s.id}>{s.label}</option>
                                  ))}
                                </optgroup>
                                <optgroup label="Aliens">
                                  {ALIEN_SKINS.map(s => (
                                    <option key={s.id} value={s.id}>{s.label}</option>
                                  ))}
                                </optgroup>
                                <optgroup label="Animais">
                                  {ANIMAL_SKINS.map(s => (
                                    <option key={s.id} value={s.id}>{s.label}</option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SettingBlock>
        </div>

        {/* Right: Projects */}
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

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-3 py-2 rounded-lg text-[12px] font-medium shadow-lg border ${
          toast.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
        }`}>
          {toast.message}
        </div>
      )}
    </main>
  );
}

function SettingBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-text-muted mb-2">{label}</label>
      {children}
    </div>
  );
}

function RangeField({ label, hint, value, min, max, step, display, onChange }: {
  label: string; hint?: string; value: number; min: number; max: number; step: number; display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-text-muted mb-1">
        <span title={hint}>{label}</span>
        <span className="tabular-nums">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent-blue h-1"
      />
    </div>
  );
}
