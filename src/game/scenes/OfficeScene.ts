import * as Phaser from 'phaser';
import {
  MAP_WIDTH, MAP_HEIGHT, TILE_WIDTH, TILE_HEIGHT,
  getZoneForTile,
  DESK_POSITIONS, LOUNGE_POSITIONS, ENTRANCE_POSITION,
  FURNITURE_POSITIONS, COFFEE_TABLE_POSITION,
} from '../data/office-layout';
import { tileToPixel } from '../utils/iso-utils';
import { getTheme, type OfficeTheme } from '../data/themes';
import { Desk } from '../objects/Desk';
import { Sofa } from '../objects/Sofa';
import { CoffeeTable } from '../objects/CoffeeTable';
import { CoffeeMachine } from '../objects/CoffeeMachine';
import { Bookshelf } from '../objects/Bookshelf';
import { Plant } from '../objects/Plant';
import { WaterCooler } from '../objects/WaterCooler';
import { Door } from '../objects/Door';
import { AgentManager } from '../managers/AgentManager';
import { AGENT_SPRITE_CONFIGS } from '../data/agent-sprite-config';
import { createAgentAnimations } from '../animations/agent-animations';
import type { Agent, ThemeName } from '@/lib/types';

export class OfficeScene extends Phaser.Scene {
  public desks: Desk[] = [];
  public coffeeMachine: CoffeeMachine | null = null;
  private sofas: Sofa[] = [];
  private coffeeTables: CoffeeTable[] = [];
  private agentManager!: AgentManager;
  private currentTheme!: OfficeTheme;
  private floorGraphics!: Phaser.GameObjects.Graphics;
  private wallGraphics!: Phaser.GameObjects.Graphics;
  private ambientLayer: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super({ key: 'OfficeScene' });
  }

  create(): void {
    this.currentTheme = getTheme('moderno');
    this.cameras.main.setBackgroundColor(this.currentTheme.backgroundColor);

    this.floorGraphics = this.add.graphics();
    this.wallGraphics = this.add.graphics();
    this.redrawFloor();
    this.redrawWalls();

    this.placeFurniture();
    this.setupCamera();
    this.registerAgentAnimations();

    this.agentManager = new AgentManager(this, this.desks);

    this.events.on('sync:agents', (agents: Agent[]) => {
      this.agentManager.syncAll(agents);
    });

    this.events.on('update:agent', (agent: Agent) => {
      this.agentManager.updateAgent(agent);
    });

    this.events.on('set:theme', (themeName: ThemeName) => {
      this.setTheme(themeName);
    });
  }

  setTheme(themeName: ThemeName): void {
    this.currentTheme = getTheme(themeName);
    this.cameras.main.setBackgroundColor(this.currentTheme.backgroundColor);
    this.redrawFloor();
    this.redrawWalls();
    this.applyAmbientEffect();
    this.desks.forEach((d) => d.applyTheme(this.currentTheme));
    this.sofas.forEach((s) => s.applyTheme(this.currentTheme));
    this.coffeeTables.forEach((ct) => ct.applyTheme(this.currentTheme));
  }

  private redrawFloor(): void {
    this.floorGraphics.clear();
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    const t = this.currentTheme;

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const zone = getZoneForTile(x, y);
        if (!zone) continue;

        const color = t.floorColors[zone];
        const { x: px, y: py } = tileToPixel(x, y);

        this.floorGraphics.fillStyle(color, 1);
        this.floorGraphics.beginPath();
        this.floorGraphics.moveTo(px, py - hh);
        this.floorGraphics.lineTo(px + hw, py);
        this.floorGraphics.lineTo(px, py + hh);
        this.floorGraphics.lineTo(px - hw, py);
        this.floorGraphics.closePath();
        this.floorGraphics.fillPath();

        this.floorGraphics.lineStyle(1, t.floorGridColor, t.floorGridAlpha);
        this.floorGraphics.strokePath();
      }
    }
  }

  private redrawWalls(): void {
    this.wallGraphics.clear();
    const t = this.currentTheme;
    this.wallGraphics.lineStyle(2, t.wallColor, t.wallAlpha);
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const zone = getZoneForTile(x, y);
        if (!zone) continue;

        const { x: px, y: py } = tileToPixel(x, y);

        if (!getZoneForTile(x, y - 1)) {
          this.wallGraphics.beginPath();
          this.wallGraphics.moveTo(px - hw, py);
          this.wallGraphics.lineTo(px, py - hh);
          this.wallGraphics.strokePath();
        }
        if (!getZoneForTile(x - 1, y)) {
          this.wallGraphics.beginPath();
          this.wallGraphics.moveTo(px, py - hh);
          this.wallGraphics.lineTo(px + hw, py);
          this.wallGraphics.strokePath();
        }
        if (!getZoneForTile(x + 1, y)) {
          this.wallGraphics.beginPath();
          this.wallGraphics.moveTo(px - hw, py);
          this.wallGraphics.lineTo(px, py + hh);
          this.wallGraphics.strokePath();
        }
        if (!getZoneForTile(x, y + 1)) {
          this.wallGraphics.beginPath();
          this.wallGraphics.moveTo(px, py + hh);
          this.wallGraphics.lineTo(px + hw, py);
          this.wallGraphics.strokePath();
        }
      }
    }
  }

  private applyAmbientEffect(): void {
    if (this.ambientLayer) {
      this.ambientLayer.destroy();
      this.ambientLayer = null;
    }

    const t = this.currentTheme;
    if (t.ambientEffect === 'none') return;

    if (t.ambientEffect === 'stars') {
      const g = this.add.graphics().setDepth(-1);
      for (let i = 0; i < 50; i++) {
        g.fillStyle(t.ambientColor, Math.random() * t.ambientAlpha + 0.1);
        g.fillCircle(
          Phaser.Math.Between(-200, 1200),
          Phaser.Math.Between(-200, 600),
          Phaser.Math.Between(1, 2),
        );
      }
      this.ambientLayer = g;
      this.tweens.add({
        targets: g,
        alpha: 0.3,
        duration: 3000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    if (t.ambientEffect === 'scanlines') {
      const g = this.add.graphics().setDepth(9999);
      g.fillStyle(0x000000, t.ambientAlpha);
      for (let y = 0; y < 800; y += 4) {
        g.fillRect(-400, y, 2000, 2);
      }
      g.setScrollFactor(0);
      this.ambientLayer = g;
    }

    if (t.ambientEffect === 'grain') {
      const g = this.add.graphics().setDepth(9999);
      g.fillStyle(t.ambientColor, t.ambientAlpha);
      for (let i = 0; i < 200; i++) {
        g.fillRect(
          Phaser.Math.Between(-200, 1200),
          Phaser.Math.Between(-200, 600),
          1, 1,
        );
      }
      this.ambientLayer = g;
    }
  }

  private placeFurniture(): void {
    // Mesas de trabalho (11 posições)
    this.desks = DESK_POSITIONS.map(
      (pos) => new Desk(this, pos.tileX, pos.tileY),
    );

    // Lounge: sofás
    this.sofas = [
      new Sofa(this, LOUNGE_POSITIONS[0].tileX, LOUNGE_POSITIONS[0].tileY),
      new Sofa(this, LOUNGE_POSITIONS[1].tileX, LOUNGE_POSITIONS[1].tileY),
      new Sofa(this, LOUNGE_POSITIONS[3].tileX, LOUNGE_POSITIONS[3].tileY),
    ];

    // Mesa de café
    this.coffeeTables = [
      new CoffeeTable(this, COFFEE_TABLE_POSITION.tileX, COFFEE_TABLE_POSITION.tileY),
    ];

    // Novos móveis do break room
    this.coffeeMachine = new CoffeeMachine(
      this, FURNITURE_POSITIONS.coffeeMachine.tileX, FURNITURE_POSITIONS.coffeeMachine.tileY,
    );
    new WaterCooler(this, FURNITURE_POSITIONS.waterCooler.tileX, FURNITURE_POSITIONS.waterCooler.tileY);
    new Bookshelf(this, FURNITURE_POSITIONS.bookshelf.tileX, FURNITURE_POSITIONS.bookshelf.tileY);
    new Plant(this, FURNITURE_POSITIONS.plant1.tileX, FURNITURE_POSITIONS.plant1.tileY);
    new Plant(this, FURNITURE_POSITIONS.plant2.tileX, FURNITURE_POSITIONS.plant2.tileY);

    // Porta de entrada
    new Door(this, ENTRANCE_POSITION.tileX, ENTRANCE_POSITION.tileY);
  }

  private registerAgentAnimations(): void {
    for (const config of Object.values(AGENT_SPRITE_CONFIGS)) {
      if (this.textures.exists(config.key)) {
        createAgentAnimations(this, config.key);
      }
    }
    if (this.textures.exists('agent-default')) {
      createAgentAnimations(this, 'agent-default');
    }
  }

  private setupCamera(): void {
    const center = tileToPixel(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    this.cameras.main.centerOn(center.x, center.y);

    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _gameObjects: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => {
        const zoom = this.cameras.main.zoom;
        const newZoom = Phaser.Math.Clamp(zoom - deltaY * 0.001, 0.5, 2);
        this.cameras.main.setZoom(newZoom);
      },
    );

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      this.cameras.main.scrollX -=
        (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
      this.cameras.main.scrollY -=
        (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
    });
  }
}
