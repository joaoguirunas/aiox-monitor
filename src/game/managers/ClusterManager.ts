import * as Phaser from 'phaser';
import { Desk } from '../objects/Desk';
import { tileToPixel } from '../utils/iso-utils';
import {
  CLUSTER_ORIGINS, generateClusterDesks,
} from '../data/office-layout';
import type { DeskPosition, TilePosition } from '../data/office-layout';

export interface ProjectCluster {
  projectId: number;
  projectName: string;
  originTile: TilePosition;
  deskPositions: DeskPosition[];
  desks: Desk[];
  label: Phaser.GameObjects.Container;
}

export class ClusterManager {
  private clusters: Map<number, ProjectCluster> = new Map();
  private usedSlots: Set<number> = new Set();

  constructor(private scene: Phaser.Scene) {}

  /** Garante que existe um cluster para o projeto. Cria se necessário. */
  ensureCluster(projectId: number, projectName: string): ProjectCluster | null {
    const existing = this.clusters.get(projectId);
    if (existing) {
      if (existing.projectName !== projectName) {
        existing.projectName = projectName;
        const textObj = existing.label.getByName('text') as Phaser.GameObjects.Text | null;
        if (textObj) textObj.setText(projectName);
      }
      return existing;
    }

    // Find next available slot
    let slotIndex = -1;
    for (let i = 0; i < CLUSTER_ORIGINS.length; i++) {
      if (!this.usedSlots.has(i)) {
        slotIndex = i;
        break;
      }
    }

    if (slotIndex < 0) return null;

    const origin = CLUSTER_ORIGINS[slotIndex];
    const deskPositions = generateClusterDesks(origin, slotIndex);

    // Create workstation desks (fully programmatic)
    const desks = deskPositions.map(pos => new Desk(this.scene, pos.tileX, pos.tileY));

    // Create project name plate above cluster
    const labelPos = tileToPixel(origin.tileX + 2, origin.tileY - 1);
    const label = this.createNamePlate(labelPos.x, labelPos.y - 22, projectName);

    const cluster: ProjectCluster = {
      projectId,
      projectName,
      originTile: origin,
      deskPositions,
      desks,
      label,
    };

    this.clusters.set(projectId, cluster);
    this.usedSlots.add(slotIndex);

    return cluster;
  }

  /** Retorna as mesas de um cluster ou null */
  getCluster(projectId: number): ProjectCluster | null {
    return this.clusters.get(projectId) ?? null;
  }

  /** Remove cluster (quando projeto não tem mais agentes) */
  removeCluster(projectId: number): void {
    const cluster = this.clusters.get(projectId);
    if (!cluster) return;

    cluster.desks.forEach(d => d.destroy());
    cluster.label.destroy();

    for (let i = 0; i < CLUSTER_ORIGINS.length; i++) {
      const origin = CLUSTER_ORIGINS[i];
      if (origin.tileX === cluster.originTile.tileX && origin.tileY === cluster.originTile.tileY) {
        this.usedSlots.delete(i);
        break;
      }
    }

    this.clusters.delete(projectId);
  }

  /** Creates a styled name plate with background for a project cluster */
  private createNamePlate(x: number, y: number, name: string): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y).setDepth(9000);

    const text = this.scene.add.text(0, 0, name, {
      fontSize: '10px',
      color: '#c8d0ff',
      fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5).setName('text');

    const padX = 10;
    const padY = 4;
    const w = text.width + padX * 2;
    const h = text.height + padY * 2;

    const bg = this.scene.add.graphics();
    // Background plate
    bg.fillStyle(0x1a1e3a, 0.85);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 4);
    // Border
    bg.lineStyle(1, 0x4466aa, 0.4);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 4);
    // Accent line at bottom
    bg.fillStyle(0x6b7fff, 0.5);
    bg.fillRect(-w / 2 + 4, h / 2 - 2, w - 8, 1);

    container.add(bg);
    container.add(text);

    // Subtle float animation
    this.scene.tweens.add({
      targets: container,
      y: y - 2,
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return container;
  }

  /** Retorna todos os clusters ativos */
  getAllClusters(): ProjectCluster[] {
    return [...this.clusters.values()];
  }

  /** Retorna todas as mesas de todos os clusters (para OfficeScene) */
  getAllDesks(): Desk[] {
    const allDesks: Desk[] = [];
    for (const cluster of this.clusters.values()) {
      allDesks.push(...cluster.desks);
    }
    return allDesks;
  }
}
