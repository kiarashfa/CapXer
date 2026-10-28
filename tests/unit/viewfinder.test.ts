import { describe, expect, it } from 'vitest';
import { derive } from '../../src/setup/derive.ts';
import { focalRange, fromEntry, fromSlider, stepFocal, toEntry, toSlider } from '../../src/setup/focal.ts';
import { ASPECTS, SAFE_AREAS, defaultSetup } from '../../src/setup/presets.ts';
import { overlayGeometry } from '../../src/overlay/geometry.ts';
import { SCENE_HALF_WIDTH, project, viewBoxFor } from '../../src/overlay/scene.ts';
import { getReference } from '../../src/references/index.ts';

const ALEXA_4K = { width: 24.9, height: 14.0 };

describe('derive (default cinema setup: ALEXA 35, 4K 16:9, 2.39:1, 35 mm)', () => {
  const d = derive(defaultSetup('cinema'), ALEXA_4K);

  it('matches the values shown in the approved mocks', () => {
    expect(d.fov.horizontal).toBeCloseTo(39.2, 1);
    expect(d.fov.vertical).toBeCloseTo(16.9, 1);
    expect(d.fov.diagonal).toBeCloseTo(42.2, 1);
    expect(d.crop).toBeCloseTo(1.51, 2);
    expect(Math.round(d.equivalent)).toBe(53);
    expect(d.coverage.width).toBeCloseTo(2.13, 2);
    expect(d.coverage.height).toBeCloseTo(0.89, 2);
  });

  it('letterboxes 2.39:1 inside 16:9', () => {
    expect(d.frameFraction.w).toBe(1);
    // ARRI's published 4K 16:9 area is 24.9 x 14.0 mm, a 1.7786 ratio.
    expect(d.frameFraction.h).toBeCloseTo(24.9 / 14 / 2.39, 6);
  });

  it('"full" frames the whole format', () => {
    const full = derive({ ...defaultSetup('cinema'), aspect: 'full' }, ALEXA_4K);
    expect(full.frameFraction).toEqual({ w: 1, h: 1 });
  });

  it('desqueezes anamorphic before fitting the aspect', () => {
    const d2 = derive({ ...defaultSetup('cinema'), aspect: '2.39', squeeze: 2 }, { width: 22, height: 18.59 });
    expect(d2.areaAspect).toBeCloseTo(2.367, 3);
    expect(d2.frameFraction.w).toBe(1);
    expect(d2.frameFraction.h).toBeLessThan(1);
  });
});

describe('focal helpers', () => {
  it('covers 10-800 mm full-frame equivalent', () => {
    expect(focalRange(1)).toEqual({ min: 10, max: 800 });
    expect(focalRange(1.51)).toEqual({ min: 6.6, max: 530 });
  });

  it('maps the slider logarithmically and back', () => {
    const r = focalRange(1);
    expect(toSlider(10, r)).toBe(0);
    expect(toSlider(800, r)).toBe(1000);
    expect(fromSlider(toSlider(50, r), r)).toBe(50);
    // Each doubling moves the slider the same distance (to the nearest whole step).
    expect(Math.abs(toSlider(40, r) - toSlider(20, r) - (toSlider(80, r) - toSlider(40, r)))).toBeLessThanOrEqual(1);
  });

  it('steps to the next and previous lens stop', () => {
    const stops = [18, 25, 35, 50];
    expect(stepFocal(35, stops, 1)).toBe(50);
    expect(stepFocal(35, stops, -1)).toBe(25);
    expect(stepFocal(30, stops, 1)).toBe(35);
    expect(stepFocal(50, stops, 1)).toBe(50);
  });

  it('converts between actual and full-frame equivalent entry', () => {
    expect(toEntry(35, 'equivalent', 1.51)).toBe(53);
    expect(fromEntry(53, 'equivalent', 1.51)).toBe(35);
    expect(toEntry(4.5, 'actual', 3.5)).toBe(4.5);
  });
});

describe('overlay geometry', () => {
  const g = overlayGeometry({ w: 1, h: 16 / 9 / 2.39 }, { thirds: true, golden: true, centre: true, safe: true }, SAFE_AREAS);

  it('centres the frame with two mask bands', () => {
    expect(g.frame.y).toBeCloseTo(0.1281, 4);
    expect(g.masks).toHaveLength(2);
  });

  it('draws thirds and golden-ratio lines inside the frame', () => {
    expect(g.lines).toHaveLength(8);
    expect(g.lines[0]!.x1).toBeCloseTo(1 / 3, 6);
    expect(g.lines[4]!.x1).toBeCloseTo(0.382, 3);
  });

  it('insets safe areas by the EBU R 95 margins', () => {
    expect(g.safe!.action.x).toBeCloseTo(0.035, 6);
    expect(g.safe!.graphics.w).toBeCloseTo(0.9, 6);
    expect(getReference(SAFE_AREAS.citation.ref)?.number).toBe('EBU R 95, version 1.1');
  });

  it('pillarboxes a taller frame', () => {
    expect(overlayGeometry({ w: 0.5, h: 1 }, { thirds: false, golden: false, centre: false, safe: false }, SAFE_AREAS).masks).toHaveLength(2);
  });
});

describe('scene projection', () => {
  it('projects onto the tangent plane at eye height', () => {
    expect(project(1, 1.6, 4)).toEqual({ X: 0.25, Y: -0 });
    expect(project(0, 0, 2).Y).toBeCloseTo(0.8, 10);
  });

  it('frames exactly the angle of view: a 36 mm wide image at 18 mm spans tan(45 deg) each side', () => {
    expect(viewBoxFor(36, 24, 18)).toBe('-1 -0.66667 2 1.33333');
    expect(SCENE_HALF_WIDTH).toBeCloseTo(2.1445, 4);
  });

  it('every mode has a Full preset', () => {
    expect(ASPECTS.cinema.at(-1)!.id).toBe('full');
    expect(ASPECTS.stills.at(-1)!.id).toBe('full');
  });
});
