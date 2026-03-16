import * as Phaser from 'phaser';
import { AgentSprite } from '../objects/AgentSprite';
import { getAgentColor } from '../data/agent-visuals';
import {
  ENTRANCE_POSITION, RECREATION_POSITIONS, FURNITURE_POSITIONS,
} from '../data/office-layout';
import type { RecreationPosition } from '../data/office-layout';
import { tileToPixel } from '../utils/iso-utils';
import type { Agent, AgentStatus, Project } from '@/lib/types';
import type { OfficeScene } from '../scenes/OfficeScene';
import type { ClusterManager } from './ClusterManager';

const DISPLAY_NAMES: Record<string, string> = {
  '@dev': 'Dex', '@qa': 'Quinn', '@architect': 'Aria',
  '@pm': 'Morgan', '@sm': 'River', '@po': 'Pax',
  '@analyst': 'Alex', '@devops': 'Gage',
  '@data-engineer': 'Dara', '@ux-design-expert': 'Uma',
  '@aiox-master': 'AIOX',
};

interface DeskSlot {
  projectId: number;
  deskIndex: number;
}

export class AgentManager {
  private sprites: Map<string, AgentSprite> = new Map();
  private deskAssignment: Map<string, DeskSlot> = new Map();
  private projectNames: Map<number, string> = new Map();

  constructor(
    private scene: OfficeScene,
    private clusterManager: ClusterManager,
  ) {}

  /** Chave única por agente: project_id + name */
  private agentKey(agent: Agent): string {
    return `${agent.project_id}:${agent.name}`;
  }

  /** Atualiza mapa de nomes de projetos */
  syncProjects(projects: Project[]): void {
    for (const p of projects) {
      this.projectNames.set(p.id, p.name);
    }
  }

  private getProjectName(projectId: number): string {
    return this.projectNames.get(projectId) ?? `Projeto ${projectId}`;
  }

  // Carga inicial: posiciona instantaneamente (sem walk)
  syncAll(agents: Agent[]): void {
    const activeKeys = new Set<string>();

    // Ensure clusters exist for all projects with non-offline agents
    const activeProjectIds = new Set<number>();
    for (const agent of agents) {
      if (agent.status !== 'offline') {
        activeProjectIds.add(agent.project_id);
      }
    }
    for (const projectId of activeProjectIds) {
      this.clusterManager.ensureCluster(projectId, this.getProjectName(projectId));
    }

    for (const agent of agents) {
      const key = this.agentKey(agent);
      activeKeys.add(key);
      const existing = this.sprites.get(key);

      if (existing) {
        existing.setStatus(agent.status);
        this.positionInstant(key, agent);
      } else if (agent.status !== 'offline') {
        this.createAgent(agent, false);
      }
    }

    for (const [key] of this.sprites) {
      if (!activeKeys.has(key)) {
        this.removeAgent(key);
      }
    }
  }

  // Update individual via WS: usa walk animation
  updateAgent(agent: Agent): void {
    // Ensure cluster for this project exists
    if (agent.status !== 'offline') {
      this.clusterManager.ensureCluster(agent.project_id, this.getProjectName(agent.project_id));
    }

    const key = this.agentKey(agent);
    const existing = this.sprites.get(key);
    if (!existing && agent.status !== 'offline') {
      this.createAgent(agent, true);
      return;
    }
    if (existing) {
      existing.setStatus(agent.status);
      this.transitionAgent(key, agent);
    }
  }

  private createAgent(agent: Agent, withWalk: boolean): void {
    const key = this.agentKey(agent);
    const startPos = ENTRANCE_POSITION;
    const displayName = agent.display_name ?? DISPLAY_NAMES[agent.name] ?? agent.name;
    const sprite = new AgentSprite(
      this.scene, agent.name, displayName,
      startPos.tileX, startPos.tileY,
    );
    sprite.setStatus(agent.status);
    this.sprites.set(key, sprite);

    if (withWalk) {
      this.transitionAgent(key, agent);
    } else {
      this.positionInstant(key, agent);
    }
  }

  // Posicionamento instantâneo (sync inicial)
  private positionInstant(key: string, agent: Agent): void {
    const sprite = this.sprites.get(key);
    if (!sprite) return;

    if (agent.status === 'offline') {
      this.removeAgent(key);
      return;
    }

    if (agent.status === 'working') {
      const slot = this.assignDesk(key, agent.project_id);
      if (slot) {
        const cluster = this.clusterManager.getCluster(slot.projectId);
        if (cluster && slot.deskIndex < cluster.deskPositions.length) {
          const deskPos = cluster.deskPositions[slot.deskIndex];
          sprite.setTilePosition(deskPos.tileX, deskPos.tileY);
          sprite.sitDown();
          this.scene.time.delayedCall(400, () => sprite.startTyping());
          if (slot.deskIndex < cluster.desks.length) {
            cluster.desks[slot.deskIndex].setScreenOn(getAgentColor(sprite.agentName));
          }
        }
      }
    } else if (agent.status === 'idle' || agent.status === 'break') {
      this.releaseDesk(key);
      const pos = this.getRecreationPosition(key, agent.status);
      sprite.setTilePosition(pos.tileX, pos.tileY);
      sprite.standIdle();
    }
  }

  // Transição com walk animation (updates via WS)
  private transitionAgent(key: string, agent: Agent): void {
    const sprite = this.sprites.get(key);
    if (!sprite) return;

    if (agent.status === 'offline') {
      sprite.walkTo(ENTRANCE_POSITION.tileX, ENTRANCE_POSITION.tileY).then(() => {
        this.removeAgent(key);
      });
      return;
    }

    if (agent.status === 'working') {
      const slot = this.assignDesk(key, agent.project_id);
      if (slot) {
        const cluster = this.clusterManager.getCluster(slot.projectId);
        if (cluster && slot.deskIndex < cluster.deskPositions.length) {
          const deskPos = cluster.deskPositions[slot.deskIndex];
          sprite.walkTo(deskPos.tileX, deskPos.tileY).then(() => {
            if (!this.sprites.has(key)) return;
            sprite.sitDown();
            this.scene.time.delayedCall(400, () => {
              if (this.sprites.has(key)) sprite.startTyping();
            });
            if (slot.deskIndex < cluster.desks.length) {
              cluster.desks[slot.deskIndex].setScreenOn(getAgentColor(sprite.agentName));
            }
          });
        }
      }
    } else if (agent.status === 'idle' || agent.status === 'break') {
      this.releaseDesk(key);
      const pos = this.getRecreationPosition(key, agent.status);
      sprite.walkTo(pos.tileX, pos.tileY).then(() => {
        if (!this.sprites.has(key)) return;
        sprite.standIdle();
        if (agent.status === 'break' && pos.type === 'coffee-machine') {
          this.scene.coffeeMachine?.setSteamActive(true);
        }
      });
      this.checkCoffeeMachineState();
    }
  }

  private getRecreationPosition(key: string, status: AgentStatus): RecreationPosition {
    const statusKey = status as 'idle' | 'break';
    const available = RECREATION_POSITIONS.filter(
      p => p.interactionFor.includes(statusKey),
    );

    const occupiedPositions = new Set<string>();
    for (const [k, sprite] of this.sprites) {
      if (k !== key) {
        occupiedPositions.add(`${Math.round(sprite.x)},${Math.round(sprite.y)}`);
      }
    }

    const free = available.filter(p => {
      const { x, y } = tileToPixel(p.tileX, p.tileY);
      return !occupiedPositions.has(`${Math.round(x)},${Math.round(y)}`);
    });

    let idx = 0;
    for (const [k] of this.sprites) {
      if (k === key) break;
      idx++;
    }

    if (free.length > 0) {
      return free[idx % free.length];
    }
    return available[idx % available.length];
  }

  private checkCoffeeMachineState(): void {
    if (!this.scene.coffeeMachine) return;
    const coffeePos = FURNITURE_POSITIONS.coffeeMachine;
    const { x: cx, y: cy } = tileToPixel(coffeePos.tileX, coffeePos.tileY);
    const hasAgentNearby = [...this.sprites.values()].some(s => {
      const dist = Phaser.Math.Distance.Between(s.x, s.y, cx, cy);
      return dist < 40;
    });
    this.scene.coffeeMachine.setSteamActive(hasAgentNearby);
  }

  private assignDesk(key: string, projectId: number): DeskSlot | null {
    const existing = this.deskAssignment.get(key);
    if (existing) return existing;

    // Ensure cluster exists
    const projectName = this.getProjectName(projectId);
    const cluster = this.clusterManager.ensureCluster(projectId, projectName);
    if (!cluster) return null;

    // Find first free desk in this cluster
    const usedInCluster = new Set<number>();
    for (const [, slot] of this.deskAssignment) {
      if (slot.projectId === projectId) {
        usedInCluster.add(slot.deskIndex);
      }
    }

    for (let i = 0; i < cluster.deskPositions.length; i++) {
      if (!usedInCluster.has(i)) {
        const slot: DeskSlot = { projectId, deskIndex: i };
        this.deskAssignment.set(key, slot);
        return slot;
      }
    }

    return null; // Cluster full
  }

  private releaseDesk(key: string): void {
    const slot = this.deskAssignment.get(key);
    if (slot) {
      this.deskAssignment.delete(key);
      const cluster = this.clusterManager.getCluster(slot.projectId);
      if (cluster && slot.deskIndex < cluster.desks.length) {
        cluster.desks[slot.deskIndex].setScreenOff();
      }
    }
  }

  private removeAgent(key: string): void {
    const sprite = this.sprites.get(key);
    if (sprite) {
      sprite.destroy();
      this.sprites.delete(key);
    }
    this.releaseDesk(key);
  }
}
