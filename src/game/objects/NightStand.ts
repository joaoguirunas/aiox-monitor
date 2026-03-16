import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class NightStand extends Phaser.GameObjects.Container {
  private graphics: Phaser.GameObjects.Graphics;
  private glowGraphics: Phaser.GameObjects.Graphics;
  private glowTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    // Shadow
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.1);
    shadow.fillEllipse(0, 6, 20, 6);
    this.add(shadow);

    this.graphics = scene.add.graphics();
    this.drawStand(0x1a2040, 0x252e50, 0x2a3565);
    this.add(this.graphics);

    // Lamp glow
    this.glowGraphics = scene.add.graphics();
    this.glowGraphics.fillStyle(0xffcc66, 0.08);
    this.glowGraphics.fillEllipse(0, -16, 20, 12);
    this.add(this.glowGraphics);

    this.glowTween = scene.tweens.add({
      targets: this.glowGraphics,
      alpha: { from: 0.5, to: 0.9 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.setDepth(y);
    scene.add.existing(this);
  }

  private drawStand(baseColor: number, accentColor: number, edgeColor: number): void {
    this.graphics.clear();
    const g = this.graphics;

    // Body
    g.fillStyle(baseColor, 1);
    g.fillRect(-8, -10, 16, 14);
    // Front face (3D)
    g.fillStyle(baseColor, 1);
    g.fillRect(-8, 4, 16, 3);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(-8, 4, 16, 3);
    // Side panel (3D)
    g.fillStyle(baseColor, 0.7);
    g.fillRect(8, -8, 3, 12);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(8, -8, 3, 12);

    // Top surface
    g.fillStyle(accentColor, 0.5);
    g.fillRect(-8, -12, 16, 3);
    g.fillStyle(0xffffff, 0.03);
    g.fillRect(-8, -12, 16, 1);

    // Drawer
    g.fillStyle(accentColor, 0.7);
    g.fillRect(-6, -6, 12, 5);
    g.lineStyle(1, edgeColor, 0.2);
    g.strokeRect(-6, -6, 12, 5);
    // Drawer handle
    g.fillStyle(edgeColor, 0.4);
    g.fillRect(-2, -4, 4, 1);

    // Lamp on top
    // Lamp base
    g.fillStyle(accentColor, 0.6);
    g.fillRect(-2, -14, 4, 3);
    // Lamp pole
    g.fillStyle(edgeColor, 0.4);
    g.fillRect(-0.5, -20, 1, 7);
    // Lampshade
    g.fillStyle(0x5a4a3a, 0.4);
    g.beginPath();
    g.moveTo(-5, -20);
    g.lineTo(5, -20);
    g.lineTo(3, -24);
    g.lineTo(-3, -24);
    g.closePath();
    g.fillPath();
  }

  applyTheme(theme: OfficeTheme): void {
    this.drawStand(theme.furnitureBaseColor, theme.furnitureAccentColor, theme.furnitureEdgeColor);
  }

  destroy(fromScene?: boolean): void {
    if (this.glowTween) {
      this.glowTween.stop();
      this.glowTween = null;
    }
    super.destroy(fromScene);
  }
}
