import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

/**
 * Premium sci-fi workstation — drawn entirely with Phaser Graphics.
 * Each desk is an individual developer setup with:
 *  - Isometric desk surface with metallic edge
 *  - Dual monitors with screen glow
 *  - Keyboard, mouse, gadgets
 *  - Small decorative plant
 *  - Coffee mug
 *  - LED underglow (purple/blue)
 */
export class Desk extends Phaser.GameObjects.Container {
  private occupied = false;
  private graphics: Phaser.GameObjects.Graphics;
  private screenGlow: Phaser.GameObjects.Graphics;
  private underglow: Phaser.GameObjects.Graphics;
  private agentColor = 0x00ccff;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);
    this.setDepth(y + 1);

    // LED underglow (below desk)
    this.underglow = scene.add.graphics();
    this.add(this.underglow);

    // Main desk graphics
    this.graphics = scene.add.graphics();
    this.add(this.graphics);

    // Screen glow overlay (on top)
    this.screenGlow = scene.add.graphics();
    this.add(this.screenGlow);

    this.drawDesk();
    scene.add.existing(this);
  }

  private drawDesk(): void {
    const g = this.graphics;
    g.clear();

    // ── Desk surface (isometric rectangle) ──
    const dw = 26; // half-width
    const dh = 10; // half-height (iso)

    // Desk shadow
    g.fillStyle(0x000000, 0.25);
    g.beginPath();
    g.moveTo(0, -dh + 3);
    g.lineTo(dw + 2, 2);
    g.lineTo(0, dh + 3);
    g.lineTo(-dw - 2, 2);
    g.closePath();
    g.fillPath();

    // Desk top surface — dark tech surface
    g.fillStyle(0x1a1e30, 1);
    g.beginPath();
    g.moveTo(0, -dh);
    g.lineTo(dw, 0);
    g.lineTo(0, dh);
    g.lineTo(-dw, 0);
    g.closePath();
    g.fillPath();

    // Front edge (depth)
    g.fillStyle(0x12152a, 1);
    g.beginPath();
    g.moveTo(-dw, 0);
    g.lineTo(0, dh);
    g.lineTo(0, dh + 3);
    g.lineTo(-dw, 3);
    g.closePath();
    g.fillPath();

    g.fillStyle(0x0e1122, 1);
    g.beginPath();
    g.moveTo(0, dh);
    g.lineTo(dw, 0);
    g.lineTo(dw, 3);
    g.lineTo(0, dh + 3);
    g.closePath();
    g.fillPath();

    // Metallic edge highlight
    g.lineStyle(1, 0x3a4570, 0.6);
    g.beginPath();
    g.moveTo(-dw, 0);
    g.lineTo(0, -dh);
    g.lineTo(dw, 0);
    g.strokePath();

    // ── Dual monitors ──
    this.drawMonitor(g, -8, -dh - 8, false);
    this.drawMonitor(g, 6, -dh - 9, false);

    // Monitor stand/base
    g.fillStyle(0x22263a, 1);
    g.fillRect(-2, -dh - 1, 4, 2);

    // ── Keyboard ──
    g.fillStyle(0x1c2035, 1);
    g.beginPath();
    g.moveTo(-6, -2);
    g.lineTo(0, -4);
    g.lineTo(6, -2);
    g.lineTo(0, 0);
    g.closePath();
    g.fillPath();
    // Key rows (tiny dots)
    g.fillStyle(0x2a3050, 1);
    for (let i = -3; i <= 3; i += 2) {
      g.fillRect(i - 0.5, -2.5, 1, 0.5);
    }

    // ── Mouse (right side) ──
    g.fillStyle(0x282c42, 1);
    g.fillEllipse(10, -1, 3, 2);
    g.fillStyle(0x3a4060, 0.6);
    g.fillRect(9.5, -1.5, 1, 0.5);

    // ── Small plant (left corner) ──
    g.fillStyle(0x1a3020, 1);
    g.fillRect(-20, -3, 3, 3); // pot
    g.fillStyle(0x2d5a35, 1);
    g.fillCircle(-19, -5, 2.5);
    g.fillStyle(0x3a7a45, 0.8);
    g.fillCircle(-18, -6, 1.5);

    // ── Coffee mug (right corner) ──
    g.fillStyle(0x3a2820, 1);
    g.fillRect(16, -3, 3, 3);
    // Steam wisps
    g.lineStyle(0.5, 0xffffff, 0.08);
    g.beginPath();
    g.moveTo(17, -4);
    g.lineTo(17.5, -6);
    g.moveTo(18, -4);
    g.lineTo(17.5, -7);
    g.strokePath();

    // ── Tech gadgets — small USB hub / headphones ──
    g.fillStyle(0x252840, 1);
    g.fillRect(13, -5, 2, 1);
    g.fillStyle(0x4466ff, 0.4);
    g.fillRect(13.5, -4.8, 0.5, 0.5); // LED indicator

    // ── Desk edge glow line (accent) ──
    g.lineStyle(0.5, 0x4466cc, 0.15);
    g.beginPath();
    g.moveTo(-dw + 2, 1);
    g.lineTo(0, dh - 1);
    g.lineTo(dw - 2, 1);
    g.strokePath();
  }

  private drawMonitor(
    g: Phaser.GameObjects.Graphics,
    mx: number,
    my: number,
    active: boolean,
  ): void {
    const mw = 7; // monitor half-width
    const mh = 5; // monitor height

    // Monitor bezel (dark frame)
    g.fillStyle(0x0c0e1a, 1);
    g.fillRect(mx - mw, my - mh, mw * 2, mh * 2);

    // Screen
    if (active) {
      g.fillStyle(this.agentColor, 0.15);
    } else {
      g.fillStyle(0x080a14, 1);
    }
    g.fillRect(mx - mw + 1, my - mh + 1, mw * 2 - 2, mh * 2 - 2);

    // Screen reflection line
    g.lineStyle(0.5, 0xffffff, active ? 0.06 : 0.02);
    g.lineBetween(mx - mw + 2, my - mh + 2, mx + mw - 4, my - mh + 2);

    // Stand
    g.fillStyle(0x181c2e, 1);
    g.fillRect(mx - 1, my + mh, 2, 3);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  applyTheme(_theme: OfficeTheme): void {
    this.drawDesk();
    if (this.occupied) {
      this.setScreenOn(this.agentColor);
    }
  }

  setScreenOn(color: number = 0x00ccff): void {
    this.agentColor = color;
    this.occupied = true;

    // Redraw monitors as active
    this.graphics.clear();
    this.drawDeskActive(color);

    // Screen glow effect
    this.screenGlow.clear();
    this.screenGlow.fillStyle(color, 0.08);
    this.screenGlow.fillEllipse(0, -18, 30, 10);

    // LED underglow
    this.underglow.clear();
    this.underglow.fillStyle(0x6633cc, 0.12);
    this.underglow.fillEllipse(0, 4, 40, 12);
    this.underglow.fillStyle(color, 0.06);
    this.underglow.fillEllipse(0, 4, 30, 8);
  }

  private drawDeskActive(color: number): void {
    const g = this.graphics;
    const dw = 26;
    const dh = 10;

    // Desk shadow (stronger when active)
    g.fillStyle(0x000000, 0.3);
    g.beginPath();
    g.moveTo(0, -dh + 3);
    g.lineTo(dw + 2, 2);
    g.lineTo(0, dh + 3);
    g.lineTo(-dw - 2, 2);
    g.closePath();
    g.fillPath();

    // Desk surface
    g.fillStyle(0x1a1e30, 1);
    g.beginPath();
    g.moveTo(0, -dh);
    g.lineTo(dw, 0);
    g.lineTo(0, dh);
    g.lineTo(-dw, 0);
    g.closePath();
    g.fillPath();

    // Front edges
    g.fillStyle(0x12152a, 1);
    g.beginPath();
    g.moveTo(-dw, 0);
    g.lineTo(0, dh);
    g.lineTo(0, dh + 3);
    g.lineTo(-dw, 3);
    g.closePath();
    g.fillPath();

    g.fillStyle(0x0e1122, 1);
    g.beginPath();
    g.moveTo(0, dh);
    g.lineTo(dw, 0);
    g.lineTo(dw, 3);
    g.lineTo(0, dh + 3);
    g.closePath();
    g.fillPath();

    // Metallic edge highlight (brighter when active)
    g.lineStyle(1, 0x4a5580, 0.7);
    g.beginPath();
    g.moveTo(-dw, 0);
    g.lineTo(0, -dh);
    g.lineTo(dw, 0);
    g.strokePath();

    // Dual monitors (ACTIVE)
    this.drawMonitor(g, -8, -dh - 8, true);
    this.drawMonitor(g, 6, -dh - 9, true);

    // Monitor stand
    g.fillStyle(0x22263a, 1);
    g.fillRect(-2, -dh - 1, 4, 2);

    // Keyboard (subtle glow)
    g.fillStyle(0x1c2035, 1);
    g.beginPath();
    g.moveTo(-6, -2);
    g.lineTo(0, -4);
    g.lineTo(6, -2);
    g.lineTo(0, 0);
    g.closePath();
    g.fillPath();
    g.fillStyle(color, 0.06);
    g.beginPath();
    g.moveTo(-6, -2);
    g.lineTo(0, -4);
    g.lineTo(6, -2);
    g.lineTo(0, 0);
    g.closePath();
    g.fillPath();

    // Keys
    g.fillStyle(0x2a3050, 1);
    for (let i = -3; i <= 3; i += 2) {
      g.fillRect(i - 0.5, -2.5, 1, 0.5);
    }

    // Mouse
    g.fillStyle(0x282c42, 1);
    g.fillEllipse(10, -1, 3, 2);
    g.fillStyle(color, 0.3);
    g.fillRect(9.5, -1.5, 1, 0.5);

    // Plant
    g.fillStyle(0x1a3020, 1);
    g.fillRect(-20, -3, 3, 3);
    g.fillStyle(0x2d5a35, 1);
    g.fillCircle(-19, -5, 2.5);
    g.fillStyle(0x3a7a45, 0.8);
    g.fillCircle(-18, -6, 1.5);

    // Coffee mug
    g.fillStyle(0x3a2820, 1);
    g.fillRect(16, -3, 3, 3);
    g.lineStyle(0.5, 0xffffff, 0.1);
    g.beginPath();
    g.moveTo(17, -4);
    g.lineTo(17.5, -6);
    g.moveTo(18, -4);
    g.lineTo(17.5, -7);
    g.strokePath();

    // USB hub with active LED
    g.fillStyle(0x252840, 1);
    g.fillRect(13, -5, 2, 1);
    g.fillStyle(color, 0.7);
    g.fillRect(13.5, -4.8, 0.5, 0.5);

    // Desk edge glow (matches agent colour)
    g.lineStyle(0.5, color, 0.2);
    g.beginPath();
    g.moveTo(-dw + 2, 1);
    g.lineTo(0, dh - 1);
    g.lineTo(dw - 2, 1);
    g.strokePath();
  }

  setScreenOff(): void {
    this.occupied = false;
    this.agentColor = 0x00ccff;
    this.screenGlow.clear();
    this.underglow.clear();
    this.graphics.clear();
    this.drawDesk();
  }

  isOccupied(): boolean {
    return this.occupied;
  }

  destroy(fromScene?: boolean): void {
    this.graphics.destroy();
    this.screenGlow.destroy();
    this.underglow.destroy();
    super.destroy(fromScene);
  }
}
