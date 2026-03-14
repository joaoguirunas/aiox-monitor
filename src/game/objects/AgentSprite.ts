import * as Phaser from 'phaser';
import { tileToPixel, pixelToTile } from '../utils/iso-utils';
import { getAgentColor, STATUS_COLORS } from '../data/agent-visuals';
import { getAgentSpriteConfig } from '../data/agent-sprite-config';
import { getZoneForTile } from '../data/office-layout';
import type { AgentAnimState } from '../animations/agent-animations';
import type { AgentStatus } from '@/lib/types';

export class AgentSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private statusBadge: Phaser.GameObjects.Graphics;
  private nameLabel: Phaser.GameObjects.Text;
  private agentColor: number;
  private spriteKey: string;
  private currentStatus: AgentStatus = 'idle';
  private animState: AgentAnimState = 'idle';
  private currentTween: Phaser.Tweens.Tween | null = null;
  private lastZone: string | null = null;

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

    // Usar spritesheet do agente, fallback para default, fallback para programático
    this.spriteKey = scene.textures.exists(config.key)
      ? config.key
      : scene.textures.exists('agent-default')
        ? 'agent-default'
        : '';

    if (this.spriteKey) {
      this.sprite = scene.add.sprite(0, -8, this.spriteKey, 0);
      this.sprite.setOrigin(0.5, 0.5);

      if (this.spriteKey === 'agent-default' && config.key !== 'agent-default') {
        this.sprite.setTint(this.agentColor);
      }
    } else {
      this.sprite = scene.add.sprite(0, -8, '__DEFAULT');
      this.sprite.setVisible(false);
      this.createFallbackGraphics();
    }
    this.add(this.sprite);

    // Status badge
    this.statusBadge = scene.add.graphics();
    this.drawStatusBadge();
    this.add(this.statusBadge);

    // Nome flutuante
    this.nameLabel = scene.add.text(0, -32, displayName, {
      fontSize: '10px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5);
    this.add(this.nameLabel);

    // Inicializar zona actual
    const tile = pixelToTile(x, y);
    this.lastZone = getZoneForTile(tile.tileX, tile.tileY);

    this.setDepth(y + 1);
    scene.add.existing(this);
  }

  private createFallbackGraphics(): void {
    const g = this.scene.add.graphics();
    g.fillStyle(0xddccbb, 1);
    g.fillCircle(0, -18, 6);
    g.fillStyle(this.agentColor, 1);
    g.fillRoundedRect(-7, -12, 14, 16, 3);
    g.fillStyle(0x333344, 1);
    g.fillRect(-5, 4, 4, 6);
    g.fillRect(1, 4, 4, 6);
    this.add(g);
  }

  private drawStatusBadge(): void {
    this.statusBadge.clear();
    const color = STATUS_COLORS[this.currentStatus] ?? STATUS_COLORS.idle;
    this.statusBadge.fillStyle(color, 1);
    this.statusBadge.fillCircle(10, -18, 4);
    this.statusBadge.lineStyle(1, 0xffffff, 0.8);
    this.statusBadge.strokeCircle(10, -18, 4);
  }

  setStatus(status: AgentStatus): void {
    this.currentStatus = status;
    this.drawStatusBadge();
  }

  setTilePosition(tileX: number, tileY: number): void {
    const { x, y } = tileToPixel(tileX, tileY);
    this.setPosition(x, y);
    this.setDepth(y + 1);
  }

  walkTo(tileX: number, tileY: number): Promise<void> {
    return new Promise((resolve) => {
      this.stopCurrentAnimation();
      this.animState = 'walk';

      const { x: targetX, y: targetY } = tileToPixel(tileX, tileY);
      const deltaX = targetX - this.x;
      const deltaY = targetY - this.y;
      const distance = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
      const duration = Phaser.Math.Clamp(distance * 4, 500, 3000);

      // Determinar direcção dominante e tocar animação correcta
      const direction = this.getWalkDirection(deltaX, deltaY);
      this.playAnimIfExists(`walk-${direction}`);

      // Flip horizontal para walk-side esquerda
      if (direction === 'side' && deltaX < 0) {
        this.sprite.setFlipX(true);
      } else {
        this.sprite.setFlipX(false);
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
        },
        onComplete: () => {
          this.currentTween = null;
          this.sprite.setFlipX(false);
          this.stopSpriteAnim();
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
      // Flash sutil ao cruzar fronteira de zona
      this.scene.tweens.add({
        targets: this.sprite,
        alpha: 0.6,
        duration: 150,
        yoyo: true,
        ease: 'Sine.easeInOut',
      });
    }
    this.lastZone = currentZone;
  }

  sitDown(): void {
    this.stopCurrentAnimation();
    this.animState = 'sit';
    this.sprite.setFlipX(false);
    this.playAnimIfExists('sit');
  }

  startTyping(): void {
    this.stopCurrentAnimation();
    this.animState = 'type';
    this.playAnimIfExists('type');
  }

  standIdle(): void {
    this.stopCurrentAnimation();
    this.animState = 'idle';
    this.sprite.setFlipX(false);
    this.playAnimIfExists('idle');
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
    this.stopSpriteAnim();
  }

  getAgentName(): string {
    return this.agentName;
  }

  destroy(fromScene?: boolean): void {
    this.stopCurrentAnimation();
    super.destroy(fromScene);
  }
}
