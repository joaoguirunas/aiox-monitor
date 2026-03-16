/**
 * Mapeamento de agentes AIOX para sprites PixelLab.
 * Cada agente com sprites PixelLab tem 4 direções (south, east, north, west).
 * Agentes sem entrada aqui usam o sistema procedural como fallback.
 */

export interface PixelLabDirections {
  south: string;
  east: string;
  north: string;
  west: string;
}

export interface PixelLabSpriteEntry {
  agentKey: string;
  directions: PixelLabDirections;
  frameSize: number;
}

function agentPaths(name: string): PixelLabDirections {
  return {
    south: `/sprites/agents/${name}-south.png`,
    east: `/sprites/agents/${name}-east.png`,
    north: `/sprites/agents/${name}-north.png`,
    west: `/sprites/agents/${name}-west.png`,
  };
}

export const PIXELLAB_SPRITES: Record<string, PixelLabSpriteEntry> = {
  '@dev':              { agentKey: 'agent-dev',       directions: agentPaths('dex'),    frameSize: 96 },
  '@qa':               { agentKey: 'agent-qa',        directions: agentPaths('quinn'),  frameSize: 96 },
  '@architect':        { agentKey: 'agent-architect',  directions: agentPaths('aria'),   frameSize: 96 },
  '@pm':               { agentKey: 'agent-pm',        directions: agentPaths('morgan'), frameSize: 96 },
  '@sm':               { agentKey: 'agent-sm',        directions: agentPaths('river'),  frameSize: 96 },
  '@po':               { agentKey: 'agent-po',        directions: agentPaths('pax'),    frameSize: 96 },
  '@analyst':          { agentKey: 'agent-analyst',    directions: agentPaths('alex'),   frameSize: 96 },
  '@devops':           { agentKey: 'agent-devops',     directions: agentPaths('gage'),   frameSize: 96 },
  '@data-engineer':    { agentKey: 'agent-data',       directions: agentPaths('dara'),   frameSize: 96 },
  '@ux-design-expert': { agentKey: 'agent-ux',         directions: agentPaths('uma'),    frameSize: 96 },
  '@aiox-master':      { agentKey: 'agent-aiox',       directions: agentPaths('aiox'),   frameSize: 96 },
};

/** Verifica se um agente tem sprites PixelLab disponíveis */
export function hasPixelLabSprite(agentName: string): boolean {
  return agentName in PIXELLAB_SPRITES;
}

/** Retorna a config PixelLab para um agente, ou null */
export function getPixelLabSprite(agentName: string): PixelLabSpriteEntry | null {
  return PIXELLAB_SPRITES[agentName] ?? null;
}

/** Gera a chave de textura para uma direção PixelLab */
export function pixelLabTextureKey(agentKey: string, direction: string): string {
  return `pl-${agentKey}-${direction}`;
}

/**
 * Mapeia um ângulo de movimento (em graus) para a direção cardinal mais próxima.
 * Temos 4 direções disponíveis: south, east, north, west.
 */
export function angleToDirection(angleDeg: number): string {
  // Normalizar para 0-360
  const a = ((angleDeg % 360) + 360) % 360;
  if (a >= 315 || a < 45) return 'east';
  if (a >= 45 && a < 135) return 'south';
  if (a >= 135 && a < 225) return 'west';
  return 'north';
}

/** Tamanho do frame PixelLab (fonte) */
export const PIXELLAB_FRAME_SIZE = 96;

/** Escala para renderizar sprites PixelLab no tamanho do jogo */
export const PIXELLAB_DISPLAY_SCALE = 48 / PIXELLAB_FRAME_SIZE; // 0.5
