import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class CoffeeTable extends Phaser.GameObjects.Container {
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
    this.graphics.fillStyle(0x5a4030, 1);
    this.graphics.fillCircle(0, 0, 10);
    this.graphics.fillStyle(0xdddddd, 1);
    this.graphics.fillCircle(3, -2, 3);
  }

  applyTheme(theme: OfficeTheme): void {
    this.graphics.clear();
    this.graphics.fillStyle(theme.furnitureBaseColor, 1);
    this.graphics.fillCircle(0, 0, 10);
    this.graphics.fillStyle(0xdddddd, 1);
    this.graphics.fillCircle(3, -2, 3);
  }
}
