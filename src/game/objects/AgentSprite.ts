import * as Phaser from 'phaser';
import { tileToPixel, pixelToTile } from '../utils/iso-utils';
import { getAgentColor, STATUS_COLORS } from '../data/agent-visuals';
import { getAgentSpriteConfig } from '../data/agent-sprite-config';
import { getZoneForTile } from '../data/office-layout';
import {
  pixelLabTextureKey, angleToDirection,
  PIXELLAB_DISPLAY_SCALE, PIXELLAB_SPRITES,
} from '../data/pixellab-sprites';
import { getAgentSkin } from '../data/skin-config';
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
  // Typing code particles
  private codeParticles: Phaser.GameObjects.Text[] = [];
  private codeParticleTimer: Phaser.Time.TimerEvent | null = null;

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
    this.glowCircle = scene.add.circle(0, 8, 22, this.agentColor, 0.06);
    this.add(this.glowCircle);

    // Check for custom skin first, then PixelLab default
    const skinDef = getAgentSkin(agentName);
    const skinSouthKey = skinDef ? `skin-${skinDef.id}-south` : '';
    const hasSkin = !!skinDef && scene.textures.exists(skinSouthKey);

    const plEntry = Object.values(PIXELLAB_SPRITES).find(e => e.agentKey === config.key);
    const plSouthKey = pixelLabTextureKey(config.key, 'south');
    this.isPixelLab = hasSkin || (!!plEntry && scene.textures.exists(plSouthKey));

    const spriteOffsetY = -14; // Raised to compensate for larger sprites
    if (hasSkin) {
      // Custom skin: use skin textures with tween-based animations
      this.plAgentKey = `skin:${skinDef!.id}`;
      this.sprite = scene.add.sprite(0, spriteOffsetY, skinSouthKey);
      this.sprite.setOrigin(0.5, 0.5);
      this.sprite.setScale(PIXELLAB_DISPLAY_SCALE);
      this.spriteKey = config.key;
      this.startIdleBreathing();
    } else if (this.isPixelLab) {
      // PixelLab default: use directional textures with tween-based animations
      this.plAgentKey = config.key;
      this.sprite = scene.add.sprite(0, spriteOffsetY, plSouthKey);
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
        this.sprite = scene.add.sprite(0, spriteOffsetY, this.spriteKey, 0);
        this.sprite.setOrigin(0.5, 0.5);

        if (this.spriteKey === 'agent-default' && config.key !== 'agent-default') {
          this.sprite.setTint(this.agentColor);
        }
      } else {
        this.sprite = scene.add.sprite(0, spriteOffsetY, '__DEFAULT');
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
    this.nameLabel = scene.add.text(0, -48, displayName, {
      fontSize: '10px',
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

    this.setDepth(y + 100);
    scene.add.existing(this);
  }

  private createFallbackGraphics(): void {
    const g = this.scene.add.graphics();
    g.fillStyle(0xddccbb, 1);
    g.fillCircle(0, -26, 9);
    g.fillStyle(this.agentColor, 1);
    g.fillRoundedRect(-10, -17, 20, 24, 4);
    g.fillStyle(0x1a1e30, 1);
    g.fillRect(-5, 5, 4, 7);
    g.fillRect(1, 5, 4, 7);
    this.add(g);
  }

  private drawStatusBadge(): void {
    this.statusBadge.clear();
    const color = STATUS_COLORS[this.currentStatus] ?? STATUS_COLORS.idle;
    this.statusBadge.fillStyle(color, 0.25);
    this.statusBadge.fillCircle(16, -30, 7);
    this.statusBadge.fillStyle(color, 1);
    this.statusBadge.fillCircle(16, -30, 4);
    this.statusBadge.lineStyle(1, 0xffffff, 0.5);
    this.statusBadge.strokeCircle(16, -30, 4);
  }

  private updateGlow(): void {
    if (this.glowTween) {
      this.glowTween.stop();
      this.glowTween = null;
    }

    if (this.currentStatus === 'working') {
      this.glowCircle.setAlpha(0.15);
      this.glowTween = this.scene.tweens.add({
        targets: this.glowCircle,
        alpha: { from: 0.12, to: 0.25 },
        scaleX: { from: 1, to: 1.2 },
        scaleY: { from: 1, to: 1.15 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (this.currentStatus === 'idle') {
      this.glowCircle.setAlpha(0.06);
      this.glowCircle.setScale(1);
    } else {
      this.glowCircle.setAlpha(0.03);
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
    this.setDepth(y + 10);
  }

  // ─── PixelLab direction switching ─────────────────────────────

  /** Resolve texture key for current direction (supports skins and PixelLab) */
  private resolveDirectionKey(direction: string): string {
    if (this.plAgentKey.startsWith('skin:')) {
      const skinId = this.plAgentKey.slice(5);
      return `skin-${skinId}-${direction}`;
    }
    return pixelLabTextureKey(this.plAgentKey, direction);
  }

  private setPixelLabDirection(direction: string): void {
    if (!this.isPixelLab) return;
    const texKey = this.resolveDirectionKey(direction);
    if (this.scene.textures.exists(texKey)) {
      this.sprite.setTexture(texKey);
      this.sprite.setFlipX(false);
      this.currentDirection = direction;
    } else if (direction === 'west') {
      const eastKey = this.resolveDirectionKey('east');
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
    this.stopCodeParticles();
    // Reset sprite transform
    this.sprite.setScale(PIXELLAB_DISPLAY_SCALE);
    this.sprite.y = -14;
    this.sprite.x = 0;
  }

  private startIdleBreathing(): void {
    if (!this.isPixelLab) return;
    this.stopPixelLabTweens();
    this.setPixelLabDirection('south');

    const baseScale = PIXELLAB_DISPLAY_SCALE;
    this.breathTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleY: baseScale * 1.015,
      y: -14.5,
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
      y: { from: -14, to: -16 },
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
    // Face the desk (north = looking at monitor)
    this.setPixelLabDirection('north');

    const baseScale = PIXELLAB_DISPLAY_SCALE;
    this.sprite.y = -12;
    // Gentle breathing while seated
    this.activityTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleY: baseScale * 0.985,
      y: -11,
      duration: 2800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private startTypeAnimation(): void {
    if (!this.isPixelLab) return;
    this.stopPixelLabTweens();
    // Face the desk (north = looking at monitor)
    this.setPixelLabDirection('north');

    const baseScale = PIXELLAB_DISPLAY_SCALE;
    this.sprite.y = -12;

    // Typing: rhythmic shoulder/arm bob — more visible
    this.activityTween = this.scene.tweens.add({
      targets: this.sprite,
      y: { from: -12, to: -13.5 },
      scaleX: { from: baseScale, to: baseScale * 1.012 },
      scaleY: { from: baseScale, to: baseScale * 0.988 },
      duration: 350,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Add a secondary slow sway for naturalness
    this.breathTween = this.scene.tweens.add({
      targets: this.sprite,
      x: { from: 0, to: 0.6 },
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Start code particles floating above the agent
    this.startCodeParticles();
  }

  // ─── Code Particles (typing indicator) ─────────────────────────

  private static readonly CODE_SNIPPETS = [
    '{', '}', '/>', '</', '()', '=>', '&&', '||', '==', '!=',
    '[]', '...', '::',  '++', '--', '<<', '>>', '**', '??',
    'fn', 'if', 'do', 'let', 'var', 'new', 'for',
    '0x', '/**', '*/', '!=', '::', '/*',
  ];

  private startCodeParticles(): void {
    this.stopCodeParticles();
    const colorHex = '#' + this.agentColor.toString(16).padStart(6, '0');

    this.codeParticleTimer = this.scene.time.addEvent({
      delay: 800,
      callback: () => {
        if (this.codeParticles.length >= 3) return;

        const snippet = AgentSprite.CODE_SNIPPETS[
          Phaser.Math.Between(0, AgentSprite.CODE_SNIPPETS.length - 1)
        ];
        const offsetX = Phaser.Math.Between(-12, 12);
        const particle = this.scene.add.text(offsetX, -52, snippet, {
          fontSize: '7px',
          color: colorHex,
          fontFamily: 'monospace',
          stroke: '#000000',
          strokeThickness: 1,
        }).setOrigin(0.5).setAlpha(0.6);
        this.add(particle);
        this.codeParticles.push(particle);

        this.scene.tweens.add({
          targets: particle,
          y: particle.y - Phaser.Math.Between(14, 22),
          x: particle.x + Phaser.Math.FloatBetween(-6, 6),
          alpha: 0,
          duration: Phaser.Math.Between(1200, 2000),
          ease: 'Sine.easeOut',
          onComplete: () => {
            const idx = this.codeParticles.indexOf(particle);
            if (idx >= 0) this.codeParticles.splice(idx, 1);
            particle.destroy();
          },
        });
      },
      loop: true,
    });
  }

  private stopCodeParticles(): void {
    if (this.codeParticleTimer) {
      this.codeParticleTimer.destroy();
      this.codeParticleTimer = null;
    }
    for (const p of this.codeParticles) {
      p.destroy();
    }
    this.codeParticles = [];
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
          this.setDepth(this.y + 10);
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
    this.stopCodeParticles();
    if (this.glowTween) this.glowTween.stop();
    if (this.labelTween) this.labelTween.stop();
    super.destroy(fromScene);
  }
}
