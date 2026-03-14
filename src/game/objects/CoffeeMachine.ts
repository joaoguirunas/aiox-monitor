import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export class CoffeeMachine extends Phaser.GameObjects.Container {
  private steamGraphics: Phaser.GameObjects.Graphics | null = null;
  private steamTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const g = scene.add.graphics();
    // Base (caixa metálica)
    g.fillStyle(0x666677, 1);
    g.fillRoundedRect(-8, -16, 16, 16, 2);
    // Bico
    g.fillStyle(0x444455, 1);
    g.fillRect(-2, -18, 4, 3);
    // Chávena
    g.fillStyle(0xffffff, 1);
    g.fillRect(-3, -3, 6, 4);
    // LED indicador
    g.fillStyle(0x22c55e, 1);
    g.fillCircle(5, -14, 2);
    this.add(g);

    this.setDepth(y);
    scene.add.existing(this);
  }

  setSteamActive(active: boolean): void {
    if (active && !this.steamGraphics) {
      const steam = this.scene.add.graphics();
      steam.fillStyle(0xffffff, 0.3);
      steam.fillCircle(0, -22, 3);
      this.add(steam);
      this.steamTween = this.scene.tweens.add({
        targets: steam,
        y: steam.y - 8,
        alpha: 0,
        duration: 1000,
        repeat: -1,
        ease: 'Sine.easeOut',
      });
      this.steamGraphics = steam;
    } else if (!active && this.steamGraphics) {
      if (this.steamTween) {
        this.steamTween.stop();
        this.steamTween = null;
      }
      this.steamGraphics.destroy();
      this.steamGraphics = null;
    }
  }

  destroy(fromScene?: boolean): void {
    this.setSteamActive(false);
    super.destroy(fromScene);
  }
}
