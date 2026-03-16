import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class CoffeeTable extends Phaser.GameObjects.Container {
  private graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    // Shadow
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.1);
    shadow.fillEllipse(0, 4, 24, 6);
    this.add(shadow);

    this.graphics = scene.add.graphics();
    this.drawTable(0x1a2040, 0x2a3565);
    this.add(this.graphics);

    this.setDepth(y);
    scene.add.existing(this);
  }

  private drawTable(baseColor: number, edgeColor: number): void {
    this.graphics.clear();

    // Table legs (3 legs visible)
    this.graphics.fillStyle(baseColor, 0.6);
    this.graphics.fillRect(-8, 5, 2, 5);
    this.graphics.fillRect(6, 5, 2, 5);
    this.graphics.fillRect(-1, 7, 2, 4);

    // Table surface (top face with 3D rim)
    this.graphics.fillStyle(baseColor, 1);
    this.graphics.fillCircle(0, 0, 11);
    // Table rim/edge (3D depth)
    this.graphics.fillStyle(baseColor, 1);
    this.graphics.fillEllipse(0, 4, 22, 5);
    this.graphics.fillStyle(0x000000, 0.2);
    this.graphics.fillEllipse(0, 4, 22, 5);
    // Surface top highlight
    this.graphics.fillStyle(0xffffff, 0.02);
    this.graphics.fillEllipse(0, -2, 16, 6);
    // Edge ring
    this.graphics.lineStyle(1, edgeColor, 0.3);
    this.graphics.strokeCircle(0, 0, 11);

    // Cup with saucer
    this.graphics.fillStyle(edgeColor, 0.15);
    this.graphics.fillCircle(3, -2, 4);
    this.graphics.fillStyle(0x252e50, 1);
    this.graphics.fillCircle(3, -2, 3);
    // Cup highlight
    this.graphics.fillStyle(0xffffff, 0.06);
    this.graphics.fillCircle(2, -3, 1.5);
    // Cup steam (tiny)
    this.graphics.fillStyle(0xffffff, 0.1);
    this.graphics.fillCircle(3, -6, 1.5);
    this.graphics.fillStyle(0xffffff, 0.06);
    this.graphics.fillCircle(2, -8, 1);

    // Center detail
    this.graphics.fillStyle(edgeColor, 0.1);
    this.graphics.fillCircle(-3, 1, 2);
  }

  applyTheme(theme: OfficeTheme): void {
    this.drawTable(theme.furnitureBaseColor, theme.furnitureEdgeColor);
  }
}
