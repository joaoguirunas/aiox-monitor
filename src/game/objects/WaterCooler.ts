import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class WaterCooler extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const g = scene.add.graphics();
    // Base
    g.fillStyle(0xccccdd, 1);
    g.fillRect(-6, -4, 12, 8);
    // Corpo
    g.fillStyle(0xddddee, 1);
    g.fillRoundedRect(-5, -16, 10, 12, 2);
    // Garrafão (azul translúcido)
    g.fillStyle(0x60a5fa, 0.6);
    g.fillRoundedRect(-4, -26, 8, 11, 3);
    // Torneira
    g.fillStyle(0xaaaabb, 1);
    g.fillRect(-7, -10, 3, 2);
    this.add(g);

    this.setDepth(y);
    scene.add.existing(this);
  }
}
