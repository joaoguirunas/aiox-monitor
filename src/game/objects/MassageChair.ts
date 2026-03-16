import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class MassageChair extends Phaser.GameObjects.Container {
  private graphics: Phaser.GameObjects.Graphics;
  private ledGraphics: Phaser.GameObjects.Graphics;
  private ledTween: Phaser.Tweens.Tween | null = null;
  private inUse = false;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    // Shadow
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.12);
    shadow.fillEllipse(0, 8, 34, 10);
    this.add(shadow);

    this.graphics = scene.add.graphics();
    this.drawChair(0x1a2040, 0x252e50, 0x2a3565);
    this.add(this.graphics);

    // LED pulse
    this.ledGraphics = scene.add.graphics();
    this.drawLed(false);
    this.add(this.ledGraphics);

    this.ledTween = scene.tweens.add({
      targets: this.ledGraphics,
      alpha: { from: 0.3, to: 0.8 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.setDepth(y);
    scene.add.existing(this);
  }

  private drawChair(baseColor: number, accentColor: number, edgeColor: number): void {
    this.graphics.clear();
    const g = this.graphics;

    // Base / pedestal
    g.fillStyle(baseColor, 1);
    g.fillRect(-8, 4, 16, 4);
    g.fillStyle(accentColor, 0.6);
    g.fillRect(-6, 5, 12, 2);

    // Seat (reclined shape)
    g.fillStyle(accentColor, 1);
    g.fillRoundedRect(-12, -4, 24, 12, 4);
    // Seat cushion highlight
    g.fillStyle(edgeColor, 0.2);
    g.fillRoundedRect(-10, -2, 20, 8, 3);

    // 3D side panel
    g.fillStyle(accentColor, 1);
    g.fillRect(12, -4, 3, 12);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(12, -4, 3, 12);

    // Backrest (tall, slightly reclined)
    g.fillStyle(baseColor, 1);
    g.fillRoundedRect(-10, -20, 20, 18, 5);
    // Backrest cushion
    g.fillStyle(accentColor, 0.5);
    g.fillRoundedRect(-8, -18, 16, 14, 4);
    // Top highlight
    g.fillStyle(0xffffff, 0.03);
    g.fillRoundedRect(-10, -20, 20, 2, 2);

    // Headrest
    g.fillStyle(accentColor, 1);
    g.fillRoundedRect(-6, -26, 12, 7, 3);
    g.fillStyle(edgeColor, 0.15);
    g.fillRoundedRect(-5, -25, 10, 5, 2);

    // Armrests
    g.fillStyle(baseColor, 1);
    g.fillRect(-14, -8, 3, 10);
    g.fillRect(11, -8, 3, 10);
    // Armrest top
    g.fillStyle(edgeColor, 0.2);
    g.fillRect(-14, -8, 3, 1);
    g.fillRect(11, -8, 3, 1);

    // Control panel (small LED spot)
    g.fillStyle(0x6366f1, 0.4);
    g.fillCircle(13, -4, 1.5);
  }

  private drawLed(on: boolean): void {
    this.ledGraphics.clear();
    const color = on ? 0x22dd66 : 0x6366f1;
    const alpha = on ? 0.5 : 0.3;
    this.ledGraphics.fillStyle(color, alpha);
    this.ledGraphics.fillCircle(13, -4, 2);
  }

  applyTheme(theme: OfficeTheme): void {
    this.drawChair(theme.furnitureBaseColor, theme.furnitureAccentColor, theme.furnitureEdgeColor);
  }

  setInUse(on: boolean): void {
    this.inUse = on;
    this.drawLed(on);
  }

  isInUse(): boolean {
    return this.inUse;
  }

  destroy(fromScene?: boolean): void {
    if (this.ledTween) {
      this.ledTween.stop();
      this.ledTween = null;
    }
    super.destroy(fromScene);
  }
}
