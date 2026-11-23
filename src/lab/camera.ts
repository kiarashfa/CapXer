import { circleOfConfusion, desqueezed, entrancePupil, type Area } from '../optics/index.ts';
import { derive } from '../setup/derive.ts';
import type { Setup } from '../setup/types.ts';
import type { Point } from './types.ts';

// The lab camera, from the viewfinder setup (the same camera, format, frame
// and focal length), plus the sampling patterns the renderer uses to build up
// depth of field, motion blur, soft light and smooth edges. Pure: no three.js.

export interface LabCamera {
  focal: number;
  /** The frame as seen (desqueezed), mm. */
  frame: Area;
  /** Frame width / height. */
  aspect: number;
  /** Vertical angle of view, degrees. */
  vFov: number;
  /** tan of half the horizontal / vertical angle of view. */
  tanW: number;
  tanH: number;
  /** Acceptable circle of confusion for this frame, mm (diagonal / 1500). */
  coc: number;
}

export function labCamera(setup: Setup, area: Area): LabCamera {
  const d = derive(setup, area);
  const frame = desqueezed(d.frame, d.squeeze);
  // Horizontal angle comes from the desqueezed width (an anamorphic lens sees wider).
  const tanW = Math.tan((d.fov.horizontal * Math.PI) / 360);
  const tanH = Math.tan((d.fov.vertical * Math.PI) / 360);
  return { focal: setup.focal, frame, aspect: tanW / tanH, vFov: d.fov.vertical, tanW, tanH, coc: circleOfConfusion(frame) };
}

/** Entrance pupil radius in metres (the disc the camera samples for depth of field). */
export function pupilRadiusM(focalMm: number, fNumber: number): number {
  return entrancePupil(focalMm, fNumber) / 2 / 1000;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Sample i of n on the unit disc, evenly spread (golden-angle spiral: equal
 * area per sample, no clumps). Scale by the pupil radius for depth of field,
 * or by a light's half-size for soft shadows.
 */
export function discPoint(i: number, n: number): { x: number; y: number } {
  const r = Math.sqrt((i + 0.5) / n);
  const a = i * GOLDEN_ANGLE;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

/** Low-discrepancy number in [0, 1) for sample i (golden ratio sequence): moment inside the shutter time. */
export function timeSample(i: number): number {
  return (i * 0.6180339887498949) % 1;
}

/** Sub-pixel offset in [-0.5, 0.5) for sample i (R2 sequence), for smooth edges. */
export function pixelJitter(i: number): { x: number; y: number } {
  return { x: ((0.5 + i * 0.7548776662466927) % 1) - 0.5, y: ((0.5 + i * 0.5698402909980532) % 1) - 0.5 };
}

/**
 * Projection shift (normalised device units) that keeps the focus plane still
 * when the camera moves by (dx, dy) metres across the pupil: subtract it from
 * the projection matrix's skew terms. Points at the focus distance then land
 * on the same pixel from every point of the pupil; nearer and farther points
 * spread into blur discs, as through a real lens.
 */
export function focusShift(dx: number, dy: number, focusM: number, tanW: number, tanH: number): { x: number; y: number } {
  return { x: dx / (focusM * tanW), y: dy / (focusM * tanH) };
}

/** Distance between two points, metres. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
