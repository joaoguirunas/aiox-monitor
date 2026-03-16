export interface TilePosition {
  tileX: number;
  tileY: number;
}

export interface DeskPosition extends TilePosition {
  id: string;
  facing: 'left' | 'right' | 'up' | 'down';
}

export interface ZoneDefinition {
  name: 'work' | 'recreation' | 'entrance';
  color: number;
}

// ─── Mapa isométrico 36x26 tiles — escritório grande ──────────────────────────
export const MAP_WIDTH = 36;
export const MAP_HEIGHT = 26;
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

// ─── Clusters de projeto (zona de trabalho) ───────────────────────────────────
// Cada cluster tem até 12 mesas (2 filas x 6 colunas) + label do projeto
// Posições âncora (top-left do cluster) na zona de trabalho

export const CLUSTER_ORIGINS: TilePosition[] = [
  { tileX: 19, tileY: 2 },
  { tileX: 19, tileY: 8 },
  { tileX: 19, tileY: 14 },
  { tileX: 27, tileY: 2 },
  { tileX: 27, tileY: 8 },
  { tileX: 27, tileY: 14 },
];

export const DESKS_PER_CLUSTER = 12;
export const CLUSTER_COLS = 4;
export const CLUSTER_ROWS = 3;
export const CLUSTER_COL_SPACING = 2;
export const CLUSTER_ROW_SPACING = 2;

/** Gera posições de mesa para um cluster dado a posição âncora */
export function generateClusterDesks(origin: TilePosition, clusterIndex: number): DeskPosition[] {
  const desks: DeskPosition[] = [];
  let deskNum = 0;
  for (let row = 0; row < CLUSTER_ROWS; row++) {
    for (let col = 0; col < CLUSTER_COLS; col++) {
      desks.push({
        id: `cluster-${clusterIndex}-desk-${deskNum}`,
        tileX: origin.tileX + col * CLUSTER_COL_SPACING,
        tileY: origin.tileY + row * CLUSTER_ROW_SPACING,
        facing: 'down',
      });
      deskNum++;
    }
  }
  return desks;
}

// ─── Posições da zona de recreação ────────────────────────────────────────────

export interface RecreationPosition extends TilePosition {
  type: 'sofa' | 'coffee-machine' | 'bookshelf' | 'water-cooler' | 'ping-pong' | 'hammock' | 'arcade' | 'standing';
  interactionFor: ('idle' | 'break')[];
}

export const RECREATION_POSITIONS: RecreationPosition[] = [
  // Ping-pong area (top)
  { tileX: 5,  tileY: 3,  type: 'ping-pong', interactionFor: ['idle', 'break'] },
  { tileX: 3,  tileY: 3,  type: 'standing',   interactionFor: ['idle', 'break'] },
  { tileX: 7,  tileY: 3,  type: 'standing',   interactionFor: ['idle', 'break'] },

  // Arcade area
  { tileX: 10, tileY: 3,  type: 'arcade',     interactionFor: ['idle', 'break'] },
  { tileX: 12, tileY: 3,  type: 'arcade',     interactionFor: ['idle', 'break'] },
  { tileX: 11, tileY: 5,  type: 'standing',   interactionFor: ['idle', 'break'] },

  // Hammock / rest area (left side)
  { tileX: 3,  tileY: 7,  type: 'hammock',    interactionFor: ['idle', 'break'] },
  { tileX: 3,  tileY: 9,  type: 'hammock',    interactionFor: ['idle', 'break'] },
  { tileX: 3,  tileY: 11, type: 'hammock',    interactionFor: ['idle', 'break'] },

  // Sofa lounge (center)
  { tileX: 7,  tileY: 7,  type: 'sofa',       interactionFor: ['idle'] },
  { tileX: 7,  tileY: 9,  type: 'sofa',       interactionFor: ['idle'] },
  { tileX: 7,  tileY: 11, type: 'sofa',       interactionFor: ['idle'] },
  { tileX: 7,  tileY: 13, type: 'sofa',       interactionFor: ['idle'] },

  // Coffee / break area (right of recreation)
  { tileX: 12, tileY: 7,  type: 'coffee-machine', interactionFor: ['break'] },
  { tileX: 12, tileY: 10, type: 'water-cooler',   interactionFor: ['break'] },
  { tileX: 14, tileY: 7,  type: 'bookshelf',      interactionFor: ['break', 'idle'] },

  // Standing overflow (spread across recreation)
  { tileX: 5,  tileY: 6,  type: 'standing',   interactionFor: ['idle', 'break'] },
  { tileX: 9,  tileY: 7,  type: 'standing',   interactionFor: ['idle', 'break'] },
  { tileX: 5,  tileY: 10, type: 'standing',   interactionFor: ['idle', 'break'] },
  { tileX: 9,  tileY: 11, type: 'standing',   interactionFor: ['idle', 'break'] },
  { tileX: 11, tileY: 9,  type: 'standing',   interactionFor: ['idle', 'break'] },
  { tileX: 5,  tileY: 13, type: 'standing',   interactionFor: ['idle', 'break'] },
  { tileX: 9,  tileY: 14, type: 'standing',   interactionFor: ['idle', 'break'] },
  { tileX: 13, tileY: 13, type: 'standing',   interactionFor: ['idle', 'break'] },
  { tileX: 11, tileY: 15, type: 'standing',   interactionFor: ['idle', 'break'] },
];

// ─── Posições dos móveis decorativos ──────────────────────────────────────────

export const FURNITURE_POSITIONS = {
  coffeeMachine: { tileX: 12, tileY: 7 },
  waterCooler:   { tileX: 12, tileY: 10 },
  bookshelf:     { tileX: 14, tileY: 7 },
  pingPong:      { tileX: 5,  tileY: 3 },
  arcade1:       { tileX: 10, tileY: 3 },
  arcade2:       { tileX: 12, tileY: 3 },
  hammock1:      { tileX: 3,  tileY: 7 },
  hammock2:      { tileX: 3,  tileY: 9 },
  hammock3:      { tileX: 3,  tileY: 11 },
  plant1:        { tileX: 1,  tileY: 2 },
  plant2:        { tileX: 1,  tileY: 8 },
  plant3:        { tileX: 1,  tileY: 14 },
  plant4:        { tileX: 15, tileY: 2 },
  plant5:        { tileX: 15, tileY: 12 },
  plant6:        { tileX: 17, tileY: 20 },
};

// Backward compat — kept for sofas in OfficeScene.placeFurniture
export const LOUNGE_POSITIONS: TilePosition[] = [
  { tileX: 7, tileY: 7 },
  { tileX: 7, tileY: 9 },
  { tileX: 7, tileY: 11 },
  { tileX: 7, tileY: 13 },
];

export const COFFEE_TABLE_POSITION: TilePosition = { tileX: 9, tileY: 9 };

export const ENTRANCE_POSITION: TilePosition = { tileX: 14, tileY: 23 };

// ─── Zonas ────────────────────────────────────────────────────────────────────

export const ZONES: ZoneDefinition[] = [
  { name: 'work',       color: 0x2a2a3e },
  { name: 'recreation', color: 0x1a2a3e },
  { name: 'entrance',   color: 0x3e2a1a },
];

export function getZoneForTile(tileX: number, tileY: number): ZoneDefinition['name'] | null {
  if (tileX >= 17 && tileX <= 34 && tileY >= 1 && tileY <= 21) return 'work';
  if (tileX >= 1 && tileX <= 15 && tileY >= 1 && tileY <= 17)  return 'recreation';
  if (tileX >= 10 && tileX <= 20 && tileY >= 19 && tileY <= 25) return 'entrance';
  return null;
}
