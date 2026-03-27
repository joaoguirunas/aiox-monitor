import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

/**
 * Modern workstation — theme-aware desk with a single iMac monitor.
 * Uses furnitureBaseColor/AccentColor/EdgeColor like all other furniture.
 */
/** Target display width for the desk-imac sprite */
const DESK_SPRITE_WIDTH = 52;

export class Desk extends Phaser.GameObjects.Container {
  private occupied = false;
  private graphics: Phaser.GameObjects.Graphics;
  private screenGlow: Phaser.GameObjects.Graphics;
  private deskSprite: Phaser.GameObjects.Image | null = null;
  private agentColor = 0x00ccff;
  private usesSprite = false;

  // Theme colors (defaults = moderno theme)
  private baseColor = 0x1a2040;
  private accentColor = 0x252e50;
  private edgeColor = 0x2a3565;
  private screenGlowColor = 0x00ccff;
  private screenOffColor = 0x0a0f1a;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);
    this.setDepth(y + 1);

    this.graphics = scene.add.graphics();
    this.add(this.graphics);

    this.screenGlow = scene.add.graphics();
    this.add(this.screenGlow);

    // Use desk-imac sprite if available, procedural fallback otherwise
    if (scene.textures.exists('desk-imac')) {
      this.usesSprite = true;
      this.deskSprite = scene.add.image(0, -8, 'desk-imac');
      const ratio = this.deskSprite.width / this.deskSprite.height;
      this.deskSprite.setDisplaySize(DESK_SPRITE_WIDTH, DESK_SPRITE_WIDTH / ratio);
      this.deskSprite.setOrigin(0.5, 0.5);
      this.deskSprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.add(this.deskSprite);
    }

    try {
      this.drawIdle();
    } catch (err) {
      console.error('[Desk] drawIdle failed at tile', tileX, tileY, err);
    }
    scene.add.existing(this);
  }

  // ── Desk body (isometric 3D) ──────────────────────────────
  private drawDeskBody(g: Phaser.GameObjects.Graphics, active: boolean): void {
    // Shadow
    g.fillStyle(0x000000, 0.12);
    g.fillEllipse(0, 8, 52, 12);

    // Desk legs (4 thin supports)
    g.fillStyle(this.baseColor, 0.9);
    g.fillRect(-22, 2, 3, 7);
    g.fillRect(19, 2, 3, 7);
    g.fillRect(-22, -3, 3, 7);
    g.fillRect(19, -3, 3, 7);

    // Desk front face (3D depth)
    g.fillStyle(this.baseColor, 1);
    g.fillRect(-24, 2, 48, 4);
    g.fillStyle(0x000000, 0.2);
    g.fillRect(-24, 2, 48, 4);

    // Desk side panel (3D depth — right)
    g.fillStyle(this.baseColor, 1);
    g.fillRect(24, -4, 3, 8);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(24, -4, 3, 8);

    // Desk top surface
    g.fillStyle(this.accentColor, 1);
    g.fillRect(-24, -4, 48, 8);

    // Surface highlight (subtle wood/material grain)
    g.fillStyle(this.edgeColor, 0.15);
    g.fillRect(-22, -3, 44, 6);

    // Edge highlight
    g.lineStyle(1, this.edgeColor, active ? 0.4 : 0.2);
    g.strokeRect(-24, -4, 48, 8);

    // Active accent line
    if (active) {
      g.lineStyle(1, this.agentColor, 0.15);
      g.lineBetween(-22, 5, 22, 5);
    }
  }

  // ── iMac monitor ──────────────────────────────────────────
  private drawIMac(g: Phaser.GameObjects.Graphics, active: boolean): void {
    const mx = 0;
    const my = -16;
    const mw = 12;
    const mh = 9;

    // Monitor body
    g.fillStyle(this.accentColor, 1);
    g.fillRect(mx - mw, my - mh, mw * 2, mh * 2);

    // Monitor top edge (3D)
    g.fillStyle(this.accentColor, 0.9);
    g.fillRect(mx - mw, my - mh - 2, mw * 2, 2);
    g.fillStyle(0xffffff, 0.03);
    g.fillRect(mx - mw + 1, my - mh - 2, mw * 2 - 2, 1);

    // Monitor side panel (3D)
    g.fillStyle(this.accentColor, 1);
    g.fillRect(mx + mw, my - mh, 2, mh * 2);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(mx + mw, my - mh, 2, mh * 2);

    // Screen area
    if (active) {
      // Dark screen with code
      g.fillStyle(0x0a1428, 1);
      g.fillRect(mx - mw + 1, my - mh + 1, mw * 2 - 2, mh * 2 - 3);

      // Code lines
      g.fillStyle(this.agentColor, 0.45);
      const lineWidths = [16, 10, 18, 8, 14, 10];
      for (let i = 0; i < lineWidths.length; i++) {
        const ly = my - mh + 3 + i * 2.5;
        if (ly >= my + mh - 3) break;
        g.fillRect(mx - mw + 3, ly, Math.min(lineWidths[i], mw * 2 - 6), 1);
      }
      // Accent color lines (secondary)
      g.fillStyle(0x44dd88, 0.25);
      const accWidths = [6, 12, 4];
      for (let i = 0; i < accWidths.length; i++) {
        const ly = my - mh + 4 + i * 5;
        if (ly >= my + mh - 3) break;
        g.fillRect(mx - mw + 5, ly, accWidths[i], 1);
      }

      // Screen top reflection
      g.fillStyle(0xffffff, 0.04);
      g.fillRect(mx - mw + 1, my - mh + 1, mw * 2 - 2, 2);
    } else {
      // Standby screen — slightly brighter than pure off
      g.fillStyle(this.screenOffColor, 1);
      g.fillRect(mx - mw + 1, my - mh + 1, mw * 2 - 2, mh * 2 - 3);
      // Subtle screen border glow (makes the monitor shape visible)
      g.lineStyle(0.5, this.screenGlowColor, 0.08);
      g.strokeRect(mx - mw + 1, my - mh + 1, mw * 2 - 2, mh * 2 - 3);
      // Standby dot — brighter for visibility
      g.fillStyle(this.screenGlowColor, 0.35);
      g.fillCircle(mx, my, 1.2);
    }

    // Bezel border
    g.lineStyle(1, this.edgeColor, 0.4);
    g.strokeRect(mx - mw, my - mh, mw * 2, mh * 2);

    // Chin
    g.fillStyle(this.baseColor, 1);
    g.fillRect(mx - mw, my + mh - 2, mw * 2, 3);

    // Stand neck
    g.fillStyle(this.baseColor, 1);
    g.fillRect(mx - 2, my + mh + 1, 4, 4);
    // Stand base
    g.fillStyle(this.baseColor, 0.9);
    g.fillEllipse(mx, my + mh + 6, 10, 3);
    g.lineStyle(0.5, this.edgeColor, 0.2);
    g.strokeEllipse(mx, my + mh + 6, 10, 3);
  }

  // ── Keyboard ──────────────────────────────────────────────
  private drawKeyboard(g: Phaser.GameObjects.Graphics, active: boolean): void {
    // Body
    g.fillStyle(this.accentColor, 1);
    g.fillRect(-7, -3, 14, 4);
    // Edge
    g.lineStyle(0.5, this.edgeColor, 0.25);
    g.strokeRect(-7, -3, 14, 4);

    // Key rows
    g.fillStyle(this.edgeColor, 0.25);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        g.fillRect(-5 + col * 2.5, -2.2 + row * 2, 1.5, 1);
      }
    }

    // Active backlight
    if (active) {
      g.fillStyle(this.agentColor, 0.06);
      g.fillRect(-7, -3, 14, 4);
    }
  }

  // ── Mouse ─────────────────────────────────────────────────
  private drawMouse(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(this.accentColor, 1);
    g.fillEllipse(11, -1, 3.5, 2.5);
    g.lineStyle(0.5, this.edgeColor, 0.2);
    g.strokeEllipse(11, -1, 3.5, 2.5);
  }

  // ── Draw states ───────────────────────────────────────────
  private drawIdle(): void {
    const g = this.graphics;
    g.clear();
    this.screenGlow.clear();

    if (this.usesSprite) {
      // Sprite mode: only draw the screen glow overlay, sprite handles visuals
      if (this.deskSprite) this.deskSprite.setAlpha(0.7);
      this.screenGlow.fillStyle(this.screenGlowColor, 0.015);
      this.screenGlow.fillEllipse(0, -8, 24, 8);
    } else {
      // Procedural fallback
      this.drawDeskBody(g, false);
      this.drawIMac(g, false);
      this.drawKeyboard(g, false);
      this.drawMouse(g);
      this.screenGlow.fillStyle(this.screenGlowColor, 0.015);
      this.screenGlow.fillEllipse(0, -8, 24, 8);
    }
  }

  private drawActive(color: number): void {
    const g = this.graphics;
    g.clear();
    this.screenGlow.clear();

    if (this.usesSprite) {
      // Sprite mode: brighten sprite and add glow
      if (this.deskSprite) this.deskSprite.setAlpha(1);
      this.screenGlow.fillStyle(color, 0.08);
      this.screenGlow.fillEllipse(0, -8, 30, 10);
    } else {
      // Procedural fallback
      this.drawDeskBody(g, true);
      this.drawIMac(g, true);
      this.drawKeyboard(g, true);
      this.drawMouse(g);
      this.screenGlow.fillStyle(color, 0.05);
      this.screenGlow.fillEllipse(0, -8, 30, 10);
    }
  }

  // ── Public API ────────────────────────────────────────────

  applyTheme(theme: OfficeTheme): void {
    this.baseColor = theme.furnitureBaseColor;
    this.accentColor = theme.furnitureAccentColor;
    this.edgeColor = theme.furnitureEdgeColor;
    this.screenGlowColor = theme.screenGlowColor;
    this.screenOffColor = theme.screenOffColor;
    if (this.occupied) {
      this.drawActive(this.agentColor);
    } else {
      this.drawIdle();
    }
  }

  setScreenOn(color: number = 0x00ccff): void {
    this.agentColor = color;
    this.occupied = true;
    this.drawActive(color);
  }

  setScreenOff(): void {
    this.occupied = false;
    this.agentColor = 0x00ccff;
    this.screenGlow.clear();
    this.drawIdle();
  }

  isOccupied(): boolean {
    return this.occupied;
  }

  destroy(fromScene?: boolean): void {
    this.graphics.destroy();
    this.screenGlow.destroy();
    if (this.deskSprite) this.deskSprite.destroy();
    super.destroy(fromScene);
  }
}
