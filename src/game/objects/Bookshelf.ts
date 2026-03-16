import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class Bookshelf extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const g = scene.add.graphics();
    // Frame front face (dark metal)
    g.fillStyle(0x1a2040, 1);
    g.fillRect(-12, -26, 24, 26);
    // Frame side panel (3D depth)
    g.fillStyle(0x1a2040, 1);
    g.fillRect(12, -24, 4, 24);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(12, -24, 4, 24);
    // Frame top face (3D depth)
    g.fillStyle(0x1a2040, 0.9);
    g.fillRect(-12, -28, 28, 2);
    g.fillStyle(0xffffff, 0.03);
    g.fillRect(-12, -28, 28, 1);
    // Frame edge
    g.lineStyle(1, 0x2a3565, 0.3);
    g.strokeRect(-12, -26, 24, 26);
    // Shelves (metallic with highlight)
    g.fillStyle(0x252e50, 1);
    g.fillRect(-12, -20, 24, 2);
    g.fillRect(-12, -12, 24, 2);
    g.fillStyle(0xffffff, 0.03);
    g.fillRect(-12, -20, 24, 1);
    g.fillRect(-12, -12, 24, 1);
    // Data tablets (colored, like books but sci-fi)
    const tabletColors = [0x6366f1, 0xf87171, 0x34d399, 0xfbbf24, 0xa78bfa];
    for (let i = 0; i < 5; i++) {
      // Top shelf tablets
      g.fillStyle(tabletColors[i], 0.8);
      g.fillRect(-10 + i * 4.2, -26, 3, 6);
      // Tablet spine highlight
      g.fillStyle(0xffffff, 0.08);
      g.fillRect(-10 + i * 4.2, -26, 1, 6);
      // Bottom shelf tablets
      g.fillStyle(tabletColors[i], 0.6);
      g.fillRect(-10 + i * 4.2, -18, 3, 6);
    }
    // Small LED on frame (power indicator)
    g.fillStyle(0x34d399, 0.5);
    g.fillCircle(9, -24, 1);
    this.add(g);

    this.setDepth(y);
    scene.add.existing(this);
  }
}
