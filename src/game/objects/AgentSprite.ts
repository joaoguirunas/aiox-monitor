import * as Phaser from 'phaser';
import { tileToPixel, pixelToTile } from '../utils/iso-utils';
import { getAgentColor, STATUS_COLORS } from '../data/agent-visuals';
import { getAgentSpriteConfig } from '../data/agent-sprite-config';
import { getZoneForTile } from '../data/office-layout';
import {
  pixelLabTextureKey, angleToDirection,
  PIXELLAB_DISPLAY_SCALE, PIXELLAB_SPRITES,
} from '../data/pixellab-sprites';
import type { AgentAnimState } from '../animations/agent-animations';
import type { AgentStatus } from '@/lib/types';

export class AgentSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private statusBadge: Phaser.GameObjects.Graphics;
  private nameLabel: Phaser.GameObjects.Text;
  private glowCircle: Phaser.GameObjects.Arc;
  private agentColor: number;
  private spriteKey: string;
  private currentStatus: AgentStatus = 'idle';
  private animState: AgentAnimState = 'idle';
  private currentTween: Phaser.Tweens.Tween | null = null;
  private glowTween: Phaser.Tweens.Tween | null = null;
  private labelTween: Phaser.Tweens.Tween | null = null;
  private lastZone: string | null = null;

  // PixelLab mode
  private isPixelLab = false;
  private plAgentKey = '';
  private breathTween: Phaser.Tweens.Tween | null = null;
  private walkBobTween: Phaser.Tweens.Tween | null = null;
  private activityTween: Phaser.Tweens.Tween | null = null;
  private currentDirection = 'south';

  constructor(
    scene: Phaser.Scene,
    public readonly agentName: string,
    public readonly displayName: string,
    tileX: number,
    tileY: number,
  ) {
    const { x, y } = tileToPixel(tileX, tileY);
    super(scene, x, y);

    this.agentColor = getAgentColor(agentName);
    const config = getAgentSpriteConfig(agentName);

    // Agent glow (aura under feet)
    this.glowCircle = scene.add.circle(0, 6, 18, this.agentColor, 0.06);
    this.add(this.glowCircle);

    // Detect PixelLab mode
    const plEntry = Object.values(PIXELLAB_SPRITES).find(e => e.agentKey === config.key);
    const plSouthKey = pixelLabTextureKey(config.key, 'south');
    this.isPixelLab = !!plEntry && scene.textures.exists(plSouthKey);

    if (this.isPixelLab) {
      // PixelLab: use directional textures with tween-based animations
      this.plAgentKey = config.key;
      this.sprite = scene.add.sprite(0, -10, plSouthKey);
      this.sprite.setOrigin(0.5, 0.5);
      this.sprite.setScale(PIXELLAB_DISPLAY_SCALE);
      this.spriteKey = config.key;
      this.startIdleBreathing();
    } else {
      // Procedural spritesheet mode
      this.spriteKey = scene.textures.exists(config.key)
        ? config.key
        : scene.textures.exists('agent-default')
          ? 'agent-default'
          : '';

      if (this.spriteKey) {
        this.sprite = scene.add.sprite(0, -10, this.spriteKey, 0);
        this.sprite.setOrigin(0.5, 0.5);

        if (this.spriteKey === 'agent-default' && config.key !== 'agent-default') {
          this.sprite.setTint(this.agentColor);
        }
      } else {
        this.sprite = scene.add.sprite(0, -10, '__DEFAULT');
        this.sprite.setVisible(false);
        this.createFallbackGraphics();
      }
    }
    this.add(this.sprite);

    // Status badge
    this.statusBadge = scene.add.graphics();
    this.drawStatusBadge();
    this.add(this.statusBadge);

    // Holographic name label
    const colorHex = '#' + this.agentColor.toString(16).padStart(6, '0');
    this.nameLabel = scene.add.text(0, -38, displayName, {
      fontSize: '9px',
      color: colorHex,
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.nameLabel.setAlpha(0.7);
    this.add(this.nameLabel);

    // Floating label animation
    this.labelTween = scene.tweens.add({
      targets: this.nameLabel,
      y: this.nameLabel.y - 2,
      duration: 2500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Initialize zone
    const tile = pixelToTile(x, y);
    this.lastZone = getZoneForTile(tile.tileX, tile.tileY);

    this.setDepth(y + 1);
    scene.add.existing(this);
  }

  private createFallbackGraphics(): void {
    const g = this.scene.add.graphics();
    g.fillStyle(0xddccbb, 1);
    g.fillCircle(0, -20, 7);
    g.fillStyle(this.agentColor, 1);
    g.fillRoundedRect(-8, -13, 16, 18, 3);
    g.fillStyle(0x1a1e30, 1);
    g.fillRect(-5, 5, 4, 7);
    g.fillRect(1, 5, 4, 7);
    this.add(g);
  }

  private drawStatusBadge(): void {
    this.statusBadge.clear();
    const color = STATUS_COLORS[this.currentStatus] ?? STATUS_COLORS.idle;
    this.statusBadge.fillStyle(color, 0.25);
    this.statusBadge.fillCircle(12, -22, 6);
    this.statusBadge.fillStyle(color, 1);
    this.statusBadge.fillCircle(12, -22, 3.5);
    this.statusBadge.lineStyle(1, 0xffffff, 0.5);
    this.statusBadge.strokeCircle(12, -22, 3.5);
  }

  private updateGlow(): void {
    if (this.glowTween) {
      this.glowTween.stop();
      this.glowTween = null;
    }

    if (this.currentStatus === 'working') {
      this.glowCircle.setAlpha(0.1);
      this.glowTween = this.scene.tweens.add({
        targets: this.glowCircle,
        alpha: { from: 0.08, to: 0.18 },
        scaleX: { from: 1, to: 1.15 },
        scaleY: { from: 1, to: 1.1 },
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.glowCircle.setAlpha(0.04);
      this.glowCircle.setScale(1);
    }
  }

  setStatus(status: AgentStatus): void {
    this.currentStatus = status;
    this.drawStatusBadge();
    this.updateGlow();
  }

  setTilePosition(tileX: number, tileY: number): void {
    const { x, y } = tileToPixel(tileX, tileY);
    this.setPosition(x, y);
    this.setDepth(y + 1);
  }

  // ─── PixelLab direction switching ─────────────────────────────

  private setPixelLabDirection(direction: string): void {
    if (!this.isPixelLab) return;
    const texKey = pixelLabTextureKey(this.plAgentKey, direction);
    if (this.scene.textures.exists(texKey)) {
      this.sprite.setTexture(texKey);
      this.sprite.setFlipX(false);
      this.currentDirection = direction;
    } else if (direction === 'west') {
      // Fallback: flip east
      const eastKey = pixelLabTextureKey(this.plAgentKey, 'east');
      if (this.scene.textures.exists(eastKey)) {
        this.sprite.setTexture(eastKey);
        this.sprite.setFlipX(true);
        this.currentDirection = direction;
      }
    }
  }

  // ─── PixelLab tween animations ────────────────────────────────

  private stopPixelLabTweens(): void {
    if (this.breathTween) { this.breathTween.stop(); this.breathTween = null; }
    if (this.walkBobTween) { this.walkBobTween.stop(); this.walkBobTween = null; }
    if (this.activityTween) { this.activityTween.stop(); this.activityTween = null; }
    // Reset sprite transform
    this.sprite.setScale(PIXELLAB_DISPLAY_SCALE);
    this.sprite.y = -10;
  }

  private startIdleBreathing(): void {
    if (!this.isPixelLab) return;
    this.stopPixelLabTweens();
    this.setPixelLabDirection('south');

    const baseScale = PIXELLAB_DISPLAY_SCALE;
    this.breathTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleY: baseScale * 1.015,
      y: -10.5,
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private startWalkBob(): void {
    if (!this.isPixelLab) return;
    if (this.walkBobTween) { this.walkBobTween.stop(); this.walkBobTween = null; }

    this.walkBobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: { from: -10, to: -12 },
      scaleX: { from: PIXELLAB_DISPLAY_SCALE, to: PIXELLAB_DISPLAY_SCALE * 0.97 },
      scaleY: { from: PIXELLAB_DISPLAY_SCALE, to: PIXELLAB_DISPLAY_SCALE * 1.03 },
      duration: 180,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private startSitAnimation(): void {
    if (!this.isPixelLab) return;
    this.stopPixelLabTweens();
    this.setPixelLabDirection('south');

    const baseScale = PIXELLAB_DISPLAY_SCALE;
    // Subtle settle - slight scale compress + gentle sway
    this.sprite.y = -8; // Seated slightly lower
    this.activityTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleY: baseScale * 0.98,
      y: -7.5,
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private startTypeAnimation(): void {
    if (!this.isPixelLab) return;
    this.stopPixelLabTweens();
    this.setPixelLabDirection('north');

    const baseScale = PIXELLAB_DISPLAY_SCALE;
    // Typing bounce - rapid subtle shoulder movement
    this.sprite.y = -8;
    this.activityTween = this.scene.tweens.add({
      targets: this.sprite,
      y: { from: -8, to: -8.8 },
      scaleX: { from: baseScale, to: baseScale * 1.005 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ─── Movement ─────────────────────────────────────────────────

  walkTo(tileX: number, tileY: number): Promise<void> {
    return new Promise((resolve) => {
      this.stopCurrentAnimation();
      this.animState = 'walk';

      const { x: targetX, y: targetY } = tileToPixel(tileX, tileY);
      const deltaX = targetX - this.x;
      const deltaY = targetY - this.y;
      const distance = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
      const duration = Phaser.Math.Clamp(distance * 4, 500, 3000);

      if (this.isPixelLab) {
        // PixelLab: use 4-direction texture swap + walk bob tween
        const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
        const dir = angleToDirection(angle);
        this.setPixelLabDirection(dir);
        this.startWalkBob();
      } else {
        // Procedural: use spritesheet frame animation
        const direction = this.getWalkDirection(deltaX, deltaY);
        this.playAnimIfExists(`walk-${direction}`);
        if (direction === 'side' && deltaX < 0) {
          this.sprite.setFlipX(true);
        } else {
          this.sprite.setFlipX(false);
        }
      }

      this.currentTween = this.scene.tweens.add({
        targets: this,
        x: targetX,
        y: targetY,
        duration,
        ease: 'Power1',
        onUpdate: () => {
          this.setDepth(this.y + 1);
          this.checkZoneCrossing();

          // PixelLab: update direction during walk for smooth turns
          if (this.isPixelLab) {
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
              const a = Math.atan2(dy, dx) * (180 / Math.PI);
              const newDir = angleToDirection(a);
              if (newDir !== this.currentDirection) {
                this.setPixelLabDirection(newDir);
              }
            }
          }
        },
        onComplete: () => {
          this.currentTween = null;
          if (this.isPixelLab) {
            this.stopPixelLabTweens();
            this.setPixelLabDirection('south');
            this.startIdleBreathing();
          } else {
            this.sprite.setFlipX(false);
            this.stopSpriteAnim();
          }
          this.animState = 'idle';
          resolve();
        },
      });
    });
  }

  private getWalkDirection(deltaX: number, deltaY: number): 'down' | 'up' | 'side' {
    const absDx = Math.abs(deltaX);
    const absDy = Math.abs(deltaY);

    if (absDx > absDy * 1.5) return 'side';
    if (deltaY > 0) return 'down';
    return 'up';
  }

  private checkZoneCrossing(): void {
    const tile = pixelToTile(this.x, this.y);
    const currentZone = getZoneForTile(tile.tileX, tile.tileY);
    if (currentZone && currentZone !== this.lastZone && this.lastZone !== null) {
      this.scene.tweens.add({
        targets: this.glowCircle,
        alpha: 0.25,
        scaleX: 1.4,
        scaleY: 1.3,
        duration: 200,
        yoyo: true,
        ease: 'Sine.easeInOut',
      });
    }
    this.lastZone = currentZone;
  }

  // ─── State changes ────────────────────────────────────────────

  sitDown(): void {
    this.stopCurrentAnimation();
    this.animState = 'sit';
    if (this.isPixelLab) {
      this.startSitAnimation();
    } else {
      this.sprite.setFlipX(false);
      this.playAnimIfExists('sit');
    }
  }

  startTyping(): void {
    this.stopCurrentAnimation();
    this.animState = 'type';
    if (this.isPixelLab) {
      this.startTypeAnimation();
    } else {
      this.playAnimIfExists('type');
    }
  }

  standIdle(): void {
    this.stopCurrentAnimation();
    this.animState = 'idle';
    if (this.isPixelLab) {
      this.startIdleBreathing();
    } else {
      this.sprite.setFlipX(false);
      this.playAnimIfExists('idle');
    }
  }

  getAnimState(): AgentAnimState {
    return this.animState;
  }

  private playAnimIfExists(animSuffix: string): void {
    if (!this.spriteKey) return;
    const animKey = `${this.spriteKey}-${animSuffix}`;
    if (this.scene.anims.exists(animKey)) {
      this.sprite.play(animKey);
    }
  }

  private stopSpriteAnim(): void {
    if (this.sprite.anims && this.sprite.anims.isPlaying) {
      this.sprite.anims.stop();
    }
  }

  private stopCurrentAnimation(): void {
    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }
    if (this.isPixelLab) {
      this.stopPixelLabTweens();
    } else {
      this.stopSpriteAnim();
    }
  }

  getAgentName(): string {
    return this.agentName;
  }

  destroy(fromScene?: boolean): void {
    this.stopCurrentAnimation();
    if (this.glowTween) this.glowTween.stop();
    if (this.labelTween) this.labelTween.stop();
    super.destroy(fromScene);
  }
}
