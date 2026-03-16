import type { AgentSpriteConfig } from '../data/agent-sprite-config';

export const FRAME_SIZE = 48;
export const ATLAS_COLS = 6;
export const ATLAS_ROWS = 3;
export const TOTAL_FRAMES = ATLAS_COLS * ATLAS_ROWS; // 18

type AnimType = 'idle' | 'walk-down' | 'walk-up' | 'walk-side' | 'sit' | 'type';

interface FramePosition {
  col: number;
  row: number;
  animType: AnimType;
  frameIndex: number;
}

/**
 * Gera spritesheet pixel art 288×144 (18 frames de 48×48) para um agente.
 *
 * Layout:
 *   Row 0: idle(2) + walk-down(4)
 *   Row 1: walk-up(4) + walk-side(2)
 *   Row 2: walk-side(2) + sit(2) + type(2)
 */
export function generateAgentSpritesheet(
  config: AgentSpriteConfig,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_SIZE * ATLAS_COLS;
  canvas.height = FRAME_SIZE * ATLAS_ROWS;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const positions = getFramePositions();
  for (const fp of positions) {
    const ox = fp.col * FRAME_SIZE;
    const oy = fp.row * FRAME_SIZE;
    drawAgentFrame(ctx, ox, oy, config, fp.animType, fp.frameIndex);
  }

  return canvas;
}

function getFramePositions(): FramePosition[] {
  return [
    // Row 0: idle(2) + walk-down(4)
    { col: 0, row: 0, animType: 'idle', frameIndex: 0 },
    { col: 1, row: 0, animType: 'idle', frameIndex: 1 },
    { col: 2, row: 0, animType: 'walk-down', frameIndex: 0 },
    { col: 3, row: 0, animType: 'walk-down', frameIndex: 1 },
    { col: 4, row: 0, animType: 'walk-down', frameIndex: 2 },
    { col: 5, row: 0, animType: 'walk-down', frameIndex: 3 },
    // Row 1: walk-up(4) + walk-side(2 of 4)
    { col: 0, row: 1, animType: 'walk-up', frameIndex: 0 },
    { col: 1, row: 1, animType: 'walk-up', frameIndex: 1 },
    { col: 2, row: 1, animType: 'walk-up', frameIndex: 2 },
    { col: 3, row: 1, animType: 'walk-up', frameIndex: 3 },
    { col: 4, row: 1, animType: 'walk-side', frameIndex: 0 },
    { col: 5, row: 1, animType: 'walk-side', frameIndex: 1 },
    // Row 2: walk-side(2 of 4) + sit(2) + type(2)
    { col: 0, row: 2, animType: 'walk-side', frameIndex: 2 },
    { col: 1, row: 2, animType: 'walk-side', frameIndex: 3 },
    { col: 2, row: 2, animType: 'sit', frameIndex: 0 },
    { col: 3, row: 2, animType: 'sit', frameIndex: 1 },
    { col: 4, row: 2, animType: 'type', frameIndex: 0 },
    { col: 5, row: 2, animType: 'type', frameIndex: 1 },
  ];
}

// ──────────────────────────────────────────────
// Frame drawing — 48×48 enhanced sprites
// ──────────────────────────────────────────────

function drawAgentFrame(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  config: AgentSpriteConfig,
  animType: AnimType,
  frameIndex: number,
): void {
  const cx = ox + 24; // horizontal center
  const headTop = oy + 5; // top of head area
  const walkBob = getWalkBob(animType, frameIndex);

  // ── Ground glow (subtle agent color circle under feet) ──
  const glowAlpha = animType === 'type' ? 0.08 : 0.04;
  ctx.fillStyle = hexToRgba(config.primaryColor, glowAlpha);
  fillPixelEllipse(ctx, cx, oy + 42, 10, 4);

  // ── Shadow under feet ──
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  fillPixelEllipse(ctx, cx, oy + 41, 8, 3);

  // ── Legs ──
  const sitOffset = animType === 'sit' ? 3 : 0;
  const legY = headTop + 26 + sitOffset + walkBob;
  const legLen = animType === 'sit' ? 4 : 8;
  const spread = getWalkLegSpread(animType, frameIndex);
  ctx.fillStyle = hexToRgb(0x1a1e30);
  ctx.fillRect(cx - 4 - spread, legY, 4, legLen);
  ctx.fillRect(cx + spread, legY, 4, legLen);

  // ── Boots ──
  if (animType !== 'sit') {
    ctx.fillStyle = hexToRgb(0x0f1320);
    ctx.fillRect(cx - 5 - spread, legY + legLen, 5, 3);
    ctx.fillRect(cx + spread - 1, legY + legLen, 5, 3);
    // Boot highlight
    ctx.fillStyle = 'rgba(100,130,200,0.1)';
    ctx.fillRect(cx - 5 - spread, legY + legLen, 5, 1);
    ctx.fillRect(cx + spread - 1, legY + legLen, 5, 1);
  }

  // ── Body (gradient: primary top → darker bottom) ──
  const bodyY = headTop + 14 + sitOffset + walkBob;
  const darkPrimary = darkenColor(config.primaryColor, 0.7);
  // Bottom portion (darker)
  ctx.fillStyle = hexToRgb(darkPrimary);
  ctx.fillRect(cx - 7, bodyY + 5, 14, 7);
  // Top portion (lighter primary)
  ctx.fillStyle = hexToRgb(config.primaryColor);
  ctx.fillRect(cx - 7, bodyY, 14, 6);
  // Collar detail
  ctx.fillStyle = hexToRgb(config.secondaryColor);
  ctx.fillRect(cx - 4, bodyY, 8, 2);
  // Body edge highlight (subtle metallic)
  ctx.fillStyle = 'rgba(150,170,220,0.08)';
  ctx.fillRect(cx - 7, bodyY, 1, 12);
  ctx.fillRect(cx + 6, bodyY, 1, 12);

  // ── Arms (with typing vibration) ──
  const armVibrate = animType === 'type' && frameIndex % 2 === 1 ? 1 : 0;
  const armSwing = getArmSwing(animType, frameIndex);
  ctx.fillStyle = hexToRgb(config.primaryColor);
  ctx.fillRect(cx - 10, bodyY + 2 + armVibrate + armSwing, 3, 8);
  ctx.fillRect(cx + 7, bodyY + 2 - armVibrate - armSwing, 3, 8);

  // ── Hands (skin) ──
  ctx.fillStyle = hexToRgb(config.skinTone);
  ctx.fillRect(cx - 10, bodyY + 10 + armVibrate + armSwing, 3, 3);
  ctx.fillRect(cx + 7, bodyY + 10 - armVibrate - armSwing, 3, 3);

  // ── Head ──
  const headY = headTop + 5 + walkBob;
  // Head shadow (darker skin on bottom)
  fillPixelCircle(ctx, cx, headY + 1, 6, darkenColor(config.skinTone, 0.9));
  // Main head
  fillPixelCircle(ctx, cx, headY, 6, config.skinTone);

  // ── Hair ──
  drawHair(ctx, cx, headTop + walkBob, config.hairStyle, config.hairColor);

  // ── Eyes ──
  if (animType === 'idle' && frameIndex === 1) {
    // Blink frame
    ctx.fillStyle = hexToRgb(darkenColor(config.skinTone, 0.85));
    ctx.fillRect(cx - 3, headY + 1, 2, 1);
    ctx.fillRect(cx + 1, headY + 1, 2, 1);
  } else {
    // Open eyes (2×2 with highlight)
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(cx - 3, headY, 2, 2);
    ctx.fillRect(cx + 1, headY, 2, 2);
    // Eye shine (white pixel, top-left of each eye)
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(cx - 3, headY, 1, 1);
    ctx.fillRect(cx + 1, headY, 1, 1);
  }

  // ── Mouth (subtle) ──
  if (animType !== 'walk-up') {
    ctx.fillStyle = hexToRgba(darkenColor(config.skinTone, 0.75), 0.5);
    ctx.fillRect(cx - 1, headY + 3, 2, 1);
  }

  // ── Accessory ──
  drawAccessory(ctx, cx, headTop + walkBob, config.accessory, config.secondaryColor);

  // ── Typing screen glow reflect on face ──
  if (animType === 'type') {
    ctx.fillStyle = 'rgba(0,200,255,0.06)';
    fillPixelCircle(ctx, cx, headY, 7, -1, 'rgba(0,200,255,0.06)');
  }
}

// ──────────────────────────────────────────────
// Hair styles — enhanced for 48px
// ──────────────────────────────────────────────

function drawHair(
  ctx: CanvasRenderingContext2D,
  cx: number,
  headTop: number,
  style: AgentSpriteConfig['hairStyle'],
  color: number,
): void {
  ctx.fillStyle = hexToRgb(color);
  const highlightColor = lightenColor(color, 1.3);

  switch (style) {
    case 'short':
      ctx.fillRect(cx - 6, headTop + 1, 12, 4);
      ctx.fillRect(cx - 7, headTop + 2, 1, 3);
      ctx.fillRect(cx + 6, headTop + 2, 1, 3);
      // Highlight
      ctx.fillStyle = hexToRgb(highlightColor);
      ctx.fillRect(cx - 2, headTop + 1, 3, 1);
      break;
    case 'long':
      ctx.fillRect(cx - 6, headTop + 1, 12, 4);
      ctx.fillRect(cx - 7, headTop + 2, 2, 12);
      ctx.fillRect(cx + 5, headTop + 2, 2, 12);
      // Tips
      ctx.fillRect(cx - 7, headTop + 13, 1, 2);
      ctx.fillRect(cx + 6, headTop + 13, 1, 2);
      // Highlight
      ctx.fillStyle = hexToRgb(highlightColor);
      ctx.fillRect(cx - 3, headTop + 1, 4, 1);
      break;
    case 'spiky':
      ctx.fillRect(cx - 5, headTop + 1, 10, 3);
      ctx.fillRect(cx - 5, headTop - 1, 2, 3);
      ctx.fillRect(cx - 1, headTop - 3, 2, 3);
      ctx.fillRect(cx + 3, headTop - 1, 2, 3);
      // Extra spike
      ctx.fillRect(cx + 1, headTop - 2, 2, 2);
      // Highlight
      ctx.fillStyle = hexToRgb(highlightColor);
      ctx.fillRect(cx - 1, headTop - 3, 1, 1);
      break;
    case 'bun':
      ctx.fillRect(cx - 6, headTop + 1, 12, 4);
      ctx.fillRect(cx - 3, headTop - 2, 6, 4);
      // Bun decoration
      ctx.fillStyle = hexToRgb(highlightColor);
      ctx.fillRect(cx - 1, headTop - 2, 2, 1);
      break;
    case 'bald':
      // Shine highlights
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(cx - 2, headTop + 2, 3, 1);
      ctx.fillRect(cx - 1, headTop + 1, 2, 1);
      break;
    case 'ponytail':
      ctx.fillRect(cx - 6, headTop + 1, 12, 4);
      ctx.fillRect(cx + 6, headTop + 3, 2, 8);
      ctx.fillRect(cx + 5, headTop + 10, 2, 3);
      // Hair band
      ctx.fillStyle = hexToRgb(highlightColor);
      ctx.fillRect(cx + 5, headTop + 3, 3, 1);
      break;
  }
}

// ──────────────────────────────────────────────
// Accessories — enhanced
// ──────────────────────────────────────────────

function drawAccessory(
  ctx: CanvasRenderingContext2D,
  cx: number,
  headTop: number,
  accessory: AgentSpriteConfig['accessory'],
  color: number,
): void {
  ctx.fillStyle = hexToRgb(color);

  switch (accessory) {
    case 'glasses':
      // Lens frames
      ctx.fillRect(cx - 5, headTop + 4, 4, 3);
      ctx.fillRect(cx + 1, headTop + 4, 4, 3);
      // Lens (lighter)
      ctx.fillStyle = 'rgba(120,160,255,0.25)';
      ctx.fillRect(cx - 4, headTop + 5, 2, 1);
      ctx.fillRect(cx + 2, headTop + 5, 2, 1);
      // Bridge
      ctx.fillStyle = hexToRgb(color);
      ctx.fillRect(cx - 1, headTop + 4, 2, 1);
      break;
    case 'headset':
      // Band over head
      ctx.fillRect(cx - 7, headTop + 3, 1, 4);
      ctx.fillRect(cx + 6, headTop + 3, 1, 4);
      ctx.fillRect(cx - 6, headTop + 1, 12, 1);
      // Ear cups
      ctx.fillRect(cx - 8, headTop + 5, 2, 3);
      ctx.fillRect(cx + 6, headTop + 5, 2, 3);
      // Mic boom
      ctx.fillRect(cx - 9, headTop + 6, 2, 1);
      ctx.fillRect(cx - 10, headTop + 7, 2, 2);
      // Mic LED
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(cx - 10, headTop + 7, 1, 1);
      break;
    case 'beret':
      ctx.fillRect(cx - 7, headTop, 12, 3);
      ctx.fillRect(cx - 8, headTop + 1, 3, 1);
      // Top decoration
      ctx.fillStyle = hexToRgb(lightenColor(color, 1.2));
      ctx.fillRect(cx - 2, headTop, 2, 1);
      break;
    case 'tie':
      ctx.fillRect(cx - 1, headTop + 14, 2, 6);
      ctx.fillRect(cx - 2, headTop + 13, 4, 2);
      // Tie knot
      ctx.fillStyle = hexToRgb(lightenColor(color, 1.2));
      ctx.fillRect(cx - 1, headTop + 13, 2, 1);
      break;
    case 'scarf':
      ctx.fillRect(cx - 7, headTop + 11, 14, 3);
      ctx.fillRect(cx + 6, headTop + 13, 2, 4);
      // Stripe
      ctx.fillStyle = hexToRgb(lightenColor(color, 1.3));
      ctx.fillRect(cx - 7, headTop + 12, 14, 1);
      break;
    case 'clipboard':
      ctx.fillRect(cx + 9, headTop + 17, 5, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 10, headTop + 18, 3, 1);
      ctx.fillRect(cx + 10, headTop + 20, 3, 1);
      ctx.fillRect(cx + 10, headTop + 22, 2, 1);
      break;
    case 'cap':
      ctx.fillRect(cx - 7, headTop + 1, 14, 3);
      ctx.fillRect(cx - 9, headTop + 2, 4, 2);
      // Visor shine
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(cx - 8, headTop + 2, 3, 1);
      break;
    case 'headphones':
      ctx.fillRect(cx - 7, headTop + 2, 1, 7);
      ctx.fillRect(cx + 6, headTop + 2, 1, 7);
      ctx.fillRect(cx - 8, headTop + 5, 2, 4);
      ctx.fillRect(cx + 6, headTop + 5, 2, 4);
      // Cup detail
      ctx.fillStyle = hexToRgb(lightenColor(color, 1.3));
      ctx.fillRect(cx - 8, headTop + 6, 1, 2);
      ctx.fillRect(cx + 7, headTop + 6, 1, 2);
      break;
    case 'pen':
      ctx.fillRect(cx + 6, headTop + 1, 1, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 6, headTop + 1, 1, 2);
      // Pen clip
      ctx.fillStyle = hexToRgb(color);
      ctx.fillRect(cx + 5, headTop + 2, 1, 1);
      break;
    case 'crown':
      ctx.fillRect(cx - 4, headTop - 2, 8, 3);
      ctx.fillRect(cx - 4, headTop - 4, 1, 2);
      ctx.fillRect(cx - 1, headTop - 5, 2, 3);
      ctx.fillRect(cx + 3, headTop - 4, 1, 2);
      // Jewels
      ctx.fillStyle = '#ff3366';
      ctx.fillRect(cx - 3, headTop - 1, 1, 1);
      ctx.fillStyle = '#00ccff';
      ctx.fillRect(cx + 2, headTop - 1, 1, 1);
      break;
    case 'none':
      break;
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getWalkLegSpread(animType: AnimType, frameIndex: number): number {
  if (animType === 'walk-down' || animType === 'walk-up' || animType === 'walk-side') {
    const spreads = [0, 3, 0, -3];
    return spreads[frameIndex] ?? 0;
  }
  return 0;
}

function getWalkBob(animType: AnimType, frameIndex: number): number {
  if (animType === 'walk-down' || animType === 'walk-up' || animType === 'walk-side') {
    return frameIndex % 2 === 1 ? -1 : 0;
  }
  if (animType === 'idle') {
    return frameIndex === 1 ? -1 : 0; // Breathing
  }
  return 0;
}

function getArmSwing(animType: AnimType, frameIndex: number): number {
  if (animType === 'walk-down' || animType === 'walk-up' || animType === 'walk-side') {
    const swings = [1, -1, -1, 1];
    return swings[frameIndex] ?? 0;
  }
  return 0;
}

function fillPixelCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: number,
  colorOverride?: string,
): void {
  ctx.fillStyle = colorOverride ?? hexToRgb(color);
  for (let dy = -radius; dy <= radius; dy++) {
    const halfWidth = Math.round(Math.sqrt(radius * radius - dy * dy));
    ctx.fillRect(cx - halfWidth, cy + dy, halfWidth * 2, 1);
  }
}

function fillPixelEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const halfWidth = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
    ctx.fillRect(cx - halfWidth, cy + dy, halfWidth * 2, 1);
  }
}

function hexToRgb(hex: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgb(${r},${g},${b})`;
}

function hexToRgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

function darkenColor(hex: number, factor: number): number {
  const r = Math.round(((hex >> 16) & 0xff) * factor);
  const g = Math.round(((hex >> 8) & 0xff) * factor);
  const b = Math.round((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function lightenColor(hex: number, factor: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((hex >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((hex & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}
