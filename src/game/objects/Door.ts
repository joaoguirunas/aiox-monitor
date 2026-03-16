import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class Door extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const g = scene.add.graphics();
    // Door frame (metallic, with 3D depth)
    g.fillStyle(0x1a2040, 1);
    g.fillRect(-16, -34, 32, 34);
    // Frame side panel (3D)
    g.fillStyle(0x1a2040, 1);
    g.fillRect(16, -32, 4, 32);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(16, -32, 4, 32);
    // Frame top (3D)
    g.fillStyle(0x1a2040, 0.9);
    g.fillRect(-16, -36, 36, 2);
    g.fillStyle(0xffffff, 0.03);
    g.fillRect(-16, -36, 36, 1);
    // Frame edge
    g.lineStyle(1, 0x2a3565, 0.5);
    g.strokeRect(-16, -34, 32, 34);
    // Door panels (2 sliding doors, sci-fi)
    g.fillStyle(0x151a30, 1);
    g.fillRect(-14, -32, 13, 30);
    g.fillRect(1, -32, 13, 30);
    // Center gap
    g.fillStyle(0x0a0f1a, 1);
    g.fillRect(-1, -32, 2, 30);
    // Panel lines (horizontal)
    g.lineStyle(1, 0x2a3565, 0.15);
    g.lineBetween(-14, -24, -1, -24);
    g.lineBetween(1, -24, 14, -24);
    g.lineBetween(-14, -16, -1, -16);
    g.lineBetween(1, -16, 14, -16);
    // Panel vertical accent
    g.lineStyle(1, 0x2a3565, 0.06);
    g.lineBetween(-8, -32, -8, -2);
    g.lineBetween(8, -32, 8, -2);
    // Door header glow
    g.lineStyle(2, 0x6366f1, 0.3);
    g.lineBetween(-14, -32, 14, -32);
    // Access panel (keycard reader)
    g.fillStyle(0x6366f1, 0.25);
    g.fillRect(10, -20, 3, 5);
    g.lineStyle(1, 0x6366f1, 0.15);
    g.strokeRect(10, -20, 3, 5);
    // Access LED
    g.fillStyle(0x34d399, 0.6);
    g.fillCircle(11.5, -16, 1);
    // Floor threshold
    g.fillStyle(0x2a3565, 0.2);
    g.fillRect(-14, -2, 28, 2);
    this.add(g);

    // Door header glow pulse
    const headerGlow = scene.add.graphics();
    headerGlow.lineStyle(1, 0x6366f1, 0.15);
    headerGlow.lineBetween(-14, -30, 14, -30);
    this.add(headerGlow);
    scene.tweens.add({
      targets: headerGlow,
      alpha: { from: 0.3, to: 0.8 },
      duration: 2500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.setDepth(y);
    scene.add.existing(this);
  }
}
