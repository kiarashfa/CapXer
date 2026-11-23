import type { Citation } from '../data/index.ts';
import { diagonal } from './format.ts';
import type { Area } from './types.ts';

// Depth of field for the v2 lab. Pure: no DOM, unit-tested. All lengths in mm,
// distances measured from the lens (its entrance pupil) to the subject.
//
// Follows Nasse, "Depth of Field and Bokeh" (Zeiss, 2010):
// - Entrance pupil diameter = focal length / f-number (p. 12).
// - Hyperfocal distance ~ f^2 / (N * c), the nearest focus at which depth of
//   field reaches infinity; its near limit is half of it (p. 12).
// - Acceptable circle of confusion c = image diagonal / 1500 (pp. 8 and 13);
//   it belongs to the format, not the lens (p. 9).
// - Focus distance = harmonic mean of the near and far limits (p. 15). The
//   limits below, H*s/(H+s) and H*s/(H-s), are the pair that satisfies it.
// These are the usual approximations for subjects much farther than the focal
// length; they are not meant for macro distances.

export const DOF_SOURCE: Citation = { ref: 'zeiss-nasse-depth-of-field-2010', locator: 'pp. 8, 9, 12, 13, 15' };

/** The diagonal is divided by this to get the acceptable circle of confusion. */
export const COC_DIVISOR = 1500;

function positive(name: string, ...values: number[]) {
  for (const v of values) if (!(v > 0 && Number.isFinite(v))) throw new RangeError(`${name} must be positive and finite`);
}

/** Acceptable circle of confusion (mm) for an image area: diagonal / 1500. */
export function circleOfConfusion(area: Area): number {
  return diagonal(area) / COC_DIVISOR;
}

/** Entrance pupil diameter (mm): focal length / f-number. */
export function entrancePupil(focalLength: number, fNumber: number): number {
  positive('focal length and f-number', focalLength, fNumber);
  return focalLength / fNumber;
}

/** Hyperfocal distance (mm). */
export function hyperfocal(focalLength: number, fNumber: number, coc: number): number {
  positive('focal length, f-number and circle of confusion', focalLength, fNumber, coc);
  return (focalLength * focalLength) / (fNumber * coc);
}

export interface DepthOfField {
  /** Near limit (mm). */
  near: number;
  /** Far limit (mm), Infinity at or beyond the hyperfocal distance. */
  far: number;
  /** far - near (mm), Infinity when far is. */
  total: number;
}

/** Near and far limits of acceptable sharpness when focused at `focus` (mm). */
export function depthOfField(focalLength: number, fNumber: number, coc: number, focus: number): DepthOfField {
  positive('focus distance', focus);
  const h = hyperfocal(focalLength, fNumber, coc);
  const near = (h * focus) / (h + focus);
  const far = focus >= h ? Infinity : (h * focus) / (h - focus);
  return { near, far, total: far - near };
}

/**
 * Diameter (mm, on the sensor) of the blur disc of a point at `distance` when
 * focused at `focus`. Object side: the light cone from the entrance pupil to
 * the focus plane cuts a disc of pupil * |distance - focus| / distance there;
 * the image is that times the magnification, about focalLength / focus.
 * Equals the circle of confusion for a point at infinity when focused at the
 * hyperfocal distance (consistent with the formulas above).
 */
export function blurDiameter(focalLength: number, fNumber: number, focus: number, distance: number): number {
  positive('focus distance', focus);
  if (!(distance > 0)) throw new RangeError('subject distance must be positive');
  const pupil = entrancePupil(focalLength, fNumber);
  const spread = distance === Infinity ? 1 : Math.abs(distance - focus) / distance;
  return pupil * spread * (focalLength / focus);
}
