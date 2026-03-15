import type { AgentSpriteConfig } from '../data/agent-sprite-config';

export const FRAME_SIZE = 32;
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
 * Gera um spritesheet pixel art 192×96 (18 frames de 32×32) para um agente.
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
// Frame drawing
// ──────────────────────────────────────────────

function drawAgentFrame(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  config: AgentSpriteConfig,
  animType: AnimType,
  frameIndex: number,
): void {
  const cx = ox + 16; // horizontal center
  const headTop = oy + 4; // top of head area

  // ── Head ──
  fillPixelCircle(ctx, cx, headTop + 4, 4, config.skinTone);

  // ── Hair ──
  drawHair(ctx, cx, headTop, config.hairStyle, config.hairColor);

  // ── Body ──
  const bodyY = headTop + 9;
  const sitOffset = animType === 'sit' ? 2 : 0;

  ctx.fillStyle = hexToRgb(config.primaryColor);
  ctx.fillRect(cx - 5, bodyY + sitOffset, 10, 10);

  // ── Arms (vibrate when typing) ──
  const armVibrate = animType === 'type' && frameIndex % 2 === 1 ? 1 : 0;
  ctx.fillStyle = hexToRgb(config.primaryColor);
  ctx.fillRect(cx - 7, bodyY + 1 + sitOffset + armVibrate, 2, 6);
  ctx.fillRect(cx + 5, bodyY + 1 + sitOffset - armVibrate, 2, 6);

  // ── Hands (skin) ──
  ctx.fillStyle = hexToRgb(config.skinTone);
  ctx.fillRect(cx - 7, bodyY + 7 + sitOffset + armVibrate, 2, 2);
  ctx.fillRect(cx + 5, bodyY + 7 + sitOffset - armVibrate, 2, 2);

  // ── Legs ──
  const legY = bodyY + 10 + sitOffset;
  const legLen = animType === 'sit' ? 3 : 5;
  const spread = getWalkLegSpread(animType, frameIndex);
  ctx.fillStyle = hexToRgb(0x333344);
  ctx.fillRect(cx - 3 - spread, legY, 3, legLen);
  ctx.fillRect(cx + spread, legY, 3, legLen);

  // ── Shoes ──
  ctx.fillStyle = hexToRgb(0x222233);
  if (animType !== 'sit') {
    ctx.fillRect(cx - 4 - spread, legY + legLen, 4, 2);
    ctx.fillRect(cx + spread - 1, legY + legLen, 4, 2);
  }

  // ── Accessory ──
  drawAccessory(ctx, cx, headTop, config.accessory, config.secondaryColor);

  // ── Idle breath bounce ──
  if (animType === 'idle' && frameIndex === 1) {
    // slight upward shift already handled by different frame — add subtle eye blink
    ctx.fillStyle = hexToRgb(config.skinTone);
    ctx.fillRect(cx - 2, headTop + 3, 1, 1);
    ctx.fillRect(cx + 1, headTop + 3, 1, 1);
  } else {
    // Eyes (small dark pixels)
    ctx.fillStyle = '#111111';
    ctx.fillRect(cx - 2, headTop + 3, 1, 1);
    ctx.fillRect(cx + 1, headTop + 3, 1, 1);
  }

  // ── Walk bob (vertical offset for walk frames) ──
  // Walk frames 1 and 3 are "up" positions — we shift body up 1px by drawing at oy-1
  // This is already baked into the leg spread; the visual bob comes from leg positions.
}

// ──────────────────────────────────────────────
// Hair styles
// ──────────────────────────────────────────────

function drawHair(
  ctx: CanvasRenderingContext2D,
  cx: number,
  headTop: number,
  style: AgentSpriteConfig['hairStyle'],
  color: number,
): void {
  ctx.fillStyle = hexToRgb(color);

  switch (style) {
    case 'short':
      // Cap-like hair on top half
      ctx.fillRect(cx - 4, headTop, 8, 3);
      ctx.fillRect(cx - 5, headTop + 1, 1, 2);
      ctx.fillRect(cx + 4, headTop + 1, 1, 2);
      break;
    case 'long':
      // Hair flowing down sides
      ctx.fillRect(cx - 4, headTop, 8, 3);
      ctx.fillRect(cx - 5, headTop + 1, 2, 8);
      ctx.fillRect(cx + 3, headTop + 1, 2, 8);
      break;
    case 'spiky':
      // Spikes pointing up
      ctx.fillRect(cx - 3, headTop, 6, 2);
      ctx.fillRect(cx - 4, headTop - 1, 2, 2);
      ctx.fillRect(cx, headTop - 2, 2, 2);
      ctx.fillRect(cx + 2, headTop - 1, 2, 2);
      break;
    case 'bun':
      // Hair with bun on top
      ctx.fillRect(cx - 4, headTop, 8, 3);
      ctx.fillRect(cx - 2, headTop - 2, 4, 3);
      break;
    case 'bald':
      // Just a subtle shine highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(cx - 1, headTop + 1, 2, 1);
      break;
    case 'ponytail':
      // Hair on top + tail hanging right
      ctx.fillRect(cx - 4, headTop, 8, 3);
      ctx.fillRect(cx + 4, headTop + 2, 2, 6);
      ctx.fillRect(cx + 3, headTop + 7, 2, 2);
      break;
  }
}

// ──────────────────────────────────────────────
// Accessories
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
      // Two rectangles over eyes + bridge
      ctx.fillRect(cx - 3, headTop + 2, 3, 2);
      ctx.fillRect(cx, headTop + 2, 3, 2);
      ctx.fillRect(cx - 1, headTop + 2, 2, 1);
      break;
    case 'headset':
      // Arc over head + ear pieces
      ctx.fillRect(cx - 5, headTop + 2, 1, 3);
      ctx.fillRect(cx + 4, headTop + 2, 1, 3);
      ctx.fillRect(cx - 4, headTop, 8, 1);
      // Mic boom
      ctx.fillRect(cx - 6, headTop + 4, 2, 1);
      break;
    case 'beret':
      // Flat hat tilted
      ctx.fillRect(cx - 5, headTop - 1, 8, 2);
      ctx.fillRect(cx - 6, headTop, 3, 1);
      break;
    case 'tie':
      // Small tie below neck
      ctx.fillRect(cx - 1, headTop + 9, 2, 4);
      ctx.fillRect(cx - 2, headTop + 9, 4, 1);
      break;
    case 'scarf':
      // Wrap around neck
      ctx.fillRect(cx - 5, headTop + 7, 10, 2);
      ctx.fillRect(cx + 4, headTop + 8, 2, 3);
      break;
    case 'clipboard':
      // Small board held at side
      ctx.fillRect(cx + 6, headTop + 12, 4, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 7, headTop + 13, 2, 3);
      break;
    case 'cap':
      // Baseball cap
      ctx.fillRect(cx - 5, headTop, 10, 2);
      ctx.fillRect(cx - 6, headTop + 1, 4, 1);
      break;
    case 'headphones':
      // Over-ear headphones
      ctx.fillRect(cx - 5, headTop + 1, 1, 5);
      ctx.fillRect(cx + 4, headTop + 1, 1, 5);
      ctx.fillRect(cx - 6, headTop + 3, 2, 3);
      ctx.fillRect(cx + 4, headTop + 3, 2, 3);
      break;
    case 'pen':
      // Pen behind ear
      ctx.fillRect(cx + 4, headTop, 1, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 4, headTop, 1, 1);
      break;
    case 'crown':
      // Small crown
      ctx.fillRect(cx - 3, headTop - 2, 6, 2);
      ctx.fillRect(cx - 3, headTop - 3, 1, 1);
      ctx.fillRect(cx, headTop - 3, 1, 1);
      ctx.fillRect(cx + 2, headTop - 3, 1, 1);
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
    // Frames 0,2 = neutral; 1 = right forward; 3 = left forward
    const spreads = [0, 2, 0, -2];
    return spreads[frameIndex] ?? 0;
  }
  return 0;
}

function fillPixelCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: number,
): void {
  ctx.fillStyle = hexToRgb(color);
  // Pixel-art circle via filled rows
  for (let dy = -radius; dy <= radius; dy++) {
    const halfWidth = Math.round(Math.sqrt(radius * radius - dy * dy));
    ctx.fillRect(cx - halfWidth, cy + dy, halfWidth * 2, 1);
  }
}

function hexToRgb(hex: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgb(${r},${g},${b})`;
}
