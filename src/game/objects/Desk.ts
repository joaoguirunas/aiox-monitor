import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';
import type { OfficeTheme } from '../data/themes';

export class Desk extends Phaser.GameObjects.Container {
  private tableGraphics: Phaser.GameObjects.Graphics;
  private monitorGraphics: Phaser.GameObjects.Graphics;
  private screen: Phaser.GameObjects.Graphics;
  private occupied = false;
  private screenOffColor = 0x111111;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    this.tableGraphics = scene.add.graphics();
    this.tableGraphics.fillStyle(0x4a3728, 1);
    this.tableGraphics.fillRect(-20, -6, 40, 12);
    this.add(this.tableGraphics);

    this.monitorGraphics = scene.add.graphics();
    this.monitorGraphics.fillStyle(0x333333, 1);
    this.monitorGraphics.fillRect(-8, -20, 16, 14);
    this.add(this.monitorGraphics);

    this.screen = scene.add.graphics();
    this.setScreenOff();
    this.add(this.screen);

    this.setDepth(y);
    scene.add.existing(this);
  }

  applyTheme(theme: OfficeTheme): void {
    this.screenOffColor = theme.screenOffColor;
    this.tableGraphics.clear();
    this.tableGraphics.fillStyle(theme.furnitureBaseColor, 1);
    this.tableGraphics.fillRect(-20, -6, 40, 12);
    this.monitorGraphics.clear();
    this.monitorGraphics.fillStyle(theme.furnitureAccentColor, 1);
    this.monitorGraphics.fillRect(-8, -20, 16, 14);
    if (!this.occupied) {
      this.setScreenOff();
    }
  }

  setScreenOn(color: number = 0x44ff44): void {
    this.screen.clear();
    this.screen.fillStyle(color, 0.8);
    this.screen.fillRect(-6, -18, 12, 10);
    this.occupied = true;
  }

  setScreenOff(): void {
    this.screen.clear();
    this.screen.fillStyle(this.screenOffColor, 1);
    this.screen.fillRect(-6, -18, 12, 10);
    this.occupied = false;
  }

  isOccupied(): boolean {
    return this.occupied;
  }
}
