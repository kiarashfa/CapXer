import { describe, expect, it } from 'vitest';
import {
  FULL_FRAME,
  FULL_FRAME_DIAGONAL,
  angleOfView,
  aspectRatio,
  coverageAtDistance,
  cropFactor,
  equivalentAperture,
  equivalentFocalLength,
  fieldOfView,
  fitAspect,
  focalLengthForAngle,
} from '../../src/optics/index.ts';

// Reference: the standard angle-of-view table for rectilinear lenses on the
// 36 x 24 mm format (values as commonly published, rounded to 0.1 degree).
const FF_TABLE = [
  { f: 24, diagonal: 84.1, horizontal: 73.7, vertical: 53.1 },
  { f: 35, diagonal: 63.4, horizontal: 54.4, vertical: 37.8 },
  { f: 50, diagonal: 46.8, horizontal: 39.6, vertical: 27.0 },
  { f: 85, diagonal: 28.6, horizontal: 23.9, vertical: 16.1 },
  { f: 200, diagonal: 12.3, horizontal: 10.3, vertical: 6.9 },
];

describe('angle of view', () => {
  for (const row of FF_TABLE) {
    it(`${row.f} mm on full frame matches the reference table`, () => {
      const fov = fieldOfView(FULL_FRAME, row.f);
      expect(Math.abs(fov.diagonal - row.diagonal)).toBeLessThan(0.06);
      expect(Math.abs(fov.horizontal - row.horizontal)).toBeLessThan(0.06);
      expect(Math.abs(fov.vertical - row.vertical)).toBeLessThan(0.06);
    });
  }

  it('is 90 degrees when the dimension is twice the focal length', () => {
    expect(angleOfView(50, 25)).toBeCloseTo(90, 10);
  });

  it('inverts with focalLengthForAngle', () => {
    expect(focalLengthForAngle(36, angleOfView(36, 50))).toBeCloseTo(50, 10);
  });

  it('rejects non-positive input', () => {
    expect(() => angleOfView(0, 50)).toThrow(RangeError);
    expect(() => angleOfView(36, -1)).toThrow(RangeError);
    expect(() => focalLengthForAngle(36, 180)).toThrow(RangeError);
  });

  it('widens horizontally by the anamorphic squeeze', () => {
    // A 2x anamorphic 50 mm on a 22 mm wide area sees what a spherical 50 mm sees on 44 mm.
    expect(fieldOfView({ width: 22, height: 18.59 }, 50, 2).horizontal).toBeCloseTo(angleOfView(44, 50), 10);
    expect(fieldOfView({ width: 22, height: 18.59 }, 50, 2).vertical).toBeCloseTo(angleOfView(18.59, 50), 10);
  });
});

describe('crop factor and equivalence', () => {
  it('full frame diagonal is about 43.27 mm', () => {
    expect(FULL_FRAME_DIAGONAL).toBeCloseTo(43.267, 3);
    expect(cropFactor(FULL_FRAME)).toBe(1);
  });

  it.each([
    ['Micro Four Thirds 17.3 x 13.0', { width: 17.3, height: 13.0 }, 2.0],
    ['APS-C 23.5 x 15.6', { width: 23.5, height: 15.6 }, 1.53],
    ['1-inch type 13.2 x 8.8', { width: 13.2, height: 8.8 }, 2.73],
    ['medium format 43.8 x 32.9', { width: 43.8, height: 32.9 }, 0.79],
  ])('%s has the published crop factor', (_name, area, expected) => {
    expect(cropFactor(area)).toBeCloseTo(expected, 2);
  });

  it('25 mm f/1.4 on Micro Four Thirds frames like 50 mm f/2.8 on full frame', () => {
    const mft = { width: 17.3, height: 13.0 };
    expect(equivalentFocalLength(25, mft)).toBeCloseTo(50, 0);
    expect(equivalentAperture(1.4, mft)).toBeCloseTo(2.8, 1);
  });

  it('measures aspect ratio after desqueeze', () => {
    expect(aspectRatio(FULL_FRAME)).toBe(1.5);
    expect(aspectRatio({ width: 22, height: 18.59 }, 2)).toBeCloseTo(2.367, 3);
  });
});

describe('fitAspect', () => {
  it('letterboxes a wider target', () => {
    const r = fitAspect(FULL_FRAME, 16 / 9);
    expect(r.crop).toBe('top-bottom');
    expect(r.frame.width).toBe(36);
    expect(r.frame.height).toBeCloseTo(20.25, 10);
    expect(fitAspect(FULL_FRAME, 2.39).frame.height).toBeCloseTo(15.063, 3);
  });

  it('pillarboxes a narrower target', () => {
    const r = fitAspect(FULL_FRAME, 4 / 3);
    expect(r.crop).toBe('sides');
    expect(r.frame.width).toBeCloseTo(32, 10);
    expect(r.frame.height).toBe(24);
    expect(r.coverage).toBeCloseTo(32 / 36, 10);
  });

  it('leaves a matching aspect untouched', () => {
    expect(fitAspect(FULL_FRAME, 3 / 2)).toEqual({ frame: FULL_FRAME, crop: 'none', coverage: 1 });
  });

  it('fits on the desqueezed image for anamorphic', () => {
    // 2x anamorphic on 22 x 18.59 desqueezes to about 2.367:1; 2.39:1 trims the height.
    const r = fitAspect({ width: 22, height: 18.59 }, 2.39, 2);
    expect(r.crop).toBe('top-bottom');
    expect((r.frame.width * 2) / r.frame.height).toBeCloseTo(2.39, 10);
  });
});

describe('coverageAtDistance', () => {
  it('a 50 mm on full frame covers 3.6 x 2.4 m at 5 m', () => {
    const c = coverageAtDistance(FULL_FRAME, 50, 5);
    expect(c.width).toBeCloseTo(3.6, 10);
    expect(c.height).toBeCloseTo(2.4, 10);
  });
});
