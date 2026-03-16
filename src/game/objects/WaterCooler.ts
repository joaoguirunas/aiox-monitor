import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class WaterCooler extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const g = scene.add.graphics();
    // Base (dark metal with 3D front)
    g.fillStyle(0x1a2040, 1);
    g.fillRect(-7, -4, 14, 8);
    g.fillStyle(0x000000, 0.2);
    g.fillRect(-7, 0, 14, 4);
    // Body front
    g.fillStyle(0x252e50, 1);
    g.fillRoundedRect(-6, -18, 12, 14, 2);
    // Body side (3D depth)
    g.fillStyle(0x252e50, 1);
    g.fillRect(6, -16, 3, 12);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(6, -16, 3, 12);
    // Body edge
    g.lineStyle(1, 0x2a3565, 0.3);
    g.strokeRoundedRect(-6, -18, 12, 14, 2);
    // Coolant container (translucent cyan)
    g.fillStyle(0x22d3ee, 0.25);
    g.fillRoundedRect(-5, -28, 10, 11, 3);
    // Liquid level lines
    g.fillStyle(0x22d3ee, 0.1);
    g.fillRect(-4, -22, 8, 1);
    g.fillRect(-4, -19, 8, 1);
    // Container edge
    g.lineStyle(1, 0x22d3ee, 0.15);
    g.strokeRoundedRect(-5, -28, 10, 11, 3);
    // Container cap highlight
    g.fillStyle(0xffffff, 0.04);
    g.fillRect(-4, -28, 8, 1);
    // Tap
    g.fillStyle(0x2a3565, 1);
    g.fillRect(-8, -12, 3, 2);
    // Drip tray
    g.fillStyle(0x151a30, 1);
    g.fillRect(-7, -5, 8, 2);
    // LED
    g.fillStyle(0x22d3ee, 0.5);
    g.fillCircle(4, -16, 1);
    this.add(g);

    // Liquid glow
    const glow = scene.add.graphics();
    glow.fillStyle(0x22d3ee, 0.04);
    glow.fillCircle(0, -22, 8);
    this.add(glow);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 0.3, to: 0.7 },
      duration: 4000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.setDepth(y);
    scene.add.existing(this);
  }
}
