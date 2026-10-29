import { describe, expect, it } from 'vitest';
import { BANDS, BT709, bandOf, bandRange, frameInVideo, histogram, histogramPath, luma, oetf, signalAt, zebraThreshold } from '../../src/analysis/levels.ts';
import { getReference } from '../../src/references/index.ts';

const band = (id: string) => BANDS.find((b) => b.id === id)!;

describe('BT.709 levels', () => {
  it('cites a reference that exists', () => {
    expect(getReference(BT709.ref)?.number).toBe('ITU-R BT.709-6');
  });

  it('luma weights add up to 1 (white is 100 %)', () => {
    expect(luma(1, 1, 1)).toBeCloseTo(1, 12);
    expect(luma(0, 1, 0)).toBeCloseTo(0.7152, 12);
  });

  it('transfer curve: linear toe, power law above 0.018, continuous at the joint', () => {
    expect(oetf(0)).toBe(0);
    expect(oetf(1)).toBeCloseTo(1, 12);
    expect(oetf(0.01)).toBeCloseTo(0.045, 12);
    expect(oetf(0.018)).toBeCloseTo(4.5 * 0.018, 3);
  });

  it('an 18 % grey card encodes at about 41 %, one stop over at about 59 %', () => {
    expect(signalAt(0)).toBeCloseTo(0.409, 3);
    expect(signalAt(1)).toBeCloseTo(0.595, 3);
    expect(signalAt(-3)).toBeCloseTo(0.1, 2);
  });
});

describe('false colour bands', () => {
  it('do not overlap and run from brightest to darkest', () => {
    for (let i = 1; i < BANDS.length; i++) expect(BANDS[i]!.hi).toBeLessThanOrEqual(BANDS[i - 1]!.lo);
    for (const b of BANDS) expect(b.hi).toBeGreaterThan(b.lo);
  });

  it('put grey, one stop over, clipping and black where expected', () => {
    expect(bandOf(signalAt(0))?.id).toBe('grey');
    expect(bandOf(signalAt(1))?.id).toBe('overGrey');
    expect(bandOf(1)?.id).toBe('clipped');
    expect(bandOf(0.97)?.id).toBe('nearClip');
    expect(bandOf(0.05)?.id).toBe('shadow');
    expect(bandOf(0)?.id).toBe('crushed');
    // Half a stop over grey is between bands: shown in grey.
    expect(bandOf(signalAt(0.5))).toBeUndefined();
  });

  it('labels ranges in whole percent for the legend', () => {
    expect(bandRange(band('grey'))).toBe('37-45 %');
    expect(bandRange(band('overGrey'))).toBe('54-65 %');
    expect(bandRange(band('clipped'))).toBe('99-100 %');
    expect(bandRange(band('shadow'))).toBe('2-10 %');
  });
});

describe('zebras', () => {
  it('100 % marks only fully clipped 8-bit values', () => {
    expect(254 / 255).toBeLessThan(zebraThreshold(100));
    expect(1).toBeGreaterThanOrEqual(zebraThreshold(100));
    expect(zebraThreshold(95)).toBe(0.95);
  });
});

describe('histogram', () => {
  const px = (...rgb: number[][]) => new Uint8ClampedArray(rgb.flatMap(([r, g, b]) => [r!, g!, b!, 255]));

  it('bins luma and each channel, and measures clipping at both ends', () => {
    const h = histogram(px([0, 0, 0], [255, 255, 255], [255, 255, 255], [128, 128, 128]), 4);
    expect(h.count).toBe(4);
    expect([...h.luma]).toEqual([1, 0, 1, 2]);
    expect([...h.r]).toEqual([1, 0, 1, 2]);
    expect(h.low).toBe(0.25);
    expect(h.high).toBe(0.5);
  });

  it('pure red counts in the red channel and at 21 % luma', () => {
    const h = histogram(px([255, 0, 0]), 100);
    expect(h.r[99]).toBe(1);
    expect(h.g[0]).toBe(1);
    expect(h.luma[21]).toBe(1);
  });

  it('path scales to the tallest inner bin, so a clipped spike does not flatten the rest', () => {
    const d = histogramPath(new Uint32Array([100, 10, 5, 0]), 40, 10, true);
    expect(d.startsWith('M0,10L5.0,0.0')).toBe(true);
    expect(d).toContain('15.0,0.0');
    expect(d).toContain('25.0,5.0');
    expect(d.endsWith('L40,10Z')).toBe(true);
  });
});

describe('frame inside the video', () => {
  it('maps the frame into video fractions', () => {
    // Video covers the whole stage: frame unchanged.
    const same = frameInVideo({ x: 0, y: 0.2, w: 1, h: 0.6 }, { x: 0, y: 0, w: 1, h: 1 })!;
    expect(same.y).toBeCloseTo(0.2, 12);
    expect(same.h).toBeCloseTo(0.6, 12);
    // Video enlarged 2x around the centre: the frame sees the middle half.
    const r = frameInVideo({ x: 0, y: 0, w: 1, h: 1 }, { x: -0.5, y: -0.5, w: 2, h: 2 })!;
    expect(r.x).toBeCloseTo(0.25);
    expect(r.w).toBeCloseTo(0.5);
  });

  it('clips to the picture when the video is smaller than the frame ("wider than your camera")', () => {
    const r = frameInVideo({ x: 0, y: 0, w: 1, h: 1 }, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 })!;
    expect(r).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(frameInVideo({ x: 0, y: 0, w: 0.2, h: 0.2 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 })).toBeNull();
  });
});
