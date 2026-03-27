import * as Phaser from 'phaser';
import { tileToPixel } from '../utils/iso-utils';

export type PlantVariant = 'tropical' | 'succulent' | 'hanging' | 'bonsai';

const PLANT_TEXTURE_KEY: Record<PlantVariant, string> = {
  tropical: 'plant-tropical',
  succulent: 'plant-succulent',
  hanging: 'plant-hanging',
  bonsai: 'plant-bonsai',
};

/** Target display height in pixels — sprites are scaled to fit */
const PLANT_DISPLAY_HEIGHT = 28;

export class Plant extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, tileX: number, tileY: number, variant?: PlantVariant, scale: number = 1) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    const chosen = variant ?? pickRandomVariant(tileX, tileY);
    const textureKey = PLANT_TEXTURE_KEY[chosen];
    const h = PLANT_DISPLAY_HEIGHT * scale;

    if (scene.textures.exists(textureKey)) {
      const sprite = scene.add.image(0, -h / 2, textureKey);
      sprite.setDisplaySize(
        h * (sprite.width / sprite.height),
        h,
      );
      sprite.setOrigin(0.5, 0.5);
      sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.add(sprite);
    } else {
      // Fallback procedural plant if sprite not loaded
      const g = scene.add.graphics();
      g.fillStyle(0x1a2040, 1);
      g.fillRect(-6, -4, 12, 8);
      g.fillStyle(0x22d3ee, 0.4);
      g.fillCircle(-4, -12, 6);
      g.fillCircle(4, -14, 6);
      g.fillCircle(0, -16, 6);
      g.fillStyle(0x1a4a3a, 1);
      g.fillRect(-1, -9, 2, 6);
      this.add(g);
    }

    this.setDepth(y);
    scene.add.existing(this);
  }
}

/** Deterministic pseudo-random variant based on tile position (consistent across reloads) */
function pickRandomVariant(tileX: number, tileY: number): PlantVariant {
  const variants: PlantVariant[] = ['tropical', 'succulent', 'hanging', 'bonsai'];
  const hash = ((tileX * 31) + tileY * 17) & 0xffff;
  return variants[hash % variants.length];
}
