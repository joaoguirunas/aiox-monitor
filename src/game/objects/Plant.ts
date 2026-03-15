import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class Plant extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const g = scene.add.graphics();
    // Vaso
    g.fillStyle(0xb45309, 1);
    g.fillRect(-5, -4, 10, 8);
    g.fillRect(-6, -5, 12, 2);
    // Folhas
    g.fillStyle(0x22c55e, 1);
    g.fillCircle(-3, -10, 5);
    g.fillCircle(3, -12, 5);
    g.fillCircle(0, -14, 5);
    // Tronco
    g.fillStyle(0x6b4914, 1);
    g.fillRect(-1, -8, 2, 5);
    this.add(g);

    this.setDepth(y);
    scene.add.existing(this);
  }
}
