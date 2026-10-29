import type { Box } from '../overlay/geometry.ts';
import type { Citation } from '../data/index.ts';

// Exposure-aid maths (P5). Pure: no DOM, unit-tested.
//
// Everything is measured on the video the browser hands over: 8-bit,
// full-range, gamma-encoded R'G'B' after the phone's own exposure and tone
// mapping. So "brightness" here is signal level (0 to 100 % of full scale),
// not scene light. Conventions:
// - Brightness is luma Y' from BT.709 coefficients (ITU-R BT.709-6, item 3.2).
// - False-colour bands are placed in stops around an 18 % grey card and turned
//   into signal levels with the BT.709 transfer curve (item 1.2). There is no
//   industry standard for false colour (every camera maker uses its own table),
//   so CapXer computes its bands from a cited curve instead of copying one.
//   Phones do not use the plain BT.709 curve (they tone-map), so the stop
//   labels are approximate on a phone picture; the site says so.
// - The clip thresholds (2 %, 95 %, 99 %) are CapXer's own choices.

export const BT709: Citation = { ref: 'itu-r-bt709-6', locator: 'Items 1.2 and 3.2' };

/** Luma weights for R', G', B' (BT.709-6 item 3.2). */
export const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** Luma of gamma-encoded components, each 0 to 1. */
export function luma(r: number, g: number, b: number): number {
  return LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
}

/** BT.709 opto-electronic transfer: relative scene luminance (0 to 1) to signal (0 to 1). Item 1.2. */
export function oetf(l: number): number {
  const x = Math.min(1, Math.max(0, l));
  return x < 0.018 ? 4.5 * x : 1.099 * x ** 0.45 - 0.099;
}

/** Reflectance of the grey card the bands are measured from. */
export const GREY_CARD = 0.18;

/** Signal level of an object `stops` brighter (or darker, negative) than the grey card. */
export const signalAt = (stops: number) => oetf(GREY_CARD * 2 ** stops);

export type BandId = 'clipped' | 'nearClip' | 'overGrey' | 'grey' | 'shadow' | 'crushed';

export interface Band {
  id: BandId;
  /** Signal range, lower bound included, upper bound excluded (0 to 1; the top band includes 1). */
  lo: number;
  hi: number;
  color: string;
}

/** Half width of the grey and one-stop-over bands, in stops. */
const HALF = 0.25;

/** From brightest to darkest. Everything outside a band is shown in grey. */
export const BANDS: readonly Band[] = [
  { id: 'clipped', lo: 0.99, hi: 1.0001, color: '#e8261e' },
  { id: 'nearClip', lo: 0.95, hi: 0.99, color: '#ffd400' },
  { id: 'overGrey', lo: signalAt(1 - HALF), hi: signalAt(1 + HALF), color: '#ff7ab6' },
  { id: 'grey', lo: signalAt(-HALF), hi: signalAt(HALF), color: '#3fae49' },
  { id: 'shadow', lo: 0.02, hi: signalAt(-3), color: '#2f6fe0' },
  { id: 'crushed', lo: 0, hi: 0.02, color: '#8a3ffc' },
];

export function bandOf(y: number): Band | undefined {
  return BANDS.find((b) => y >= b.lo && y < b.hi);
}

/** "54-65 %" for the legend. */
export function bandRange(b: Band): string {
  const pct = (v: number) => Math.round(Math.min(1, v) * 100);
  return `${pct(b.lo)}-${pct(b.hi)} %`;
}

export const ZEBRA_LEVELS = [70, 80, 90, 95, 100] as const;

/** Signal level (0 to 1) from which zebras show. 100 % means only fully clipped 8-bit values. */
export function zebraThreshold(level: number): number {
  return level >= 100 ? 254.5 / 255 : level / 100;
}

export type PeakSensitivity = 'low' | 'medium' | 'high';

/** Edge strength (Sobel magnitude of luma, divided by 4 so a hard black-white edge is 1) that counts as sharp. */
export const PEAK_THRESHOLD: Record<PeakSensitivity, number> = { low: 0.22, medium: 0.14, high: 0.08 };

export interface Histogram {
  bins: number;
  luma: Uint32Array;
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  /** Pixels counted. */
  count: number;
  /** Share of pixels at or below 1 % and at or above 99 % luma. */
  low: number;
  high: number;
}

/** Share of pixels at either end that counts as clipping in the histogram. */
export const CLIP_SHARE = 0.005;

/** Counts RGBA pixel data (as from getImageData) into `bins` bins of luma and of each channel. */
export function histogram(data: Uint8ClampedArray, bins = 64): Histogram {
  const h: Histogram = { bins, luma: new Uint32Array(bins), r: new Uint32Array(bins), g: new Uint32Array(bins), b: new Uint32Array(bins), count: 0, low: 0, high: 0 };
  const bin = (v: number) => Math.min(bins - 1, Math.floor((v / 256) * bins));
  let low = 0;
  let high = 0;
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p]!;
    const g = data[p + 1]!;
    const b = data[p + 2]!;
    const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
    h.luma[bin(y)]!++;
    h.r[bin(r)]!++;
    h.g[bin(g)]!++;
    h.b[bin(b)]!++;
    if (y <= 2.55) low++;
    else if (y >= 252.45) high++;
  }
  h.count = data.length / 4;
  h.low = h.count ? low / h.count : 0;
  h.high = h.count ? high / h.count : 0;
  return h;
}

/**
 * SVG path data for one histogram channel in a `w` x `h` box: a closed area
 * (for a fill) or an open line. Heights are scaled to the tallest inner bin,
 * so a spike of clipped pixels at either end does not flatten the rest.
 */
export function histogramPath(counts: Uint32Array, w: number, h: number, closed: boolean): string {
  const n = counts.length;
  let max = 1;
  for (let i = 1; i < n - 1; i++) max = Math.max(max, counts[i]!);
  const step = w / n;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const y = h - Math.min(1, counts[i]! / max) * h;
    pts.push(`${((i + 0.5) * step).toFixed(1)},${y.toFixed(1)}`);
  }
  return closed ? `M0,${h}L${pts.join('L')}L${w},${h}Z` : `M${pts.join('L')}`;
}

/**
 * The frame (fractions of the stage) as fractions of the video picture, given
 * where the video sits on the stage. Clipped to the picture; null when they do
 * not overlap. The histogram only counts what is inside the frame lines.
 */
export function frameInVideo(frame: Box, video: Box): Box | null {
  const x0 = Math.max(0, (frame.x - video.x) / video.w);
  const y0 = Math.max(0, (frame.y - video.y) / video.h);
  const x1 = Math.min(1, (frame.x + frame.w - video.x) / video.w);
  const y1 = Math.min(1, (frame.y + frame.h - video.y) / video.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
