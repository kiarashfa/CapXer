import type { FocalEntry } from './types.ts';

// Focal length helpers: the logarithmic slider, lens-stop stepping and the
// actual / full-frame-equivalent entry modes.

/** Slider covers 10-800 mm full-frame equivalent, converted to this format's actual focal lengths. */
export function focalRange(crop: number): { min: number; max: number } {
  return { min: Math.max(1, round(10 / crop)), max: Math.round(800 / crop) };
}

export const SLIDER_STEPS = 1000;

/** Logarithmic: every doubling of focal length moves the slider the same distance. */
export function toSlider(focal: number, range: { min: number; max: number }): number {
  const f = Math.min(Math.max(focal, range.min), range.max);
  return Math.round((Math.log(f / range.min) / Math.log(range.max / range.min)) * SLIDER_STEPS);
}

export function fromSlider(value: number, range: { min: number; max: number }): number {
  return round(range.min * Math.pow(range.max / range.min, value / SLIDER_STEPS));
}

/** Next lens stop up or down from the current focal length (stops in actual mm). */
export function stepFocal(current: number, stops: number[], direction: 1 | -1): number {
  const sorted = [...stops].sort((a, b) => a - b);
  const eps = 0.01;
  if (direction > 0) return sorted.find((s) => s > current + eps) ?? current;
  return [...sorted].reverse().find((s) => s < current - eps) ?? current;
}

/** The number the user sees and types, in the chosen entry mode. */
export function toEntry(actual: number, entry: FocalEntry, crop: number): number {
  return round(entry === 'equivalent' ? actual * crop : actual);
}

/** Convert an entered value back to the actual focal length. */
export function fromEntry(value: number, entry: FocalEntry, crop: number): number {
  return round(entry === 'equivalent' ? value / crop : value);
}

/** One decimal below 10 mm, whole numbers above. */
export function round(mm: number): number {
  return mm < 10 ? Math.round(mm * 10) / 10 : Math.round(mm);
}
