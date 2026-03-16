/**
 * Generate clean, subtle isometric floor tiles for all themes.
 * Each tile is a 64×32 diamond with:
 *  - Flat base colour per zone (distinct between zones)
 *  - Very subtle edge highlights (top-left light, bottom-right dark)
 *  - Minimal grid line at the diamond border
 *  - No interior patterns / no noise / no dense grids
 *
 * Also generates rug overlay tiles.
 *
 * Usage: node scripts/generate-floor-tiles.mjs
 */

import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 64;
const H = 32;
const HW = W / 2; // 32
const HH = H / 2; // 16

// ── Theme × Zone colour definitions ──────────────────────────────────────────
// Each zone gets a clearly different base colour.
// Format: { base: '#hex', gridLine: '#hex', gridAlpha: 0-1 }

const THEMES = {
  moderno: {
    work:       { base: '#111a2e', edge: '#1e2c4a', grid: '#1a2855', gridAlpha: 0.18 },
    recreation: { base: '#0e1a26', edge: '#162a3e', grid: '#14304a', gridAlpha: 0.15 },
    bedroom:    { base: '#0c0e1e', edge: '#161838', grid: '#151535', gridAlpha: 0.12 },
    entrance:   { base: '#1a1408', edge: '#2e2412', grid: '#3a2a15', gridAlpha: 0.20 },
  },
  espacial: {
    work:       { base: '#0c1228', edge: '#152040', grid: '#1a2860', gridAlpha: 0.20 },
    recreation: { base: '#081420', edge: '#102238', grid: '#0e3050', gridAlpha: 0.18 },
    bedroom:    { base: '#0a0c1c', edge: '#141830', grid: '#121440', gridAlpha: 0.14 },
    entrance:   { base: '#1c1008', edge: '#2e1c10', grid: '#3a2010', gridAlpha: 0.22 },
  },
  oldschool: {
    work:       { base: '#201e0e', edge: '#302c18', grid: '#3a3020', gridAlpha: 0.18 },
    recreation: { base: '#1a1e10', edge: '#2a2e1a', grid: '#303818', gridAlpha: 0.15 },
    bedroom:    { base: '#18160c', edge: '#282418', grid: '#2a2412', gridAlpha: 0.12 },
    entrance:   { base: '#2a1e0a', edge: '#3e2e14', grid: '#4a3418', gridAlpha: 0.20 },
  },
  cyberpunk: {
    work:       { base: '#120a1e', edge: '#1e1232', grid: '#2a1448', gridAlpha: 0.16 },
    recreation: { base: '#0a1220', edge: '#121e34', grid: '#142a4a', gridAlpha: 0.14 },
    bedroom:    { base: '#0e0a16', edge: '#181428', grid: '#1a1238', gridAlpha: 0.12 },
    entrance:   { base: '#1e0a12', edge: '#30121c', grid: '#3a1420', gridAlpha: 0.18 },
  },
};

// Rug colours
const RUG_COLOURS = {
  moderno:  { lounge: '#141c35', bedroom: '#12102a' },
  espacial: { lounge: '#101830', bedroom: '#0e0c24' },
  oldschool: { lounge: '#2a2818', bedroom: '#221e14' },
  cyberpunk: { lounge: '#18102e', bedroom: '#140e22' },
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function blendColour(base, overlay, alpha) {
  return {
    r: Math.round(base.r * (1 - alpha) + overlay.r * alpha),
    g: Math.round(base.g * (1 - alpha) + overlay.g * alpha),
    b: Math.round(base.b * (1 - alpha) + overlay.b * alpha),
  };
}

/**
 * Check if pixel (px, py) is inside the isometric diamond.
 * Diamond vertices: top(32,0), right(63,15), bottom(32,31), left(0,15)
 */
function isInsideDiamond(px, py) {
  // Normalise to diamond centre
  const cx = px - HW + 0.5;
  const cy = py - HH + 0.5;
  // Manhattan distance in iso space (diamond = |x/hw| + |y/hh| <= 1)
  return (Math.abs(cx) / HW + Math.abs(cy) / HH) <= 1.0;
}

function distanceToEdge(px, py) {
  const cx = px - HW + 0.5;
  const cy = py - HH + 0.5;
  return 1.0 - (Math.abs(cx) / HW + Math.abs(cy) / HH);
}

/**
 * Generate a single isometric diamond tile as raw RGBA buffer.
 */
function generateTile(config) {
  const { base, edge, grid, gridAlpha } = config;
  const baseRgb = hexToRgb(base);
  const edgeRgb = hexToRgb(edge);
  const gridRgb = hexToRgb(grid);

  const buf = Buffer.alloc(W * H * 4, 0); // RGBA, fully transparent

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isInsideDiamond(x, y)) continue;

      const d = distanceToEdge(x, y);
      const idx = (y * W + x) * 4;

      // Base colour
      let r = baseRgb.r, g = baseRgb.g, b = baseRgb.b;

      // Subtle edge gradient (outer 15% blends toward edge colour)
      if (d < 0.15) {
        const t = d / 0.15;
        const blended = blendColour(edgeRgb, baseRgb, t);
        r = blended.r;
        g = blended.g;
        b = blended.b;
      }

      // Very subtle top-left highlight
      const cx = x - HW;
      const cy = y - HH;
      if (cx + cy < -8 && d > 0.05) {
        const hl = blendColour({ r, g, b }, { r: 255, g: 255, b: 255 }, 0.02);
        r = hl.r; g = hl.g; b = hl.b;
      }
      // Very subtle bottom-right shadow
      if (cx + cy > 8 && d > 0.05) {
        const sh = blendColour({ r, g, b }, { r: 0, g: 0, b: 0 }, 0.04);
        r = sh.r; g = sh.g; b = sh.b;
      }

      // Thin grid line at diamond edge (1px border)
      if (d < 0.06 && d >= 0.0) {
        const blended = blendColour({ r, g, b }, gridRgb, gridAlpha);
        r = blended.r; g = blended.g; b = blended.b;
      }

      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }

  return buf;
}

/**
 * Generate a rug tile — slightly lighter flat diamond.
 */
function generateRugTile(hexColour) {
  const baseRgb = hexToRgb(hexColour);
  const buf = Buffer.alloc(W * H * 4, 0);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isInsideDiamond(x, y)) continue;
      const idx = (y * W + x) * 4;
      buf[idx] = baseRgb.r;
      buf[idx + 1] = baseRgb.g;
      buf[idx + 2] = baseRgb.b;
      buf[idx + 3] = 180; // semi-transparent overlay
    }
  }

  return buf;
}

async function main() {
  const root = join(import.meta.dirname, '..', 'public', 'sprites', 'themes');

  for (const [themeName, zones] of Object.entries(THEMES)) {
    const dir = join(root, themeName);
    mkdirSync(dir, { recursive: true });

    for (const [zoneName, config] of Object.entries(zones)) {
      const buf = generateTile(config);
      const png = await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
        .png()
        .toBuffer();
      const path = join(dir, `floor-${zoneName}.png`);
      writeFileSync(path, png);
      console.log(`  ✓ ${themeName}/floor-${zoneName}.png`);
    }

    // Rugs
    const rugColours = RUG_COLOURS[themeName];
    for (const [rugType, colour] of Object.entries(rugColours)) {
      const buf = generateRugTile(colour);
      const png = await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
        .png()
        .toBuffer();
      const path = join(dir, `rug-${rugType}.png`);
      writeFileSync(path, png);
      console.log(`  ✓ ${themeName}/rug-${rugType}.png`);
    }
  }

  console.log('\nDone! All floor tiles regenerated.');
}

main().catch(console.error);
