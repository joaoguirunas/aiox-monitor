'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as Phaser from 'phaser';
import { createGameConfig } from '@/game/config';
import { NAVBAR_HEIGHT } from '@/game/constants';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useProjectContext } from '@/contexts/ProjectContext';
import {
  setGameInstance, clearGameInstance, syncAgents, syncProjects, setTheme,
  updateAgent,
} from '@/game/bridge/react-phaser-bridge';
import type { WsAgentUpdate, WsEventNew, CompanyConfig, ThemeName } from '@/lib/types';

export function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const lastSyncRef = useRef(0);
  const { lastMessage, reconnectCount } = useWebSocket();
  const { selectedProjectId } = useProjectContext();
  const selectedProjectIdRef = useRef(selectedProjectId);
  selectedProjectIdRef.current = selectedProjectId;

  /** Full sync: agents + projects + config (init, reconnect, manual refresh) */
  const fetchAndSync = useCallback(() => {
    const pid = selectedProjectIdRef.current;
    const agentsUrl = pid ? `/api/agents?expand=terminals&project_id=${pid}` : '/api/agents?expand=terminals';
    Promise.all([fetch(agentsUrl), fetch('/api/projects'), fetch('/api/company-config')])
      .then(([agentsRes, projRes, configRes]) =>
        Promise.all([agentsRes.json(), projRes.json(), configRes.json()])
      )
      .then(([agents, projects, config]: [unknown, unknown, CompanyConfig]) => {
        syncProjects(projects as import('@/lib/types').Project[]);
        syncAgents(agents as import('@/lib/types').Agent[]);
        if (config.theme) setTheme(config.theme);
      })
      .catch(() => {});
  }, []);

  /** Lightweight sync: agents only (WS terminal/event updates) */
  const fetchAgentsOnly = useCallback(() => {
    const pid = selectedProjectIdRef.current;
    const url = pid ? `/api/agents?expand=terminals&project_id=${pid}` : '/api/agents?expand=terminals';
    fetch(url)
      .then(res => res.json())
      .then(agents => syncAgents(agents as import('@/lib/types').Agent[]))
      .catch(() => {});
  }, []);

  // Init game
  useEffect(() => {
    if (gameRef.current) return;

    const config = createGameConfig('phaser-container');
    const game = new Phaser.Game(config);
    gameRef.current = game;
    setGameInstance(game);

    game.events.on('ready', () => {
      const waitForScene = setInterval(() => {
        const scene = game.scene.getScene('OfficeScene');
        if (scene && scene.scene.isActive()) {
          clearInterval(waitForScene);
          fetchAndSync();
        }
      }, 100);
    });

    return () => {
      clearGameInstance();
      game.destroy(true);
      gameRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (!gameRef.current) return;
      gameRef.current.scale.resize(window.innerWidth, window.innerHeight - NAVBAR_HEIGHT);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Refetch on WebSocket reconnection
  useEffect(() => {
    if (reconnectCount === 0) return;
    fetchAndSync();
  }, [reconnectCount, fetchAndSync]);

  // Push WS messages para Phaser
  useEffect(() => {
    if (!lastMessage) return;

    // agent:update → push directly to Phaser (no HTTP round-trip, no throttle)
    if (lastMessage.type === 'agent:update') {
      const msg = lastMessage as WsAgentUpdate;
      if (selectedProjectId && msg.projectId !== selectedProjectId) return;
      updateAgent(msg.agent);
      return;
    }

    // terminal:update / event:new → throttled agents-only re-fetch (1 HTTP instead of 2-3)
    if (lastMessage.type === 'event:new' || lastMessage.type === 'terminal:update') {
      const now = Date.now();
      if (now - lastSyncRef.current < 2000) return;
      lastSyncRef.current = now;
      const projectId = 'projectId' in lastMessage ? (lastMessage as WsEventNew).projectId : undefined;
      if (selectedProjectId && projectId && projectId !== selectedProjectId) return;
      fetchAgentsOnly();
    }

    if (lastMessage.type === 'theme:change') {
      const { theme } = lastMessage as { type: 'theme:change'; theme: ThemeName };
      setTheme(theme);
    }
  }, [lastMessage, selectedProjectId, fetchAgentsOnly]);

  return (
    <div className="relative w-full" style={{ height: `calc(100vh - ${NAVBAR_HEIGHT}px)` }}>
      <div id="phaser-container" className="w-full h-full" />
      <button
        onClick={fetchAndSync}
        className="absolute top-3 right-3 z-10 px-2.5 py-1 text-[11px] font-medium text-text-muted hover:text-text-secondary rounded-md border border-border/50 hover:border-border bg-surface-0/80 backdrop-blur-sm transition-colors"
      >
        Atualizar
      </button>
    </div>
  );
}
