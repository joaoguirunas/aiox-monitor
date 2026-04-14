'use client';

/**
 * useCommandRoomProject — hook de ciclo de vida do projeto na Sala de Comando v2.
 *
 * Responsabilidades:
 * - Carregar MRU do localStorage e projetos conhecidos da API
 * - Chamar POST /api/projects/open ao trocar de projeto
 * - Escutar WS catalog.reloaded / catalog.updated escopados ao projeto atual
 * - Atualizar canvasStore.currentProjectPath + agentCatalog
 *
 * Graceful degradation: se as rotas do Han Solo (JOB-021) ainda não existirem,
 * opera em modo offline (só MRU local + projetos da API legada /api/projects).
 */

import { useEffect, useCallback, useRef } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import {
  useCanvasStore,
  type RecentProject,
} from '../canvas/store/canvasStore';
import type {
  WsCatalogReloaded,
  WsCatalogUpdated,
  WsIncomingMessage,
} from '@/lib/types';

// Formato retornado por /api/projects (rota legada, sempre disponível)
interface LegacyProject {
  id: number;
  name: string;
  path: string;
  detected_at: string;
  last_active: string;
}

// Formato retornado por /api/projects/recent (Han Solo JOB-021)
interface RecentProjectsResponse {
  projects: RecentProject[];
}

export function useCommandRoomProject() {
  const { subscribe } = useWebSocketContext();
  const {
    currentProjectPath,
    recentProjects,
    catalogLoading,
    catalogReady,
    setCurrentProject,
    setRecentProjects,
    setCatalog,
    patchCatalog,
    setCatalogLoading,
  } = useCanvasStore();

  const currentPathRef = useRef<string | null>(currentProjectPath);
  useEffect(() => { currentPathRef.current = currentProjectPath; }, [currentProjectPath]);

  // ── 1. Carregar MRU na montagem ────────────────────────────────────────────
  useEffect(() => {
    // Tenta rota do Han Solo primeiro; fallback para projetos legados
    const fetchRecent = async () => {
      try {
        const r = await fetch('/api/projects/recent');
        if (r.ok) {
          const data: RecentProjectsResponse = await r.json();
          setRecentProjects(data.projects ?? []);
          return;
        }
      } catch { /* rota não existe ainda (JOB-021 em andamento) */ }

      // Fallback: converte projetos da API legada em RecentProject[]
      try {
        const r = await fetch('/api/projects');
        if (!r.ok) return;
        const data: LegacyProject[] = await r.json();
        const mapped: RecentProject[] = data
          .filter((p) => !!p.path)
          .map((p) => ({
            path: p.path,
            name: p.name || p.path.split('/').filter(Boolean).pop() || p.path,
            openedAt: p.last_active ?? p.detected_at,
          }));
        setRecentProjects(mapped);
      } catch { /* noop */ }
    };

    fetchRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Escutar eventos WS escopados ao projeto atual ──────────────────────
  useEffect(() => {
    const unsub = subscribe((msg: WsIncomingMessage) => {
      if (msg.type === 'catalog.reloaded') {
        const ev = msg as WsCatalogReloaded;
        if (ev.projectPath !== currentPathRef.current) return; // outro projeto
        setCatalog(ev.full);
      } else if (msg.type === 'catalog.updated') {
        const ev = msg as WsCatalogUpdated;
        if (ev.projectPath !== currentPathRef.current) return;
        patchCatalog(ev.added, ev.removed);
      }
    });
    return unsub;
  }, [subscribe, setCatalog, patchCatalog]);

  // ── 3. Abrir projeto ───────────────────────────────────────────────────────
  const openProject = useCallback(
    async (projectPath: string) => {
      if (projectPath === currentPathRef.current) return;
      setCatalogLoading(true);
      setCurrentProject(projectPath);

      try {
        const r = await fetch('/api/projects/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath }),
        });

        if (r.ok) {
          // Se a rota retornar o catálogo inicial, hidratamos imediatamente
          // sem esperar o WS (reduz latência percebida).
          try {
            const body = await r.json() as { catalog?: import('@/lib/types').AgentCatalogEntry[] };
            if (body.catalog) {
              setCatalog(body.catalog);
              return; // já hidratado
            }
          } catch { /* resposta sem body, aguarda WS */ }
          // Catálogo chegará via WS catalog.reloaded — setCatalogLoading(false)
          // será chamado pelo handler WS acima (via setCatalog).
        } else {
          // Rota do Han Solo retornou erro — continua em modo local
          setCatalogLoading(false);
        }
      } catch {
        // Rota não existe (JOB-021 em andamento) — modo offline
        setCatalogLoading(false);
      }
    },
    [setCurrentProject, setCatalog, setCatalogLoading],
  );

  // ── 4. Fechar projeto ──────────────────────────────────────────────────────
  const closeProject = useCallback(async () => {
    if (!currentPathRef.current) return;
    try {
      await fetch('/api/projects/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: currentPathRef.current }),
      });
    } catch { /* noop */ }
    setCurrentProject(null);
  }, [setCurrentProject]);

  return {
    currentProjectPath,
    recentProjects,
    catalogLoading,
    catalogReady,
    openProject,
    closeProject,
  };
}
