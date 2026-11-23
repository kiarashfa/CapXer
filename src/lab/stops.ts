// The lab's settings steps. Pure, unit-tested.
//
// Apertures and shutter times move in third stops. The maths uses the exact
// values (a third stop is 2^(1/6) in f-number and 2^(1/3) in time); the labels
// are the rounded numbers cameras mark (f/5.6 is really 5.66, 1/60 is really
// 1/64), the same convention real cameras follow. ISO speeds are used as
// marked. The lab's lens is ideal: f/1.4 to f/22, and a T-stop equals the f-number.

export interface Stop {
  value: number;
  label: string;
}

const APERTURE_LABELS = ['1.4', '1.6', '1.8', '2', '2.2', '2.5', '2.8', '3.2', '3.5', '4', '4.5', '5', '5.6', '6.3', '7.1', '8', '9', '10', '11', '13', '14', '16', '18', '20', '22'];
/** f/1.4 (2^(3/6)) to f/22 (2^(27/6)). */
export const APERTURES: Stop[] = APERTURE_LABELS.map((label, i) => ({ value: 2 ** ((i + 3) / 6), label }));

const SHUTTER_LABELS = [
  '30', '25', '20', '15', '13', '10', '8', '6', '5', '4', '3.2', '2.5', '2', '1.6', '1.3', '1', '0.8', '0.6', '0.5', '0.4', '0.3',
  '1/4', '1/5', '1/6', '1/8', '1/10', '1/13', '1/15', '1/20', '1/25', '1/30', '1/40', '1/50', '1/60', '1/80', '1/100', '1/125',
  '1/160', '1/200', '1/250', '1/320', '1/400', '1/500', '1/640', '1/800', '1/1000', '1/1250', '1/1600', '1/2000', '1/2500',
  '1/3200', '1/4000', '1/5000', '1/6400', '1/8000',
];
/** 30 s (2^5) to 1/8000 s (2^-13), longest first. */
export const SHUTTERS: Stop[] = SHUTTER_LABELS.map((label, i) => ({ value: 2 ** (5 - i / 3), label: `${label} s` }));

export const ISOS: number[] = [50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 16000, 20000, 25600];

/** Common cinema shutter angles, degrees. */
export const ANGLES: number[] = [11.25, 22.5, 45, 90, 144, 172.8, 180, 270, 360];

/** Common frame rates, frames per second. */
export const FRAME_RATES: number[] = [23.976, 24, 25, 29.97, 30, 48, 50, 60];

/** White balance settings, kelvin. */
export const WHITE_BALANCES: number[] = [2500, 2800, 3200, 3600, 4000, 4500, 5000, 5600, 6500, 7500, 9000, 10000];

/** Manual focus distances, metres (Infinity last). */
export const FOCUS_DISTANCES: number[] = [0.5, 0.6, 0.7, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10, 15, 20, 30, Infinity];

/** Index of the entry closest to `value` (on a log scale, which is how stops are spaced). */
export function nearestIndex(values: number[], value: number): number {
  let best = 0;
  let bestD = Infinity;
  values.forEach((v, i) => {
    const d = Number.isFinite(v) && Number.isFinite(value) ? Math.abs(Math.log(v / value)) : v === value ? 0 : Infinity;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Index after one step, kept inside the list. */
export function step(index: number, direction: 1 | -1, length: number): number {
  return Math.max(0, Math.min(length - 1, index + direction));
}
