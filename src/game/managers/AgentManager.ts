import * as Phaser from 'phaser';
import { AgentSprite } from '../objects/AgentSprite';
import { Desk } from '../objects/Desk';
import { getAgentColor } from '../data/agent-visuals';
import {
  DESK_POSITIONS, ENTRANCE_POSITION,
  LOUNGE_POSITIONS_V2, FURNITURE_POSITIONS,
} from '../data/office-layout';
import type { LoungePosition } from '../data/office-layout';
import { tileToPixel } from '../utils/iso-utils';
import type { Agent, AgentStatus } from '@/lib/types';
import type { OfficeScene } from '../scenes/OfficeScene';

const DISPLAY_NAMES: Record<string, string> = {
  '@dev': 'Dex', '@qa': 'Quinn', '@architect': 'Aria',
  '@pm': 'Morgan', '@sm': 'River', '@po': 'Pax',
  '@analyst': 'Alex', '@devops': 'Gage',
  '@data-engineer': 'Dara', '@ux-design-expert': 'Uma',
  '@aiox-master': 'AIOX',
};

export class AgentManager {
  private sprites: Map<string, AgentSprite> = new Map();
  private deskAssignment: Map<string, number> = new Map();

  constructor(
    private scene: OfficeScene,
    private desks: Desk[],
  ) {}

  // Carga inicial: posiciona instantaneamente (sem walk)
  syncAll(agents: Agent[]): void {
    const activeNames = new Set<string>();

    for (const agent of agents) {
      activeNames.add(agent.name);
      const existing = this.sprites.get(agent.name);

      if (existing) {
        existing.setStatus(agent.status);
        this.positionInstant(agent.name, agent.status);
      } else if (agent.status !== 'offline') {
        this.createAgent(agent, false);
      }
    }

    for (const [name] of this.sprites) {
      if (!activeNames.has(name)) {
        this.removeAgent(name);
      }
    }
  }

  // Update individual via WS: usa walk animation
  updateAgent(agent: Agent): void {
    const existing = this.sprites.get(agent.name);
    if (!existing && agent.status !== 'offline') {
      this.createAgent(agent, true);
      return;
    }
    if (existing) {
      existing.setStatus(agent.status);
      this.transitionAgent(agent.name, agent.status);
    }
  }

  private createAgent(agent: Agent, withWalk: boolean): void {
    const startPos = ENTRANCE_POSITION;
    const displayName = agent.display_name ?? DISPLAY_NAMES[agent.name] ?? agent.name;
    const sprite = new AgentSprite(
      this.scene, agent.name, displayName,
      startPos.tileX, startPos.tileY,
    );
    sprite.setStatus(agent.status);
    this.sprites.set(agent.name, sprite);

    if (withWalk) {
      this.transitionAgent(agent.name, agent.status);
    } else {
      this.positionInstant(agent.name, agent.status);
    }
  }

  // Posicionamento instantâneo (sync inicial)
  private positionInstant(name: string, status: AgentStatus): void {
    const sprite = this.sprites.get(name);
    if (!sprite) return;

    if (status === 'offline') {
      this.removeAgent(name);
      return;
    }

    if (status === 'working') {
      const deskIdx = this.assignDesk(name);
      if (deskIdx >= 0 && deskIdx < DESK_POSITIONS.length) {
        const desk = DESK_POSITIONS[deskIdx];
        sprite.setTilePosition(desk.tileX, desk.tileY);
        sprite.sitDown();
        this.scene.time.delayedCall(400, () => sprite.startTyping());
        if (deskIdx < this.desks.length) {
          this.desks[deskIdx].setScreenOn(getAgentColor(name));
        }
      }
    } else if (status === 'idle' || status === 'break') {
      this.releaseDesk(name);
      const pos = this.getLoungePosition(name, status);
      sprite.setTilePosition(pos.tileX, pos.tileY);
      sprite.standIdle();
    }
  }

  // Transição com walk animation (updates via WS)
  private transitionAgent(name: string, status: AgentStatus): void {
    const sprite = this.sprites.get(name);
    if (!sprite) return;

    if (status === 'offline') {
      sprite.walkTo(ENTRANCE_POSITION.tileX, ENTRANCE_POSITION.tileY).then(() => {
        this.removeAgent(name);
      });
      return;
    }

    if (status === 'working') {
      const deskIdx = this.assignDesk(name);
      if (deskIdx >= 0 && deskIdx < DESK_POSITIONS.length) {
        const desk = DESK_POSITIONS[deskIdx];
        sprite.walkTo(desk.tileX, desk.tileY).then(() => {
          // Verificar se ainda existe e ainda está working
          if (!this.sprites.has(name)) return;
          sprite.sitDown();
          this.scene.time.delayedCall(400, () => {
            if (this.sprites.has(name)) sprite.startTyping();
          });
          if (deskIdx < this.desks.length) {
            this.desks[deskIdx].setScreenOn(getAgentColor(name));
          }
        });
      }
    } else if (status === 'idle' || status === 'break') {
      this.releaseDesk(name);
      const pos = this.getLoungePosition(name, status);
      sprite.walkTo(pos.tileX, pos.tileY).then(() => {
        if (!this.sprites.has(name)) return;
        sprite.standIdle();
        // Activar vapor da máquina de café se agente está na posição coffee-machine
        if (status === 'break' && pos.type === 'coffee-machine') {
          this.scene.coffeeMachine?.setSteamActive(true);
        }
      });
      // Verificar se deve desactivar vapor (agente saiu de perto)
      this.checkCoffeeMachineState();
    }
  }

  private getLoungePosition(name: string, status: AgentStatus): LoungePosition {
    const statusKey = status as 'idle' | 'break';
    const available = LOUNGE_POSITIONS_V2.filter(
      (p) => p.interactionFor.includes(statusKey),
    );

    // Encontrar posições não ocupadas
    const occupiedPositions = new Set<string>();
    for (const [n, sprite] of this.sprites) {
      if (n !== name) {
        occupiedPositions.add(`${Math.round(sprite.x)},${Math.round(sprite.y)}`);
      }
    }

    const free = available.filter((p) => {
      const { x, y } = tileToPixel(p.tileX, p.tileY);
      return !occupiedPositions.has(`${Math.round(x)},${Math.round(y)}`);
    });

    // Se há posição livre, usar. Senão, round-robin nas disponíveis
    let idx = 0;
    for (const [n] of this.sprites) {
      if (n === name) break;
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
    const hasAgentNearby = [...this.sprites.values()].some((s) => {
      const dist = Phaser.Math.Distance.Between(s.x, s.y, cx, cy);
      return dist < 40;
    });
    this.scene.coffeeMachine.setSteamActive(hasAgentNearby);
  }

  private assignDesk(name: string): number {
    const existing = this.deskAssignment.get(name);
    if (existing !== undefined) return existing;

    const usedDesks = new Set(this.deskAssignment.values());
    for (let i = 0; i < DESK_POSITIONS.length; i++) {
      if (!usedDesks.has(i)) {
        this.deskAssignment.set(name, i);
        return i;
      }
    }
    return -1;
  }

  private releaseDesk(name: string): void {
    const deskIdx = this.deskAssignment.get(name);
    if (deskIdx !== undefined) {
      this.deskAssignment.delete(name);
      if (deskIdx < this.desks.length) {
        this.desks[deskIdx].setScreenOff();
      }
    }
  }

  private removeAgent(name: string): void {
    const sprite = this.sprites.get(name);
    if (sprite) {
      sprite.destroy();
      this.sprites.delete(name);
    }
    this.releaseDesk(name);
  }
}
