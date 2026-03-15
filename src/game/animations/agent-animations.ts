import * as Phaser from 'phaser';

export type AgentAnimState = 'walk' | 'sit' | 'type' | 'idle';

/**
 * Cria animações frame-based para um agente a partir do seu spritesheet.
 *
 * Spritesheet layout (18 frames, 32×32 cada):
 *   Row 0: idle(0-1) + walk-down(2-5)
 *   Row 1: walk-up(6-9) + walk-side(10-11)
 *   Row 2: walk-side(12-13) + sit(14-15) + type(16-17)
 */
export function createAgentAnimations(scene: Phaser.Scene, key: string): void {
  // Evitar duplicação se já existem
  if (scene.anims.exists(`${key}-idle`)) return;

  scene.anims.create({
    key: `${key}-idle`,
    frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 1 }),
    frameRate: 2,
    repeat: -1,
  });

  scene.anims.create({
    key: `${key}-walk-down`,
    frames: scene.anims.generateFrameNumbers(key, { start: 2, end: 5 }),
    frameRate: 8,
    repeat: -1,
  });

  scene.anims.create({
    key: `${key}-walk-up`,
    frames: scene.anims.generateFrameNumbers(key, { start: 6, end: 9 }),
    frameRate: 8,
    repeat: -1,
  });

  scene.anims.create({
    key: `${key}-walk-side`,
    frames: scene.anims.generateFrameNumbers(key, { start: 10, end: 13 }),
    frameRate: 8,
    repeat: -1,
  });

  scene.anims.create({
    key: `${key}-sit`,
    frames: scene.anims.generateFrameNumbers(key, { start: 14, end: 15 }),
    frameRate: 2,
    repeat: -1,
  });

  scene.anims.create({
    key: `${key}-type`,
    frames: scene.anims.generateFrameNumbers(key, { start: 16, end: 17 }),
    frameRate: 4,
    repeat: -1,
  });
}
