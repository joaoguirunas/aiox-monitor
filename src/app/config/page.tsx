'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { setTheme } from '@/game/bridge/react-phaser-bridge';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  loadSkinConfig, saveSkinConfig,
  type SkinAssignment,
} from '@/game/data/skin-config';
import type { CompanyConfig, ThemeName, Project, Agent } from '@/lib/types';
import { TabGeneral } from './_components/TabGeneral';
import { TabAppearance } from './_components/TabAppearance';
import { TabAgents } from './_components/TabAgents';
import { TabProjects } from './_components/TabProjects';

interface ProjectWithStats extends Project {
  events: number;
  agents: number;
  sessions: number;
}

const TABS = [
  { id: 'general', label: 'Geral' },
  { id: 'appearance', label: 'Aparência' },
  { id: 'agents', label: 'Agentes' },
  { id: 'projects', label: 'Projetos' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [skinConfig, setSkinConfig] = useState<SkinAssignment>({});
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const { lastMessage, reconnectCount } = useWebSocket();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const loadAgents = useCallback(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((agents: Agent[]) => setAllAgents(agents))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  useEffect(() => {
    fetch('/api/company-config')
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => showToast('error', 'Erro ao carregar configuração'));
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
      showToast('success', 'Configuração salva!');
    } catch {
      showToast('error', 'Erro ao salvar');
    } finally {
      setSaving(false);
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
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-[11px] font-medium text-white bg-accent-orange hover:bg-accent-orange/80 rounded-md transition-colors disabled:opacity-40"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-border/40">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-[11px] font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent-orange rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="max-w-2xl">
        {activeTab === 'general' && (
          <TabGeneral config={config} onConfigChange={setConfig} />
        )}
        {activeTab === 'appearance' && (
          <TabAppearance config={config} onThemeChange={handleThemeChange} />
        )}
        {activeTab === 'agents' && (
          <TabAgents
            skinConfig={skinConfig}
            onSkinChange={handleSkinChange}
            onSkinConfigChange={setSkinConfig}
            allAgents={allAgents}
            projects={projects}
          />
        )}
        {activeTab === 'projects' && (
          <TabProjects
            projects={projects}
            onProjectsReload={loadProjects}
            showToast={showToast}
          />
        )}
      </div>

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
