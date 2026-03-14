import type { ThemeName } from '@/lib/types';

export interface ZoneColors {
  work: number;
  lounge: number;
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
  furnitureBaseColor: number;
  furnitureAccentColor: number;
  screenGlowColor: number;
  screenOffColor: number;
  ambientEffect: 'stars' | 'scanlines' | 'grain' | 'none';
  ambientColor: number;
  ambientAlpha: number;
}

export const THEMES: Record<ThemeName, OfficeTheme> = {
  moderno: {
    name: 'moderno',
    displayName: 'Moderno',
    backgroundColor: 0x1a1a2e,
    floorColors: { work: 0x2a2a3e, lounge: 0x1a2a3e, entrance: 0x3e2a1a },
    floorGridColor: 0x333344,
    floorGridAlpha: 0.3,
    wallColor: 0x555577,
    wallAlpha: 0.8,
    furnitureBaseColor: 0x444455,
    furnitureAccentColor: 0x666677,
    screenGlowColor: 0x4488ff,
    screenOffColor: 0x222233,
    ambientEffect: 'none',
    ambientColor: 0x000000,
    ambientAlpha: 0,
  },
  espacial: {
    name: 'espacial',
    displayName: 'Espacial',
    backgroundColor: 0x0a0a1a,
    floorColors: { work: 0x1a1a30, lounge: 0x0a1a30, entrance: 0x301a0a },
    floorGridColor: 0x2244aa,
    floorGridAlpha: 0.4,
    wallColor: 0x3344aa,
    wallAlpha: 0.6,
    furnitureBaseColor: 0x333355,
    furnitureAccentColor: 0x4466aa,
    screenGlowColor: 0x00ccff,
    screenOffColor: 0x111133,
    ambientEffect: 'stars',
    ambientColor: 0xffffff,
    ambientAlpha: 0.5,
  },
  oldschool: {
    name: 'oldschool',
    displayName: 'Oldschool',
    backgroundColor: 0x2e2a1a,
    floorColors: { work: 0x3e3a2a, lounge: 0x2e3a2a, entrance: 0x4e3a1a },
    floorGridColor: 0x554433,
    floorGridAlpha: 0.3,
    wallColor: 0x887755,
    wallAlpha: 0.7,
    furnitureBaseColor: 0x8b6914,
    furnitureAccentColor: 0xaa8833,
    screenGlowColor: 0x33ff33,
    screenOffColor: 0x1a2a1a,
    ambientEffect: 'grain',
    ambientColor: 0xaa9977,
    ambientAlpha: 0.05,
  },
  cyberpunk: {
    name: 'cyberpunk',
    displayName: 'Cyberpunk',
    backgroundColor: 0x0a0a0a,
    floorColors: { work: 0x1a0a2a, lounge: 0x0a1a2a, entrance: 0x2a0a1a },
    floorGridColor: 0xff00ff,
    floorGridAlpha: 0.2,
    wallColor: 0xff00aa,
    wallAlpha: 0.5,
    furnitureBaseColor: 0x222233,
    furnitureAccentColor: 0x00ffff,
    screenGlowColor: 0xff00ff,
    screenOffColor: 0x110011,
    ambientEffect: 'scanlines',
    ambientColor: 0x00ffff,
    ambientAlpha: 0.03,
  },
};

export function getTheme(name: ThemeName): OfficeTheme {
  return THEMES[name] ?? THEMES.moderno;
}
