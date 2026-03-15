export interface TilePosition {
  tileX: number;
  tileY: number;
}

export interface DeskPosition extends TilePosition {
  id: string;
  facing: 'left' | 'right' | 'up' | 'down';
}

export interface ZoneDefinition {
  name: 'work' | 'lounge' | 'entrance';
  color: number;
}

// Mapa isométrico 20x16 tiles
export const MAP_WIDTH = 20;
export const MAP_HEIGHT = 16;
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

// 11 posições de mesa na zona de trabalho (grid 3 colunas x 4 filas, última fila tem 2)
export const DESK_POSITIONS: DeskPosition[] = [
  { id: 'desk-0',  tileX: 12, tileY: 3,  facing: 'down' },
  { id: 'desk-1',  tileX: 14, tileY: 3,  facing: 'down' },
  { id: 'desk-2',  tileX: 16, tileY: 3,  facing: 'down' },
  { id: 'desk-3',  tileX: 12, tileY: 6,  facing: 'down' },
  { id: 'desk-4',  tileX: 14, tileY: 6,  facing: 'down' },
  { id: 'desk-5',  tileX: 16, tileY: 6,  facing: 'down' },
  { id: 'desk-6',  tileX: 12, tileY: 9,  facing: 'down' },
  { id: 'desk-7',  tileX: 14, tileY: 9,  facing: 'down' },
  { id: 'desk-8',  tileX: 16, tileY: 9,  facing: 'down' },
  { id: 'desk-9',  tileX: 12, tileY: 12, facing: 'down' },
  { id: 'desk-10', tileX: 14, tileY: 12, facing: 'down' },
];

// Posições do lounge (sofás + mesa café) — mantido para backward compat
export const LOUNGE_POSITIONS: TilePosition[] = [
  { tileX: 3, tileY: 5 },  // sofá 1
  { tileX: 3, tileY: 7 },  // sofá 2
  { tileX: 5, tileY: 6 },  // mesa café
  { tileX: 3, tileY: 9 },  // sofá 3
];

// Posições expandidas do lounge com tipo de interacção
export interface LoungePosition extends TilePosition {
  type: 'sofa' | 'coffee-machine' | 'bookshelf' | 'water-cooler' | 'plant' | 'standing';
  interactionFor: ('idle' | 'break')[];
}

export const LOUNGE_POSITIONS_V2: LoungePosition[] = [
  // Sofás (para idle)
  { tileX: 3, tileY: 5, type: 'sofa', interactionFor: ['idle'] },
  { tileX: 3, tileY: 7, type: 'sofa', interactionFor: ['idle'] },
  { tileX: 3, tileY: 9, type: 'sofa', interactionFor: ['idle'] },
  // Máquina de café (para break)
  { tileX: 5, tileY: 4, type: 'coffee-machine', interactionFor: ['break'] },
  // Dispensador de água (para break)
  { tileX: 6, tileY: 8, type: 'water-cooler', interactionFor: ['break'] },
  // Estante (para break e idle)
  { tileX: 2, tileY: 4, type: 'bookshelf', interactionFor: ['break', 'idle'] },
  // Em pé (overflow para idle/break)
  { tileX: 4, tileY: 6, type: 'standing', interactionFor: ['idle', 'break'] },
  { tileX: 5, tileY: 10, type: 'standing', interactionFor: ['idle', 'break'] },
];

// Posições dos móveis decorativos
export const FURNITURE_POSITIONS = {
  coffeeMachine: { tileX: 5, tileY: 4 },
  waterCooler: { tileX: 6, tileY: 8 },
  bookshelf: { tileX: 2, tileY: 4 },
  plant1: { tileX: 1, tileY: 6 },
  plant2: { tileX: 7, tileY: 3 },
};

// Posição da mesa de café (mantida)
export const COFFEE_TABLE_POSITION: TilePosition = { tileX: 5, tileY: 6 };

// Posição da porta de entrada
export const ENTRANCE_POSITION: TilePosition = { tileX: 9, tileY: 14 };

// Definição das zonas com cores
export const ZONES: ZoneDefinition[] = [
  { name: 'work',     color: 0x2a2a3e },  // cinza escuro azulado
  { name: 'lounge',   color: 0x1a2a3e },  // azul escuro
  { name: 'entrance', color: 0x3e2a1a },  // marrom escuro
];

// Determina a zona de um tile baseado nas suas coordenadas
export function getZoneForTile(tileX: number, tileY: number): ZoneDefinition['name'] | null {
  if (tileX >= 10 && tileX <= 18 && tileY >= 1 && tileY <= 13) return 'work';
  if (tileX >= 1 && tileX <= 7 && tileY >= 3 && tileY <= 11) return 'lounge';
  if (tileX >= 7 && tileX <= 12 && tileY >= 12 && tileY <= 15) return 'entrance';
  return null;
}
