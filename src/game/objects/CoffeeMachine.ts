import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class CoffeeMachine extends Phaser.GameObjects.Container {
  private steamParticles: Phaser.GameObjects.Graphics[] = [];
  private steamTweens: Phaser.Tweens.Tween[] = [];
  private ledTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    // Shadow
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.1);
    shadow.fillEllipse(0, 4, 20, 6);
    this.add(shadow);

    const g = scene.add.graphics();
    // Body front face
    g.fillStyle(0x1a2040, 1);
    g.fillRoundedRect(-9, -18, 18, 18, 3);
    // Body side panel (3D depth)
    g.fillStyle(0x1a2040, 1);
    g.fillRect(9, -16, 4, 16);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(9, -16, 4, 16);
    // Body top face (3D depth)
    g.fillStyle(0x1a2040, 0.9);
    g.fillRect(-9, -20, 22, 2);
    g.fillStyle(0xffffff, 0.03);
    g.fillRect(-9, -20, 22, 1);
    // Body edge highlight
    g.lineStyle(1, 0x2a3565, 0.4);
    g.strokeRoundedRect(-9, -18, 18, 18, 3);
    // Top panel (darker)
    g.fillStyle(0x151a30, 1);
    g.fillRect(-7, -18, 14, 4);
    // Nozzle
    g.fillStyle(0x252e50, 1);
    g.fillRect(-3, -22, 6, 3);
    // Display (mini screen with border)
    g.fillStyle(0x00ccff, 0.2);
    g.fillRect(-5, -12, 10, 4);
    g.lineStyle(1, 0x00ccff, 0.1);
    g.strokeRect(-5, -12, 10, 4);
    // Display text lines
    g.fillStyle(0x00ccff, 0.4);
    g.fillRect(-4, -11, 4, 1);
    g.fillRect(-4, -9, 6, 1);
    // Cup slot
    g.fillStyle(0x252e50, 1);
    g.fillRect(-4, -2, 8, 4);
    // Cup
    g.fillStyle(0x2a3565, 1);
    g.fillRect(-3, -1, 6, 3);
    // Cup highlight
    g.fillStyle(0xffffff, 0.04);
    g.fillRect(-3, -1, 2, 2);
    this.add(g);

    // LED indicator (pulsing)
    const led = scene.add.graphics();
    led.fillStyle(0x34d399, 0.8);
    led.fillCircle(6, -15, 1.5);
    this.add(led);
    this.ledTween = scene.tweens.add({
      targets: led,
      alpha: { from: 0.4, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.setDepth(y);
    scene.add.existing(this);
  }

  setSteamActive(active: boolean): void {
    if (active && this.steamParticles.length === 0) {
      // Create 3 steam particles
      for (let i = 0; i < 3; i++) {
        const steam = this.scene.add.graphics();
        steam.fillStyle(0xffffff, 0.15);
        steam.fillCircle(0, 0, 2 - i * 0.3);
        steam.setPosition(-1 + i, -22);
        this.add(steam);
        this.steamParticles.push(steam);

        const tw = this.scene.tweens.add({
          targets: steam,
          y: steam.y - 12,
          x: steam.x + Phaser.Math.Between(-3, 3),
          alpha: 0,
          duration: 1200 + i * 300,
          repeat: -1,
          delay: i * 200,
          ease: 'Sine.easeOut',
          onRepeat: () => {
            steam.setPosition(-1 + i, -22);
            steam.setAlpha(0.15);
          },
        });
        this.steamTweens.push(tw);
      }
    } else if (!active && this.steamParticles.length > 0) {
      this.steamTweens.forEach(tw => tw.stop());
      this.steamTweens = [];
      this.steamParticles.forEach(p => p.destroy());
      this.steamParticles = [];
    }
  }

  destroy(fromScene?: boolean): void {
    this.setSteamActive(false);
    if (this.ledTween) this.ledTween.stop();
    super.destroy(fromScene);
  }
}
