import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class Sofa extends Phaser.GameObjects.Container {
  private graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    this.graphics = scene.add.graphics();
    this.drawDefault();
    this.add(this.graphics);

    this.setDepth(y);
    scene.add.existing(this);
  }

  private drawDefault(): void {
    this.graphics.fillStyle(0x2a4a6a, 1);
    this.graphics.fillRoundedRect(-18, -8, 36, 16, 4);
    this.graphics.fillStyle(0x1a3a5a, 1);
    this.graphics.fillRoundedRect(-18, -14, 36, 8, 3);
  }

  applyTheme(theme: OfficeTheme): void {
    this.graphics.clear();
    this.graphics.fillStyle(theme.furnitureAccentColor, 1);
    this.graphics.fillRoundedRect(-18, -8, 36, 16, 4);
    this.graphics.fillStyle(theme.furnitureBaseColor, 1);
    this.graphics.fillRoundedRect(-18, -14, 36, 8, 3);
  }
}
