import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class PoolTable extends Phaser.GameObjects.Container {
  private graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    // Shadow
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.15);
    shadow.fillEllipse(0, 10, 60, 14);
    this.add(shadow);

    this.graphics = scene.add.graphics();
    this.drawTable(0x1a2040, 0x252e50, 0x2a3565);
    this.add(this.graphics);

    this.setDepth(y);
    scene.add.existing(this);
  }

  private drawTable(baseColor: number, accentColor: number, edgeColor: number): void {
    this.graphics.clear();
    const g = this.graphics;

    // Table legs (4 corners)
    g.fillStyle(baseColor, 0.9);
    g.fillRect(-26, 4, 4, 8);
    g.fillRect(22, 4, 4, 8);
    g.fillRect(-26, -2, 4, 8);
    g.fillRect(22, -2, 4, 8);

    // Table body (front face — 3D depth)
    g.fillStyle(0x1a6b3a, 1);
    g.fillRect(-28, 4, 56, 5);
    g.fillStyle(0x145530, 1);
    g.fillRect(-28, 4, 56, 3);

    // Side panel (3D depth)
    g.fillStyle(baseColor, 0.8);
    g.fillRect(26, -4, 4, 10);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(26, -4, 4, 10);

    // Table surface (green felt)
    g.fillStyle(0x1a7a2a, 1);
    g.fillRect(-28, -6, 56, 12);
    // Surface highlight
    g.fillStyle(0x22aa44, 0.15);
    g.fillRect(-26, -5, 52, 10);

    // Rail / cushion border (dark wood)
    g.lineStyle(2, edgeColor, 0.6);
    g.strokeRect(-28, -6, 56, 12);

    // Corner pockets (6)
    g.fillStyle(0x0a0a0a, 0.8);
    g.fillCircle(-26, -4, 2.5);
    g.fillCircle(26, -4, 2.5);
    g.fillCircle(-26, 4, 2.5);
    g.fillCircle(26, 4, 2.5);
    g.fillCircle(0, -5, 2);
    g.fillCircle(0, 5, 2);

    // Center line
    g.lineStyle(1, 0xffffff, 0.08);
    g.lineBetween(0, -5, 0, 5);

    // Balls (scattered)
    const ballColors = [0xff2222, 0x2222ff, 0xffff22, 0xff8800, 0x22cc22, 0x8822aa];
    const ballPositions = [
      { bx: -10, by: -1 }, { bx: -8, by: 1 }, { bx: -6, by: -1 },
      { bx: 8, by: 0 }, { bx: 10, by: -2 }, { bx: 12, by: 1 },
    ];
    for (let i = 0; i < ballPositions.length; i++) {
      g.fillStyle(ballColors[i], 0.7);
      g.fillCircle(ballPositions[i].bx, ballPositions[i].by, 1.5);
    }
    // Cue ball (white)
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(-16, 0, 1.5);
  }

  applyTheme(theme: OfficeTheme): void {
    this.drawTable(theme.furnitureBaseColor, theme.furnitureAccentColor, theme.furnitureEdgeColor);
  }
}
