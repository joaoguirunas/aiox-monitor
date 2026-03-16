import * as Phaser from 'phaser';
import {
  MAP_WIDTH, MAP_HEIGHT, TILE_WIDTH, TILE_HEIGHT,
  getZoneForTile,
  LOUNGE_POSITIONS, ENTRANCE_POSITION,
  FURNITURE_POSITIONS, COFFEE_TABLE_POSITION,
} from '../data/office-layout';
import { tileToPixel } from '../utils/iso-utils';
import { getTheme, type OfficeTheme } from '../data/themes';
import {
  floorTextureKey, rugTextureKey, getRugTypeForTile,
  ZONE_NAMES, RUG_TYPES,
  type ZoneName,
} from '../data/floor-tiles';
import { Sofa } from '../objects/Sofa';
import { CoffeeTable } from '../objects/CoffeeTable';
import { CoffeeMachine } from '../objects/CoffeeMachine';
import { Bookshelf } from '../objects/Bookshelf';
import { Plant } from '../objects/Plant';
import { WaterCooler } from '../objects/WaterCooler';
import { Door } from '../objects/Door';
import { PingPongTable } from '../objects/PingPongTable';
import { Hammock } from '../objects/Hammock';
import { ArcadeMachine } from '../objects/ArcadeMachine';
import { PoolTable } from '../objects/PoolTable';
import { MassageChair } from '../objects/MassageChair';
import { GamingSetup } from '../objects/GamingSetup';
import { Bed } from '../objects/Bed';
import { BeanBag } from '../objects/BeanBag';
import { NightStand } from '../objects/NightStand';
import { ClusterManager } from '../managers/ClusterManager';
import { AgentManager } from '../managers/AgentManager';
import { AGENT_SPRITE_CONFIGS } from '../data/agent-sprite-config';
import { createAgentAnimations } from '../animations/agent-animations';
import type { Agent, Project, ThemeName } from '@/lib/types';

export class OfficeScene extends Phaser.Scene {
  public coffeeMachine: CoffeeMachine | null = null;
  public clusterManager!: ClusterManager;
  public gamingSetups: GamingSetup[] = [];
  public massageChairs: MassageChair[] = [];
  public beds: Bed[] = [];
  public beanBags: BeanBag[] = [];
  private sofas: Sofa[] = [];
  private coffeeTables: CoffeeTable[] = [];
  private poolTables: PoolTable[] = [];
  private nightStands: NightStand[] = [];
  private agentManager!: AgentManager;
  private currentTheme!: OfficeTheme;
  private floorGraphics!: Phaser.GameObjects.Graphics;
  private floorRT: Phaser.GameObjects.RenderTexture | null = null;
  private rugSprites: Phaser.GameObjects.Image[] = [];
  private wallGraphics!: Phaser.GameObjects.Graphics;
  private starfield: Phaser.GameObjects.Graphics | null = null;
  private ambientLayer: Phaser.GameObjects.Graphics | null = null;
  private dustParticles: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super({ key: 'OfficeScene' });
  }

  create(): void {
    this.currentTheme = getTheme('moderno');
    this.cameras.main.setBackgroundColor(this.currentTheme.backgroundColor);

    this.createStarfield();

    this.floorGraphics = this.add.graphics();
    this.wallGraphics = this.add.graphics();
    this.redrawFloor();
    this.redrawWalls();

    this.createDustParticles();
    this.placeFurniture();
    this.createLightPools();
    this.setupCamera();
    this.registerAgentAnimations();

    this.clusterManager = new ClusterManager(this);
    this.agentManager = new AgentManager(this, this.clusterManager);

    this.events.on('sync:agents', (agents: Agent[]) => {
      this.agentManager.syncAll(agents);
    });

    this.events.on('update:agent', (agent: Agent) => {
      this.agentManager.updateAgent(agent);
    });

    this.events.on('sync:projects', (projects: Project[]) => {
      this.agentManager.syncProjects(projects);
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
    this.sofas.forEach(s => s.applyTheme(this.currentTheme));
    this.coffeeTables.forEach(ct => ct.applyTheme(this.currentTheme));
    this.poolTables.forEach(pt => pt.applyTheme(this.currentTheme));
    this.gamingSetups.forEach(gs => gs.applyTheme(this.currentTheme));
    this.massageChairs.forEach(mc => mc.applyTheme(this.currentTheme));
    this.beds.forEach(b => b.applyTheme(this.currentTheme));
    this.beanBags.forEach(bb => bb.applyTheme(this.currentTheme));
    this.nightStands.forEach(ns => ns.applyTheme(this.currentTheme));
    // Apply theme to all dynamic cluster desks
    for (const desk of this.clusterManager.getAllDesks()) {
      desk.applyTheme(this.currentTheme);
    }
  }

  // ── Starfield ──────────────────────────────
  private createStarfield(): void {
    if (this.starfield) this.starfield.destroy();
    const g = this.add.graphics().setDepth(-10);
    g.setScrollFactor(0.15);

    const w = 2000;
    const h = 1200;
    for (let i = 0; i < 100; i++) {
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.05, 0.2));
      g.fillCircle(Phaser.Math.Between(-100, w), Phaser.Math.Between(-100, h), Phaser.Math.FloatBetween(0.3, 0.8));
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.15, 0.45));
      g.fillCircle(Phaser.Math.Between(-100, w), Phaser.Math.Between(-100, h), Phaser.Math.FloatBetween(0.5, 1.5));
    }
    const starColors = [0x6366f1, 0x22d3ee, 0xa78bfa];
    for (let i = 0; i < 10; i++) {
      g.fillStyle(starColors[i % starColors.length], 0.2);
      g.fillCircle(Phaser.Math.Between(-50, w), Phaser.Math.Between(-50, h), Phaser.Math.FloatBetween(0.8, 2));
    }
    this.starfield = g;

    this.tweens.add({
      targets: g,
      alpha: { from: 0.7, to: 1 },
      duration: 4000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ── Dust Particles ─────────────────────────
  private createDustParticles(): void {
    this.dustParticles.forEach(p => p.destroy());
    this.dustParticles = [];

    const t = this.currentTheme;
    for (let i = 0; i < 30; i++) {
      const particle = this.add.circle(
        Phaser.Math.Between(-400, 1400),
        Phaser.Math.Between(-200, 800),
        Phaser.Math.FloatBetween(0.4, 1.2),
        t.dustColor,
        Phaser.Math.FloatBetween(0.02, t.dustAlpha),
      );
      particle.setDepth(9990);

      this.tweens.add({
        targets: particle,
        y: particle.y - Phaser.Math.Between(80, 250),
        x: particle.x + Phaser.Math.Between(-40, 40),
        alpha: 0,
        duration: Phaser.Math.Between(8000, 16000),
        delay: Phaser.Math.Between(0, 5000),
        repeat: -1,
        onRepeat: () => {
          particle.setPosition(Phaser.Math.Between(-400, 1400), 800 + Phaser.Math.Between(0, 100));
          particle.setAlpha(Phaser.Math.FloatBetween(0.02, t.dustAlpha));
        },
      });

      this.dustParticles.push(particle);
    }
  }

  // ── Floor ──
  private hasFloorSprites(): boolean {
    const themeName = this.currentTheme.name;
    return ZONE_NAMES.every(z => this.textures.exists(floorTextureKey(themeName, z)));
  }

  private redrawFloor(): void {
    if (this.hasFloorSprites()) {
      this.redrawFloorSprites();
    } else {
      this.redrawFloorGraphics();
    }
  }

  /** Sprite-based floor using RenderTexture (1 draw call for entire floor) */
  private redrawFloorSprites(): void {
    this.floorGraphics.clear();
    const themeName = this.currentTheme.name;

    // Calculate map pixel bounds for RT sizing
    const topLeft = tileToPixel(0, 0);
    const topRight = tileToPixel(MAP_WIDTH - 1, 0);
    const bottomLeft = tileToPixel(0, MAP_HEIGHT - 1);
    const bottomRight = tileToPixel(MAP_WIDTH - 1, MAP_HEIGHT - 1);

    const minX = Math.min(topLeft.x, bottomLeft.x) - TILE_WIDTH;
    const maxX = Math.max(topRight.x, bottomRight.x) + TILE_WIDTH;
    const minY = Math.min(topLeft.y, topRight.y) - TILE_HEIGHT;
    const maxY = Math.max(bottomLeft.y, bottomRight.y) + TILE_HEIGHT;

    const rtW = maxX - minX;
    const rtH = maxY - minY;

    // Create or resize the RenderTexture
    if (this.floorRT) {
      this.floorRT.destroy();
    }
    this.floorRT = this.add.renderTexture(minX, minY, rtW, rtH).setOrigin(0, 0).setDepth(-1);

    // Stamp floor tiles onto the RT
    const stamp = this.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0.5).setVisible(false);

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const zone = getZoneForTile(x, y) as ZoneName | null;
        if (!zone) continue;

        const texKey = floorTextureKey(themeName, zone);
        if (!this.textures.exists(texKey)) continue;

        stamp.setTexture(texKey);
        const { x: px, y: py } = tileToPixel(x, y);
        // Stamp position is relative to the RT origin
        this.floorRT.draw(stamp, px - minX, py - minY);
      }
    }

    stamp.destroy();

    // Redraw rug overlay sprites
    this.redrawRugs();
  }

  /** Place rug sprites on top of the floor RT */
  private redrawRugs(): void {
    this.rugSprites.forEach(s => s.destroy());
    this.rugSprites = [];

    const themeName = this.currentTheme.name;

    for (const rugType of RUG_TYPES) {
      const texKey = rugTextureKey(themeName, rugType);
      if (!this.textures.exists(texKey)) continue;

      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const zone = getZoneForTile(x, y);
          if (!zone) continue;

          const rt = getRugTypeForTile(x, y);
          if (rt !== rugType) continue;

          const { x: px, y: py } = tileToPixel(x, y);
          const rugImg = this.add.image(px, py, texKey)
            .setOrigin(0.5, 0.5)
            .setDepth(0.1);
          this.rugSprites.push(rugImg);
        }
      }
    }
  }

  /** Fallback: Graphics-based floor when sprite tiles are missing */
  private redrawFloorGraphics(): void {
    // Clean up sprite-based floor if it existed
    if (this.floorRT) {
      this.floorRT.destroy();
      this.floorRT = null;
    }
    this.rugSprites.forEach(s => s.destroy());
    this.rugSprites = [];

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

        // Flat fill — clean and subtle
        this.floorGraphics.fillStyle(color, 1);
        this.floorGraphics.beginPath();
        this.floorGraphics.moveTo(px, py - hh);
        this.floorGraphics.lineTo(px + hw, py);
        this.floorGraphics.lineTo(px, py + hh);
        this.floorGraphics.lineTo(px - hw, py);
        this.floorGraphics.closePath();
        this.floorGraphics.fillPath();

        // Thin border line only
        this.floorGraphics.lineStyle(1, t.floorGridColor, t.floorGridAlpha * 0.5);
        this.floorGraphics.beginPath();
        this.floorGraphics.moveTo(px, py - hh);
        this.floorGraphics.lineTo(px + hw, py);
        this.floorGraphics.lineTo(px, py + hh);
        this.floorGraphics.lineTo(px - hw, py);
        this.floorGraphics.closePath();
        this.floorGraphics.strokePath();

        // Subtle top-left highlight
        this.floorGraphics.lineStyle(1, 0xffffff, 0.015);
        this.floorGraphics.beginPath();
        this.floorGraphics.moveTo(px - hw + 1, py);
        this.floorGraphics.lineTo(px, py - hh + 1);
        this.floorGraphics.lineTo(px + hw - 1, py);
        this.floorGraphics.strokePath();
      }
    }
  }

  // ── Walls ──
  private redrawWalls(): void {
    this.wallGraphics.clear();
    const t = this.currentTheme;
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    const wallH = 22;

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const zone = getZoneForTile(x, y);
        if (!zone) continue;

        const { x: px, y: py } = tileToPixel(x, y);

        if (!getZoneForTile(x, y - 1)) {
          this.wallGraphics.fillStyle(t.wallColor, 0.65);
          this.wallGraphics.beginPath();
          this.wallGraphics.moveTo(px - hw, py);
          this.wallGraphics.lineTo(px, py - hh);
          this.wallGraphics.lineTo(px, py - hh - wallH);
          this.wallGraphics.lineTo(px - hw, py - wallH);
          this.wallGraphics.closePath();
          this.wallGraphics.fillPath();

          this.wallGraphics.lineStyle(1.5, t.wallGlowColor, t.wallGlowAlpha * 0.6);
          this.wallGraphics.lineBetween(px - hw, py - wallH, px, py - hh - wallH);

          this.wallGraphics.lineStyle(1, 0x000000, 0.3);
          this.wallGraphics.lineBetween(px - hw, py, px, py - hh);
        }

        if (!getZoneForTile(x - 1, y)) {
          this.wallGraphics.fillStyle(t.wallColor, 0.5);
          this.wallGraphics.beginPath();
          this.wallGraphics.moveTo(px, py - hh);
          this.wallGraphics.lineTo(px + hw, py);
          this.wallGraphics.lineTo(px + hw, py - wallH);
          this.wallGraphics.lineTo(px, py - hh - wallH);
          this.wallGraphics.closePath();
          this.wallGraphics.fillPath();

          this.wallGraphics.lineStyle(1.5, t.wallGlowColor, t.wallGlowAlpha * 0.45);
          this.wallGraphics.lineBetween(px, py - hh - wallH, px + hw, py - wallH);

          this.wallGraphics.lineStyle(1, 0x000000, 0.2);
          this.wallGraphics.lineBetween(px, py - hh, px + hw, py);
        }

        if (!getZoneForTile(x + 1, y)) {
          this.wallGraphics.lineStyle(1, t.wallColor, t.wallAlpha * 0.4);
          this.wallGraphics.lineBetween(px - hw, py, px, py + hh);
        }
        if (!getZoneForTile(x, y + 1)) {
          this.wallGraphics.lineStyle(1, t.wallColor, t.wallAlpha * 0.4);
          this.wallGraphics.lineBetween(px, py + hh, px + hw, py);
        }
      }
    }

    this.drawWallConsoles();
  }

  private drawWallConsoles(): void {
    const t = this.currentTheme;
    const wallH = 22;
    const consolePositions = [
      { tileX: 20, tileY: 1 },
      { tileX: 24, tileY: 1 },
      { tileX: 28, tileY: 1 },
      { tileX: 32, tileY: 1 },
      { tileX: 4, tileY: 1 },
      { tileX: 8, tileY: 1 },
      { tileX: 12, tileY: 1 },
    ];

    for (const pos of consolePositions) {
      const { x: px, y: py } = tileToPixel(pos.tileX, pos.tileY);
      const cy = py - wallH * 0.6;
      this.wallGraphics.fillStyle(t.screenGlowColor, 0.15);
      this.wallGraphics.fillRect(px - 4, cy, 8, 5);
      this.wallGraphics.lineStyle(1, t.wallGlowColor, 0.12);
      this.wallGraphics.strokeRect(px - 4, cy, 8, 5);
      this.wallGraphics.fillStyle(t.wallGlowColor, 0.5);
      this.wallGraphics.fillCircle(px + 5, cy + 2, 1);
      this.wallGraphics.fillStyle(t.screenGlowColor, 0.25);
      this.wallGraphics.fillRect(px - 3, cy + 1, 5, 1);
      this.wallGraphics.fillRect(px - 3, cy + 3, 4, 1);
    }
  }

  // ── Light Pools ──
  private createLightPools(): void {
    const g = this.add.graphics().setDepth(0.5);
    // Recreation zone ambient
    const recCenter = tileToPixel(8, 8);
    g.fillStyle(0x22d3ee, 0.006);
    g.fillEllipse(recCenter.x, recCenter.y, 200, 100);
    // Arcade glow
    const arcadePos = tileToPixel(11, 3);
    g.fillStyle(0xff00ff, 0.008);
    g.fillEllipse(arcadePos.x, arcadePos.y, 60, 24);
    // Gaming setup glow
    const gamingPos = tileToPixel(FURNITURE_POSITIONS.gaming.tileX, FURNITURE_POSITIONS.gaming.tileY);
    g.fillStyle(0x6366f1, 0.008);
    g.fillEllipse(gamingPos.x, gamingPos.y, 70, 30);
    // Bedroom ambient (warm lamp glow)
    const bedroomCenter = tileToPixel(4, 21);
    g.fillStyle(0xffcc66, 0.005);
    g.fillEllipse(bedroomCenter.x, bedroomCenter.y, 140, 80);
  }

  // ── Ambient Effects ──
  private applyAmbientEffect(): void {
    if (this.ambientLayer) {
      this.ambientLayer.destroy();
      this.ambientLayer = null;
    }

    const t = this.currentTheme;
    if (t.ambientEffect === 'none' || t.ambientEffect === 'stars') return;

    if (t.ambientEffect === 'scanlines') {
      const g = this.add.graphics().setDepth(9999);
      g.fillStyle(0x000000, t.ambientAlpha);
      for (let y = 0; y < 1200; y += 4) {
        g.fillRect(-600, y, 3000, 1);
      }
      g.setScrollFactor(0);
      this.ambientLayer = g;
    }

    if (t.ambientEffect === 'grain') {
      const g = this.add.graphics().setDepth(9999);
      g.fillStyle(t.ambientColor, t.ambientAlpha);
      for (let i = 0; i < 200; i++) {
        g.fillRect(Phaser.Math.Between(-400, 2000), Phaser.Math.Between(-200, 1000), 1, 1);
      }
      this.ambientLayer = g;
    }
  }

  private placeFurniture(): void {
    // Sofas
    this.sofas = LOUNGE_POSITIONS.map(pos => new Sofa(this, pos.tileX, pos.tileY));

    // Coffee table
    this.coffeeTables = [
      new CoffeeTable(this, COFFEE_TABLE_POSITION.tileX, COFFEE_TABLE_POSITION.tileY),
    ];

    // Coffee machine & water cooler
    this.coffeeMachine = new CoffeeMachine(
      this, FURNITURE_POSITIONS.coffeeMachine.tileX, FURNITURE_POSITIONS.coffeeMachine.tileY,
    );
    new WaterCooler(this, FURNITURE_POSITIONS.waterCooler.tileX, FURNITURE_POSITIONS.waterCooler.tileY);
    new Bookshelf(this, FURNITURE_POSITIONS.bookshelf.tileX, FURNITURE_POSITIONS.bookshelf.tileY);

    // Recreation — Ping-pong
    new PingPongTable(this, FURNITURE_POSITIONS.pingPong.tileX, FURNITURE_POSITIONS.pingPong.tileY);

    // Recreation — Arcades
    new ArcadeMachine(this, FURNITURE_POSITIONS.arcade1.tileX, FURNITURE_POSITIONS.arcade1.tileY);
    new ArcadeMachine(this, FURNITURE_POSITIONS.arcade2.tileX, FURNITURE_POSITIONS.arcade2.tileY);

    // Recreation — Hammocks
    new Hammock(this, FURNITURE_POSITIONS.hammock1.tileX, FURNITURE_POSITIONS.hammock1.tileY);
    new Hammock(this, FURNITURE_POSITIONS.hammock2.tileX, FURNITURE_POSITIONS.hammock2.tileY);
    new Hammock(this, FURNITURE_POSITIONS.hammock3.tileX, FURNITURE_POSITIONS.hammock3.tileY);

    // Recreation — Pool table
    this.poolTables = [
      new PoolTable(this, FURNITURE_POSITIONS.poolTable.tileX, FURNITURE_POSITIONS.poolTable.tileY),
    ];

    // Recreation — Gaming setup (TV + console)
    this.gamingSetups = [
      new GamingSetup(this, FURNITURE_POSITIONS.gaming.tileX, FURNITURE_POSITIONS.gaming.tileY),
    ];

    // Recreation — Bean bags (near gaming)
    this.beanBags = [
      new BeanBag(this, FURNITURE_POSITIONS.beanBag1.tileX, FURNITURE_POSITIONS.beanBag1.tileY, 0x4a3080),
      new BeanBag(this, FURNITURE_POSITIONS.beanBag2.tileX, FURNITURE_POSITIONS.beanBag2.tileY, 0x305080),
    ];

    // Recreation — Massage chairs
    this.massageChairs = [
      new MassageChair(this, FURNITURE_POSITIONS.massage1.tileX, FURNITURE_POSITIONS.massage1.tileY),
      new MassageChair(this, FURNITURE_POSITIONS.massage2.tileX, FURNITURE_POSITIONS.massage2.tileY),
    ];

    // Bedroom — Beds
    this.beds = [
      new Bed(this, FURNITURE_POSITIONS.bed1.tileX, FURNITURE_POSITIONS.bed1.tileY),
      new Bed(this, FURNITURE_POSITIONS.bed2.tileX, FURNITURE_POSITIONS.bed2.tileY),
      new Bed(this, FURNITURE_POSITIONS.bed3.tileX, FURNITURE_POSITIONS.bed3.tileY),
    ];

    // Bedroom — Night stands with lamps
    this.nightStands = [
      new NightStand(this, FURNITURE_POSITIONS.nightStand1.tileX, FURNITURE_POSITIONS.nightStand1.tileY),
      new NightStand(this, FURNITURE_POSITIONS.nightStand2.tileX, FURNITURE_POSITIONS.nightStand2.tileY),
      new NightStand(this, FURNITURE_POSITIONS.nightStand3.tileX, FURNITURE_POSITIONS.nightStand3.tileY),
    ];

    // Bedroom — Plants
    new Plant(this, FURNITURE_POSITIONS.bedroomPlant1.tileX, FURNITURE_POSITIONS.bedroomPlant1.tileY);
    new Plant(this, FURNITURE_POSITIONS.bedroomPlant2.tileX, FURNITURE_POSITIONS.bedroomPlant2.tileY);

    // Bedroom — Door
    new Door(this, FURNITURE_POSITIONS.bedroomDoor.tileX, FURNITURE_POSITIONS.bedroomDoor.tileY);

    // Plants
    new Plant(this, FURNITURE_POSITIONS.plant1.tileX, FURNITURE_POSITIONS.plant1.tileY);
    new Plant(this, FURNITURE_POSITIONS.plant2.tileX, FURNITURE_POSITIONS.plant2.tileY);
    new Plant(this, FURNITURE_POSITIONS.plant3.tileX, FURNITURE_POSITIONS.plant3.tileY);
    new Plant(this, FURNITURE_POSITIONS.plant4.tileX, FURNITURE_POSITIONS.plant4.tileY);
    new Plant(this, FURNITURE_POSITIONS.plant5.tileX, FURNITURE_POSITIONS.plant5.tileY);
    new Plant(this, FURNITURE_POSITIONS.plant6.tileX, FURNITURE_POSITIONS.plant6.tileY);

    // Entrance door
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
        const newZoom = Phaser.Math.Clamp(zoom - deltaY * 0.001, 0.4, 2);
        this.cameras.main.setZoom(newZoom);
      },
    );

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
      this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
    });
  }
}
