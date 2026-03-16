import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class PingPongTable extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const g = scene.add.graphics();

    // Shadow
    g.fillStyle(0x000000, 0.12);
    g.fillEllipse(0, 8, 56, 14);

    // Table legs
    g.fillStyle(0x3a3a5a, 0.8);
    g.fillRect(-22, 2, 3, 8);
    g.fillRect(19, 2, 3, 8);

    // Table surface (green)
    g.fillStyle(0x1a6b3a, 1);
    g.fillRect(-24, -4, 48, 8);
    // Surface edge highlight
    g.lineStyle(1, 0x22aa55, 0.4);
    g.strokeRect(-24, -4, 48, 8);

    // Front face (3D depth)
    g.fillStyle(0x145530, 1);
    g.fillRect(-24, 4, 48, 3);

    // Center white line
    g.lineStyle(1, 0xffffff, 0.6);
    g.lineBetween(0, -4, 0, 4);

    // Net (center vertical)
    g.fillStyle(0xcccccc, 0.3);
    g.fillRect(-1, -8, 2, 5);
    // Net mesh
    g.lineStyle(1, 0xffffff, 0.15);
    g.lineBetween(-24, -6, 24, -6);

    // Ball (small white dot)
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(8, -3, 2);

    this.add(g);
    this.setDepth(y);
    scene.add.existing(this);
  }
}
