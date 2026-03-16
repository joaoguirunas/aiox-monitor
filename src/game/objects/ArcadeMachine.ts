import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class ArcadeMachine extends Phaser.GameObjects.Container {
  private screenGlow: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const g = scene.add.graphics();

    // Shadow
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(0, 8, 28, 8);

    // Cabinet body
    g.fillStyle(0x1a1a30, 1);
    g.fillRect(-10, -30, 20, 36);
    // Side panel (3D depth)
    g.fillStyle(0x1a1a30, 1);
    g.fillRect(10, -28, 4, 34);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(10, -28, 4, 34);

    // Top edge
    g.fillStyle(0x2a2a55, 1);
    g.fillRect(-10, -32, 20, 3);
    g.fillStyle(0xffffff, 0.05);
    g.fillRect(-10, -32, 20, 1);

    // Screen area
    g.fillStyle(0x0a0a18, 1);
    g.fillRect(-7, -26, 14, 10);

    // Screen border (neon)
    g.lineStyle(1, 0xff00ff, 0.4);
    g.strokeRect(-7, -26, 14, 10);

    // Control panel (tilted surface)
    g.fillStyle(0x252540, 1);
    g.fillRect(-8, -14, 16, 6);
    g.lineStyle(1, 0x3a3a6a, 0.3);
    g.strokeRect(-8, -14, 16, 6);

    // Joystick
    g.fillStyle(0x555588, 1);
    g.fillCircle(-3, -11, 2);
    g.fillStyle(0xff4444, 1);
    g.fillCircle(-3, -13, 1.5);

    // Buttons
    g.fillStyle(0xff3366, 0.9);
    g.fillCircle(3, -12, 1.5);
    g.fillStyle(0x33ff66, 0.9);
    g.fillCircle(6, -11, 1.5);

    // Coin slot
    g.fillStyle(0x333355, 1);
    g.fillRect(-2, -4, 4, 2);
    g.lineStyle(1, 0x4a4a7a, 0.3);
    g.strokeRect(-2, -4, 4, 2);

    this.add(g);

    // Screen glow (animated)
    this.screenGlow = scene.add.graphics();
    this.screenGlow.fillStyle(0x00ffcc, 0.5);
    this.screenGlow.fillRect(-5, -24, 10, 6);
    // Fake game pixels
    this.screenGlow.fillStyle(0xff00ff, 0.3);
    this.screenGlow.fillRect(-3, -22, 2, 2);
    this.screenGlow.fillStyle(0x00ff00, 0.3);
    this.screenGlow.fillRect(1, -20, 2, 2);
    this.screenGlow.fillStyle(0xffff00, 0.2);
    this.screenGlow.fillRect(-1, -23, 3, 1);
    this.add(this.screenGlow);

    // Screen pulse animation
    scene.tweens.add({
      targets: this.screenGlow,
      alpha: { from: 0.6, to: 1 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.setDepth(y);
    scene.add.existing(this);
  }
}
