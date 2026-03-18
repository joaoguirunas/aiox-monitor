export interface TilePosition {
  tileX: number;
  tileY: number;
}

export interface DeskPosition extends TilePosition {
  id: string;
  facing: 'left' | 'right' | 'up' | 'down';
}

export interface ZoneDefinition {
  name: 'work' | 'recreation' | 'entrance' | 'bedroom';
  color: number;
}

// ─── Mapa isométrico 36x26 tiles — escritório grande ──────────────────────────
export const MAP_WIDTH = 36;
export const MAP_HEIGHT = 26;
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

// ─── Clusters de projeto (zona de trabalho) ───────────────────────────────────
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
//
// Layout organizado em 4 áreas distintas:
//
//  ┌─────────────────────┬─────────────────────┐
//  │   ÁREA DE JOGOS     │    ÁREA GAMER        │
//  │  Ping Pong + Sinuca │  Arcades + Gaming    │
//  │  (x:2-7, y:2-7)    │  (x:9-14, y:2-7)    │
//  ├─────────────────────┼─────────────────────┤
//  │   ÁREA DE REDES     │  LOUNGE DE LEITURA   │
//  │  Hammocks + Descanso│  Sofás + Estante     │
//  │  (x:2-7, y:9-16)   │  (x:9-14, y:9-16)   │
//  └─────────────────────┴─────────────────────┘

export interface RecreationPosition extends TilePosition {
  type: 'sofa' | 'coffee-machine' | 'bookshelf' | 'water-cooler' | 'ping-pong' | 'hammock' | 'arcade' | 'standing' | 'pool-table' | 'massage' | 'gaming' | 'bean-bag' | 'bed';
  interactionFor: ('idle' | 'break' | 'sleep')[];
}

export const RECREATION_POSITIONS: RecreationPosition[] = [
  // ═══ ÁREA DE JOGOS (topo-esquerda: x:2-7, y:2-7) ═══
  // Ping pong
  { tileX: 4,  tileY: 3,  type: 'ping-pong',  interactionFor: ['idle', 'break'] },
  { tileX: 3,  tileY: 2,  type: 'standing',    interactionFor: ['idle', 'break'] },
  { tileX: 5,  tileY: 4,  type: 'standing',    interactionFor: ['idle', 'break'] },
  // Sinuca (pool table)
  { tileX: 4,  tileY: 6,  type: 'pool-table',  interactionFor: ['idle', 'break'] },
  { tileX: 3,  tileY: 5,  type: 'standing',    interactionFor: ['idle', 'break'] },
  { tileX: 5,  tileY: 7,  type: 'standing',    interactionFor: ['idle', 'break'] },
  { tileX: 6,  tileY: 5,  type: 'standing',    interactionFor: ['idle', 'break'] },

  // ═══ ÁREA GAMER (topo-direita: x:9-14, y:2-7) ═══
  // Arcades
  { tileX: 10, tileY: 3,  type: 'arcade',      interactionFor: ['idle', 'break'] },
  { tileX: 12, tileY: 3,  type: 'arcade',      interactionFor: ['idle', 'break'] },
  { tileX: 11, tileY: 2,  type: 'standing',    interactionFor: ['idle', 'break'] },
  // Gaming setup (TV + console)
  { tileX: 11, tileY: 5,  type: 'gaming',      interactionFor: ['idle', 'break'] },
  // Bean bags (in front of TV)
  { tileX: 10, tileY: 7,  type: 'bean-bag',    interactionFor: ['idle', 'break'] },
  { tileX: 12, tileY: 7,  type: 'bean-bag',    interactionFor: ['idle', 'break'] },
  { tileX: 14, tileY: 5,  type: 'standing',    interactionFor: ['idle', 'break'] },

  // ═══ ÁREA DE REDES (baixo-esquerda: x:2-7, y:9-16) ═══
  // Hammocks
  { tileX: 3,  tileY: 10, type: 'hammock',     interactionFor: ['idle', 'break'] },
  { tileX: 3,  tileY: 12, type: 'hammock',     interactionFor: ['idle', 'break'] },
  { tileX: 3,  tileY: 14, type: 'hammock',     interactionFor: ['idle', 'break'] },
  // Massage chairs (relaxation area)
  { tileX: 6,  tileY: 10, type: 'massage',     interactionFor: ['break'] },
  { tileX: 6,  tileY: 12, type: 'massage',     interactionFor: ['break'] },
  // Standing / stroll near hammocks
  { tileX: 5,  tileY: 11, type: 'standing',    interactionFor: ['idle', 'break'] },
  { tileX: 5,  tileY: 14, type: 'standing',    interactionFor: ['idle', 'break'] },
  { tileX: 4,  tileY: 16, type: 'standing',    interactionFor: ['idle', 'break'] },

  // ═══ LOUNGE DE LEITURA (baixo-direita: x:9-14, y:9-16) ═══
  // Sofas (L-shape arrangement)
  { tileX: 10, tileY: 10, type: 'sofa',        interactionFor: ['idle'] },
  { tileX: 10, tileY: 12, type: 'sofa',        interactionFor: ['idle'] },
  { tileX: 12, tileY: 10, type: 'sofa',        interactionFor: ['idle'] },
  { tileX: 12, tileY: 12, type: 'sofa',        interactionFor: ['idle'] },
  // Bookshelf
  { tileX: 14, tileY: 10, type: 'bookshelf',   interactionFor: ['idle', 'break'] },
  // Coffee machine & water cooler
  { tileX: 14, tileY: 13, type: 'coffee-machine', interactionFor: ['break'] },
  { tileX: 14, tileY: 15, type: 'water-cooler',   interactionFor: ['break'] },
  // Standing / reading
  { tileX: 11, tileY: 11, type: 'standing',    interactionFor: ['idle', 'break'] },
  { tileX: 13, tileY: 11, type: 'standing',    interactionFor: ['idle', 'break'] },
  { tileX: 11, tileY: 14, type: 'standing',    interactionFor: ['idle', 'break'] },
  { tileX: 13, tileY: 15, type: 'standing',    interactionFor: ['idle', 'break'] },

  // ═══ BEDROOM (zona de dormir, separada) ═══
  { tileX: 3,  tileY: 19, type: 'bed',         interactionFor: ['sleep'] },
  { tileX: 3,  tileY: 21, type: 'bed',         interactionFor: ['sleep'] },
  { tileX: 3,  tileY: 23, type: 'bed',         interactionFor: ['sleep'] },
];

// ─── Posições dos móveis decorativos ──────────────────────────────────────────

export const FURNITURE_POSITIONS = {
  // Área de Jogos
  pingPong:      { tileX: 4,  tileY: 3 },
  poolTable:     { tileX: 4,  tileY: 6 },

  // Área Gamer
  arcade1:       { tileX: 10, tileY: 3 },
  arcade2:       { tileX: 12, tileY: 3 },
  gaming:        { tileX: 11, tileY: 5 },
  beanBag1:      { tileX: 10, tileY: 7 },
  beanBag2:      { tileX: 12, tileY: 7 },

  // Área de Redes
  hammock1:      { tileX: 3,  tileY: 10 },
  hammock2:      { tileX: 3,  tileY: 12 },
  hammock3:      { tileX: 3,  tileY: 14 },
  massage1:      { tileX: 6,  tileY: 10 },
  massage2:      { tileX: 6,  tileY: 12 },

  // Lounge de Leitura
  coffeeMachine: { tileX: 14, tileY: 13 },
  waterCooler:   { tileX: 14, tileY: 15 },
  bookshelf:     { tileX: 14, tileY: 10 },

  // Plants (decorative, spread across zones)
  plant1:        { tileX: 1,  tileY: 2 },
  plant2:        { tileX: 1,  tileY: 8 },
  plant3:        { tileX: 1,  tileY: 16 },
  plant4:        { tileX: 8,  tileY: 2 },
  plant5:        { tileX: 8,  tileY: 8 },
  plant6:        { tileX: 15, tileY: 2 },

  // Bedroom furniture
  bed1:          { tileX: 3,  tileY: 19 },
  bed2:          { tileX: 3,  tileY: 21 },
  bed3:          { tileX: 3,  tileY: 23 },
  nightStand1:   { tileX: 5,  tileY: 19 },
  nightStand2:   { tileX: 5,  tileY: 21 },
  nightStand3:   { tileX: 5,  tileY: 23 },
  bedroomPlant1: { tileX: 1,  tileY: 19 },
  bedroomPlant2: { tileX: 1,  tileY: 23 },
  bedroomDoor:   { tileX: 7,  tileY: 20 },
};

// Sofa positions for the reading lounge
export const LOUNGE_POSITIONS: TilePosition[] = [
  { tileX: 10, tileY: 10 },
  { tileX: 10, tileY: 12 },
  { tileX: 12, tileY: 10 },
  { tileX: 12, tileY: 12 },
];

export const COFFEE_TABLE_POSITION: TilePosition = { tileX: 11, tileY: 11 };

export const ENTRANCE_POSITION: TilePosition = { tileX: 14, tileY: 23 };

// ─── Zonas ────────────────────────────────────────────────────────────────────

export const ZONES: ZoneDefinition[] = [
  { name: 'work',       color: 0x2a2a3e },
  { name: 'recreation', color: 0x1a2a3e },
  { name: 'entrance',   color: 0x3e2a1a },
  { name: 'bedroom',    color: 0x1a1a2e },
];

export function getZoneForTile(tileX: number, tileY: number): ZoneDefinition['name'] | null {
  if (tileX >= 17 && tileX <= 34 && tileY >= 1 && tileY <= 21) return 'work';
  if (tileX >= 1 && tileX <= 15 && tileY >= 1 && tileY <= 17)  return 'recreation';
  if (tileX >= 1 && tileX <= 8 && tileY >= 18 && tileY <= 25)   return 'bedroom';
  if (tileX >= 10 && tileX <= 20 && tileY >= 19 && tileY <= 25) return 'entrance';
  return null;
}
