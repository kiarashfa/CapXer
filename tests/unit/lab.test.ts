import { describe, expect, it } from 'vitest';
import { getSensor } from '../../src/data/index.ts';
import { circleOfConfusion } from '../../src/optics/index.ts';
import { derive } from '../../src/setup/derive.ts';
import { defaultSetup } from '../../src/setup/presets.ts';
import { discPoint, focusShift, labCamera, pixelJitter, pupilRadiusM, timeSample } from '../../src/lab/camera.ts';
import { formatAperture, formatMetres, formatShutter, formatStops } from '../../src/lab/format.ts';
import { alongToWall, beam, sharpBand, viewWedge } from '../../src/lab/plan.ts';
import { averageLuminance, METER_H, METER_W } from '../../src/lab/render/accumulate.ts';
import { MAX_PER_FRAME, TIERS, initialTier, nextPerFrame, tierAfter } from '../../src/lab/render/tiers.ts';
import { SETS, getSet } from '../../src/lab/sets/index.ts';
import { clampPlace } from '../../src/lab/place.ts';
import { decodeLabLink, encodeLabLink } from '../../src/lab/link.ts';
import { decodeLink } from '../../src/storage/link.ts';
import { defaultLab } from '../../src/storage/sanitize.ts';
import { ANGLES, APERTURES, FRAME_RATES, ISOS, SHUTTERS, WHITE_BALANCES, nearestIndex, step } from '../../src/lab/stops.ts';
import { noiseCoefficients, noiseSigma } from '../../src/lab/render/noise.ts';
import { SUBJECTS, getSubject } from '../../src/lab/subjects/index.ts';

describe('sets and subjects', () => {
  it('ids are unique and lower-case kebab', () => {
    for (const list of [SETS.map((s) => s.id), SUBJECTS.map((s) => s.id)]) {
      expect(new Set(list).size).toBe(list.length);
      for (const id of list) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('unknown ids fall back to the defaults', () => {
    expect(getSet('nowhere').id).toBe(SETS[0]!.id);
    expect(getSubject('nobody').id).toBe(SUBJECTS[0]!.id);
  });

  for (const set of SETS) {
    describe(set.name, () => {
      const halfW = set.room.width / 2;
      const front = set.room.wallZ + set.room.depth;
      const inside = (x: number, z: number) => Math.abs(x) <= halfW && z >= set.room.wallZ && z <= front;

      it('lists subjects that exist, and at least one lighting scenario', () => {
        expect(set.subjects.length).toBeGreaterThan(0);
        for (const id of set.subjects) expect(SUBJECTS.some((s) => s.id === id), id).toBe(true);
        expect(set.lighting.length).toBeGreaterThan(0);
        expect(new Set(set.lighting.map((l) => l.id)).size).toBe(set.lighting.length);
      });

      it('keeps the camera, props and lights inside the room, in front of the wall', () => {
        expect(inside(set.camera.x, set.camera.z)).toBe(true);
        expect(set.camera.z).toBeGreaterThan(0);
        for (const p of set.props) expect(inside(p.at.x, p.at.z), p.id).toBe(true);
        for (const sc of set.lighting) for (const l of sc.lights) expect(inside(l.at.x, l.at.z), `${sc.id}/${l.id}`).toBe(true);
      });

      it('has sensible lights: positive candela, unique ids, colour temperature in range', () => {
        for (const sc of set.lighting) {
          expect(new Set(sc.lights.map((l) => l.id)).size).toBe(sc.lights.length);
          expect(sc.ambient).toBeGreaterThanOrEqual(0);
          for (const l of sc.lights) {
            expect(l.candela).toBeGreaterThan(0);
            expect(l.size).toBeGreaterThanOrEqual(0);
            expect(l.kelvin).toBeGreaterThanOrEqual(1500);
            expect(l.kelvin).toBeLessThanOrEqual(12000);
          }
        }
      });
    });
  }
});

describe('lab camera', () => {
  const setup = defaultSetup('cinema');
  const sensor = getSensor(setup.sensorId)!;
  const format = sensor.formats.find((f) => f.id === setup.formatId)!;
  const area = { width: format.width, height: format.height };
  const cam = labCamera(setup, area);

  it('uses the viewfinder frame: same angles, same aspect', () => {
    const d = derive(setup, area);
    expect(cam.vFov).toBeCloseTo(d.fov.vertical, 10);
    expect(cam.aspect).toBeCloseTo(2.39, 2);
    expect(cam.coc).toBeCloseTo(circleOfConfusion(cam.frame), 12);
  });

  it('pupil radius is focal length / f-number / 2, in metres', () => {
    expect(pupilRadiusM(50, 2)).toBeCloseTo(0.0125, 12);
  });

  it('disc samples fill the unit disc evenly', () => {
    const n = 128;
    const pts = Array.from({ length: n }, (_, i) => discPoint(i, n));
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(1);
    const mean = pts.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n }), { x: 0, y: 0 });
    expect(Math.hypot(mean.x, mean.y)).toBeLessThan(0.02);
    // Equal area: about half the samples inside radius 1/sqrt(2).
    expect(pts.filter((p) => Math.hypot(p.x, p.y) < Math.SQRT1_2).length).toBe(n / 2);
  });

  it('time and pixel samples stay in range', () => {
    for (let i = 0; i < 200; i++) {
      const t = timeSample(i);
      const j = pixelJitter(i);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1);
      expect(Math.abs(j.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(j.y)).toBeLessThanOrEqual(0.5);
    }
  });

  // Projection of a camera-space point as three.js does it, with the skew term
  // set to minus the focus shift: x_ndc = x / (depth * tanW) + shift.
  const project = (x: number, depth: number, dx: number, focus: number) => {
    const shift = focusShift(dx, 0, focus, cam.tanW, cam.tanH).x;
    return (x - dx) / (depth * cam.tanW) + shift;
  };

  it('a point on the focus plane lands on the same pixel from anywhere on the pupil', () => {
    for (const dx of [-0.02, 0.005, 0.03]) expect(project(0.4, 3, dx, 3)).toBeCloseTo(project(0.4, 3, 0, 3), 12);
  });

  it('points off the focus plane move with the pupil (that spread is the blur)', () => {
    expect(Math.abs(project(0.4, 6, 0.02, 3) - project(0.4, 6, 0, 3))).toBeGreaterThan(1e-4);
    expect(Math.abs(project(0.4, 1.5, 0.02, 3) - project(0.4, 1.5, 0, 3))).toBeGreaterThan(1e-4);
  });
});

describe('render tiers', () => {
  it('software renderers start low, graphics chips medium', () => {
    expect(initialTier('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe('low');
    expect(initialTier('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('low');
    expect(initialTier('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)')).toBe('medium');
  });

  it('drops one tier when the picture would take over 2 s', () => {
    expect(tierAfter('high', 2000 / TIERS.high.samples + 1)).toBe('medium');
    expect(tierAfter('medium', 2000 / TIERS.medium.samples - 1)).toBe('medium');
    expect(tierAfter('low', 1000)).toBe('low');
  });

  it('draws more samples per frame while frames keep pace, fewer when they lag', () => {
    expect(nextPerFrame(1, 16.7)).toBe(2);
    expect(nextPerFrame(MAX_PER_FRAME, 16.7)).toBe(MAX_PER_FRAME);
    expect(nextPerFrame(4, 24)).toBe(4);
    expect(nextPerFrame(4, 40)).toBe(2);
    expect(nextPerFrame(1, 100)).toBe(1);
  });
});

describe('meter readback', () => {
  // Mirror of the meter shader: y / (y + 1), packed into four bytes.
  const pack = (y: number): number[] => {
    const v = Math.min(y / (y + 1), 0.99999);
    const f = [1, 255, 65025, 16581375].map((m) => (v * m) % 1);
    const e = [f[0]! - f[1]! / 255, f[1]! - f[2]! / 255, f[2]! - f[3]! / 255, f[3]!];
    return e.map((c) => Math.round(c * 255));
  };

  it('averages luminance from the packed grid', () => {
    const values = [0, 0.02, 0.5, 3, 40, 1200];
    const px = new Uint8Array(values.flatMap(pack));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(averageLuminance(px) / mean).toBeCloseTo(1, 2);
  });

  it('reads a uniform grey card back to its luminance', () => {
    const px = new Uint8Array(Array.from({ length: METER_W * METER_H }, () => pack(14.5)).flat());
    expect(averageLuminance(px)).toBeCloseTo(14.5, 2);
  });
});

describe('plan geometry', () => {
  const cam = { x: 0, z: 4.5 };
  const w = viewWedge(cam, { x: 0, z: 0 });

  it('looks from the camera to the subject', () => {
    expect(w.axis.x).toBeCloseTo(0, 12);
    expect(w.axis.z).toBeCloseTo(-1, 12);
    expect(alongToWall(cam, w, -3)).toBeCloseTo(7.5, 12);
    expect(alongToWall(cam, viewWedge(cam, { x: 0, z: 9 }), -3)).toBe(Infinity);
  });

  it('the sharp band sits between the near and far limits, inside the lens angle', () => {
    const band = sharpBand(cam, w, 0.35, 3.8, 5.5, 7.5);
    expect(band.map((p) => cam.z - p.z)).toEqual([3.8, 3.8, 5.5, 5.5].map((d) => expect.closeTo(d, 10)));
    expect(band[1]!.x - band[0]!.x).toBeCloseTo(2 * 3.8 * 0.35, 10);
  });

  it('an endless far limit stops at the wall', () => {
    const band = sharpBand(cam, w, 0.35, 3, Infinity, 7.5);
    expect(cam.z - band[2]!.z).toBeCloseTo(7.5, 10);
  });

  it('a beam points from the light towards its aim', () => {
    const [tip, a, b] = beam({ x: 2, z: 2 }, { x: 0, z: 0 }, 30, 1);
    expect(tip).toEqual({ x: 2, z: 2 });
    expect((a!.x + b!.x) / 2).toBeLessThan(2);
    expect((a!.z + b!.z) / 2).toBeLessThan(2);
  });
});

describe('lab number formats', () => {
  it('writes shutter times like a camera', () => {
    expect(formatShutter(1 / 50)).toBe('1/50 s');
    expect(formatShutter(1 / 8000)).toBe('1/8000 s');
    expect(formatShutter(0.5)).toBe('1/2 s');
    expect(formatShutter(0.4)).toBe('0.4 s');
    expect(formatShutter(2)).toBe('2 s');
  });

  it('writes apertures, distances and stops', () => {
    expect(formatAperture(2.8)).toBe('f/2.8');
    expect(formatAperture(11)).toBe('f/11');
    expect(formatAperture(1.4)).toBe('f/1.4');
    expect(formatMetres(4.53)).toBe('4.5 m');
    expect(formatMetres(Infinity)).toBe('infinity');
    expect(formatStops(0.68)).toBe('+0.7');
    expect(formatStops(-1.26)).toBe('−1.3');
    expect(formatStops(0.02)).toBe('0.0');
  });
});

describe('settings steps', () => {
  it('apertures run f/1.4 to f/22 in exact third stops with the marked labels', () => {
    expect(APERTURES[0]).toEqual({ value: Math.SQRT2, label: '1.4' });
    expect(APERTURES.at(-1)!.label).toBe('22');
    const f28 = APERTURES.find((s) => s.label === '2.8')!;
    expect(f28.value).toBeCloseTo(2 * Math.SQRT2, 12);
    for (let i = 1; i < APERTURES.length; i++) expect(APERTURES[i]!.value / APERTURES[i - 1]!.value).toBeCloseTo(2 ** (1 / 6), 12);
  });

  it('shutter times run 30 s to 1/8000 s in exact third stops', () => {
    expect(SHUTTERS[0]!.label).toBe('30 s');
    expect(SHUTTERS.at(-1)!.label).toBe('1/8000 s');
    expect(SHUTTERS.find((s) => s.label === '1/4 s')!.value).toBeCloseTo(0.25, 12);
    expect(SHUTTERS.find((s) => s.label === '1 s')!.value).toBeCloseTo(1, 12);
    for (let i = 1; i < SHUTTERS.length; i++) expect(SHUTTERS[i - 1]!.value / SHUTTERS[i]!.value).toBeCloseTo(2 ** (1 / 3), 12);
  });

  it('ISO speeds are third stops apart, near enough', () => {
    for (let i = 1; i < ISOS.length; i++) expect(Math.log2(ISOS[i]! / ISOS[i - 1]!)).toBeCloseTo(1 / 3, 1);
    expect(ANGLES).toContain(180);
    expect(FRAME_RATES).toContain(24);
    expect(WHITE_BALANCES).toContain(5600);
  });

  it('finds the nearest stop on a log scale and keeps steps inside the list', () => {
    expect(nearestIndex([1, 2, 4, 8], 2.9)).toBe(2);
    expect(nearestIndex([1, 2, Infinity], Infinity)).toBe(2);
    expect(step(0, -1, 5)).toBe(0);
    expect(step(4, 1, 5)).toBe(4);
    expect(step(2, 1, 5)).toBe(3);
  });
});

describe('noise model', () => {
  it('mid grey at ISO 100 is clean (about 1 % noise), and grain grows with ISO', () => {
    expect(noiseSigma(0.18, 100) / 0.18).toBeCloseTo(1 / Math.sqrt(8000), 3);
    expect(noiseSigma(0.18, 3200)).toBeGreaterThan(noiseSigma(0.18, 400));
    expect(noiseSigma(0.18, 12800) / 0.18).toBeGreaterThan(0.08);
  });

  it('shadows are relatively noisier than highlights (fewer photons)', () => {
    expect(noiseSigma(0.02, 400) / 0.02).toBeGreaterThan(noiseSigma(0.5, 400) / 0.5);
  });

  it('the shader coefficients give the same sigma', () => {
    for (const [v, iso] of [[0.18, 100], [0.05, 1600], [0.9, 25600]] as const) {
      const { a, b } = noiseCoefficients(iso);
      expect(Math.sqrt(v * a + b)).toBeCloseTo(noiseSigma(v, iso), 12);
    }
  });
});

describe('moving things on the plan', () => {
  const room = { width: 9, depth: 10, wallZ: -3 };
  it('keeps a moved light inside the room and in front of the wall', () => {
    expect(clampPlace(room, 9, -9, 0.6)).toEqual({ x: 4.3, z: -2.8 });
    expect(clampPlace(room, -9, 20, 0.6)).toEqual({ x: -4.3, z: 6.8 });
  });

  it('keeps it clear of the subject, pushed straight out', () => {
    const p = clampPlace(room, 0.3, 0.4, 1);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1, 12);
    expect(p.x / p.z).toBeCloseTo(0.75, 12);
    expect(clampPlace(room, 0, 0, 0.8)).toEqual({ x: 0, z: 0.8 });
  });
});

describe('lab share links', () => {
  const NOW = new Date('2026-11-23T12:00:00Z');
  const setup = { ...defaultSetup('stills'), focal: 85 };
  const state = {
    ...defaultLab(NOW),
    lighting: 'tungsten-hard',
    exposure: { fNumber: 2 ** (13 / 6), shutter: 2 ** (5 - 38 / 3), angle: 172.8, fps: 25, iso: 1600, kelvin: 3200 },
    focus: 3.5 as const,
    lights: { key: { on: true, stops: -2 / 3, size: 0.5, kelvin: 4300, x: -1.5, z: 2.1 } },
    ambient: 1 / 3,
    camera: { x: 0.4, z: 3.9 },
  };

  it('round-trips the camera setup and the lab state (values rounded for the address bar)', () => {
    const out = decodeLabLink(`#${encodeLabLink(setup, state)}`, NOW)!;
    expect(out.setup).toEqual(setup);
    expect(out.unknownCamera).toBe(false);
    expect(out.state.lighting).toBe('tungsten-hard');
    expect(out.state.exposure.fNumber).toBeCloseTo(state.exposure.fNumber, 2);
    expect(out.state.exposure.shutter / state.exposure.shutter).toBeCloseTo(1, 4);
    expect(out.state.exposure).toMatchObject({ angle: 172.8, fps: 25, iso: 1600, kelvin: 3200 });
    expect(out.state.focus).toBe(3.5);
    expect(out.state.lights.key).toEqual({ on: true, stops: -2 / 3, size: 0.5, kelvin: 4300, x: -1.5, z: 2.1 });
    expect(out.state.ambient).toBeCloseTo(1 / 3, 3);
    expect(out.state.camera).toEqual({ x: 0.4, z: 3.9 });
  });

  it('a viewfinder link is not a lab link, and a lab link still opens the viewfinder setup', () => {
    const lab = encodeLabLink(setup, state);
    expect(decodeLabLink(lab.split('&lab=')[0]!, NOW)).toBeNull();
    expect(decodeLink(lab)!.setup).toEqual(setup);
  });

  it('leaves viewer preferences (aids) out of links', () => {
    const out = decodeLabLink(encodeLabLink(setup, { ...state, aids: { histogram: true, histMode: 'rgb', picture: 'zebras', zebra: 80 } }), NOW)!;
    expect(out.state.aids).toEqual(defaultLab(NOW).aids);
  });

  it('focus on the subject and at infinity survive', () => {
    for (const focus of ['subject', 'infinity'] as const) expect(decodeLabLink(encodeLabLink(setup, { ...state, focus }), NOW)!.state.focus).toBe(focus);
  });
});
