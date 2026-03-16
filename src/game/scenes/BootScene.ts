import * as Phaser from 'phaser';
import { AGENT_SPRITE_CONFIGS } from '../data/agent-sprite-config';
import {
  generateAgentSpritesheet,
  FRAME_SIZE, ATLAS_COLS, ATLAS_ROWS,
} from '../utils/sprite-generator';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#08090f');

    const { centerX, centerY } = this.cameras.main;

    // Loading indicator — orbital dot
    const dot = this.add.circle(centerX, centerY - 20, 4, 0x6366f1, 0.8);
    this.tweens.add({
      targets: dot,
      alpha: { from: 0.3, to: 0.8 },
      scaleX: { from: 0.8, to: 1.2 },
      scaleY: { from: 0.8, to: 1.2 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(centerX, centerY + 10, 'a inicializar estação...', {
        fontSize: '13px',
        color: '#4a5272',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    // Gerar spritesheets procedurais para todos os agentes
    this.generateAgentSpritesheets();

    this.time.delayedCall(500, () => {
      this.scene.start('OfficeScene');
    });
  }

  private generateAgentSpritesheets(): void {
    for (const config of Object.values(AGENT_SPRITE_CONFIGS)) {
      try {
        this.addCanvasSpritesheet(config.key, generateAgentSpritesheet(config));
      } catch {
        // Silent fallback — agent will use default sprite
      }
    }

    // Gerar spritesheet default para agentes desconhecidos
    try {
      this.addCanvasSpritesheet('agent-default', generateAgentSpritesheet({
        key: 'agent-default',
        accessory: 'none',
        primaryColor: 0x818cf8,
        secondaryColor: 0x6366f1,
        skinTone: 0xe0c8b0,
        hairStyle: 'short',
        hairColor: 0x4a3728,
      }));
    } catch {
      // Silent — programmatic fallback will be used
    }
  }

  private addCanvasSpritesheet(key: string, sourceCanvas: HTMLCanvasElement): void {
    const canvasTex = this.textures.createCanvas(
      key,
      sourceCanvas.width,
      sourceCanvas.height,
    );
    if (!canvasTex) return;
    const ctx = canvasTex.getContext();
    ctx.drawImage(sourceCanvas, 0, 0);
    canvasTex.refresh();

    const texture = this.textures.get(key);
    let frameIndex = 0;
    for (let row = 0; row < ATLAS_ROWS; row++) {
      for (let col = 0; col < ATLAS_COLS; col++) {
        texture.add(
          frameIndex,
          0,
          col * FRAME_SIZE,
          row * FRAME_SIZE,
          FRAME_SIZE,
          FRAME_SIZE,
        );
        frameIndex++;
      }
    }
  }
}
