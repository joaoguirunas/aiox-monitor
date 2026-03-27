import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class Hammock extends Phaser.GameObjects.Container {
  private occupied = false;
  private swayTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const g = scene.add.graphics();

    // Shadow
    g.fillStyle(0x000000, 0.1);
    g.fillEllipse(0, 8, 44, 10);

    // Posts
    g.fillStyle(0x5a4a3a, 1);
    g.fillRect(-20, -14, 3, 20);
    g.fillRect(17, -14, 3, 20);
    // Post tops
    g.fillStyle(0x6a5a4a, 1);
    g.fillCircle(-18.5, -14, 2);
    g.fillCircle(18.5, -14, 2);

    // Hammock fabric (curved shape using line segments)
    g.lineStyle(2, 0x4488aa, 0.6);
    g.beginPath();
    g.moveTo(-18, -10);
    g.lineTo(-12, -6);
    g.lineTo(-6, -3);
    g.lineTo(0, -2);
    g.lineTo(6, -3);
    g.lineTo(12, -6);
    g.lineTo(18, -10);
    g.strokePath();

    // Fabric fill
    g.fillStyle(0x3377aa, 0.2);
    g.beginPath();
    g.moveTo(-18, -10);
    g.lineTo(-12, -6);
    g.lineTo(-6, -3);
    g.lineTo(0, -2);
    g.lineTo(6, -3);
    g.lineTo(12, -6);
    g.lineTo(18, -10);
    g.lineTo(18, -8);
    g.lineTo(12, -4);
    g.lineTo(6, -1);
    g.lineTo(0, 0);
    g.lineTo(-6, -1);
    g.lineTo(-12, -4);
    g.lineTo(-18, -8);
    g.closePath();
    g.fillPath();

    // Pillow
    g.fillStyle(0xddddee, 0.4);
    g.fillEllipse(-10, -6, 8, 4);

    this.add(g);
    this.setDepth(y);
    scene.add.existing(this);
  }

  setOccupied(on: boolean): void {
    this.occupied = on;
    if (on) {
      if (!this.swayTween) {
        this.swayTween = this.scene.tweens.add({
          targets: this,
          angle: { from: -1.5, to: 1.5 },
          duration: 2500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    } else {
      if (this.swayTween) {
        this.swayTween.stop();
        this.swayTween = null;
        this.setAngle(0);
      }
    }
  }

  isOccupied(): boolean {
    return this.occupied;
  }
}
