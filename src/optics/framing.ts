import type { Area } from './types.ts';

// Fitting a target aspect ratio (for example 2.39:1) inside a recorded area.
// The frame is the largest centred rectangle of the target aspect that fits:
// if the area is wider than the target, the sides are cropped (pillarbox);
// if it is taller, the top and bottom are cropped (letterbox).
// With an anamorphic squeeze s, the aspect is judged on the desqueezed image
// (width x s), and the returned frame is in sensor millimetres (squeezed).

export type Crop = 'none' | 'sides' | 'top-bottom';

export interface FittedFrame {
  /** Frame on the sensor, in mm (not desqueezed). */
  frame: Area;
  crop: Crop;
  /** Share of the area's surface used by the frame, 0-1. */
  coverage: number;
}

const EPSILON = 1e-9;

export function fitAspect(area: Area, targetAspect: number, squeeze = 1): FittedFrame {
  if (!(targetAspect > 0)) throw new RangeError('aspect must be positive');
  const imageAspect = (area.width * squeeze) / area.height;

  let frame: Area;
  let crop: Crop;
  if (Math.abs(imageAspect - targetAspect) < EPSILON) {
    frame = { ...area };
    crop = 'none';
  } else if (imageAspect > targetAspect) {
    frame = { width: (area.height * targetAspect) / squeeze, height: area.height };
    crop = 'sides';
  } else {
    frame = { width: area.width, height: (area.width * squeeze) / targetAspect };
    crop = 'top-bottom';
  }
  return { frame, crop, coverage: (frame.width * frame.height) / (area.width * area.height) };
}
