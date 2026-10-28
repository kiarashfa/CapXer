import type { Area } from './types.ts';

// Format size, crop factor and equivalence.
//
// Convention: crop factor is the ratio of DIAGONALS against the 36 x 24 mm
// full-frame format (the common photographic convention). Equivalent focal
// length therefore matches the DIAGONAL angle of view; when aspect ratios
// differ, horizontal or vertical angles will not match exactly.

/** 36 x 24 mm full-frame reference format. */
export const FULL_FRAME: Readonly<Area> = { width: 36, height: 24 };

export function diagonal(area: Area): number {
  return Math.hypot(area.width, area.height);
}

/** Full-frame diagonal, about 43.27 mm. */
export const FULL_FRAME_DIAGONAL = diagonal(FULL_FRAME);

/**
 * Area as it appears after desqueezing an anamorphic image: the width is
 * stretched by the squeeze factor. A squeeze of 1 (spherical lens) changes nothing.
 */
export function desqueezed(area: Area, squeeze = 1): Area {
  return { width: area.width * squeeze, height: area.height };
}

/** Diagonal crop factor relative to full frame (> 1 for smaller formats). */
export function cropFactor(area: Area, squeeze = 1): number {
  return FULL_FRAME_DIAGONAL / diagonal(desqueezed(area, squeeze));
}

/** Full-frame focal length giving the same diagonal angle of view. */
export function equivalentFocalLength(focalLength: number, area: Area, squeeze = 1): number {
  return focalLength * cropFactor(area, squeeze);
}

/**
 * Full-frame f-number giving the same depth of field at the same framing and
 * distance (depth-of-field equivalence). It does not change exposure: the
 * exposure f-number is the lens's own.
 */
export function equivalentAperture(fNumber: number, area: Area, squeeze = 1): number {
  return fNumber * cropFactor(area, squeeze);
}

/** Width divided by height, after desqueeze. */
export function aspectRatio(area: Area, squeeze = 1): number {
  const a = desqueezed(area, squeeze);
  return a.width / a.height;
}
