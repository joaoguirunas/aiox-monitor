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
  label: Phaser.GameObjects.Text;
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
        existing.label.setText(projectName);
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

    // Create project label above cluster
    const labelPos = tileToPixel(origin.tileX + 2, origin.tileY - 1);
    const label = this.scene.add.text(labelPos.x, labelPos.y - 20, projectName, {
      fontSize: '11px',
      color: '#6b7fff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5).setAlpha(0.7).setDepth(9000);

    // Label float animation
    this.scene.tweens.add({
      targets: label,
      y: label.y - 2,
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

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
