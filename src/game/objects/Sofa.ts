import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class Sofa extends Phaser.GameObjects.Container {
  private graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    // Shadow
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.1);
    shadow.fillEllipse(0, 6, 40, 8);
    this.add(shadow);

    this.graphics = scene.add.graphics();
    this.drawSofa(0x252e50, 0x1a2040, 0x2a3565);
    this.add(this.graphics);

    this.setDepth(y);
    scene.add.existing(this);
  }

  private drawSofa(seatColor: number, backColor: number, edgeColor: number): void {
    this.graphics.clear();

    // Front face (3D depth visible below seat)
    this.graphics.fillStyle(seatColor, 1);
    this.graphics.fillRoundedRect(-20, 5, 40, 6, 3);
    this.graphics.fillStyle(0x000000, 0.25);
    this.graphics.fillRoundedRect(-20, 5, 40, 6, 3);

    // Armrests (3D blocks at sides)
    this.graphics.fillStyle(backColor, 1);
    this.graphics.fillRect(-22, -12, 4, 18);
    this.graphics.fillRect(18, -12, 4, 18);
    // Armrest top highlight
    this.graphics.fillStyle(edgeColor, 0.12);
    this.graphics.fillRect(-22, -12, 4, 1);
    this.graphics.fillRect(18, -12, 4, 1);
    // Armrest inner shadow
    this.graphics.fillStyle(0x000000, 0.15);
    this.graphics.fillRect(-18, -10, 1, 14);
    this.graphics.fillRect(17, -10, 1, 14);

    // Seat (top face)
    this.graphics.fillStyle(seatColor, 1);
    this.graphics.fillRoundedRect(-18, -8, 36, 14, 4);

    // Backrest
    this.graphics.fillStyle(backColor, 1);
    this.graphics.fillRoundedRect(-18, -17, 36, 10, 4);
    // Backrest top highlight
    this.graphics.fillStyle(0xffffff, 0.03);
    this.graphics.fillRoundedRect(-18, -17, 36, 2, 2);

    // Cushion divider seam
    this.graphics.lineStyle(1, 0x000000, 0.08);
    this.graphics.lineBetween(0, -6, 0, 4);

    // Cushion highlights
    this.graphics.fillStyle(edgeColor, 0.1);
    this.graphics.fillRoundedRect(-15, -5, 13, 10, 3);
    this.graphics.fillRoundedRect(2, -5, 13, 10, 3);

    // Edge glow
    this.graphics.lineStyle(1, edgeColor, 0.15);
    this.graphics.strokeRoundedRect(-18, -8, 36, 14, 4);
  }

  applyTheme(theme: OfficeTheme): void {
    this.drawSofa(theme.furnitureAccentColor, theme.furnitureBaseColor, theme.furnitureEdgeColor);
  }
}
