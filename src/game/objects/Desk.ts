import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class Desk extends Phaser.GameObjects.Container {
  private tableGraphics: Phaser.GameObjects.Graphics;
  private monitorGraphics: Phaser.GameObjects.Graphics;
  private screen: Phaser.GameObjects.Graphics;
  private occupied = false;
  private screenOffColor = 0x0a0f1a;
  private ledLeft: Phaser.GameObjects.Graphics;
  private ledRight: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    // Shadow
    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.12);
    shadow.fillEllipse(0, 6, 44, 10);
    this.add(shadow);

    // Table surface
    this.tableGraphics = scene.add.graphics();
    this.add(this.tableGraphics);

    // Monitor frame
    this.monitorGraphics = scene.add.graphics();
    this.add(this.monitorGraphics);

    // Screen content
    this.screen = scene.add.graphics();
    this.add(this.screen);

    // Side LEDs
    this.ledLeft = scene.add.graphics();
    this.ledRight = scene.add.graphics();
    this.add(this.ledLeft);
    this.add(this.ledRight);

    this.drawDesk(0x1a2040, 0x252e50, 0x2a3565);
    this.setScreenOff();

    this.setDepth(y);
    scene.add.existing(this);
  }

  private drawDesk(baseColor: number, accentColor: number, edgeColor: number): void {
    this.tableGraphics.clear();

    // Table legs (visible at corners)
    this.tableGraphics.fillStyle(baseColor, 0.7);
    this.tableGraphics.fillRect(-20, 2, 3, 6);
    this.tableGraphics.fillRect(17, 2, 3, 6);

    // Table surface (top face)
    this.tableGraphics.fillStyle(baseColor, 1);
    this.tableGraphics.fillRect(-22, -6, 44, 8);

    // Table front face (3D depth visible below surface)
    this.tableGraphics.fillStyle(baseColor, 1);
    this.tableGraphics.fillRect(-22, 2, 44, 4);
    this.tableGraphics.fillStyle(0x000000, 0.25);
    this.tableGraphics.fillRect(-22, 2, 44, 4);

    // Top edge highlight
    this.tableGraphics.lineStyle(1, edgeColor, 0.4);
    this.tableGraphics.lineBetween(-22, -6, 22, -6);
    // Front edge bottom shadow
    this.tableGraphics.lineStyle(1, 0x000000, 0.2);
    this.tableGraphics.lineBetween(-22, 6, 22, 6);

    // Keyboard on desk surface
    this.tableGraphics.fillStyle(0x0a0e1a, 0.8);
    this.tableGraphics.fillRect(-6, -5, 12, 4);
    this.tableGraphics.lineStyle(1, edgeColor, 0.08);
    this.tableGraphics.strokeRect(-6, -5, 12, 4);
    // Key rows
    this.tableGraphics.fillStyle(edgeColor, 0.07);
    this.tableGraphics.fillRect(-5, -4, 10, 1);
    this.tableGraphics.fillRect(-5, -2, 10, 1);

    // Monitor frame
    this.monitorGraphics.clear();
    // Monitor top edge (visible from above — 3D depth)
    this.monitorGraphics.fillStyle(accentColor, 0.9);
    this.monitorGraphics.fillRect(-10, -24, 23, 2);
    this.monitorGraphics.fillStyle(0xffffff, 0.03);
    this.monitorGraphics.fillRect(-10, -24, 23, 1);
    // Monitor front face
    this.monitorGraphics.fillStyle(accentColor, 1);
    this.monitorGraphics.fillRect(-10, -22, 20, 16);
    // Monitor side panel (3D depth)
    this.monitorGraphics.fillStyle(accentColor, 1);
    this.monitorGraphics.fillRect(10, -22, 3, 16);
    this.monitorGraphics.fillStyle(0x000000, 0.35);
    this.monitorGraphics.fillRect(10, -22, 3, 16);
    // Monitor bezel
    this.monitorGraphics.lineStyle(1, edgeColor, 0.5);
    this.monitorGraphics.strokeRect(-10, -22, 20, 16);
    // Monitor stand
    this.monitorGraphics.fillStyle(baseColor, 1);
    this.monitorGraphics.fillRect(-2, -6, 4, 2);
    // Stand base
    this.monitorGraphics.fillStyle(baseColor, 0.8);
    this.monitorGraphics.fillRect(-4, -5, 8, 1);

    // LEDs (off by default)
    this.drawLeds(false);
  }

  private drawLeds(on: boolean): void {
    this.ledLeft.clear();
    this.ledRight.clear();
    const color = on ? 0x34d399 : 0x1a2040;
    const alpha = on ? 0.8 : 0.3;
    this.ledLeft.fillStyle(color, alpha);
    this.ledLeft.fillCircle(-18, -1, 1.5);
    this.ledRight.fillStyle(color, alpha);
    this.ledRight.fillCircle(18, -1, 1.5);
  }

  applyTheme(theme: OfficeTheme): void {
    this.screenOffColor = theme.screenOffColor;
    this.drawDesk(theme.furnitureBaseColor, theme.furnitureAccentColor, theme.furnitureEdgeColor);
    if (!this.occupied) {
      this.setScreenOff();
    }
  }

  setScreenOn(color: number = 0x00ccff): void {
    this.screen.clear();
    // Screen glow
    this.screen.fillStyle(color, 0.7);
    this.screen.fillRect(-8, -20, 16, 12);
    // Scanline effect on screen
    this.screen.fillStyle(0x000000, 0.08);
    for (let sy = -20; sy < -8; sy += 3) {
      this.screen.fillRect(-8, sy, 16, 1);
    }
    // Screen top highlight
    this.screen.fillStyle(0xffffff, 0.05);
    this.screen.fillRect(-8, -20, 16, 2);
    this.occupied = true;
    this.drawLeds(true);
  }

  setScreenOff(): void {
    this.screen.clear();
    this.screen.fillStyle(this.screenOffColor, 1);
    this.screen.fillRect(-8, -20, 16, 12);
    // Subtle standby dot
    this.screen.fillStyle(0x2a3565, 0.3);
    this.screen.fillCircle(0, -14, 1);
    this.occupied = false;
    this.drawLeds(false);
  }

  isOccupied(): boolean {
    return this.occupied;
  }
}
