'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { LinkedTerminalEntry } from '@/components/command-room/TerminalPanel';
import dynamic from 'next/dynamic';

const TerminalPanel = dynamic(
  () => import('@/components/command-room/TerminalPanel').then((mod) => mod.TerminalPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full rounded-lg bg-surface-1/30 border border-border/40">
        <div className="text-sm text-text-muted">Carregando terminal...</div>
      </div>
    ),
  }
);

const FolderPicker = dynamic(
  () => import('@/components/command-room/FolderPicker').then((mod) => mod.FolderPicker),
  { ssr: false }
);

const TeamBuilder = dynamic(
  () => import('@/components/command-room/TeamBuilder').then((mod) => mod.TeamBuilder),
  { ssr: false }
);

const CategoryRow = dynamic(
  () => import('@/components/command-room/CategoryRow').then((mod) => mod.CategoryRow),
  { ssr: false }
);

const CategoryCreator = dynamic(
  () => import('@/components/command-room/CategoryCreator').then((mod) => mod.CategoryCreator),
  { ssr: false }
);

// ─── Types ──────────────────────────────────────────────────────────────────

type TerminalMode = 'claude' | 'bypass' | 'clean';

interface TeamTerminal {
  label: string;
  mode: TerminalMode;
  aiox_agent?: string;
  persona?: string;
  specialty?: string;
}

interface TeamPreset {
  name: string;
  description: string;
  icon: string;
  terminals: TeamTerminal[];
}

interface TerminalCategory {
  id: string;
  name: string;
  color: string | null;
}

interface ActiveTerminal {
  id: string;
  agentName: string;
  createdAt: string;
  mode?: TerminalMode;
  projectPath?: string;
  linkedTerminalIds: string[];   // 1-to-many broadcast targets
  aiox_agent?: string;           // e.g. '@dev', '@aiox-master'
  pty_status?: string;           // from DB: 'active' | 'idle' | 'crashed' | 'closed'
  isRestored?: boolean;          // true when loaded from DB (not freshly spawned)
  category_id?: string | null;
  category?: TerminalCategory | null;
  description?: string | null;
  is_chief?: boolean;
}

interface Project {
  path: string;
  label: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TEAM_PRESETS: TeamPreset[] = [
  {
    name: 'AIOX Standard',
    description: '13 agentes — workspace completo',
    icon: '⚡',
    terminals: [
      // Coordenação
      { label: 'MASTER',   mode: 'bypass', aiox_agent: '@aiox-master',      persona: 'Orion', specialty: 'Orquestração central — coordena todos os agentes' },
      // Desenvolvimento
      { label: 'DEV 1',    mode: 'bypass', aiox_agent: '@dev',              persona: 'Dex',   specialty: 'CRM Negócios — kanban, pipelines' },
      { label: 'DEV 2',    mode: 'bypass', aiox_agent: '@dev',              persona: 'Dex',   specialty: 'CRM Clientes/Empresas/Pessoas' },
      { label: 'DEV 3',    mode: 'bypass', aiox_agent: '@dev',              persona: 'Dex',   specialty: 'OMNI PRO — Conversas, mensageria' },
      { label: 'DEV 4',    mode: 'bypass', aiox_agent: '@dev',              persona: 'Dex',   specialty: 'Config + ADM (84 componentes)' },
      // Design
      { label: 'UX',       mode: 'bypass', aiox_agent: '@ux-design-expert', persona: 'Uma',   specialty: 'Design System, UI, visual' },
      // Qualidade & Dados
      { label: 'QA',       mode: 'bypass', aiox_agent: '@qa',               persona: 'Quinn', specialty: 'Testes, TypeScript, compliance' },
      { label: 'DATA',     mode: 'bypass', aiox_agent: '@data-engineer',    persona: 'Dara',  specialty: 'Banco de dados, migrations, SQL' },
      // Produto & Processo
      { label: 'PM',       mode: 'bypass', aiox_agent: '@pm',               persona: 'Morgan',specialty: 'Product management, epics' },
      { label: 'SM',       mode: 'bypass', aiox_agent: '@sm',               persona: 'River', specialty: 'Stories, scrum, planejamento' },
      { label: 'ANALYST',  mode: 'bypass', aiox_agent: '@analyst',          persona: 'Alex',  specialty: 'Pesquisa, análise, relatórios' },
      { label: 'ARCHITECT',mode: 'bypass', aiox_agent: '@architect',        persona: 'Aria',  specialty: 'Arquitetura, decisões técnicas' },
      // Infraestrutura
      { label: 'DEV OPS',  mode: 'bypass', aiox_agent: '@devops',           persona: 'Gage',  specialty: 'Git, push, deploy, migrations' },
    ],
  },
];

const MODE_OPTIONS: { value: TerminalMode; label: string; desc: string; color: string }[] = [
  { value: 'bypass', label: 'Bypass',  desc: 'Skip permissions', color: '#fbbf24' },
  { value: 'claude', label: 'Claude',  desc: 'Modo interativo',  color: '#34d399' },
  { value: 'clean',  label: 'Limpo',   desc: 'Shell sem Claude', color: '#94a3b8' },
];


// ─── SVG link lines ──────────────────────────────────────────────────────────
// ─── Page ───────────────────────────────────────────────────────────────────

export default function CommandRoomPage() {
  // ── Projects state ───────────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);

  // ── Terminals state ──────────────────────────────────────────────────────
  const [terminals, setTerminals] = useState<ActiveTerminal[]>([]);
  const [categories, setCategories] = useState<TerminalCategory[]>([]);
  const [isSpawning, setIsSpawning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addMode, setAddMode] = useState<TerminalMode>('bypass');
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [teamSpawning, setTeamSpawning] = useState<string | null>(null);
  const [teamProgress, setTeamProgress] = useState({ current: 0, total: 0 });
  const [teamModeOverride, setTeamModeOverride] = useState<TerminalMode | 'default'>('default');
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [teamBuilderOpen, setTeamBuilderOpen] = useState(false);
  const [categoryCreatorOpen, setCategoryCreatorOpen] = useState(false);
  const [autopilotIds, setAutopilotIds] = useState<Set<string>>(new Set());

  // ── Card refs (drag reorder) ──────────────────────────────────────────────
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ── Auto-select first project if none active ──────────────────────────
  useEffect(() => {
    if (!activeProject && projects.length > 0) {
      setActiveProject(projects[0].path);
    }
  }, [activeProject, projects]);

  // ── Load terminals from DB on mount ──────────────────────────────────
  useEffect(() => {
    const loadFromDb = async () => {
      try {
        const res = await fetch('/api/command-room/list');
        if (!res.ok) return;
        const data = await res.json();
        const dbTerminals: Array<{
          id: string;
          agentName: string;
          projectPath?: string;
          pty_status?: string;
          createdAt?: string;
          category_id?: string | null;
          category?: TerminalCategory | null;
          description?: string | null;
          is_chief?: boolean;
        }> = data.terminals ?? [];
        const active = dbTerminals.filter((t) => (t.pty_status ?? 'active') !== 'closed');
        if (active.length === 0) return;
        const uniquePaths = [...new Set(
          active.map((t) => t.projectPath).filter((p): p is string => !!p)
        )];
        if (uniquePaths.length > 0) {
          setProjects(uniquePaths.map((path) => ({
            path,
            label: path.split('/').filter(Boolean).pop() ?? path,
          })));
          setActiveProject(uniquePaths[0]);
        }
        setTerminals(
          active.map((t) => ({
            id: t.id,
            agentName: t.agentName,
            createdAt: t.createdAt ?? new Date().toISOString(),
            mode: 'bypass' as TerminalMode,
            projectPath: t.projectPath,
            linkedTerminalIds: [],
            pty_status: t.pty_status ?? 'active',
            isRestored: true,
            category_id: t.category_id,
            category: t.category,
            description: t.description,
            is_chief: t.is_chief ?? false,
          }))
        );

        // Load categories
        const categoriesData = data.categories ?? [];
        setCategories(categoriesData);
      } catch { /* ignore */ }
    };
    loadFromDb();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handlePickerSelect = useCallback((path: string) => {
    if (projects.some((p) => p.path === path)) {
      setActiveProject(path);
      return;
    }
    const label = path.split('/').filter(Boolean).pop() ?? path;
    setProjects((prev) => [...prev, { path, label }]);
    setActiveProject(path);
  }, [projects]);

  const handleRemoveProject = useCallback((path: string) => {
    setProjects((prev) => prev.filter((p) => p.path !== path));
    setTerminals((prev) => prev.filter((t) => t.projectPath !== path));
    if (activeProject === path) {
      setActiveProject(null);
    }
  }, [activeProject]);

  // ── Switch project ─────────────────────────────────────────────────────
  const handleSelectProject = useCallback((path: string) => {
    if (path === activeProject) return;
    setActiveProject(path);
  }, [activeProject]);

  // ── Spawn terminal ─────────────────────────────────────────────────────
  const handleSpawn = useCallback(async (label: string, mode: TerminalMode, categoryId?: string | null) => {
    if (!activeProject || isSpawning) return;
    setIsSpawning(true);
    setError(null);
    setAddDropdownOpen(false);

    const initialPrompt = mode === 'bypass'
      ? 'claude --dangerously-skip-permissions'
      : mode === 'claude'
        ? 'claude'
        : undefined;

    // Check if this is the first terminal for this project
    const isFirstTerminal = terminals.filter((t) => t.projectPath === activeProject).length === 0;

    try {
      const res = await fetch('/api/command-room/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: label,
          projectPath: activeProject,
          ...(initialPrompt && { initialPrompt }),
          is_chief: isFirstTerminal, // Primeiro terminal é sempre Chief
          category_id: isFirstTerminal ? null : categoryId, // Chief não tem categoria
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'HTTP ' + res.status);
      }

      const data = await res.json();
      const newTerminalId = data.id;

      setTerminals((prev) => {
        // Find chief terminal
        const chief = prev.find((t) => t.is_chief && t.projectPath === activeProject);

        // Create new terminal
        const newTerminal = {
          id: newTerminalId,
          agentName: label,
          createdAt: data.createdAt,
          mode,
          projectPath: activeProject,
          linkedTerminalIds: [],
          is_chief: isFirstTerminal, // Marcar como chief se for o primeiro
          category_id: isFirstTerminal ? null : categoryId,
        };

        // Auto-link with chief if exists AND this is not the chief itself
        if (chief && !isFirstTerminal) {
          return prev.map((t) =>
            t.id === chief.id
              ? { ...t, linkedTerminalIds: [...t.linkedTerminalIds, newTerminalId] }
              : t
          ).concat(newTerminal);
        }

        return [...prev, newTerminal];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar terminal');
    } finally {
      setIsSpawning(false);
    }
  }, [activeProject, isSpawning]);

  // ── Close terminal ─────────────────────────────────────────────────────
  const closingRef = useRef(new Set<string>());
  const handleClose = useCallback(async (terminalId: string) => {
    if (closingRef.current.has(terminalId)) return;
    closingRef.current.add(terminalId);
    try {
      await fetch(`/api/command-room/${terminalId}`, { method: 'DELETE' });
    } catch { /* remove from UI anyway */ }
    setTerminals((prev) => prev.filter((t) => t.id !== terminalId));
    cardRefs.current.delete(terminalId);
    setTimeout(() => closingRef.current.delete(terminalId), 5000);
  }, []);

  // ── Kill all processes for active project (clear + server cleanup) ────
  const handleClearProject = useCallback(async () => {
    if (!activeProject) return;
    setTerminals((prev) => prev.filter((t) => t.projectPath !== activeProject));
    cardRefs.current.clear();
    try {
      await fetch(`/api/command-room/kill?project=${encodeURIComponent(activeProject)}`, { method: 'DELETE' });
    } catch { /* ignore */ }
  }, [activeProject]);

  // ── Kill all server processes (emergency reset) ────────────────────────
  const handleKillAll = useCallback(async () => {
    setTerminals([]);
    cardRefs.current.clear();
    try {
      await fetch('/api/command-room/kill?all=true', { method: 'DELETE' });
    } catch { /* ignore */ }
  }, []);

  // ── Spawn team ─────────────────────────────────────────────────────────
  const handleTeamSpawn = useCallback(async (preset: TeamPreset) => {
    if (!activeProject || isSpawning || teamSpawning) return;
    setTeamDropdownOpen(false);
    setTeamSpawning(preset.name);
    setTeamProgress({ current: 0, total: preset.terminals.length });
    setError(null);

    for (let i = 0; i < preset.terminals.length; i++) {
      const t = preset.terminals[i];
      setTeamProgress({ current: i + 1, total: preset.terminals.length });

      const effectiveMode = teamModeOverride !== 'default' ? teamModeOverride : t.mode;
      const initialPrompt = effectiveMode === 'bypass'
        ? 'claude --dangerously-skip-permissions'
        : effectiveMode === 'claude'
          ? 'claude'
          : undefined;

      try {
        const res = await fetch('/api/command-room/spawn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentName: t.label,
            projectPath: activeProject,
            ...(initialPrompt && { initialPrompt }),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setTerminals((prev) => [...prev, {
          id: data.id,
          agentName: t.label,
          createdAt: data.createdAt,
          mode: effectiveMode,
          projectPath: activeProject,
          linkedTerminalIds: [],
          aiox_agent: t.aiox_agent,
        }]);
      } catch (err) {
        setError(`Equipe: falha ao criar ${t.label} — ${err instanceof Error ? err.message : 'erro'}`);
        break;
      }

      if (i < preset.terminals.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    setTeamSpawning(null);
    setTeamProgress({ current: 0, total: 0 });
  }, [activeProject, isSpawning, teamSpawning, teamModeOverride]);

  // ── Spawn custom squad (from TeamBuilder) ────────────────────────────
  const handleCustomSquadSpawn = useCallback(async (composition: Record<string, number>) => {
    if (!activeProject || isSpawning || teamSpawning) return;

    type SquadComposition = Record<string, number>;
    const squadComposition = composition as SquadComposition;

    // Convert composition to array of terminals to spawn
    const terminalsToSpawn: Array<{ agentId: string; label: string; index: number }> = [];

    for (const [agentId, count] of Object.entries(squadComposition)) {
      for (let i = 1; i <= count; i++) {
        const agentName = agentId.replace('@', '').replace(/-/g, ' ').toUpperCase();
        const baseLabel = agentName.split(' ')[0]; // Get first word (DEV, QA, etc.)
        terminalsToSpawn.push({
          agentId,
          label: count > 1 ? `${baseLabel} ${i}` : baseLabel,
          index: i,
        });
      }
    }

    setTeamSpawning('Custom Squad');
    setTeamProgress({ current: 0, total: terminalsToSpawn.length });
    setError(null);

    for (let i = 0; i < terminalsToSpawn.length; i++) {
      const t = terminalsToSpawn[i];
      setTeamProgress({ current: i + 1, total: terminalsToSpawn.length });

      // Build initialPrompt with AIOX agent auto-activation
      const agentCommand = `/AIOX:agents:${t.agentId.replace('@', '')}`;
      const initialPrompt = `claude --dangerously-skip-permissions\n${agentCommand}`;

      try {
        const res = await fetch('/api/command-room/spawn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentName: t.label,
            projectPath: activeProject,
            initialPrompt,
            aiox_agent: t.agentId,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setTerminals((prev) => [...prev, {
          id: data.id,
          agentName: t.label,
          createdAt: data.createdAt,
          mode: 'bypass',
          projectPath: activeProject,
          linkedTerminalIds: [],
          aiox_agent: t.agentId,
        }]);
      } catch (err) {
        setError(`Squad: falha ao criar ${t.label} — ${err instanceof Error ? err.message : 'erro'}`);
        break;
      }

      if (i < terminalsToSpawn.length - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    setTeamSpawning(null);
    setTeamProgress({ current: 0, total: 0 });
  }, [activeProject, isSpawning, teamSpawning]);

  // ── Rename terminal ────────────────────────────────────────────────────
  const handleRename = useCallback((id: string, newName: string) => {
    setTerminals((prev) =>
      prev.map((t) => (t.id === id ? { ...t, agentName: newName } : t))
    );
  }, []);

  // ── Link terminals (toggle — 1-to-many) ───────────────────────────────
  const handleLink = useCallback((id: string, targetId: string) => {
    setTerminals((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const already = t.linkedTerminalIds.includes(targetId);
        return {
          ...t,
          linkedTerminalIds: already
            ? t.linkedTerminalIds.filter((x) => x !== targetId)
            : [...t.linkedTerminalIds, targetId],
        };
      })
    );
  }, []);

  // ── Autopilot ──────────────────────────────────────────────────────────
  const handleAutopilotToggle = useCallback((id: string) => {
    setAutopilotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleTaskDone = useCallback((id: string) => {
    const terminal = terminals.find((t) => t.id === id);
    if (!terminal) return;

    // Find terminals that have this terminal linked (they sent commands to it)
    const masters = terminals.filter((t) => t.linkedTerminalIds.includes(id));
    if (masters.length > 0) {
      const notification = `[${terminal.agentName}] tarefa concluída ✓`;
      masters.forEach((master) => {
        fetch(`/api/command-room/${master.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: notification }),
        }).catch(() => {});
      });
    }
  }, [terminals]);

  // ── Drag-and-drop reorder ─────────────────────────────────────────────
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setTerminals((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(dragIdx, 1);
      updated.splice(idx, 0, moved);
      return updated;
    });
    setDragIdx(idx);
  }, [dragIdx]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
  }, []);

  // ── External terminals (all active PTY processes across all projects) ──
  const [externalTerminals, setExternalTerminals] = useState<{
    id: string; agentName: string; projectPath?: string; status: string;
  }[]>([]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/command-room/list');
        if (!res.ok) return;
        const data = await res.json();
        const all: { id: string; agentName: string; projectPath?: string; status: string }[] = data.terminals ?? [];
        // Show only terminals NOT in the current project's terminal list
        const activeIds = new Set(terminals.map((t) => t.id));
        setExternalTerminals(all.filter((p) => !activeIds.has(p.id) && p.status !== 'closed'));
      } catch { /* ignore */ }
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [terminals]);

  // ── Derived ────────────────────────────────────────────────────────────
  const projectTerminals = terminals.filter((t) => t.projectPath === activeProject);
  const activeProjectLabel = projects.find((p) => p.path === activeProject)?.label ?? '';

  // ── Category grouping ──────────────────────────────────────────────────
  const chiefTerminal = useMemo(
    () => projectTerminals.find((t) => t.is_chief),
    [projectTerminals]
  );

  const regularTerminals = useMemo(
    () => projectTerminals.filter((t) => !t.is_chief),
    [projectTerminals]
  );

  const terminalsByCategory = useMemo(() => {
    const grouped: Record<string, ActiveTerminal[]> = {};
    categories.forEach((cat) => {
      grouped[cat.id] = regularTerminals.filter((t) => t.category_id === cat.id);
    });
    return grouped;
  }, [categories, regularTerminals]);

  const uncategorized = useMemo(
    () => regularTerminals.filter((t) => !t.category_id),
    [regularTerminals]
  );

  return (
    <main className="flex flex-col h-[calc(100vh-44px)] bg-surface-0">
      <div className="flex flex-1 min-h-0">
      {/* ═══ SIDEBAR — only projects ═════════════════════════════════════ */}
      <aside className="w-[250px] shrink-0 flex flex-col border-r bg-[#050505]" style={{ borderColor: 'rgba(156,156,156,0.1)' }}>
        <div className="px-3 pt-3 pb-1.5">
          <span className="font-mono text-[0.5rem] font-medium uppercase tracking-[0.12em]" style={{ color: 'rgba(244,244,232,0.25)' }}>
            Projetos
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-1.5 min-h-0">
          {projects.length === 0 && (
            <div className="px-2 py-6 text-center">
              <p className="text-[11px] text-text-muted leading-relaxed">
                Adicione um projeto abaixo para começar.
              </p>
            </div>
          )}
          {projects.map((project) => (
            <div
              key={project.path}
              onClick={() => handleSelectProject(project.path)}
              className="group flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer transition-all mb-0.5 border-l-2"
              style={activeProject === project.path
                ? { borderColor: '#FF4400', background: 'rgba(255,255,255,0.06)', color: '#F4F4E8' }
                : { borderColor: 'transparent', color: 'rgba(244,244,232,0.4)' }
              }
              onMouseEnter={(e) => {
                if (activeProject !== project.path) {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(244,244,232,0.7)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                }
              }}
              onMouseLeave={(e) => {
                if (activeProject !== project.path) {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(244,244,232,0.4)';
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }
              }}
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="text-[12px] font-medium truncate flex-1">{project.label}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleRemoveProject(project.path); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-opacity"
                title="Remover projeto"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Add project */}
        <div className="px-2 pb-2 pt-1 border-t border-border/30 space-y-1.5">
          <button
            onClick={() => setFolderPickerOpen(true)}
            className="btn btn-secondary btn-sm w-full font-mono"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Abrir Projeto
          </button>
        </div>
      </aside>

      {/* ═══ MAIN AREA ═════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Error bar */}
        {error && (
          <div className="mx-2 mt-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-[12px] text-red-400 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="truncate">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto p-0.5 hover:bg-white/10 rounded shrink-0">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {!activeProject ? (
          /* ── Empty state: no project ────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <div className="w-16 h-16 rounded-full bg-surface-2/30 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h2 className="text-sm font-medium text-text-primary mb-1">Abra um projeto para começar</h2>
            <p className="text-[11px] text-text-muted max-w-xs">
              Adicione o caminho de um projeto na sidebar para iniciar terminais.
            </p>
          </div>
        ) : (
          <>
            {/* ── Toolbar ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 shrink-0">
              {/* Left: project name + terminal count */}
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-3.5 h-3.5 text-accent-orange shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-[12px] font-medium text-text-primary truncate">{activeProjectLabel}</span>
                {projectTerminals.length > 0 && (
                  <span className="text-[10px] text-text-muted shrink-0">
                    {projectTerminals.length} terminal{projectTerminals.length !== 1 ? 's' : ''}
                  </span>
                )}
                {teamSpawning && (
                  <span className="flex items-center gap-1.5 text-[10px] text-accent-orange font-medium shrink-0">
                    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {teamSpawning} ({teamProgress.current}/{teamProgress.total})
                  </span>
                )}
              </div>

              {/* Right: Team + Add buttons */}
              <div className="flex items-center gap-1.5">
                {/* Kill all server processes (emergency reset) */}
                <button
                  onClick={handleKillAll}
                  className="btn btn-ghost btn-sm font-mono text-text-muted hover:text-error"
                  title="Zerar servidor — mata todos os processos PTY"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.636 5.636a9 9 0 1012.728 12.728M12 3v9m0 0l3-3m-3 3L9 9" />
                  </svg>
                </button>

                {/* Clear project layout */}
                {projectTerminals.length > 0 && !teamSpawning && (
                  <button
                    onClick={handleClearProject}
                    className="btn btn-ghost btn-sm font-mono text-text-muted hover:text-error"
                    title="Fechar todos os terminais deste projeto"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}

                {/* Custom Squad button */}
                <button
                  onClick={() => setTeamBuilderOpen(true)}
                  disabled={!!teamSpawning || isSpawning || terminals.length >= 20}
                  className="btn btn-primary btn-sm font-mono"
                  title="Montar Squad Customizado"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Squad
                </button>

                {/* Category button */}
                <button
                  onClick={() => setCategoryCreatorOpen(true)}
                  className="btn btn-ghost btn-sm font-mono"
                  title="Criar Categoria"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Categoria
                </button>

                {/* Team button */}
                <div className="relative">
                  <button
                    onClick={() => setTeamDropdownOpen(!teamDropdownOpen)}
                    disabled={!!teamSpawning || isSpawning || terminals.length >= 20}
                    className="btn btn-ghost btn-sm font-mono"
                    title="Iniciar Equipe"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                    </svg>
                    Equipe
                  </button>

                  {teamDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setTeamDropdownOpen(false)} />
                      <div className="absolute top-full right-0 mt-1 w-80 rounded-lg bg-surface-2 border border-border/60 shadow-dropdown z-20 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between">
                          <span className="font-mono text-[0.5rem] font-medium text-text-muted uppercase tracking-[0.08em]">Equipes</span>
                        </div>
                        {TEAM_PRESETS.map((preset) => {
                          const groups: { label: string; items: typeof preset.terminals }[] = [];
                          if (preset.name === 'AIOX Standard') {
                            groups.push({ label: 'Coordenação', items: preset.terminals.filter(t => t.label === 'MASTER') });
                            groups.push({ label: 'Desenvolvimento', items: preset.terminals.filter(t => t.label.startsWith('DEV') && t.label !== 'DEV OPS') });
                            groups.push({ label: 'Design', items: preset.terminals.filter(t => t.label === 'UX') });
                            groups.push({ label: 'Qualidade & Dados', items: preset.terminals.filter(t => ['QA','DATA'].includes(t.label)) });
                            groups.push({ label: 'Produto & Processo', items: preset.terminals.filter(t => ['PM','SM','ANALYST','ARCHITECT'].includes(t.label)) });
                            groups.push({ label: 'Infraestrutura', items: preset.terminals.filter(t => t.label === 'DEV OPS') });
                          }
                          return (
                            <div key={preset.name}>
                              {/* Preset header */}
                              <div className="px-4 py-2.5 flex items-center gap-2.5">
                                <span className="text-base leading-none">{preset.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[0.7rem] text-text-primary font-semibold">{preset.name}</span>
                                    <span className="badge badge-neutral">{preset.terminals.length} terminais</span>
                                  </div>
                                  <span className="font-mono text-[0.55rem] text-text-muted">{preset.description}</span>
                                </div>
                              </div>

                              {/* Mode override selector */}
                              <div className="px-4 pb-2.5">
                                <span className="font-mono text-[0.45rem] uppercase tracking-[0.1em] text-text-muted/70 block mb-1.5">Modo de inicialização</span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => setTeamModeOverride('default')}
                                    className={`flex-1 px-2 py-1 rounded text-[0.55rem] font-mono font-medium border transition-colors ${
                                      teamModeOverride === 'default'
                                        ? 'bg-surface-3 border-border/80 text-text-primary'
                                        : 'bg-transparent border-border/30 text-text-muted hover:border-border/60'
                                    }`}
                                  >
                                    Padrão
                                  </button>
                                  {MODE_OPTIONS.map((opt) => (
                                    <button
                                      key={opt.value}
                                      onClick={() => setTeamModeOverride(opt.value)}
                                      className={`flex-1 px-2 py-1 rounded text-[0.55rem] font-mono font-medium border transition-colors ${
                                        teamModeOverride === opt.value
                                          ? 'border-current'
                                          : 'bg-transparent border-border/30 text-text-muted hover:border-border/60'
                                      }`}
                                      style={teamModeOverride === opt.value ? { color: opt.color, borderColor: opt.color + '60', background: opt.color + '15' } : {}}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Iniciar button */}
                              <div className="px-4 pb-3">
                                <button
                                  onClick={() => handleTeamSpawn(preset)}
                                  className="btn btn-primary btn-sm font-mono w-full"
                                >
                                  Iniciar {preset.name}
                                </button>
                              </div>

                              {/* Groups breakdown */}
                              {groups.length > 0 && (
                                <div className="border-t border-border/30 px-4 py-2 space-y-2 bg-surface-1/40">
                                  {groups.map((g) => (
                                    <div key={g.label}>
                                      <span className="font-mono text-[0.45rem] uppercase tracking-[0.1em] text-text-muted/70 block mb-1">{g.label}</span>
                                      <div className="flex flex-wrap gap-1">
                                        {g.items.map((t) => (
                                          <div key={t.label} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-3 border border-border/40" title={t.specialty}>
                                            <span className="font-mono text-[0.55rem] font-medium text-text-secondary">{t.label}</span>
                                            {t.aiox_agent && (
                                              <span className="font-mono text-[0.45rem] text-text-muted">{t.aiox_agent}</span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* + Terminal button with form dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setAddDropdownOpen(!addDropdownOpen);
                      setAddName('');
                      setAddMode('bypass');
                    }}
                    disabled={isSpawning || terminals.length >= 20}
                    className={`btn btn-primary btn-sm font-mono ${isSpawning ? 'btn-loading' : ''}`}
                    title="Criar terminal"
                  >
                    {!isSpawning && (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                    Terminal
                  </button>

                  {addDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setAddDropdownOpen(false)} />
                      <div className="absolute top-full right-0 mt-1 w-64 rounded-lg bg-surface-2 border border-border/60 shadow-xl z-20 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-border/40">
                          <span className="font-mono text-[0.5rem] font-medium text-text-muted uppercase tracking-[0.08em]">Novo Terminal</span>
                        </div>

                        <div className="px-4 py-3 space-y-3">
                          {/* Name input */}
                          <div>
                            <label className="font-mono text-[0.5rem] uppercase tracking-[0.08em] text-text-muted block mb-1">Nome</label>
                            <input
                              type="text"
                              value={addName}
                              onChange={(e) => setAddName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const label = addName.trim() || MODE_OPTIONS.find(o => o.value === addMode)?.label || 'Terminal';
                                  handleSpawn(label, addMode);
                                }
                              }}
                              placeholder={MODE_OPTIONS.find(o => o.value === addMode)?.label ?? 'Terminal'}
                              className="w-full px-2 py-1.5 rounded bg-surface-3 border border-border/60 text-[12px] text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-orange/60 font-mono"
                              autoFocus
                            />
                          </div>

                          {/* Mode selector */}
                          <div>
                            <label className="font-mono text-[0.5rem] uppercase tracking-[0.08em] text-text-muted block mb-1.5">Modo</label>
                            <div className="space-y-1">
                              {MODE_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => setAddMode(opt.value)}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left transition-colors ${
                                    addMode === opt.value ? 'bg-surface-3' : 'hover:bg-white/[0.03]'
                                  }`}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: opt.color }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-[12px] font-medium block" style={{ color: addMode === opt.value ? opt.color : undefined }}>{opt.label}</span>
                                    <span className="text-[10px] text-text-muted">{opt.desc}</span>
                                  </div>
                                  {addMode === opt.value && (
                                    <svg className="w-3.5 h-3.5 shrink-0" style={{ color: opt.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Create button */}
                          <button
                            onClick={() => {
                              const label = addName.trim() || MODE_OPTIONS.find(o => o.value === addMode)?.label || 'Terminal';
                              handleSpawn(label, addMode);
                            }}
                            className="btn btn-primary btn-sm w-full font-mono"
                          >
                            Criar Terminal
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── Grid area ────────────────────────────────────────────── */}
            <div className="flex-1 p-3 min-h-0">
              {projectTerminals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-full bg-surface-2/30 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-medium text-text-primary mb-1">Monte sua equipe</h2>
                  <p className="text-[11px] text-text-muted max-w-xs">
                    Use o botão + Terminal ou escolha uma Equipe pronta.
                  </p>
                </div>
              ) : (
                <div className="command-room-layout h-full overflow-y-auto p-3">
                  {/* Chief Terminal Row - DESTACADO E CENTRALIZADO */}
                  {chiefTerminal && (
                    <div className="chief-row mb-8 flex justify-center">
                      <div className="overflow-hidden rounded-lg border-2 border-accent-orange/30 shadow-lg"
                           style={{ width: '100%', maxWidth: 1000, height: 650 }}>
                        <TerminalPanel
                          terminalId={chiefTerminal.id}
                          agentName={chiefTerminal.agentName}
                          projectPath={chiefTerminal.projectPath}
                          aiox_agent={chiefTerminal.aiox_agent}
                          linkedTerminalIds={chiefTerminal.linkedTerminalIds}
                          otherTerminals={projectTerminals.filter((t) => t.id !== chiefTerminal.id).map((t) => ({ id: t.id, agentName: t.agentName }))}
                          autopilot={autopilotIds.has(chiefTerminal.id)}
                          isCrashed={chiefTerminal.pty_status === 'crashed'}
                          isRestored={chiefTerminal.isRestored}
                          description={chiefTerminal.description ?? undefined}
                          onClose={handleClose}
                          onRename={handleRename}
                          onLink={handleLink}
                          onAutopilotToggle={handleAutopilotToggle}
                          onTaskDone={handleTaskDone}
                        />
                      </div>
                    </div>
                  )}

                  {/* Category Rows (Horizontal Scroll) */}
                  {categories.length > 0 && categories.map((category) => {
                    const categoryTerminals = terminalsByCategory[category.id] || [];
                    // MUDANÇA: Mostrar categoria SEMPRE, mesmo vazia (para poder adicionar terminais)

                    return (
                      <CategoryRow
                        key={category.id}
                        categoryId={category.id}
                        categoryName={category.name}
                        categoryColor={category.color}
                        onAddTerminal={() => {
                          // Spawn terminal in this category
                          const defaultName = `Terminal ${projectTerminals.length + 1}`;
                          handleSpawn(defaultName, 'bypass', category.id);
                        }}
                      >
                        {categoryTerminals.map((terminal) => (
                          <div
                            key={terminal.id}
                            className="flex-shrink-0 overflow-hidden rounded-lg"
                            style={{ width: 780, height: 570 }}
                          >
                            <TerminalPanel
                              terminalId={terminal.id}
                              agentName={terminal.agentName}
                              projectPath={terminal.projectPath}
                              aiox_agent={terminal.aiox_agent}
                              linkedTerminalIds={terminal.linkedTerminalIds}
                              otherTerminals={projectTerminals.filter((t) => t.id !== terminal.id).map((t) => ({ id: t.id, agentName: t.agentName }))}
                              autopilot={autopilotIds.has(terminal.id)}
                              isCrashed={terminal.pty_status === 'crashed'}
                              isRestored={terminal.isRestored}
                              description={terminal.description ?? undefined}
                              onClose={handleClose}
                              onRename={handleRename}
                              onLink={handleLink}
                              onAutopilotToggle={handleAutopilotToggle}
                              onTaskDone={handleTaskDone}
                            />
                          </div>
                        ))}
                      </CategoryRow>
                    );
                  })}

                  {/* REMOVIDO: Seção "Sem Categoria" - todos terminais devem estar em categorias ou ser Chief */}

                  {/* Fallback to old layout if no categories */}
                  {categories.length === 0 && !chiefTerminal && (
                    <div className="flex flex-wrap gap-5 content-start">
                      {projectTerminals.map((terminal, idx) => {
                        const others: LinkedTerminalEntry[] = projectTerminals
                          .filter((t) => t.id !== terminal.id)
                          .map((t) => ({ id: t.id, agentName: t.agentName }));

                        return (
                          <div
                            key={terminal.id}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            className={`overflow-hidden transition-opacity ${dragIdx === idx ? 'opacity-50' : ''}`}
                            style={{ width: 780, height: 570 }}
                          >
                            <TerminalPanel
                              terminalId={terminal.id}
                              agentName={terminal.agentName}
                              projectPath={terminal.projectPath}
                              aiox_agent={terminal.aiox_agent}
                              linkedTerminalIds={terminal.linkedTerminalIds}
                              otherTerminals={others}
                              autopilot={autopilotIds.has(terminal.id)}
                              isCrashed={terminal.pty_status === 'crashed'}
                              isRestored={terminal.isRestored}
                              description={terminal.description ?? undefined}
                              onClose={handleClose}
                              onRename={handleRename}
                              onLink={handleLink}
                              onAutopilotToggle={handleAutopilotToggle}
                              onTaskDone={handleTaskDone}
                              dragHandleProps={{
                                draggable: true,
                                onDragStart: () => handleDragStart(idx),
                                onDragEnd: handleDragEnd,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ═══ FOLDER PICKER MODAL ═════════════════════════════════════════ */}
      <FolderPicker
        isOpen={folderPickerOpen}
        onClose={() => setFolderPickerOpen(false)}
        onSelect={handlePickerSelect}
      />

      {/* ═══ TEAM BUILDER MODAL ═════════════════════════════════════════ */}
      <TeamBuilder
        isOpen={teamBuilderOpen}
        onClose={() => setTeamBuilderOpen(false)}
        onConfirm={handleCustomSquadSpawn}
        maxTerminals={20}
      />

      {/* ═══ CATEGORY CREATOR MODAL ═════════════════════════════════════ */}
      {categoryCreatorOpen && (
        <CategoryCreator
          onClose={() => setCategoryCreatorOpen(false)}
          onCreated={(newCategory) => {
            setCategories((prev) => [...prev, newCategory]);
            setCategoryCreatorOpen(false);
          }}
        />
      )}
      </div>

      {/* ═══ EXTERNAL TERMINALS BAR ══════════════════════════════════════ */}
      {externalTerminals.length > 0 && (
        <div
          className="shrink-0 flex items-center gap-1.5 px-3 border-t overflow-x-auto"
          style={{
            height: '36px',
            borderColor: 'rgba(156,156,156,0.1)',
            background: '#050505',
            scrollbarWidth: 'none',
          }}
        >
          <span
            className="font-mono text-[0.45rem] uppercase tracking-[0.12em] shrink-0 pr-1"
            style={{ color: 'rgba(244,244,232,0.2)', borderRight: '1px solid rgba(156,156,156,0.1)' }}
          >
            Externos
          </span>
          {externalTerminals.map((t) => {
            const shortProject = t.projectPath
              ? t.projectPath.split('/').filter(Boolean).pop()
              : null;
            const statusColor = t.status === 'active' ? '#34d399' : t.status === 'idle' ? '#f59e0b' : 'rgba(156,156,156,0.4)';
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (t.projectPath) {
                    handlePickerSelect(t.projectPath);
                  }
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded shrink-0 transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(156,156,156,0.1)',
                  minWidth: '72px',
                }}
                title={`${t.agentName}${shortProject ? ` — ${shortProject}` : ''}`}
              >
                <span
                  className="w-[5px] h-[5px] rounded-full shrink-0"
                  style={{ background: statusColor }}
                />
                <span
                  className="font-mono text-[0.5rem] truncate max-w-[56px]"
                  style={{ color: 'rgba(244,244,232,0.5)' }}
                >
                  {t.agentName}
                </span>
                {shortProject && (
                  <span
                    className="font-mono text-[0.45rem] shrink-0"
                    style={{ color: 'rgba(244,244,232,0.2)' }}
                  >
                    /{shortProject}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
