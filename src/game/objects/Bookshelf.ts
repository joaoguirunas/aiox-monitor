import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class Bookshelf extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const g = scene.add.graphics();
    // Estrutura de madeira
    g.fillStyle(0x8b6914, 1);
    g.fillRect(-10, -24, 20, 24);
    // Prateleiras
    g.fillStyle(0x6b4914, 1);
    g.fillRect(-10, -18, 20, 2);
    g.fillRect(-10, -10, 20, 2);
    // Livros (cores variadas)
    const bookColors = [0x3b82f6, 0xef4444, 0x22c55e, 0xf59e0b, 0xa855f7];
    for (let i = 0; i < 5; i++) {
      g.fillStyle(bookColors[i], 1);
      g.fillRect(-8 + i * 3.5, -24, 3, 6);
      g.fillRect(-8 + i * 3.5, -16, 3, 6);
    }
    this.add(g);

    this.setDepth(y);
    scene.add.existing(this);
  }
}
