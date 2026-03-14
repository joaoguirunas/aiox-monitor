import { TILE_WIDTH, TILE_HEIGHT } from '../data/office-layout';

/** Converte coordenadas tile (grid) para pixel (screen) em projeção isométrica 2:1 */
export function tileToPixel(tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: (tileX - tileY) * (TILE_WIDTH / 2),
    y: (tileX + tileY) * (TILE_HEIGHT / 2),
  };
}

/** Converte coordenadas pixel (screen) para tile (grid) */
export function pixelToTile(pixelX: number, pixelY: number): { tileX: number; tileY: number } {
  return {
    tileX: Math.floor((pixelX / (TILE_WIDTH / 2) + pixelY / (TILE_HEIGHT / 2)) / 2),
    tileY: Math.floor((pixelY / (TILE_HEIGHT / 2) - pixelX / (TILE_WIDTH / 2)) / 2),
  };
}
