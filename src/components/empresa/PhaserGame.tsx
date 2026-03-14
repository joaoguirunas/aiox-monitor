'use client';

import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import { createGameConfig } from '@/game/config';
import { NAVBAR_HEIGHT } from '@/game/constants';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useProjectContext } from '@/contexts/ProjectContext';
import {
  setGameInstance, clearGameInstance, syncAgents, updateAgent, setTheme,
} from '@/game/bridge/react-phaser-bridge';
import type { WsAgentUpdate, CompanyConfig, ThemeName } from '@/lib/types';

export function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const { lastMessage } = useWebSocket();
  const { selectedProjectId } = useProjectContext();

  // Init game
  useEffect(() => {
    if (gameRef.current) return;

    const config = createGameConfig('phaser-container');
    const game = new Phaser.Game(config);
    gameRef.current = game;
    setGameInstance(game);

    // Fetch agentes e tema quando OfficeScene estiver pronta
    game.events.on('ready', async () => {
      try {
        const url = selectedProjectId
          ? `/api/agents?project_id=${selectedProjectId}`
          : '/api/agents';
        const [agentsRes, configRes] = await Promise.all([
          fetch(url),
          fetch('/api/company-config'),
        ]);
        const agents = await agentsRes.json();
        const config: CompanyConfig = await configRes.json();
        const waitForScene = setInterval(() => {
          const scene = game.scene.getScene('OfficeScene');
          if (scene && scene.scene.isActive()) {
            clearInterval(waitForScene);
            if (config.theme) setTheme(config.theme);
            syncAgents(agents);
          }
        }, 100);
      } catch {
        // silent — scene starts with defaults
      }
    });

    return () => {
      clearGameInstance();
      game.destroy(true);
      gameRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push WS messages para Phaser
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'agent:update') {
      const { agent, projectId } = lastMessage as WsAgentUpdate;
      if (selectedProjectId && projectId !== selectedProjectId) return;
      updateAgent(agent);
    }

    if (lastMessage.type === 'theme:change') {
      const { theme } = lastMessage as { type: 'theme:change'; theme: ThemeName };
      setTheme(theme);
    }
  }, [lastMessage, selectedProjectId]);

  return (
    <div
      id="phaser-container"
      className="w-full"
      style={{ height: `calc(100vh - ${NAVBAR_HEIGHT}px)` }}
    />
  );
}
