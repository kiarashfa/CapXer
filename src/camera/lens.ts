import { FULL_FRAME_DIAGONAL } from '../optics/format.ts';
import type { DeviceCamera } from '../data/index.ts';

// Live-camera lens maths. Everything is in "tangent space", like the static
// scene (src/overlay/scene.ts): a direction at angle a from the lens axis sits
// at tan(a). The simulated lens sees [-w/2f, w/2f] across; the phone camera
// sees a range set by its calibration. Comparing the two tells how much to
// zoom, and whether the phone can see enough at all.
//
// Assumptions (documented on the site as "approximate"):
// - Equivalent focal lengths use the diagonal convention against 36 x 24 mm,
//   applied to the image shape the maker quotes (4:3 for phone stills unless
//   the data says otherwise).
// - A video stream uses the full sensor along its long side when the stream is
//   wider than the native image (16:9 from 4:3), and the full short side when
//   it is narrower. Stabilisation crops a little more; manual entry corrects it.
// - Camera zoom of z narrows both tangents by z.

/** A calibrated camera: tangent of half its angle across the native image's long side, and that image's shape. */
export interface CameraFov {
  longTan: number;
  /** Long side / short side of the native image, >= 1. */
  aspect: number;
}

/** Calibration as the user gives it: a device camera from the database, or a typed value. */
export type Calibration =
  | { kind: 'device'; deviceId: string; cameraId: string }
  | { kind: 'equivalent'; mm: number }
  | { kind: 'diagonal'; degrees: number };

const PHONE_ASPECT = 4 / 3;

function fromDiagonalTan(diagTan: number, aspect: number): CameraFov {
  return { longTan: (diagTan * aspect) / Math.hypot(aspect, 1), aspect };
}

/** From a 35mm-equivalent focal length (diagonal convention). */
export function fovFromEquivalent(mm: number, aspect = PHONE_ASPECT): CameraFov {
  return fromDiagonalTan(FULL_FRAME_DIAGONAL / (2 * mm), aspect);
}

/** From a diagonal angle of view in degrees. */
export function fovFromDiagonal(degrees: number, aspect = PHONE_ASPECT): CameraFov {
  return fromDiagonalTan(Math.tan((degrees * Math.PI) / 360), aspect);
}

export function fovFromDeviceCamera(c: Pick<DeviceCamera, 'equivalent' | 'diagonalFov' | 'aspect'>): CameraFov {
  const aspect = c.aspect ? Math.max(c.aspect[0], c.aspect[1]) / Math.min(c.aspect[0], c.aspect[1]) : PHONE_ASPECT;
  return c.equivalent !== undefined ? fovFromEquivalent(c.equivalent, aspect) : fovFromDiagonal(c.diagonalFov!, aspect);
}

/** The 35mm-equivalent focal length of a calibrated camera (for display). */
export function equivalentOf(fov: CameraFov): number {
  const diagTan = (fov.longTan * Math.hypot(fov.aspect, 1)) / fov.aspect;
  return FULL_FRAME_DIAGONAL / (2 * diagTan);
}

/** Half extents in tangent space of a stream of w x h pixels (either orientation), at camera zoom 1. */
export function streamTangents(fov: CameraFov, w: number, h: number): { x: number; y: number } {
  const long = Math.max(w, h);
  const streamAspect = long / Math.min(w, h);
  const longTan = streamAspect >= fov.aspect ? fov.longTan : (fov.longTan / fov.aspect) * streamAspect;
  const perPixel = longTan / (long / 2);
  return { x: (perPixel * w) / 2, y: (perPixel * h) / 2 };
}

export interface ZoomRange {
  min: number;
  max: number;
  step?: number;
}

export type LiveMode = 'camera' | 'digital' | 'wider';

export interface ZoomPlan {
  /** Zoom to ask the camera for (1 when it has no zoom control). */
  camera: number;
  /** Extra enlargement done by scaling the video (>= 1), or < 1 when the camera cannot see enough. */
  digital: number;
  /** Total magnification from the camera's widest view at zoom 1. */
  total: number;
  mode: LiveMode;
}

const TOLERANCE = 0.01;

/**
 * Split the zoom between the camera (when it offers zoom) and digital scaling.
 * `lens` is the simulated lens's half extents, `stream` the stream's at zoom 1.
 * The video must cover the whole simulated image, so the total is limited by
 * the tighter of the two directions.
 */
export function planZoom(lens: { x: number; y: number }, stream: { x: number; y: number }, range?: ZoomRange): ZoomPlan {
  const total = Math.min(stream.x / lens.x, stream.y / lens.y);
  let camera = 1;
  if (range && range.max > range.min) {
    camera = Math.min(range.max, Math.max(range.min, total));
    if (range.step && range.step > 0) camera = range.min + Math.round((camera - range.min) / range.step) * range.step;
    camera = Math.min(range.max, Math.max(range.min, camera));
  }
  const digital = total / camera;
  // "camera" whenever the camera zooms (any rest is digital, shown alongside).
  const mode: LiveMode = digital < 1 - TOLERANCE ? 'wider' : Math.abs(camera - 1) > TOLERANCE ? 'camera' : 'digital';
  return { camera, digital, total, mode };
}

/** Where the video sits in the stage, as fractions of the stage box (centred). */
export function videoBox(lens: { x: number; y: number }, stream: { x: number; y: number }, camera: number) {
  const w = stream.x / camera / lens.x;
  const h = stream.y / camera / lens.y;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/**
 * Source rectangle (video pixels) for a photo of the frame. `frame` is the
 * frame as fractions of the stage, `video` the video's box in the same
 * fractions (from videoBox). The rectangle may reach outside the video when
 * the camera cannot see the whole frame; the caller fills that part.
 */
export function captureRect(
  frame: { x: number; y: number; w: number; h: number },
  video: { x: number; y: number; w: number; h: number },
  px: { width: number; height: number },
) {
  const sx = px.width / video.w;
  const sy = px.height / video.h;
  return { x: (frame.x - video.x) * sx, y: (frame.y - video.y) * sy, w: frame.w * sx, h: frame.h * sy };
}

/**
 * Roll of the screen against the horizon, in degrees (positive = the screen is
 * turned clockwise), from DeviceOrientationEvent beta and gamma (degrees) and
 * the screen's orientation angle. `valid` is false when the phone lies too flat
 * for a horizon to mean anything.
 */
export function levelRoll(beta: number, gamma: number, screenAngle = 0): { roll: number; valid: boolean } {
  const b = (beta * Math.PI) / 180;
  const g = (gamma * Math.PI) / 180;
  // "Up" in device coordinates (x right, y towards the top edge, z out of the screen).
  const ux = -Math.sin(g) * Math.cos(b);
  const uy = Math.sin(b);
  const valid = Math.hypot(ux, uy) > 0.5;
  let roll = (Math.atan2(-ux, uy) * 180) / Math.PI + screenAngle;
  roll = ((((roll + 180) % 360) + 360) % 360) - 180;
  return { roll, valid };
}
