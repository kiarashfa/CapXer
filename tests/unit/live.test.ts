import { describe, expect, it } from 'vitest';
import {
  captureRect,
  equivalentOf,
  fovFromDeviceCamera,
  fovFromDiagonal,
  fovFromEquivalent,
  levelRoll,
  planZoom,
  streamTangents,
  videoBox,
} from '../../src/camera/lens.ts';
import { calibrationFov } from '../../src/camera/calibration.ts';
import { getDevice } from '../../src/data/index.ts';

const deg = (tan: number) => (2 * Math.atan(tan) * 180) / Math.PI;

describe('calibration', () => {
  it('a 24 mm equivalent on a 4:3 phone sensor sees 71.6° across the long side', () => {
    // 4:3 area with the full-frame diagonal (43.27 mm) is 34.6 mm wide.
    expect(deg(fovFromEquivalent(24).longTan)).toBeCloseTo(71.6, 1);
  });

  it('a diagonal angle converts back to the equivalent focal length', () => {
    // 43.27 / (2 * tan 42.5°) = 23.6 mm
    expect(equivalentOf(fovFromDiagonal(85))).toBeCloseTo(23.6, 1);
    expect(equivalentOf(fovFromEquivalent(26))).toBeCloseTo(26, 6);
  });

  it('uses the image shape the maker quotes (webcam figures are 16:9)', () => {
    const c920 = fovFromDeviceCamera(getDevice('logitech/c920')!.cameras[0]!);
    expect(c920.aspect).toBeCloseTo(16 / 9, 6);
    // 78° diagonal on 16:9: long side tan = tan 39° x 16 / sqrt(16² + 9²)
    expect(c920.longTan).toBeCloseTo((Math.tan((39 * Math.PI) / 180) * 16) / Math.hypot(16, 9), 9);
  });

  it('reads a device camera from the database', () => {
    expect(equivalentOf(calibrationFov({ kind: 'device', deviceId: 'apple/iphone-17', cameraId: 'main' }))).toBeCloseTo(26, 6);
    expect(equivalentOf(calibrationFov({ kind: 'device', deviceId: 'samsung/galaxy-s25', cameraId: 'wide' }))).toBeCloseTo(23.6, 1);
  });
});

describe('streamTangents', () => {
  const fov = fovFromEquivalent(24);
  const L = fov.longTan;

  it('a 16:9 stream from a 4:3 sensor keeps the full width', () => {
    expect(streamTangents(fov, 1920, 1080)).toEqual({ x: L, y: (L * 1080) / 1920 });
  });

  it('follows the phone in portrait', () => {
    const s = streamTangents(fov, 1080, 1920);
    expect(s.y).toBeCloseTo(L, 12);
    expect(s.x).toBeCloseTo(L * 0.5625, 12);
  });

  it('a stream narrower than the native image keeps the full short side', () => {
    const webcam = fovFromDiagonal(78, 16 / 9);
    const s = streamTangents(webcam, 640, 480);
    expect(s.y).toBeCloseTo(webcam.longTan * (9 / 16), 12);
    expect(s.x).toBeCloseTo(webcam.longTan * 0.75, 12);
  });
});

describe('planZoom', () => {
  const lens = { x: 0.2, y: 0.1 };
  const stream = { x: 0.8, y: 0.45 };

  it('without camera zoom, all of it is digital', () => {
    expect(planZoom(lens, stream)).toEqual({ camera: 1, digital: 4, total: 4, mode: 'digital' });
  });

  it('uses the camera zoom when it reaches', () => {
    expect(planZoom(lens, stream, { min: 1, max: 10 })).toMatchObject({ camera: 4, digital: 1, mode: 'camera' });
  });

  it('adds digital zoom beyond the camera maximum', () => {
    expect(planZoom(lens, stream, { min: 1, max: 2 })).toMatchObject({ camera: 2, digital: 2, mode: 'camera' });
  });

  it('snaps to the camera zoom step', () => {
    expect(planZoom({ x: 0.3, y: 0.1 }, stream, { min: 1, max: 10, step: 0.1 }).camera).toBeCloseTo(2.7, 9);
  });

  it('reports a lens wider than the camera', () => {
    expect(planZoom({ x: 1, y: 0.5 }, stream)).toMatchObject({ camera: 1, mode: 'wider' });
    expect(planZoom({ x: 1, y: 0.5 }, stream).digital).toBeCloseTo(0.8, 9);
  });

  it('zooms out where the camera allows it (ultra-wide behind a 0.5x control)', () => {
    expect(planZoom({ x: 1, y: 0.5 }, stream, { min: 0.5, max: 10 })).toMatchObject({ camera: 0.8, mode: 'camera' });
  });
});

describe('video placement and capture', () => {
  const lens = { x: 0.2, y: 0.1 };
  const stream = { x: 0.8, y: 0.45 };

  it('places the video centred in tangent space', () => {
    expect(videoBox(lens, stream, 1)).toEqual({ x: -1.5, y: -1.75, w: 4, h: 4.5 });
    expect(videoBox(lens, stream, 4)).toEqual({ x: 0, y: -0.0625, w: 1, h: 1.125 });
  });

  it('crops the frame out of the video pixels with the right shape', () => {
    const frame = { x: 0, y: 0.1, w: 1, h: 0.8 };
    const r = captureRect(frame, videoBox(lens, stream, 1), { width: 1920, height: 1080 });
    expect(r).toEqual({ x: 720, y: 444, w: 480, h: 192 });
    // Frame is 0.4 x 0.16 in tangent space: 2.5:1, same as the crop.
    expect(r.w / r.h).toBeCloseTo(2.5, 9);
  });
});

describe('levelRoll', () => {
  it('is level when the phone stands upright', () => {
    expect(levelRoll(90, 0)).toEqual({ roll: 0, valid: true });
  });

  it('reads a clockwise roll as positive', () => {
    expect(levelRoll(80, 90).roll).toBeCloseTo(10, 6);
  });

  it('accounts for the screen turning to landscape', () => {
    const r = levelRoll(0, -90, 90);
    expect(r.valid).toBe(true);
    expect(r.roll).toBeCloseTo(0, 6);
  });

  it('gives up when the phone lies flat', () => {
    expect(levelRoll(0, 0).valid).toBe(false);
  });
});
