import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class Bed extends Phaser.GameObjects.Container {
  private graphics: Phaser.GameObjects.Graphics;
  private occupied = false;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    // Shadow
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.12);
    shadow.fillEllipse(0, 10, 52, 14);
    this.add(shadow);

    this.graphics = scene.add.graphics();
    this.drawBed(0x1a2040, 0x252e50, 0x2a3565);
    this.add(this.graphics);

    this.setDepth(y);
    scene.add.existing(this);
  }

  private drawBed(baseColor: number, accentColor: number, edgeColor: number): void {
    this.graphics.clear();
    const g = this.graphics;

    // Bed frame legs
    g.fillStyle(baseColor, 0.8);
    g.fillRect(-24, 6, 3, 6);
    g.fillRect(21, 6, 3, 6);

    // Bed frame base (front face — 3D depth)
    g.fillStyle(baseColor, 1);
    g.fillRect(-26, 4, 52, 5);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(-26, 4, 52, 3);

    // Side panel (3D depth)
    g.fillStyle(baseColor, 1);
    g.fillRect(26, -6, 3, 12);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(26, -6, 3, 12);

    // Mattress
    g.fillStyle(accentColor, 1);
    g.fillRoundedRect(-24, -6, 48, 12, 3);
    // Mattress highlight
    g.fillStyle(edgeColor, 0.15);
    g.fillRoundedRect(-22, -4, 44, 8, 2);

    // Blanket / duvet (covering lower half)
    g.fillStyle(0x1a2a5a, 0.7);
    g.fillRoundedRect(-22, -2, 44, 8, 3);
    // Blanket fold line
    g.lineStyle(1, 0x2a3a6a, 0.2);
    g.lineBetween(-20, -2, 20, -2);

    // Pillow (left)
    g.fillStyle(0xccccdd, 0.3);
    g.fillRoundedRect(-20, -10, 16, 6, 3);
    g.fillStyle(0xffffff, 0.05);
    g.fillRoundedRect(-19, -9, 14, 3, 2);

    // Pillow (right)
    g.fillStyle(0xccccdd, 0.3);
    g.fillRoundedRect(4, -10, 16, 6, 3);
    g.fillStyle(0xffffff, 0.05);
    g.fillRoundedRect(5, -9, 14, 3, 2);

    // Headboard
    g.fillStyle(baseColor, 1);
    g.fillRoundedRect(-26, -18, 52, 10, 3);
    // Headboard edge
    g.lineStyle(1, edgeColor, 0.2);
    g.strokeRoundedRect(-26, -18, 52, 10, 3);
    // Headboard panels
    g.fillStyle(accentColor, 0.4);
    g.fillRoundedRect(-22, -16, 20, 6, 2);
    g.fillRoundedRect(2, -16, 20, 6, 2);
  }

  applyTheme(theme: OfficeTheme): void {
    this.drawBed(theme.furnitureBaseColor, theme.furnitureAccentColor, theme.furnitureEdgeColor);
  }

  setOccupied(on: boolean): void {
    this.occupied = on;
  }

  isOccupied(): boolean {
    return this.occupied;
  }
}
