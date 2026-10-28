import { desqueezed, diagonal } from './format.ts';
import type { Area, FieldOfView } from './types.ts';

// Angle of view for a rectilinear lens focused at infinity:
//   angle = 2 * atan(d / (2 * f))
// where d is the image dimension and f the focal length, both in mm.
// Focusing closer extends the lens and narrows the angle slightly (focus
// breathing, magnification); that is ignored here. Fisheye lenses do not
// follow this formula.
//
// Anamorphic: a lens with squeeze s squeezes s times more horizontal angle
// onto the same sensor width, so the horizontal angle equals that of a
// spherical lens on a sensor s times wider (see desqueezed()).

const RAD_TO_DEG = 180 / Math.PI;

/** Angle of view in degrees across one image dimension. */
export function angleOfView(dimension: number, focalLength: number): number {
  if (!(dimension > 0) || !(focalLength > 0)) throw new RangeError('dimension and focal length must be positive');
  return 2 * Math.atan(dimension / (2 * focalLength)) * RAD_TO_DEG;
}

/** Horizontal, vertical and diagonal angle of view in degrees. */
export function fieldOfView(area: Area, focalLength: number, squeeze = 1): FieldOfView {
  const a = desqueezed(area, squeeze);
  return {
    horizontal: angleOfView(a.width, focalLength),
    vertical: angleOfView(a.height, focalLength),
    diagonal: angleOfView(diagonal(a), focalLength),
  };
}

/** Focal length (mm) that gives the requested angle (degrees) across a dimension. Inverse of angleOfView(). */
export function focalLengthForAngle(dimension: number, angleDeg: number): number {
  if (!(angleDeg > 0 && angleDeg < 180)) throw new RangeError('angle must be between 0 and 180 degrees');
  return dimension / (2 * Math.tan(angleDeg / RAD_TO_DEG / 2));
}

/**
 * Size of the scene covered at a subject distance, in the same unit as
 * `distance`. Pinhole approximation (distance from the lens, much larger than
 * the focal length); good to within about f / distance.
 */
export function coverageAtDistance(area: Area, focalLength: number, distance: number, squeeze = 1): Area {
  const a = desqueezed(area, squeeze);
  return { width: (a.width * distance) / focalLength, height: (a.height * distance) / focalLength };
}
