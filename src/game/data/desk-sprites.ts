// Desk sprite configurations — PixelLab startup mesões com iMacs

export type DeskSize = 4 | 12 | 16;

export interface DeskSpriteConfig {
  key: string;
  path: string;
  seats: number;
  /** Pixel dimensions of the sprite */
  width: number;
  height: number;
  /** Scale factor when rendering in the scene */
  scale: number;
}

export const DESK_SPRITES: Record<DeskSize, DeskSpriteConfig> = {
  4: {
    key: 'desk-4',
    path: '/sprites/furniture/desk-4.png',
    seats: 4,
    width: 128,
    height: 128,
    scale: 0.7,
  },
  12: {
    key: 'desk-12',
    path: '/sprites/furniture/desk-12.png',
    seats: 12,
    width: 256,
    height: 256,
    scale: 0.55,
  },
  16: {
    key: 'desk-16',
    path: '/sprites/furniture/desk-16.png',
    seats: 16,
    width: 320,
    height: 320,
    scale: 0.55,
  },
};

/** Flat array for BootScene preload */
export const DESK_SPRITE_KEYS = Object.values(DESK_SPRITES).map(s => ({
  key: s.key,
  path: s.path,
}));

/** Choose desk size based on number of agents */
export function chooseDeskSize(agentCount: number): DeskSize {
  if (agentCount <= 4) return 4;
  if (agentCount <= 12) return 12;
  return 16;
}
