import { SettingBlock } from './SettingBlock';
import {
  ALIEN_SKINS, ANIMAL_SKINS, HUMAN_SKINS,
  type SkinAssignment, type SkinDefinition,
} from '@/game/data/skin-config';
import { PIXELLAB_SPRITES } from '@/game/data/pixellab-sprites';
import type { Agent, Project } from '@/lib/types';

interface ProjectWithStats extends Project {
  events: number;
  agents: number;
  sessions: number;
}

interface TabAgentsProps {
  skinConfig: SkinAssignment;
  onSkinChange: (agentName: string, skinId: string) => void;
  onSkinConfigChange: (updater: (prev: SkinAssignment) => SkinAssignment) => void;
  allAgents: Agent[];
  projects: ProjectWithStats[];
}

export function TabAgents({ skinConfig, onSkinChange, onSkinConfigChange, allAgents, projects }: TabAgentsProps) {
  return (
    <div className="space-y-6">
      <SettingBlock label="Skins dos Agentes">
        <p className="text-[11px] text-text-muted/70 mb-3 leading-relaxed">
          Escolha uma aparência para cada agente. Use os presets por equipe para distribuir automaticamente, ou escolha individualmente.
        </p>

        {allAgents.length === 0 ? (
          <p className="text-[11px] text-text-muted/60 py-3">Nenhum agente registrado ainda.</p>
        ) : (
          <div className="space-y-5">
            {projects.map((project) => {
              const projectAgents = allAgents.filter(a => a.project_id === project.id);
              if (projectAgents.length === 0) return null;

              const applyPresetToTeam = (skins: SkinDefinition[]) => {
                onSkinConfigChange(prev => {
                  const next = { ...prev };
                  projectAgents.forEach((agent, i) => {
                    const key = agent.name.startsWith('@') ? agent.name : `@${agent.name}`;
                    next[key] = skins[i % skins.length].id;
                  });
                  return next;
                });
              };

              const resetTeam = () => {
                onSkinConfigChange(prev => {
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
                    <span className="text-[10px] font-semibold text-accent-orange/80 uppercase tracking-widest">{project.name}</span>
                    <div className="h-px flex-1 bg-border/30" />
                    <span className="text-[10px] tabular-nums text-text-muted/50">{projectAgents.length}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[
                      { label: 'Humanos', icon: '🧑', skins: HUMAN_SKINS },
                      { label: 'Aliens', icon: '👽', skins: ALIEN_SKINS },
                      { label: 'Animais', icon: '🐾', skins: ANIMAL_SKINS },
                    ].map(({ label, icon, skins }) => (
                      <button
                        key={label}
                        onClick={() => applyPresetToTeam(skins)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-border/40 bg-surface-1/40 text-text-secondary hover:border-accent-orange/40 hover:text-text-primary hover:bg-accent-orange/[0.06] transition-colors"
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
                            onChange={(e) => onSkinChange(agentKey, e.target.value)}
                            className="flex-1 bg-surface-1/50 border border-border/50 rounded-md px-2 py-1.5 text-[11px] text-text-primary focus:border-accent-orange/40 focus:outline-none transition-colors appearance-none cursor-pointer"
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
  );
}
