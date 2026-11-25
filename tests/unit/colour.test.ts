import { describe, expect, it } from 'vitest';
import { LUMA } from '../../src/analysis/levels.ts';
import {
  BT709_PRIMARIES,
  C2,
  C2_SOURCE,
  CMF_SOURCE,
  PRIMARIES_SOURCE,
  blackbodyXYZ,
  cmf1931,
  kelvinToRgb,
  rgbToXyzMatrix,
  whiteBalanceGains,
  xyzToRgb,
} from '../../src/optics/index.ts';
import { getReference } from '../../src/references/index.ts';

const lum = ([r, g, b]: number[]) => LUMA[0] * r! + LUMA[1] * g! + LUMA[2] * b!;

describe('colour sources', () => {
  it('cite the reference library', () => {
    for (const c of [CMF_SOURCE, C2_SOURCE, PRIMARIES_SOURCE])
      expect(getReference(c.ref), c.ref).toBeDefined();
  });

  it('use the 2022 CODATA second radiation constant', () => {
    expect(C2).toBe(1.438776877e-2);
  });
});

describe('BT.709 matrix', () => {
  it('its luminance row equals the BT.709 luma weights (item 3.2), computed from the primaries alone', () => {
    const y = rgbToXyzMatrix()[1];
    for (let i = 0; i < 3; i++) expect(y[i]).toBeCloseTo(LUMA[i]!, 4);
  });

  it('R = G = B = 1 is the D65 white of item 1.4', () => {
    const [X, Y, Z] = rgbToXyzMatrix().map((row) => row[0] + row[1] + row[2]) as [
      number,
      number,
      number,
    ];
    expect(X / (X + Y + Z)).toBeCloseTo(BT709_PRIMARIES.white[0], 6);
    expect(Y / (X + Y + Z)).toBeCloseTo(BT709_PRIMARIES.white[1], 6);
    expect(xyzToRgb([X, Y, Z]).every((c) => Math.abs(c - 1) < 1e-9)).toBe(true);
  });
});

describe('colour-matching fit', () => {
  it('y-bar is highest in the green and small at the ends of the visible range', () => {
    const y = (w: number) => cmf1931(w)[1];
    expect(y(555)).toBeGreaterThan(y(500));
    expect(y(555)).toBeGreaterThan(y(620));
    expect(y(400)).toBeLessThan(0.01);
    expect(y(720)).toBeLessThan(0.01);
  });
});

describe('light colour by temperature', () => {
  it('has luminance 1 whatever the temperature (colour never changes brightness)', () => {
    for (const k of [3000, 4000, 5600, 6500, 8000, 10000]) {
      expect(blackbodyXYZ(k)[1]).toBe(1);
      expect(lum(kelvinToRgb(k))).toBeCloseTo(1, 3); // LUMA is rounded to 4 places
    }
  });

  it('runs from warm (more red) to cool (more blue) as the temperature rises', () => {
    let last = Infinity;
    for (const k of [2500, 3200, 4000, 5600, 6500, 10000]) {
      const [r, , b] = kelvinToRgb(k);
      expect(r / b).toBeLessThan(last);
      last = r / b;
    }
    const [r3, g3, b3] = kelvinToRgb(3200);
    expect(r3).toBeGreaterThan(g3);
    expect(g3).toBeGreaterThan(b3);
    const [r10, , b10] = kelvinToRgb(10000);
    expect(b10).toBeGreaterThan(r10);
  });

  it('a white balance set to the light makes it neutral', () => {
    for (const k of [3200, 5600, 7500]) {
      const c = kelvinToRgb(k);
      const g = whiteBalanceGains(k);
      for (let i = 0; i < 3; i++) expect(c[i]! * g[i]!).toBeCloseTo(1, 9);
    }
  });

  it('daylight under a tungsten setting turns blue', () => {
    const c = kelvinToRgb(5600);
    const g = whiteBalanceGains(3200);
    expect(c[2]! * g[2]!).toBeGreaterThan(c[0]! * g[0]!);
  });

  it('rejects zero or negative temperatures', () => {
    expect(() => blackbodyXYZ(0)).toThrow(RangeError);
  });
});
