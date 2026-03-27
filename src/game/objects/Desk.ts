import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

/**
 * High-tech standing desk workstation — procedural rendering.
 * Scaled for 128px agents (rendered at 96px).
 * Modern minimalist design: single pedestal, floating surface, LED accents.
 */

export class Desk extends Phaser.GameObjects.Container {
  private occupied = false;
  private graphics: Phaser.GameObjects.Graphics;
  private screenGlow: Phaser.GameObjects.Graphics;
  private agentColor = 0x00ccff;

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

    // Always use procedural rendering (no sprite)
    try {
      this.drawIdle();
    } catch (err) {
      console.error('[Desk] drawIdle failed at tile', tileX, tileY, err);
    }
    scene.add.existing(this);
  }

  // ══════════════════════════════════════════════════════════════
  // HIGH-TECH STANDING DESK — scaled for 128px agents
  // ══════════════════════════════════════════════════════════════

  private drawDeskBody(g: Phaser.GameObjects.Graphics, active: boolean): void {
    // ── Ground shadow (soft, wide) ──
    g.fillStyle(0x000000, 0.12);
    g.fillEllipse(0, 18, 70, 14);

    // ── Base plate (slim elliptical foot — premium metal) ──
    g.fillStyle(this.baseColor, 1);
    g.fillEllipse(0, 14, 32, 7);
    // Base highlight
    g.fillStyle(this.edgeColor, 0.2);
    g.fillEllipse(0, 13, 28, 4);
    // Base edge
    g.lineStyle(1, this.edgeColor, 0.4);
    g.strokeEllipse(0, 14, 32, 7);

    // ── Central pedestal (single column — standing desk style) ──
    g.fillStyle(this.baseColor, 1);
    g.fillRect(-4, -2, 8, 18);
    // Pedestal metallic highlight (left edge)
    g.fillStyle(this.edgeColor, 0.25);
    g.fillRect(-3, 0, 2, 14);
    // Pedestal dark edge (right)
    g.fillStyle(0x000000, 0.15);
    g.fillRect(1, 0, 2, 14);

    // ── Desk top surface (ultra-slim floating look — 78px wide) ──
    // Main surface
    g.fillStyle(this.accentColor, 1);
    g.fillRect(-39, -6, 78, 6);

    // Surface front edge (thin 3D depth)
    g.fillStyle(this.baseColor, 1);
    g.fillRect(-39, 0, 78, 2);
    g.fillStyle(0x000000, 0.15);
    g.fillRect(-39, 0, 78, 2);

    // Surface right edge (3D depth)
    g.fillStyle(this.baseColor, 0.9);
    g.fillRect(39, -6, 2, 8);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(39, -6, 2, 8);

    // Top surface subtle highlight (premium finish)
    g.fillStyle(0xffffff, 0.04);
    g.fillRect(-37, -5, 74, 2);

    // Edge outline
    g.lineStyle(1, this.edgeColor, active ? 0.6 : 0.3);
    g.strokeRect(-39, -6, 78, 6);

    // ── Active state: LED strip under desk ──
    if (active) {
      // LED glow area
      g.fillStyle(this.agentColor, 0.1);
      g.fillRect(-35, 1, 70, 2);
      // LED line
      g.lineStyle(1, this.agentColor, 0.35);
      g.lineBetween(-32, 2, 32, 2);
      // Corner accents
      g.fillStyle(this.agentColor, 0.2);
      g.fillCircle(-36, -3, 1.5);
      g.fillCircle(36, -3, 1.5);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // iMac MONITOR — scaled proportionally
  // ══════════════════════════════════════════════════════════════

  private drawIMac(g: Phaser.GameObjects.Graphics, active: boolean): void {
    const mx = 0;
    const my = -26;   // Raised higher for larger desk
    const mw = 18;    // 50% larger (was 12)
    const mh = 14;    // 50% larger (was 9)

    // ── Monitor body ──
    g.fillStyle(this.accentColor, 1);
    g.fillRect(mx - mw, my - mh, mw * 2, mh * 2);

    // Monitor top edge (3D)
    g.fillStyle(this.accentColor, 0.9);
    g.fillRect(mx - mw, my - mh - 3, mw * 2, 3);
    g.fillStyle(0xffffff, 0.04);
    g.fillRect(mx - mw + 2, my - mh - 3, mw * 2 - 4, 1);

    // Monitor side panel (3D)
    g.fillStyle(this.accentColor, 1);
    g.fillRect(mx + mw, my - mh, 3, mh * 2);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(mx + mw, my - mh, 3, mh * 2);

    // ── Screen area ──
    if (active) {
      // Dark screen with code
      g.fillStyle(0x0a1428, 1);
      g.fillRect(mx - mw + 2, my - mh + 2, mw * 2 - 4, mh * 2 - 5);

      // Code lines (more lines for bigger screen)
      g.fillStyle(this.agentColor, 0.5);
      const lineWidths = [24, 16, 28, 12, 20, 14, 22, 10, 18];
      for (let i = 0; i < lineWidths.length; i++) {
        const ly = my - mh + 5 + i * 3;
        if (ly >= my + mh - 5) break;
        g.fillRect(mx - mw + 5, ly, Math.min(lineWidths[i], mw * 2 - 10), 1.5);
      }
      // Accent color lines (secondary — green)
      g.fillStyle(0x44dd88, 0.3);
      const accWidths = [10, 18, 8, 14];
      for (let i = 0; i < accWidths.length; i++) {
        const ly = my - mh + 6 + i * 6;
        if (ly >= my + mh - 5) break;
        g.fillRect(mx - mw + 8, ly, accWidths[i], 1.5);
      }

      // Screen top reflection
      g.fillStyle(0xffffff, 0.05);
      g.fillRect(mx - mw + 2, my - mh + 2, mw * 2 - 4, 3);
    } else {
      // Standby screen
      g.fillStyle(this.screenOffColor, 1);
      g.fillRect(mx - mw + 2, my - mh + 2, mw * 2 - 4, mh * 2 - 5);
      // Subtle screen border glow
      g.lineStyle(0.5, this.screenGlowColor, 0.1);
      g.strokeRect(mx - mw + 2, my - mh + 2, mw * 2 - 4, mh * 2 - 5);
      // Standby dot
      g.fillStyle(this.screenGlowColor, 0.4);
      g.fillCircle(mx, my, 2);
    }

    // Bezel border
    g.lineStyle(1, this.edgeColor, 0.5);
    g.strokeRect(mx - mw, my - mh, mw * 2, mh * 2);

    // ── Chin (Apple logo area) ──
    g.fillStyle(this.baseColor, 1);
    g.fillRect(mx - mw, my + mh - 3, mw * 2, 5);
    // Apple logo hint
    g.fillStyle(this.edgeColor, 0.15);
    g.fillCircle(mx, my + mh, 2);

    // ── Stand neck ──
    g.fillStyle(this.baseColor, 1);
    g.fillRect(mx - 3, my + mh + 2, 6, 8);
    // Neck highlight
    g.fillStyle(this.edgeColor, 0.15);
    g.fillRect(mx - 2, my + mh + 3, 2, 6);

    // ── Stand base (premium ellipse) ──
    g.fillStyle(this.baseColor, 0.95);
    g.fillEllipse(mx, my + mh + 12, 16, 5);
    g.lineStyle(0.5, this.edgeColor, 0.3);
    g.strokeEllipse(mx, my + mh + 12, 16, 5);
  }

  // ══════════════════════════════════════════════════════════════
  // KEYBOARD — Magic Keyboard style, scaled
  // ══════════════════════════════════════════════════════════════

  private drawKeyboard(g: Phaser.GameObjects.Graphics, active: boolean): void {
    const kx = 0;
    const ky = -2;
    const kw = 22;  // 50% larger
    const kh = 6;   // 50% larger

    // Body
    g.fillStyle(this.accentColor, 1);
    g.fillRect(kx - kw / 2, ky - kh / 2, kw, kh);

    // Edge
    g.lineStyle(0.5, this.edgeColor, 0.3);
    g.strokeRect(kx - kw / 2, ky - kh / 2, kw, kh);

    // Key rows (3 rows for bigger keyboard)
    g.fillStyle(this.edgeColor, 0.3);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        g.fillRect(kx - 9 + col * 2.4, ky - 2 + row * 2, 1.8, 1.2);
      }
    }

    // Active backlight
    if (active) {
      g.fillStyle(this.agentColor, 0.08);
      g.fillRect(kx - kw / 2, ky - kh / 2, kw, kh);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // MOUSE — Magic Mouse style, scaled
  // ══════════════════════════════════════════════════════════════

  private drawMouse(g: Phaser.GameObjects.Graphics): void {
    const mx = 18;  // Positioned to the right
    const my = -1;

    g.fillStyle(this.accentColor, 1);
    g.fillEllipse(mx, my, 5, 3.5);
    g.lineStyle(0.5, this.edgeColor, 0.25);
    g.strokeEllipse(mx, my, 5, 3.5);
    // Mouse center line
    g.lineStyle(0.5, this.edgeColor, 0.15);
    g.lineBetween(mx, my - 2.5, mx, my + 2.5);
  }

  // ══════════════════════════════════════════════════════════════
  // DRAW STATES
  // ══════════════════════════════════════════════════════════════

  private drawIdle(): void {
    const g = this.graphics;
    g.clear();
    this.screenGlow.clear();

    // Always procedural
    this.drawDeskBody(g, false);
    this.drawIMac(g, false);
    this.drawKeyboard(g, false);
    this.drawMouse(g);

    // Subtle ambient glow
    this.screenGlow.fillStyle(this.screenGlowColor, 0.02);
    this.screenGlow.fillEllipse(0, -16, 40, 14);
  }

  private drawActive(color: number): void {
    const g = this.graphics;
    g.clear();
    this.screenGlow.clear();

    // Always procedural
    this.drawDeskBody(g, true);
    this.drawIMac(g, true);
    this.drawKeyboard(g, true);
    this.drawMouse(g);

    // Active screen glow
    this.screenGlow.fillStyle(color, 0.08);
    this.screenGlow.fillEllipse(0, -16, 50, 18);
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════

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
    super.destroy(fromScene);
  }
}
