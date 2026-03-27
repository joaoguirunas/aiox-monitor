import * as Phaser from 'phaser';
import { AgentSprite } from '../objects/AgentSprite';
import { getAgentColor } from '../data/agent-visuals';
import {
  ENTRANCE_POSITION, RECREATION_POSITIONS, FURNITURE_POSITIONS,
} from '../data/office-layout';
import type { RecreationPosition } from '../data/office-layout';
import { tileToPixel } from '../utils/iso-utils';
import type { Agent, AgentStatus, AgentWithStats, Project } from '@/lib/types';
import type { OfficeScene } from '../scenes/OfficeScene';
import type { ClusterManager } from './ClusterManager';

/** Maps recreation position types to furniture indices based on tile matching */
function findFurnitureIndex(
  positions: { tileX: number; tileY: number }[],
  tileX: number, tileY: number,
): number {
  return positions.findIndex(p => p.tileX === tileX && p.tileY === tileY);
}

const DISPLAY_NAMES: Record<string, string> = {
  '@dev': 'Dex', '@qa': 'Quinn', '@architect': 'Aria',
  '@pm': 'Morgan', '@sm': 'River', '@po': 'Pax',
  '@analyst': 'Atlas', '@devops': 'Gage',
  '@data-engineer': 'Dara', '@ux-design-expert': 'Uma',
  '@aiox-master': 'AIOX',
};

interface DeskSlot {
  projectId: number;
  deskIndex: number;
}

interface AgentState {
  status: AgentStatus;
  projectId: number;
}

export class AgentManager {
  private sprites: Map<string, AgentSprite> = new Map();
  private deskAssignment: Map<string, DeskSlot> = new Map();
  private projectNames: Map<number, string> = new Map();
  /** Tracks which recreation position each agent occupies, for furniture deactivation */
  private recAssignment: Map<string, RecreationPosition> = new Map();
  /** Tracks last known state to avoid redundant transitions */
  private lastState: Map<string, AgentState> = new Map();
  /** Tracks agents currently mid-walk (wander) to avoid interrupting */
  private wandering: Set<string> = new Set();
  /** Tracks agents mid-transition (walkTo from updateAgent) to prevent syncAll from interrupting */
  private inTransition: Set<string> = new Set();
  private wanderTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    private scene: OfficeScene,
    private clusterManager: ClusterManager,
  ) {
    this.startWanderTimer();
  }

  /** Periodically moves idle/break agents to new recreation positions */
  private startWanderTimer(): void {
    this.wanderTimer = this.scene.time.addEvent({
      delay: 8000,
      callback: () => this.wanderIdleAgents(),
      loop: true,
    });
  }

  private wanderIdleAgents(): void {
    const candidates: string[] = [];
    for (const [key] of this.sprites) {
      const state = this.lastState.get(key);
      if (!state) continue;
      if ((state.status === 'idle' || state.status === 'break') && !this.wandering.has(key)) {
        // Don't wander agents that are sleeping in bed
        const currentPos = this.recAssignment.get(key);
        if (currentPos?.type === 'bed') continue;
        candidates.push(key);
      }
    }
    if (candidates.length === 0) return;

    // Pick 1-2 random agents to move each cycle
    const count = Math.min(candidates.length, Phaser.Math.Between(1, 2));
    const shuffled = Phaser.Utils.Array.Shuffle([...candidates]);

    for (let i = 0; i < count; i++) {
      const key = shuffled[i];
      const sprite = this.sprites.get(key);
      const state = this.lastState.get(key);
      if (!sprite || !state) continue;

      const currentPos = this.recAssignment.get(key);
      const newPos = this.getRecreationPosition(key, state.status, currentPos);

      // Skip if same position
      if (currentPos && newPos.tileX === currentPos.tileX && newPos.tileY === currentPos.tileY) continue;

      // Release current furniture
      if (currentPos) {
        this.deactivateFurniture(currentPos);
        this.recAssignment.delete(key);
      }

      this.wandering.add(key);
      sprite.walkTo(newPos.tileX, newPos.tileY).then(() => {
        this.wandering.delete(key);
        if (!this.sprites.has(key) || sprite.scene == null) return;
        if (newPos.type === 'bed') {
          sprite.lieDown();
        } else {
          sprite.standIdle();
        }
        this.recAssignment.set(key, newPos);
        this.activateFurniture(newPos, sprite.agentName);
        if (state.status === 'break' && newPos.type === 'coffee-machine') {
          this.scene.coffeeMachine?.setSteamActive(true);
        }
        this.checkCoffeeMachineState();
      });
    }
  }

  /** Chave estável por agente-instância.
   *  Negative IDs (from getAgentInstances) are unique per terminal — use them directly.
   *  Positive IDs (from getAgents) use project:name for deduplication. */
  private agentKey(agent: Agent): string {
    if (agent.id < 0) return String(agent.id);
    return `${agent.project_id}:${agent.name}`;
  }

  /** Atualiza mapa de nomes de projetos e garante clusters para todos */
  syncProjects(projects: Project[]): void {
    for (const p of projects) {
      this.projectNames.set(p.id, p.name);
      // Ensure every project has a visible cluster with desks
      this.clusterManager.ensureCluster(p.id, p.name);
    }
  }

  private getProjectName(projectId: number): string {
    return this.projectNames.get(projectId) ?? `Projeto ${projectId}`;
  }

  // Carga inicial: posiciona instantaneamente (sem walk)
  syncAll(agents: Agent[]): void {
    // Filter out @unknown agents — they clutter the office
    const visible = agents.filter(a => a.name !== '@unknown');
    console.log('[AgentManager] syncAll called with', visible.length, 'visible agents');
    const activeKeys = new Set<string>();

    // Ensure clusters exist for all projects that have agents
    const projectIds = new Set<number>();
    for (const agent of visible) {
      projectIds.add(agent.project_id);
    }
    for (const projectId of projectIds) {
      try {
        this.clusterManager.ensureCluster(projectId, this.getProjectName(projectId));
      } catch (err) {
        console.error('[AgentManager] ensureCluster failed for project', projectId, err);
      }
    }

    for (const agent of visible) {
      const key = this.agentKey(agent);
      activeKeys.add(key);
      const existing = this.sprites.get(key);

      try {
        if (existing) {
          // Hot-swap skin if user changed it in config
          existing.refreshSkin();

          // Skip reposition if agent is mid-transition from a WS update (avoid flickering)
          if (this.inTransition.has(key)) {
            // Still update tool state (labels, permission bubble) even during transition
            this.applyToolState(existing, agent);
          } else {
            // Only reposition if status or project changed
            const prev = this.lastState.get(key);
            if (!prev || prev.status !== agent.status || prev.projectId !== agent.project_id) {
              this.wandering.delete(key);
              existing.setStatus(agent.status);
              this.positionInstant(key, agent);
              this.lastState.set(key, { status: agent.status, projectId: agent.project_id });
            }
            // Always update tool detail and permission state
            this.applyToolState(existing, agent);
          }
        } else if (agent.status !== 'offline') {
          this.createAgent(agent, false);
          this.lastState.set(key, { status: agent.status, projectId: agent.project_id });
          // Apply tool state to newly created sprite
          const newSprite = this.sprites.get(key);
          if (newSprite) this.applyToolState(newSprite, agent);
        }
      } catch (err) {
        console.error('[AgentManager] failed to sync agent', agent.name, agent.status, err);
      }
    }

    for (const [key] of this.sprites) {
      if (!activeKeys.has(key)) {
        this.removeAgent(key);
      }
    }
  }

  /** Find all sprite keys matching a given agent name + project_id.
   *  Needed because WS broadcasts use positive IDs (agents table) while
   *  syncAll uses negative IDs (terminal instances). */
  private findKeysByAgent(projectId: number, name: string): string[] {
    const keys: string[] = [];
    // Direct key lookup for positive-ID format
    const directKey = `${projectId}:${name}`;
    if (this.sprites.has(directKey)) keys.push(directKey);
    // Scan for negative-ID terminal-instance keys
    for (const [key, sprite] of this.sprites) {
      if (key === directKey) continue; // already added
      if (sprite.agentName === name) {
        const state = this.lastState.get(key);
        if (state && state.projectId === projectId) keys.push(key);
      }
    }
    return keys;
  }

  // Update individual via WS: usa walk animation
  updateAgent(agent: Agent): void {
    // Skip @unknown agents
    if (agent.name === '@unknown') return;

    // Only create cluster when agent is actually working
    if (agent.status === 'working') {
      this.clusterManager.ensureCluster(agent.project_id, this.getProjectName(agent.project_id));
    }

    // Find all sprites for this agent (handles both positive/negative ID keys)
    const matchingKeys = this.findKeysByAgent(agent.project_id, agent.name);

    if (matchingKeys.length === 0 && agent.status !== 'offline') {
      this.createAgent(agent, true);
      return;
    }

    for (const key of matchingKeys) {
      const existing = this.sprites.get(key);
      if (!existing) continue;

      // Always update tool state (even if status unchanged)
      this.applyToolState(existing, agent);

      // Skip transition if status and project haven't changed
      const prev = this.lastState.get(key);
      if (prev && prev.status === agent.status && prev.projectId === agent.project_id) {
        continue;
      }
      this.wandering.delete(key);
      this.lastState.set(key, { status: agent.status, projectId: agent.project_id });
      existing.setStatus(agent.status);
      this.transitionAgent(key, agent);
    }
  }

  /** Apply tool detail label and permission bubble to a sprite */
  private applyToolState(sprite: AgentSprite, agent: Agent): void {
    const aws = agent as AgentWithStats;
    sprite.setToolDetail(aws.current_tool_detail ?? null);
    sprite.setWaitingPermission(aws.waiting_permission === 1);
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

    // Matrix spawn effect for new agents entering with walk
    if (withWalk) {
      sprite.playSpawnEffect();
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
      this.releaseRecreation(key);
      const pos = this.getRecreationPosition(key, agent.status);
      sprite.setTilePosition(pos.tileX, pos.tileY);
      if (pos.type === 'bed') {
        sprite.lieDown();
      } else {
        sprite.standIdle();
      }
      this.recAssignment.set(key, pos);
      this.activateFurniture(pos, sprite.agentName);
    }
  }

  // Transição com walk animation (updates via WS)
  private transitionAgent(key: string, agent: Agent): void {
    const sprite = this.sprites.get(key);
    if (!sprite) return;

    if (agent.status === 'offline') {
      this.releaseRecreation(key);
      this.inTransition.add(key);
      sprite.walkTo(ENTRANCE_POSITION.tileX, ENTRANCE_POSITION.tileY).then(() => {
        this.inTransition.delete(key);
        this.removeAgent(key);
      });
      return;
    }

    if (agent.status === 'working') {
      this.releaseRecreation(key);
      const slot = this.assignDesk(key, agent.project_id);
      if (slot) {
        const cluster = this.clusterManager.getCluster(slot.projectId);
        if (cluster && slot.deskIndex < cluster.deskPositions.length) {
          const deskPos = cluster.deskPositions[slot.deskIndex];
          this.inTransition.add(key);
          sprite.walkTo(deskPos.tileX, deskPos.tileY).then(() => {
            this.inTransition.delete(key);
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
      } else {
        // Cluster full — fallback to recreation area instead of leaving agent stranded
        const pos = this.getRecreationPosition(key, 'idle');
        this.inTransition.add(key);
        sprite.walkTo(pos.tileX, pos.tileY).then(() => {
          this.inTransition.delete(key);
          if (!this.sprites.has(key)) return;
          sprite.standIdle();
          this.recAssignment.set(key, pos);
          this.activateFurniture(pos, sprite.agentName);
        });
      }
    } else if (agent.status === 'idle' || agent.status === 'break') {
      this.releaseDesk(key);
      this.releaseRecreation(key);
      const pos = this.getRecreationPosition(key, agent.status);
      this.inTransition.add(key);
      sprite.walkTo(pos.tileX, pos.tileY).then(() => {
        this.inTransition.delete(key);
        if (!this.sprites.has(key)) return;
        if (pos.type === 'bed') {
          sprite.lieDown();
        } else {
          sprite.standIdle();
        }
        this.recAssignment.set(key, pos);
        this.activateFurniture(pos, sprite.agentName);
        if (agent.status === 'break' && pos.type === 'coffee-machine') {
          this.scene.coffeeMachine?.setSteamActive(true);
        }
      });
      this.checkCoffeeMachineState();
    }
  }

  private getRecreationPosition(key: string, status: AgentStatus, excludePos?: RecreationPosition): RecreationPosition {
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
      // Exclude current position for wander
      if (excludePos && p.tileX === excludePos.tileX && p.tileY === excludePos.tileY) return false;
      const { x, y } = tileToPixel(p.tileX, p.tileY);
      return !occupiedPositions.has(`${Math.round(x)},${Math.round(y)}`);
    });

    // For wander (excludePos provided), pick randomly; otherwise use stable index
    if (excludePos && free.length > 0) {
      return free[Phaser.Math.Between(0, free.length - 1)];
    }

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

  /** Activate furniture at the given recreation position */
  private activateFurniture(pos: RecreationPosition, agentName: string): void {
    if (pos.type === 'gaming') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.gaming],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.gamingSetups.length) {
        this.scene.gamingSetups[idx].setScreenOn(getAgentColor(agentName));
      }
    } else if (pos.type === 'massage') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.massage1, FURNITURE_POSITIONS.massage2],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.massageChairs.length) {
        this.scene.massageChairs[idx].setInUse(true);
      }
    } else if (pos.type === 'bean-bag') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.beanBag1, FURNITURE_POSITIONS.beanBag2],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.beanBags.length) {
        this.scene.beanBags[idx].setOccupied(true);
      }
    } else if (pos.type === 'bed') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.bed1, FURNITURE_POSITIONS.bed2, FURNITURE_POSITIONS.bed3],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.beds.length) {
        this.scene.beds[idx].setOccupied(true);
      }
    } else if (pos.type === 'sofa') {
      const sofaPositions = [
        { tileX: 10, tileY: 10 }, { tileX: 10, tileY: 12 },
        { tileX: 12, tileY: 10 }, { tileX: 12, tileY: 12 },
      ];
      const idx = findFurnitureIndex(sofaPositions, pos.tileX, pos.tileY);
      if (idx >= 0 && idx < this.scene.sofas.length) {
        this.scene.sofas[idx].setOccupied(true);
      }
    } else if (pos.type === 'arcade') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.arcade1, FURNITURE_POSITIONS.arcade2],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.arcades.length) {
        this.scene.arcades[idx].setInUse(true);
      }
    } else if (pos.type === 'hammock') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.hammock1, FURNITURE_POSITIONS.hammock2, FURNITURE_POSITIONS.hammock3],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.hammocks.length) {
        this.scene.hammocks[idx].setOccupied(true);
      }
    } else if (pos.type === 'pool-table') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.poolTable],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.poolTables.length) {
        this.scene.poolTables[idx].setInUse(true);
      }
    }
  }

  /** Deactivate furniture at the given recreation position */
  private deactivateFurniture(pos: RecreationPosition): void {
    if (pos.type === 'gaming') {
      const idx = findFurnitureIndex([FURNITURE_POSITIONS.gaming], pos.tileX, pos.tileY);
      if (idx >= 0 && idx < this.scene.gamingSetups.length) {
        this.scene.gamingSetups[idx].setScreenOff();
      }
    } else if (pos.type === 'massage') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.massage1, FURNITURE_POSITIONS.massage2],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.massageChairs.length) {
        this.scene.massageChairs[idx].setInUse(false);
      }
    } else if (pos.type === 'bean-bag') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.beanBag1, FURNITURE_POSITIONS.beanBag2],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.beanBags.length) {
        this.scene.beanBags[idx].setOccupied(false);
      }
    } else if (pos.type === 'bed') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.bed1, FURNITURE_POSITIONS.bed2, FURNITURE_POSITIONS.bed3],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.beds.length) {
        this.scene.beds[idx].setOccupied(false);
      }
    } else if (pos.type === 'sofa') {
      const sofaPositions = [
        { tileX: 10, tileY: 10 }, { tileX: 10, tileY: 12 },
        { tileX: 12, tileY: 10 }, { tileX: 12, tileY: 12 },
      ];
      const idx = findFurnitureIndex(sofaPositions, pos.tileX, pos.tileY);
      if (idx >= 0 && idx < this.scene.sofas.length) {
        this.scene.sofas[idx].setOccupied(false);
      }
    } else if (pos.type === 'arcade') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.arcade1, FURNITURE_POSITIONS.arcade2],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.arcades.length) {
        this.scene.arcades[idx].setInUse(false);
      }
    } else if (pos.type === 'hammock') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.hammock1, FURNITURE_POSITIONS.hammock2, FURNITURE_POSITIONS.hammock3],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.hammocks.length) {
        this.scene.hammocks[idx].setOccupied(false);
      }
    } else if (pos.type === 'pool-table') {
      const idx = findFurnitureIndex(
        [FURNITURE_POSITIONS.poolTable],
        pos.tileX, pos.tileY,
      );
      if (idx >= 0 && idx < this.scene.poolTables.length) {
        this.scene.poolTables[idx].setInUse(false);
      }
    }
  }

  /** Release recreation furniture when agent moves away */
  private releaseRecreation(key: string): void {
    const pos = this.recAssignment.get(key);
    if (pos) {
      this.deactivateFurniture(pos);
      this.recAssignment.delete(key);
    }
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
      // Clear labels before despawn to avoid visual remnants
      sprite.setToolDetail(null);
      sprite.setWaitingPermission(false);
      // Play matrix despawn effect, then destroy
      sprite.playDespawnEffect(() => {
        sprite.destroy();
      });
      this.sprites.delete(key);
    }
    this.releaseDesk(key);
    this.releaseRecreation(key);
    this.lastState.delete(key);
    this.wandering.delete(key);
    this.inTransition.delete(key);
  }
}
