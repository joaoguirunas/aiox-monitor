import type { ThemeName } from '@/lib/types';

export type ZoneName = 'work' | 'recreation' | 'bedroom' | 'entrance';
export type RugType = 'lounge' | 'bedroom';

export interface RugBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const RUG_BOUNDS: Record<RugType, RugBounds> = {
  lounge:  { minX: 6, maxX: 10, minY: 7, maxY: 13 },
  bedroom: { minX: 2, maxX: 6,  minY: 18, maxY: 24 },
};

export const THEME_NAMES: ThemeName[] = ['moderno', 'espacial', 'oldschool', 'cyberpunk'];
export const ZONE_NAMES: ZoneName[] = ['work', 'recreation', 'bedroom', 'entrance'];
export const RUG_TYPES: RugType[] = ['lounge', 'bedroom'];

/** Texture key for a floor zone tile */
export function floorTextureKey(theme: ThemeName, zone: ZoneName): string {
  return `floor-${theme}-${zone}`;
}

/** Texture key for a rug tile */
export function rugTextureKey(theme: ThemeName, rug: RugType): string {
  return `rug-${theme}-${rug}`;
}

/** Asset path for a floor zone tile */
export function floorAssetPath(theme: ThemeName, zone: ZoneName): string {
  return `/sprites/themes/${theme}/floor-${zone}.png`;
}

/** Asset path for a rug tile */
export function rugAssetPath(theme: ThemeName, rug: RugType): string {
  return `/sprites/themes/${theme}/rug-${rug}.png`;
}

/** Check if a tile position is within a rug area */
export function getRugTypeForTile(tileX: number, tileY: number): RugType | null {
  for (const rugType of RUG_TYPES) {
    const b = RUG_BOUNDS[rugType];
    if (tileX >= b.minX && tileX <= b.maxX && tileY >= b.minY && tileY <= b.maxY) {
      return rugType;
    }
  }
  return null;
}
