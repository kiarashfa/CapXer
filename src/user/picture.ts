// Profile photos: decoded in the browser, cropped to a square around the round
// frame the user positioned, and stored as one small image (PICTURE_PX square)
// inside the save file, so it grows by a few KB, not by the photo.

import { LIMITS } from '../storage/schema.ts';

export const PICTURE_PX = 192;
export const MAX_FILE = 20 * 1024 * 1024;
export const MAX_ZOOM = 4;

export interface Crop {
  /** 1 = the photo's short side just fills the circle. */
  zoom: number;
  /** Offset of the photo's centre from the circle's centre, in circle diameters. */
  x: number;
  y: number;
}

/** Decodes a chosen file (EXIF rotation applied); throws on anything that is not a picture. */
export async function decode(file: File): Promise<ImageBitmap> {
  if (file.size > MAX_FILE) throw new Error('tooBig');
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('notImage');
  }
}

/** Keeps the circle covered by the photo: limits the offset for this zoom. */
export function clampCrop(c: Crop, w: number, h: number): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, c.zoom));
  const short = Math.min(w, h);
  // Photo size in circle diameters.
  const pw = (w / short) * zoom;
  const ph = (h / short) * zoom;
  const mx = (pw - 1) / 2;
  const my = (ph - 1) / 2;
  return { zoom, x: Math.min(mx, Math.max(-mx, c.x)), y: Math.min(my, Math.max(-my, c.y)) };
}

/** The square of the photo inside the circle, in photo pixels. */
export function sourceRect(c: Crop, w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h) / c.zoom;
  // The circle's centre sits -offset away from the photo's centre.
  const cx = w / 2 - c.x * side;
  const cy = h / 2 - c.y * side;
  return { sx: cx - side / 2, sy: cy - side / 2, side };
}

/** The cropped picture as a data: URL (WebP where the browser can write it, else JPEG). */
export function render(bitmap: ImageBitmap, c: Crop): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PICTURE_PX;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  const { sx, sy, side } = sourceRect(c, bitmap.width, bitmap.height);
  g.drawImage(bitmap, sx, sy, side, side, 0, 0, PICTURE_PX, PICTURE_PX);
  for (const q of [0.82, 0.7, 0.55]) {
    let out = canvas.toDataURL('image/webp', q);
    if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', q);
    if (out.length <= LIMITS.picture) return out;
  }
  return canvas.toDataURL('image/jpeg', 0.4);
}
