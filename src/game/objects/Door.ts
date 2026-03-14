import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class Door extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const graphics = scene.add.graphics();
    // Frame da porta (moldura madeira)
    graphics.fillStyle(0x6a5a4a, 1);
    graphics.fillRect(-14, -30, 28, 30);
    // Porta interior
    graphics.fillStyle(0x4a3a2a, 1);
    graphics.fillRect(-12, -28, 24, 26);
    // Maçaneta
    graphics.fillStyle(0xccaa00, 1);
    graphics.fillCircle(8, -14, 2);
    this.add(graphics);

    this.setDepth(y);
    scene.add.existing(this);
  }
}
