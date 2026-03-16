import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class BeanBag extends Phaser.GameObjects.Container {
  private graphics: Phaser.GameObjects.Graphics;
  private bagColor: number;
  private occupied = false;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number, color = 0x4a3080) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    this.bagColor = color;

    // Shadow
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.1);
    shadow.fillEllipse(0, 6, 28, 8);
    this.add(shadow);

    this.graphics = scene.add.graphics();
    this.drawBag(0x1a2040, 0x252e50, 0x2a3565);
    this.add(this.graphics);

    this.setDepth(y);
    scene.add.existing(this);
  }

  private drawBag(baseColor: number, _accentColor: number, edgeColor: number): void {
    this.graphics.clear();
    const g = this.graphics;

    // Base contact with floor (darker underside)
    g.fillStyle(baseColor, 0.4);
    g.fillEllipse(0, 3, 22, 8);

    // Bean bag body (organic blob shape — main mass)
    g.fillStyle(this.bagColor, 0.7);
    g.fillEllipse(0, -2, 24, 16);

    // Top bulge (gives 3D volume)
    g.fillStyle(this.bagColor, 0.5);
    g.fillEllipse(-1, -5, 18, 10);

    // Side bulge (3D depth feel)
    g.fillStyle(this.bagColor, 0.35);
    g.fillEllipse(6, 0, 10, 12);

    // Front face shadow (3D depth)
    g.fillStyle(0x000000, 0.12);
    g.fillEllipse(0, 3, 20, 6);

    // Highlight (specular)
    g.fillStyle(0xffffff, 0.08);
    g.fillEllipse(-4, -7, 10, 5);

    // Crease lines (fabric detail)
    g.lineStyle(1, 0x000000, 0.08);
    g.beginPath();
    g.moveTo(-6, -8);
    g.lineTo(-2, 2);
    g.lineTo(4, -6);
    g.strokePath();

    // Second crease
    g.lineStyle(1, 0x000000, 0.05);
    g.beginPath();
    g.moveTo(2, -9);
    g.lineTo(5, -1);
    g.strokePath();

    // Bottom seam line
    g.lineStyle(1, edgeColor, 0.06);
    g.beginPath();
    g.moveTo(-10, 2);
    g.lineTo(10, 2);
    g.strokePath();

    // Tag/label (tiny fabric tag)
    g.fillStyle(0xffffff, 0.1);
    g.fillRect(9, -2, 2, 3);
  }

  applyTheme(theme: OfficeTheme): void {
    this.drawBag(theme.furnitureBaseColor, theme.furnitureAccentColor, theme.furnitureEdgeColor);
  }

  setOccupied(on: boolean): void {
    this.occupied = on;
  }

  isOccupied(): boolean {
    return this.occupied;
  }
}
