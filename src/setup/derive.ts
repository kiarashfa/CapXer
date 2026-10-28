import { aspectRatio, coverageAtDistance, cropFactor, desqueezed, fieldOfView, fitAspect, type Area, type FieldOfView } from '../optics/index.ts';
import { aspectPreset } from './presets.ts';
import type { Setup } from './types.ts';

// Everything the viewfinder shows, derived from the setup and the selected
// format's image area. All optics come from src/optics (tested separately).

export interface Derived {
  /** Recorded area on the sensor, mm. */
  area: Area;
  squeeze: number;
  /** Width / height of the recorded image after desqueeze. */
  areaAspect: number;
  /** The frame inside the area, sensor mm (not desqueezed). */
  frame: Area;
  /** Frame size as a share of the area (0-1 each way), for drawing. */
  frameFraction: { w: number; h: number };
  /** Angle of view of the frame (desqueezed), degrees. */
  fov: FieldOfView;
  /** Crop factor of the recorded area (diagonal convention). */
  crop: number;
  /** Full-frame focal length with the same diagonal angle as the recorded area. */
  equivalent: number;
  /** Frame size at the subject distance, metres. */
  coverage: Area;
}

export function derive(setup: Setup, area: Area): Derived {
  const squeeze = setup.squeeze;
  const preset = aspectPreset(setup.mode, setup.aspect);
  const target = preset?.ratio ?? aspectRatio(area, squeeze);
  const { frame } = fitAspect(area, target, squeeze);
  const crop = cropFactor(area, squeeze);
  return {
    area,
    squeeze,
    areaAspect: aspectRatio(area, squeeze),
    frame,
    frameFraction: { w: frame.width / area.width, h: frame.height / area.height },
    fov: fieldOfView(frame, setup.focal, squeeze),
    crop,
    equivalent: setup.focal * crop,
    coverage: coverageAtDistance(frame, setup.focal, setup.distance, squeeze),
  };
}

/** Desqueezed width and height of an area, mm (what the image looks like). */
export function displaySize(area: Area, squeeze: number): Area {
  return desqueezed(area, squeeze);
}
