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
  '@dev':              { agentKey: 'agent-dev',       directions: agentPaths('dex'),    frameSize: 128 },
  '@qa':               { agentKey: 'agent-qa',        directions: agentPaths('quinn'),  frameSize: 128 },
  '@architect':        { agentKey: 'agent-architect',  directions: agentPaths('aria'),   frameSize: 128 },
  '@pm':               { agentKey: 'agent-pm',        directions: agentPaths('morgan'), frameSize: 128 },
  '@sm':               { agentKey: 'agent-sm',        directions: agentPaths('river'),  frameSize: 128 },
  '@po':               { agentKey: 'agent-po',        directions: agentPaths('pax'),    frameSize: 128 },
  '@analyst':          { agentKey: 'agent-analyst',    directions: agentPaths('alex'),   frameSize: 128 },
  '@devops':           { agentKey: 'agent-devops',     directions: agentPaths('gage'),   frameSize: 128 },
  '@data-engineer':    { agentKey: 'agent-data',       directions: agentPaths('dara'),   frameSize: 128 },
  '@ux-design-expert': { agentKey: 'agent-ux',         directions: agentPaths('uma'),    frameSize: 128 },
  '@aiox-master':      { agentKey: 'agent-aiox',       directions: agentPaths('aiox'),   frameSize: 128 },
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
export const PIXELLAB_FRAME_SIZE = 128;

/** Escala para renderizar sprites PixelLab no tamanho do jogo */
export const PIXELLAB_DISPLAY_SCALE = 72 / PIXELLAB_FRAME_SIZE; // 0.75
