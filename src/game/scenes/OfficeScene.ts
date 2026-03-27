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
import { Plant, type PlantVariant } from '../objects/Plant';
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
  public sofas: Sofa[] = [];
  public arcades: ArcadeMachine[] = [];
  public hammocks: Hammock[] = [];
  public poolTables: PoolTable[] = [];
  private coffeeTables: CoffeeTable[] = [];
  private nightStands: NightStand[] = [];
  private agentManager!: AgentManager;
  private currentTheme!: OfficeTheme;
  private floorGraphics!: Phaser.GameObjects.Graphics;
  private floorRT: Phaser.GameObjects.RenderTexture | null = null;
  private rugSprites: Phaser.GameObjects.Image[] = [];
  private wallGraphics!: Phaser.GameObjects.Graphics;
  private starfield: Phaser.GameObjects.Graphics | null = null;
  private nebula: Phaser.GameObjects.Graphics | null = null;
  private planets: Phaser.GameObjects.Container | null = null;
  private ambientLayer: Phaser.GameObjects.Graphics | null = null;
  private dustParticles: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super({ key: 'OfficeScene' });
  }

  create(): void {
    this.currentTheme = getTheme('moderno');
    this.cameras.main.setBackgroundColor(this.currentTheme.backgroundColor);

    this.createNebula();
    this.createStarfield();
    this.createPlanets();

    this.floorGraphics = this.add.graphics();
    this.wallGraphics = this.add.graphics();
    this.redrawFloor();
    this.redrawWalls();

    this.createDustParticles();
    this.placeRugs();
    this.placeFurniture();
    this.createLightPools();
    this.setupCamera();
    this.registerAgentAnimations();

    this.clusterManager = new ClusterManager(this);
    this.agentManager = new AgentManager(this, this.clusterManager);

    this.events.on('sync:agents', (agents: Agent[]) => {
      try {
        this.agentManager.syncAll(agents);
      } catch (err) {
        console.error('[OfficeScene] sync:agents handler failed', err);
      }
    });

    this.events.on('update:agent', (agent: Agent) => {
      try {
        this.agentManager.updateAgent(agent);
      } catch (err) {
        console.error('[OfficeScene] update:agent handler failed', err);
      }
    });

    this.events.on('sync:projects', (projects: Project[]) => {
      try {
        this.agentManager.syncProjects(projects);
      } catch (err) {
        console.error('[OfficeScene] sync:projects handler failed', err);
      }
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

  // ── Nebula ────────────────────────────────────
  private createNebula(): void {
    if (this.nebula) this.nebula.destroy();
    const g = this.add.graphics().setDepth(-12);
    g.setScrollFactor(0.05);

    // Large diffuse nebula clouds
    const clouds: { x: number; y: number; rx: number; ry: number; color: number; alpha: number }[] = [
      { x: 300,  y: 200,  rx: 280, ry: 140, color: 0x4422aa, alpha: 0.04 },
      { x: 350,  y: 220,  rx: 200, ry: 100, color: 0x6633cc, alpha: 0.03 },
      { x: 1400, y: 600,  rx: 320, ry: 160, color: 0x2244aa, alpha: 0.035 },
      { x: 1450, y: 580,  rx: 220, ry: 110, color: 0x3366dd, alpha: 0.025 },
      { x: 800,  y: 900,  rx: 250, ry: 130, color: 0x882244, alpha: 0.03 },
    ];

    for (const c of clouds) {
      g.fillStyle(c.color, c.alpha);
      g.fillEllipse(c.x, c.y, c.rx * 2, c.ry * 2);
      // Inner brighter core
      g.fillStyle(c.color, c.alpha * 1.5);
      g.fillEllipse(c.x, c.y, c.rx, c.ry);
    }

    this.nebula = g;
  }

  // ── Planets ──────────────────────────────────
  private createPlanets(): void {
    if (this.planets) this.planets.destroy();
    const container = this.add.container(0, 0).setDepth(-11);
    container.setScrollFactor(0.08);

    const planetDefs: {
      x: number; y: number; radius: number;
      baseColor: number; shadowColor: number; glowColor: number;
      glowAlpha: number; rings?: boolean; ringColor?: number;
    }[] = [
      // Large gas giant — top-right, purple/blue
      { x: 1600, y: 120, radius: 55, baseColor: 0x3b2d6b, shadowColor: 0x1a1040, glowColor: 0x6366f1, glowAlpha: 0.12, rings: true, ringColor: 0x8888cc },
      // Medium rocky planet — left, warm red/orange
      { x: 150, y: 700, radius: 30, baseColor: 0x7a3322, shadowColor: 0x3a1510, glowColor: 0xcc5533, glowAlpha: 0.1 },
      // Small icy moon — center-top
      { x: 900, y: 60, radius: 14, baseColor: 0x4488aa, shadowColor: 0x224466, glowColor: 0x66ccee, glowAlpha: 0.15 },
      // Distant tiny planet — far right
      { x: 1850, y: 800, radius: 10, baseColor: 0x556644, shadowColor: 0x2a3322, glowColor: 0x88aa66, glowAlpha: 0.08 },
      // Medium blue planet — bottom-left
      { x: 400, y: 1000, radius: 22, baseColor: 0x2244aa, shadowColor: 0x112255, glowColor: 0x4488ff, glowAlpha: 0.1 },
    ];

    for (const p of planetDefs) {
      const g = this.add.graphics();

      // Atmospheric glow (outermost)
      g.fillStyle(p.glowColor, p.glowAlpha * 0.4);
      g.fillCircle(p.x, p.y, p.radius * 2.5);
      g.fillStyle(p.glowColor, p.glowAlpha * 0.7);
      g.fillCircle(p.x, p.y, p.radius * 1.6);
      g.fillStyle(p.glowColor, p.glowAlpha);
      g.fillCircle(p.x, p.y, p.radius * 1.2);

      // Planet body — shadow side (offset circle for 3D illusion)
      g.fillStyle(p.shadowColor, 0.9);
      g.fillCircle(p.x, p.y, p.radius);

      // Lit hemisphere
      g.fillStyle(p.baseColor, 0.85);
      g.fillCircle(p.x - p.radius * 0.15, p.y - p.radius * 0.1, p.radius * 0.92);

      // Specular highlight
      g.fillStyle(0xffffff, 0.06);
      g.fillCircle(p.x - p.radius * 0.3, p.y - p.radius * 0.3, p.radius * 0.4);

      // Rings (Saturn-like)
      if (p.rings && p.ringColor) {
        g.lineStyle(2, p.ringColor, 0.2);
        g.strokeEllipse(p.x, p.y, p.radius * 3.5, p.radius * 0.8);
        g.lineStyle(1.5, p.ringColor, 0.15);
        g.strokeEllipse(p.x, p.y, p.radius * 4.2, p.radius * 1);
        g.lineStyle(1, p.ringColor, 0.1);
        g.strokeEllipse(p.x, p.y, p.radius * 5, p.radius * 1.2);
      }

      container.add(g);
    }

    this.planets = container;
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

        // Flat fill only — no grid lines, no highlights
        this.floorGraphics.fillStyle(color, 1);
        this.floorGraphics.beginPath();
        this.floorGraphics.moveTo(px, py - hh);
        this.floorGraphics.lineTo(px + hw, py);
        this.floorGraphics.lineTo(px, py + hh);
        this.floorGraphics.lineTo(px - hw, py);
        this.floorGraphics.closePath();
        this.floorGraphics.fillPath();
      }
    }
  }

  // ── Walls ──
  private redrawWalls(): void {
    this.wallGraphics.clear();
    const t = this.currentTheme;
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    const wallH = 7; // Reduced from 22 to ~30% — removes "hole" effect

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
    const wallH = 7;
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
    // Área de Jogos — green tint
    const jogosCenter = tileToPixel(4, 5);
    g.fillStyle(0x33aa55, 0.005);
    g.fillEllipse(jogosCenter.x, jogosCenter.y, 140, 70);
    // Área Gamer — arcade/neon glow
    const gamerCenter = tileToPixel(11, 5);
    g.fillStyle(0xff00ff, 0.006);
    g.fillEllipse(gamerCenter.x, gamerCenter.y, 140, 70);
    // Gaming TV glow
    const gamingPos = tileToPixel(FURNITURE_POSITIONS.gaming.tileX, FURNITURE_POSITIONS.gaming.tileY);
    g.fillStyle(0x6366f1, 0.008);
    g.fillEllipse(gamingPos.x, gamingPos.y, 70, 30);
    // Área de Redes — warm calm
    const redesCenter = tileToPixel(4, 12);
    g.fillStyle(0xffaa55, 0.004);
    g.fillEllipse(redesCenter.x, redesCenter.y, 130, 70);
    // Lounge de Leitura — warm amber
    const loungeCenter = tileToPixel(12, 12);
    g.fillStyle(0xffcc66, 0.005);
    g.fillEllipse(loungeCenter.x, loungeCenter.y, 160, 80);
    // Bedroom — lamp glow
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

  // ── Rugs (drawn as graphics overlays on the floor) ──
  private placeRugs(): void {
    const g = this.add.graphics().setDepth(0.2);

    // Área de Jogos rug — green felt under ping pong + sinuca
    const jogosCenter = tileToPixel(4, 5);
    g.fillStyle(0x2a6633, 0.06);
    g.fillEllipse(jogosCenter.x, jogosCenter.y, 150, 80);
    g.lineStyle(1, 0x338844, 0.06);
    g.strokeEllipse(jogosCenter.x, jogosCenter.y, 150, 80);

    // Área Gamer rug — dark indigo/purple
    const gamerCenter = tileToPixel(11, 5);
    g.fillStyle(0x3322aa, 0.06);
    g.fillEllipse(gamerCenter.x, gamerCenter.y, 150, 80);
    g.lineStyle(1, 0x4433cc, 0.06);
    g.strokeEllipse(gamerCenter.x, gamerCenter.y, 150, 80);

    // Área de Redes rug — warm terracotta/earth
    const redesCenter = tileToPixel(4, 12);
    g.fillStyle(0x8b5e3c, 0.05);
    g.fillEllipse(redesCenter.x, redesCenter.y, 140, 80);
    g.lineStyle(1, 0xa06840, 0.06);
    g.strokeEllipse(redesCenter.x, redesCenter.y, 140, 80);

    // Lounge de Leitura rug — warm amber
    const loungeCenter = tileToPixel(12, 12);
    g.fillStyle(0xcc8833, 0.06);
    g.fillEllipse(loungeCenter.x, loungeCenter.y, 160, 90);
    g.lineStyle(1, 0xcc8833, 0.07);
    g.strokeEllipse(loungeCenter.x, loungeCenter.y, 160, 90);
    g.fillStyle(0xddaa44, 0.03);
    g.fillEllipse(loungeCenter.x, loungeCenter.y, 100, 55);
  }

  private placeFurniture(): void {
    // ═══ ÁREA DE JOGOS (topo-esquerda) ═══
    new PingPongTable(this, FURNITURE_POSITIONS.pingPong.tileX, FURNITURE_POSITIONS.pingPong.tileY);
    this.poolTables = [
      new PoolTable(this, FURNITURE_POSITIONS.poolTable.tileX, FURNITURE_POSITIONS.poolTable.tileY),
    ];

    // ═══ ÁREA GAMER (topo-direita) ═══
    this.arcades = [
      new ArcadeMachine(this, FURNITURE_POSITIONS.arcade1.tileX, FURNITURE_POSITIONS.arcade1.tileY),
      new ArcadeMachine(this, FURNITURE_POSITIONS.arcade2.tileX, FURNITURE_POSITIONS.arcade2.tileY),
    ];
    this.gamingSetups = [
      new GamingSetup(this, FURNITURE_POSITIONS.gaming.tileX, FURNITURE_POSITIONS.gaming.tileY),
    ];
    this.beanBags = [
      new BeanBag(this, FURNITURE_POSITIONS.beanBag1.tileX, FURNITURE_POSITIONS.beanBag1.tileY, 0x4a3080),
      new BeanBag(this, FURNITURE_POSITIONS.beanBag2.tileX, FURNITURE_POSITIONS.beanBag2.tileY, 0x305080),
    ];

    // ═══ ÁREA DE REDES (baixo-esquerda) ═══
    this.hammocks = [
      new Hammock(this, FURNITURE_POSITIONS.hammock1.tileX, FURNITURE_POSITIONS.hammock1.tileY),
      new Hammock(this, FURNITURE_POSITIONS.hammock2.tileX, FURNITURE_POSITIONS.hammock2.tileY),
      new Hammock(this, FURNITURE_POSITIONS.hammock3.tileX, FURNITURE_POSITIONS.hammock3.tileY),
    ];
    this.massageChairs = [
      new MassageChair(this, FURNITURE_POSITIONS.massage1.tileX, FURNITURE_POSITIONS.massage1.tileY),
      new MassageChair(this, FURNITURE_POSITIONS.massage2.tileX, FURNITURE_POSITIONS.massage2.tileY),
    ];

    // ═══ LOUNGE DE LEITURA (baixo-direita) ═══
    this.sofas = LOUNGE_POSITIONS.map(pos => new Sofa(this, pos.tileX, pos.tileY));
    this.coffeeTables = [
      new CoffeeTable(this, COFFEE_TABLE_POSITION.tileX, COFFEE_TABLE_POSITION.tileY),
    ];
    new Bookshelf(this, FURNITURE_POSITIONS.bookshelf.tileX, FURNITURE_POSITIONS.bookshelf.tileY);
    this.coffeeMachine = new CoffeeMachine(
      this, FURNITURE_POSITIONS.coffeeMachine.tileX, FURNITURE_POSITIONS.coffeeMachine.tileY,
    );
    new WaterCooler(this, FURNITURE_POSITIONS.waterCooler.tileX, FURNITURE_POSITIONS.waterCooler.tileY);

    // ═══ BEDROOM ═══
    this.beds = [
      new Bed(this, FURNITURE_POSITIONS.bed1.tileX, FURNITURE_POSITIONS.bed1.tileY),
      new Bed(this, FURNITURE_POSITIONS.bed2.tileX, FURNITURE_POSITIONS.bed2.tileY),
      new Bed(this, FURNITURE_POSITIONS.bed3.tileX, FURNITURE_POSITIONS.bed3.tileY),
    ];
    this.nightStands = [
      new NightStand(this, FURNITURE_POSITIONS.nightStand1.tileX, FURNITURE_POSITIONS.nightStand1.tileY),
      new NightStand(this, FURNITURE_POSITIONS.nightStand2.tileX, FURNITURE_POSITIONS.nightStand2.tileY),
      new NightStand(this, FURNITURE_POSITIONS.nightStand3.tileX, FURNITURE_POSITIONS.nightStand3.tileY),
    ];
    new Plant(this, FURNITURE_POSITIONS.bedroomPlant1.tileX, FURNITURE_POSITIONS.bedroomPlant1.tileY, 'bonsai', 2);
    new Plant(this, FURNITURE_POSITIONS.bedroomPlant2.tileX, FURNITURE_POSITIONS.bedroomPlant2.tileY, 'succulent', 3);
    new Door(this, FURNITURE_POSITIONS.bedroomDoor.tileX, FURNITURE_POSITIONS.bedroomDoor.tileY);

    // ═══ PLANTS (decorative, zone borders & corners) ═══
    // Recreation zone borders — tropical & hanging mix (2x-3x varied)
    new Plant(this, FURNITURE_POSITIONS.plant1.tileX, FURNITURE_POSITIONS.plant1.tileY, 'tropical', 3);
    new Plant(this, FURNITURE_POSITIONS.plant2.tileX, FURNITURE_POSITIONS.plant2.tileY, 'hanging', 2);
    new Plant(this, FURNITURE_POSITIONS.plant3.tileX, FURNITURE_POSITIONS.plant3.tileY, 'tropical', 2);
    new Plant(this, FURNITURE_POSITIONS.plant4.tileX, FURNITURE_POSITIONS.plant4.tileY, 'bonsai', 2);
    new Plant(this, FURNITURE_POSITIONS.plant5.tileX, FURNITURE_POSITIONS.plant5.tileY, 'succulent', 3);
    new Plant(this, FURNITURE_POSITIONS.plant6.tileX, FURNITURE_POSITIONS.plant6.tileY, 'hanging', 2);
    // Zone dividers (between areas)
    new Plant(this, 8, 5, 'tropical', 3);     // Between jogos & gamer
    new Plant(this, 8, 12, 'hanging', 2);     // Between redes & lounge
    new Plant(this, 1, 9, 'succulent', 2);    // Redes left border
    new Plant(this, 1, 14, 'bonsai', 3);      // Redes left border
    new Plant(this, 15, 8, 'tropical', 2);    // Right border mid
    new Plant(this, 15, 14, 'hanging', 3);    // Right border low
    // Work zone — bonsai & succulent (compact, desk-friendly)
    new Plant(this, 17, 2, 'bonsai', 2);
    new Plant(this, 17, 10, 'succulent', 3);
    new Plant(this, 17, 16, 'bonsai', 2);
    new Plant(this, 34, 2, 'succulent', 2);
    new Plant(this, 34, 10, 'bonsai', 3);
    new Plant(this, 34, 20, 'succulent', 2);
    // Entrance — tropical statement plants (3x for impact)
    new Plant(this, 20, 20, 'tropical', 3);
    new Plant(this, 8, 19, 'tropical', 3);

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
