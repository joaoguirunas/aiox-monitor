import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class Plant extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const g = scene.add.graphics();
    // Pot (metallic planter)
    g.fillStyle(0x1a2040, 1);
    g.fillRect(-6, -4, 12, 8);
    g.fillRect(-7, -5, 14, 2);
    // Pot edge highlight
    g.lineStyle(1, 0x2a3565, 0.3);
    g.lineBetween(-7, -5, 7, -5);
    // Bio-luminescent leaves
    g.fillStyle(0x22d3ee, 0.4);
    g.fillCircle(-4, -12, 6);
    g.fillCircle(4, -14, 6);
    g.fillCircle(0, -16, 6);
    // Brighter inner glow
    g.fillStyle(0x34d399, 0.3);
    g.fillCircle(-3, -11, 3);
    g.fillCircle(3, -13, 3);
    g.fillCircle(0, -15, 3);
    // Stem
    g.fillStyle(0x1a4a3a, 1);
    g.fillRect(-1, -9, 2, 6);
    this.add(g);

    // Gentle glow tween on leaves
    const glow = scene.add.graphics();
    glow.fillStyle(0x22d3ee, 0.06);
    glow.fillCircle(0, -13, 10);
    this.add(glow);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 0.3, to: 0.8 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.setDepth(y);
    scene.add.existing(this);
  }
}
