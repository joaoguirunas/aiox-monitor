import type { ThemeName } from '@/lib/types';

export interface ZoneColors {
  work: number;
  recreation: number;
  entrance: number;
}

export interface OfficeTheme {
  name: ThemeName;
  displayName: string;
  backgroundColor: number;
  floorColors: ZoneColors;
  floorGridColor: number;
  floorGridAlpha: number;
  wallColor: number;
  wallAlpha: number;
  /** Glow line on wall top edge */
  wallGlowColor: number;
  wallGlowAlpha: number;
  furnitureBaseColor: number;
  furnitureAccentColor: number;
  /** Metallic edge highlight on furniture */
  furnitureEdgeColor: number;
  screenGlowColor: number;
  screenOffColor: number;
  ambientEffect: 'stars' | 'scanlines' | 'grain' | 'none';
  ambientColor: number;
  ambientAlpha: number;
  /** Floating dust particle color */
  dustColor: number;
  dustAlpha: number;
}

export const THEMES: Record<ThemeName, OfficeTheme> = {
  moderno: {
    name: 'moderno',
    displayName: 'Moderno',
    backgroundColor: 0x08090f,
    floorColors: { work: 0x0f1525, recreation: 0x0c1220, entrance: 0x15100a },
    floorGridColor: 0x1a2855,
    floorGridAlpha: 0.25,
    wallColor: 0x1c2240,
    wallAlpha: 0.85,
    wallGlowColor: 0x3355aa,
    wallGlowAlpha: 0.4,
    furnitureBaseColor: 0x1a2040,
    furnitureAccentColor: 0x252e50,
    furnitureEdgeColor: 0x2a3565,
    screenGlowColor: 0x00ccff,
    screenOffColor: 0x0a0f1a,
    ambientEffect: 'stars',
    ambientColor: 0xffffff,
    ambientAlpha: 0.4,
    dustColor: 0x4488ff,
    dustAlpha: 0.06,
  },
  espacial: {
    name: 'espacial',
    displayName: 'Espacial',
    backgroundColor: 0x040610,
    floorColors: { work: 0x0a0f22, recreation: 0x080c1c, entrance: 0x180c06 },
    floorGridColor: 0x2244cc,
    floorGridAlpha: 0.35,
    wallColor: 0x1a2266,
    wallAlpha: 0.7,
    wallGlowColor: 0x4466ff,
    wallGlowAlpha: 0.5,
    furnitureBaseColor: 0x151a35,
    furnitureAccentColor: 0x202850,
    furnitureEdgeColor: 0x3355aa,
    screenGlowColor: 0x00eeff,
    screenOffColor: 0x080c1a,
    ambientEffect: 'stars',
    ambientColor: 0xffffff,
    ambientAlpha: 0.6,
    dustColor: 0x44aaff,
    dustAlpha: 0.08,
  },
  oldschool: {
    name: 'oldschool',
    displayName: 'Oldschool',
    backgroundColor: 0x1a1808,
    floorColors: { work: 0x25220f, recreation: 0x1e2210, entrance: 0x2e2008 },
    floorGridColor: 0x443322,
    floorGridAlpha: 0.25,
    wallColor: 0x554422,
    wallAlpha: 0.75,
    wallGlowColor: 0x33ff33,
    wallGlowAlpha: 0.25,
    furnitureBaseColor: 0x5a4020,
    furnitureAccentColor: 0x7a5830,
    furnitureEdgeColor: 0x8b6914,
    screenGlowColor: 0x33ff33,
    screenOffColor: 0x0a1208,
    ambientEffect: 'grain',
    ambientColor: 0xaa9977,
    ambientAlpha: 0.04,
    dustColor: 0xaa8844,
    dustAlpha: 0.04,
  },
  cyberpunk: {
    name: 'cyberpunk',
    displayName: 'Cyberpunk',
    backgroundColor: 0x050508,
    floorColors: { work: 0x10081a, recreation: 0x08101a, entrance: 0x1a0810 },
    floorGridColor: 0xff00ff,
    floorGridAlpha: 0.15,
    wallColor: 0x330033,
    wallAlpha: 0.6,
    wallGlowColor: 0xff00aa,
    wallGlowAlpha: 0.5,
    furnitureBaseColor: 0x151520,
    furnitureAccentColor: 0x1a1a30,
    furnitureEdgeColor: 0x00ffff,
    screenGlowColor: 0xff00ff,
    screenOffColor: 0x080008,
    ambientEffect: 'scanlines',
    ambientColor: 0x00ffff,
    ambientAlpha: 0.025,
    dustColor: 0xff44ff,
    dustAlpha: 0.06,
  },
};

export function getTheme(name: ThemeName): OfficeTheme {
  return THEMES[name] ?? THEMES.moderno;
}
