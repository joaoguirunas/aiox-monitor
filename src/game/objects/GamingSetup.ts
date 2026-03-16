import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class GamingSetup extends Phaser.GameObjects.Container {
  private cabinetGraphics: Phaser.GameObjects.Graphics;
  private screenGraphics: Phaser.GameObjects.Graphics;
  private consoleGraphics: Phaser.GameObjects.Graphics;
  private screenTween: Phaser.Tweens.Tween | null = null;
  private screenGlowColor = 0x00ccff;
  private screenOffColor = 0x0a0f1a;
  private occupied = false;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    // Shadow
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.12);
    shadow.fillEllipse(0, 8, 50, 12);
    this.add(shadow);

    this.cabinetGraphics = scene.add.graphics();
    this.add(this.cabinetGraphics);

    this.screenGraphics = scene.add.graphics();
    this.add(this.screenGraphics);

    this.consoleGraphics = scene.add.graphics();
    this.add(this.consoleGraphics);

    this.drawCabinet(0x1a2040, 0x252e50, 0x2a3565);
    this.drawScreenContent(true);
    this.drawConsoleAndController(0x1a2040, 0x252e50, 0x2a3565);

    // Screen glow pulse
    this.screenTween = scene.tweens.add({
      targets: this.screenGraphics,
      alpha: { from: 0.7, to: 1 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.setDepth(y);
    scene.add.existing(this);
  }

  private drawCabinet(baseColor: number, accentColor: number, edgeColor: number): void {
    this.cabinetGraphics.clear();
    const g = this.cabinetGraphics;

    // TV Stand / cabinet
    g.fillStyle(baseColor, 1);
    g.fillRect(-18, 0, 36, 6);
    // Stand front face (3D depth)
    g.fillStyle(baseColor, 1);
    g.fillRect(-18, 6, 36, 3);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(-18, 6, 36, 3);
    // Stand side panel (3D depth)
    g.fillStyle(baseColor, 1);
    g.fillRect(18, 0, 3, 6);
    g.fillStyle(0x000000, 0.3);
    g.fillRect(18, 0, 3, 6);
    // Stand highlight
    g.lineStyle(1, edgeColor, 0.2);
    g.strokeRect(-18, 0, 36, 6);

    // TV body (thin panel)
    g.fillStyle(accentColor, 1);
    g.fillRect(-16, -24, 32, 24);
    // TV bezel
    g.lineStyle(1, edgeColor, 0.5);
    g.strokeRect(-16, -24, 32, 24);
    // TV top edge (3D)
    g.fillStyle(accentColor, 0.9);
    g.fillRect(-16, -26, 32, 2);
    g.fillStyle(0xffffff, 0.03);
    g.fillRect(-16, -26, 32, 1);
    // TV side panel (3D)
    g.fillStyle(accentColor, 1);
    g.fillRect(16, -24, 3, 24);
    g.fillStyle(0x000000, 0.35);
    g.fillRect(16, -24, 3, 24);

    // Screen area background
    g.fillStyle(0x0a1428, 1);
    g.fillRect(-14, -22, 28, 20);

    // TV stand leg (center)
    g.fillStyle(baseColor, 1);
    g.fillRect(-3, -1, 6, 2);
  }

  private drawScreenContent(on: boolean): void {
    this.screenGraphics.clear();
    const g = this.screenGraphics;

    if (on) {
      // Game scene on screen
      g.fillStyle(0x1a3a6a, 0.6);
      g.fillRect(-12, -20, 24, 16);
      // Game elements
      g.fillStyle(0x22dd66, 0.4);
      g.fillRect(-8, -16, 4, 4);
      g.fillStyle(0xff4466, 0.3);
      g.fillRect(4, -14, 4, 4);
      g.fillStyle(0xffcc22, 0.3);
      g.fillRect(-2, -18, 3, 3);
      // Scanline effect
      g.fillStyle(0x000000, 0.1);
      for (let sy = -20; sy < -4; sy += 2) {
        g.fillRect(-12, sy, 24, 1);
      }
    } else {
      g.fillStyle(this.screenOffColor, 1);
      g.fillRect(-12, -20, 24, 16);
      // Standby dot
      g.fillStyle(0x2a3565, 0.3);
      g.fillCircle(0, -12, 1);
    }
  }

  private drawConsoleAndController(baseColor: number, accentColor: number, edgeColor: number): void {
    this.consoleGraphics.clear();
    const g = this.consoleGraphics;

    // Game console (on the stand)
    g.fillStyle(baseColor, 1);
    g.fillRect(-8, 1, 7, 3);
    g.lineStyle(1, edgeColor, 0.3);
    g.strokeRect(-8, 1, 7, 3);
    // Console power LED
    g.fillStyle(this.screenGlowColor, 0.6);
    g.fillCircle(-5, 2.5, 1);

    // Controller (on floor)
    g.fillStyle(accentColor, 0.6);
    g.fillRoundedRect(6, 4, 8, 4, 2);
    g.fillStyle(0x6366f1, 0.3);
    g.fillCircle(8, 5.5, 1);
    g.fillCircle(12, 5.5, 1);
  }

  applyTheme(theme: OfficeTheme): void {
    this.screenGlowColor = theme.screenGlowColor;
    this.screenOffColor = theme.screenOffColor;
    this.drawCabinet(theme.furnitureBaseColor, theme.furnitureAccentColor, theme.furnitureEdgeColor);
    this.drawConsoleAndController(theme.furnitureBaseColor, theme.furnitureAccentColor, theme.furnitureEdgeColor);
    this.drawScreenContent(this.occupied);
  }

  setScreenOn(color?: number): void {
    if (color) this.screenGlowColor = color;
    this.occupied = true;
    this.drawScreenContent(true);
  }

  setScreenOff(): void {
    this.occupied = false;
    this.drawScreenContent(false);
  }

  isOccupied(): boolean {
    return this.occupied;
  }

  destroy(fromScene?: boolean): void {
    if (this.screenTween) {
      this.screenTween.stop();
      this.screenTween = null;
    }
    super.destroy(fromScene);
  }
}
