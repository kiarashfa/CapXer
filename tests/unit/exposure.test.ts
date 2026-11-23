import { describe, expect, it } from 'vitest';
import {
  DOF_SOURCE,
  EV_SOURCE,
  FULL_FRAME,
  METER_K,
  METER_K_SOURCE,
  MID_GREY,
  SHUTTER_ANGLE_SOURCE,
  blurDiameter,
  circleOfConfusion,
  depthOfField,
  entrancePupil,
  ev100FromLuminance,
  exposureOffsetStops,
  exposureValue,
  hyperfocal,
  luminanceFromEv100,
  pictureValue,
  settingsEv100,
  shutterAngleFromTime,
  shutterForEv100,
  shutterTimeFromAngle,
} from '../../src/optics/index.ts';
import { getReference } from '../../src/references/index.ts';

describe('sources', () => {
  it('every citation points at the reference library', () => {
    for (const c of [EV_SOURCE, METER_K_SOURCE, SHUTTER_ANGLE_SOURCE, DOF_SOURCE]) {
      expect(getReference(c.ref), c.ref).toBeDefined();
      expect(c.locator.length).toBeGreaterThan(0);
    }
  });
});

describe('exposure value', () => {
  it('is 0 at f/1 and 1 s (Wikipedia, Formal definition)', () => {
    expect(exposureValue(1, 1)).toBe(0);
  });

  it('gains one per stop of aperture or shutter', () => {
    expect(exposureValue(Math.SQRT2, 1)).toBeCloseTo(1, 10);
    expect(exposureValue(1, 0.5)).toBeCloseTo(1, 10);
  });

  it('ISO 400 is two steps above ISO 100 (Wikipedia: EV400 = EV100 + 2)', () => {
    expect(exposureValue(8, 1 / 125) - settingsEv100(8, 1 / 125, 400)).toBeCloseTo(2, 10);
  });

  // Kodak F-4017 (October 2021), p. 2, daylight table for TRI-X 400 (ISO 400),
  // all at 1/500 s. The lens openings are marked values (f/5.6 is really
  // 2^2.5 = 5.66), so the results land within a tenth or two of whole EVs.
  // Wikipedia's Table 2 gives EV100 16 for light sand or snow in sun and 15
  // for a typical sunny scene (the sunny 16 rule).
  const TRI_X_400 = [
    { light: 'bright or hazy sun on light sand or snow', n: 22, ev100: 16 },
    { light: 'bright or hazy sun, distinct shadows', n: 16, ev100: 15 },
    { light: 'weak, hazy sun', n: 11, ev100: 14 },
    { light: 'cloudy bright', n: 8, ev100: 13 },
    { light: 'heavy overcast, open shade', n: 5.6, ev100: 12 },
  ];
  for (const row of TRI_X_400) {
    it(`Kodak's TRI-X 400 exposure for ${row.light} is about EV100 ${row.ev100}`, () => {
      expect(Math.abs(settingsEv100(row.n, 1 / 500, 400) - row.ev100)).toBeLessThan(0.15);
    });
  }

  it('rejects zero and negative settings', () => {
    expect(() => exposureValue(0, 1)).toThrow(RangeError);
    expect(() => exposureValue(2, -1)).toThrow(RangeError);
    expect(() => settingsEv100(2, 1, 0)).toThrow(RangeError);
  });
});

describe('meter', () => {
  it('uses K = 12.5', () => {
    expect(METER_K).toBe(12.5);
  });

  it('EV100 0 is 0.125 cd/m2 and EV100 15 is 4096 cd/m2 (Wikipedia, with K = 12.5)', () => {
    expect(luminanceFromEv100(0)).toBeCloseTo(0.125, 10);
    expect(luminanceFromEv100(15)).toBeCloseTo(4096, 6);
  });

  it('luminance and EV100 convert both ways', () => {
    for (const ev of [-2, 0, 7.5, 15]) expect(ev100FromLuminance(luminanceFromEv100(ev))).toBeCloseTo(ev, 10);
  });

  it('settings that match the meter are 0 stops off; one stop more light is +1', () => {
    expect(exposureOffsetStops(15, 16, 1 / 128, 100)).toBeCloseTo(0, 10);
    expect(exposureOffsetStops(15, 16 / Math.SQRT2, 1 / 128, 100)).toBeCloseTo(1, 10);
    expect(exposureOffsetStops(15, 16, 1 / 256, 100)).toBeCloseTo(-1, 10);
  });

  it('shutterForEv100 inverts settingsEv100', () => {
    const t = shutterForEv100(12, 2.8, 800);
    expect(settingsEv100(2.8, t, 800)).toBeCloseTo(12, 10);
  });
});

describe('picture value', () => {
  it('a metered luminance lands on mid grey, and each stop doubles it', () => {
    const lum = luminanceFromEv100(10);
    const t = shutterForEv100(10, 4, 100);
    expect(pictureValue(lum, 4, t, 100)).toBeCloseTo(MID_GREY, 10);
    expect(pictureValue(lum, 4, 2 * t, 100)).toBeCloseTo(2 * MID_GREY, 10);
    expect(pictureValue(lum, 4, t, 200)).toBeCloseTo(2 * MID_GREY, 10);
    expect(pictureValue(lum, 4 * Math.SQRT2, t, 100)).toBeCloseTo(MID_GREY / 2, 10);
  });

  it('black stays black', () => {
    expect(pictureValue(0, 2, 1 / 50, 100)).toBe(0);
  });
});

describe('shutter angle', () => {
  it('180 degrees at 24 fps is 1/48 s (RED: "near 1/48 of a second")', () => {
    expect(shutterTimeFromAngle(180, 24)).toBeCloseTo(1 / 48, 12);
  });

  it('360 degrees is the whole frame time', () => {
    expect(shutterTimeFromAngle(360, 25)).toBeCloseTo(1 / 25, 12);
  });

  it('converts both ways', () => {
    expect(shutterAngleFromTime(shutterTimeFromAngle(172.8, 23.976), 23.976)).toBeCloseTo(172.8, 9);
  });

  it('rejects angles outside (0, 360]', () => {
    expect(() => shutterTimeFromAngle(0, 24)).toThrow(RangeError);
    expect(() => shutterTimeFromAngle(361, 24)).toThrow(RangeError);
  });
});

describe('depth of field (Nasse, Zeiss 2010)', () => {
  it('full-frame circle of confusion is about 0.029 mm (diagonal / 1500, p. 8)', () => {
    expect(circleOfConfusion(FULL_FRAME)).toBeCloseTo(0.0288, 4);
  });

  it('entrance pupil is focal length / f-number (p. 12)', () => {
    expect(entrancePupil(50, 2)).toBe(25);
  });

  it("p. 13's example: focal length twice a 43 mm diagonal at f/2 gives about 129 m", () => {
    const d = 43;
    expect(hyperfocal(2 * d, 2, d / 1500) / 1000).toBeCloseTo(129, 6);
  });

  it('focused at the hyperfocal distance, sharpness runs from half of it to infinity (p. 12)', () => {
    const h = hyperfocal(35, 8, 0.03);
    const dof = depthOfField(35, 8, 0.03, h);
    expect(dof.near).toBeCloseTo(h / 2, 9);
    expect(dof.far).toBe(Infinity);
    expect(dof.total).toBe(Infinity);
  });

  it('the focus distance is the harmonic mean of the near and far limits (p. 15)', () => {
    for (const [f, n, s] of [[50, 2.8, 2000], [85, 1.4, 1500], [24, 11, 900]]) {
      const { near, far } = depthOfField(f, n, 0.03, s);
      expect((2 * near * far) / (near + far)).toBeCloseTo(s, 6);
    }
  });

  it("p. 15's example: 50 mm at f/8 with 0.03 mm focused at 3.5 m has the far limit at twice the near", () => {
    const { near, far, total } = depthOfField(50, 8, 0.03, 3500);
    expect(far / near).toBeCloseTo(2, 1);
    // "the total depth of field is as large as the distance between the camera and the near limit"
    expect(total / near).toBeCloseTo(1, 1);
  });

  it('blur of a point at infinity equals the circle of confusion when focused at the hyperfocal distance', () => {
    const h = hyperfocal(85, 2, 0.03);
    expect(blurDiameter(85, 2, h, Infinity)).toBeCloseTo(0.03, 10);
  });

  it('a point at the focus distance is sharp, and blur grows with the aperture', () => {
    expect(blurDiameter(50, 1.4, 3000, 3000)).toBe(0);
    expect(blurDiameter(50, 1.4, 3000, 6000)).toBeCloseTo(2 * blurDiameter(50, 2.8, 3000, 6000), 10);
  });

  it('rejects non-positive input', () => {
    expect(() => hyperfocal(50, 0, 0.03)).toThrow(RangeError);
    expect(() => depthOfField(50, 2, 0.03, 0)).toThrow(RangeError);
  });
});
