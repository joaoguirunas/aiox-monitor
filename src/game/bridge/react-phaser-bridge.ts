import type * as Phaser from 'phaser';
import type { Agent, Project, ThemeName } from '@/lib/types';

let gameInstance: Phaser.Game | null = null;

export function setGameInstance(game: Phaser.Game): void {
  gameInstance = game;
}

export function getGameInstance(): Phaser.Game | null {
  return gameInstance;
}

export function emitToGame(event: string, data: unknown): void {
  const scene = gameInstance?.scene.getScene('OfficeScene');
  if (scene) {
    scene.events.emit(event, data);
  }
}

export function syncAgents(agents: Agent[]): void {
  emitToGame('sync:agents', agents);
}

export function updateAgent(agent: Agent): void {
  emitToGame('update:agent', agent);
}

export function syncProjects(projects: Project[]): void {
  emitToGame('sync:projects', projects);
}

export function setTheme(themeName: ThemeName): void {
  emitToGame('set:theme', themeName);
}

export function clearGameInstance(): void {
  gameInstance = null;
}
