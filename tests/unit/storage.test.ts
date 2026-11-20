import { describe, expect, it } from 'vitest';
import { sensors } from '../../src/data/index.ts';
import { ASPECTS, defaultSetup } from '../../src/setup/presets.ts';
import { decodeLink, encodeLink } from '../../src/storage/link.ts';
import { migrate } from '../../src/storage/migrate.ts';
import { emptySave, sanitizeCalibration, sanitizeSave, sanitizeSetup } from '../../src/storage/sanitize.ts';
import { exportName, exportText, mergeSave, parseFile, summarize, uniqueName } from '../../src/storage/file.ts';
import { localAdapter } from '../../src/storage/local.ts';
import { LIMITS, newId, type SaveFile } from '../../src/storage/schema.ts';

const NOW = new Date('2026-11-20T10:00:00Z');

/**
 * A version-1 file exactly as CapXer 1 writes it. Never edit: when the format
 * changes, add the next version's sample beside it; every old one must keep opening.
 */
const SAMPLE_V1 = {
  app: 'capxer',
  v: 1,
  savedAt: '2026-11-20T09:00:00.000Z',
  current: { v: 1, mode: 'cinema', sensorId: 'arri/alexa-35', formatId: '4k-16-9', aspect: '2.39', squeeze: 1, focal: 40, focalEntry: 'actual', guides: { thirds: true, golden: false, centre: true, safe: false }, frameColor: 'amber', mask: 0.6, distance: 4 },
  setups: [
    { id: 'abc123', name: 'A-cam wide', savedAt: '2026-11-19T09:00:00.000Z', setup: { v: 1, mode: 'cinema', sensorId: 'arri/alexa-35', formatId: '4k-16-9', aspect: '2.39', squeeze: 1, focal: 25, focalEntry: 'actual', guides: { thirds: true, golden: false, centre: false, safe: false }, frameColor: 'accent', mask: 0.55, distance: 3 } },
    { id: 'def456', name: 'My rig', savedAt: '2026-11-19T10:00:00.000Z', setup: { v: 1, mode: 'stills', sensorId: 'custom/k3f9a', formatId: 'custom', aspect: '3:2', squeeze: 1, focal: 30, focalEntry: 'actual', guides: { thirds: false, golden: true, centre: false, safe: false }, frameColor: 'white', mask: 0.3, distance: 2 } },
  ],
  gear: { cameras: [{ id: 'custom/k3f9a', name: 'Rig', width: 30, height: 20, squeeze: 1 }], lenses: [21, 65] },
  calibration: { phone: { kind: 'device', deviceId: 'samsung/galaxy-s25', cameraId: 'wide' }, webcam: { kind: 'diagonal', degrees: 78 } },
  aids: { histogram: true, histMode: 'rgb', picture: 'zebras', zebra: 90, peaking: true, peakColor: 'amber', peakSens: 'high' },
};

describe('save file', () => {
  it('opens the version 1 sample unchanged', () => {
    const m = migrate(structuredClone(SAMPLE_V1));
    expect(m.ok).toBe(true);
    const file = sanitizeSave(m.ok ? m.doc : null, NOW);
    expect(file).toEqual(SAMPLE_V1);
  });

  it('refuses things that are not a CapXer save, and files from a newer version', () => {
    expect(migrate(null)).toEqual({ ok: false, reason: 'notCapxer' });
    expect(migrate([])).toEqual({ ok: false, reason: 'notCapxer' });
    expect(migrate({ app: 'other', v: 1 })).toEqual({ ok: false, reason: 'notCapxer' });
    expect(migrate({ app: 'capxer', v: '1' })).toEqual({ ok: false, reason: 'notCapxer' });
    expect(migrate({ app: 'capxer', v: 99 })).toEqual({ ok: false, reason: 'newer' });
  });

  it('repairs broken or hostile content instead of failing', () => {
    const bad = {
      ...structuredClone(SAMPLE_V1),
      current: { mode: 'x', sensorId: '../../etc', focal: 1e9, mask: -3, distance: 'far', frameColor: '<b>', guides: 'all' },
      setups: [
        { id: 'abc123', name: '\u0000  Night\u0007 ', setup: { sensorId: 'nope/none', focal: -1 } },
        { id: 'abc123', name: 'duplicate id', setup: {} },
        { id: 'BAD ID', name: 'x', setup: {} },
        'not an object',
      ],
      gear: { cameras: [{ id: 'custom/1', width: 500, height: 10 }, { id: 'evil', width: 10, height: 10 }], lenses: [-5, 'abc', 35, 35, 99999] },
      calibration: { phone: { kind: 'device', deviceId: 'samsung/galaxy-s25', cameraId: 'nope' }, webcam: { kind: 'equivalent', mm: 4000 } },
      aids: { zebra: 42, picture: 'everything' },
    };
    const f = sanitizeSave(bad, NOW)!;
    expect(f.current).toEqual({ ...defaultSetup('cinema'), focal: f.current.focal, mask: 0, distance: 3 });
    expect(f.current.focal).toBeLessThanOrEqual(800);
    expect(f.setups).toHaveLength(1);
    expect(f.setups[0]!.name).toBe('Night');
    expect(f.setups[0]!.setup.sensorId).toBe('arri/alexa-35');
    expect(f.gear).toEqual({ cameras: [], lenses: [35] });
    expect(f.calibration).toEqual({});
    expect(f.aids.zebra).toBe(95);
    expect(f.aids.picture).toBe('off');
  });

  it('caps list sizes and name length', () => {
    const many = { ...structuredClone(SAMPLE_V1), setups: Array.from({ length: 500 }, (_, i) => ({ id: `s${i}`, name: 'x'.repeat(500), setup: {} })) };
    const f = sanitizeSave(many, NOW)!;
    expect(f.setups).toHaveLength(LIMITS.setups);
    expect(f.setups[0]!.name).toHaveLength(LIMITS.name);
  });

  it('keeps a saved setup on a custom camera only while that camera exists', () => {
    const noCam = { ...structuredClone(SAMPLE_V1), gear: { cameras: [], lenses: [] } };
    expect(sanitizeSave(noCam, NOW)!.setups[1]!.setup.sensorId).toBe('nikon/z6iii');
  });

  it('checks calibrations against the device database', () => {
    expect(sanitizeCalibration({ kind: 'device', deviceId: 'apple/iphone-16', cameraId: 'main' })).toBeDefined();
    expect(sanitizeCalibration({ kind: 'device', deviceId: 'apple/iphone-99', cameraId: 'wide' })).toBeUndefined();
    expect(sanitizeCalibration({ kind: 'equivalent', mm: 26 })).toEqual({ kind: 'equivalent', mm: 26 });
    expect(sanitizeCalibration({ kind: 'diagonal', degrees: 200 })).toBeUndefined();
  });

  it('makes short random ids', () => {
    const ids = new Set(Array.from({ length: 200 }, newId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{6}$/);
  });
});

describe('share links', () => {
  it('round-trips every camera, format and frame', () => {
    for (const s of sensors) {
      for (const mode of ['cinema', 'stills'] as const) {
        for (const f of s.formats) {
          for (const a of ASPECTS[mode]) {
            const setup = sanitizeSetup({ ...defaultSetup(mode), sensorId: s.id, formatId: f.id, aspect: a.id, squeeze: f.squeeze ?? 1, focal: 12 });
            const back = decodeLink(encodeLink(setup));
            expect(back?.unknownCamera).toBe(false);
            expect(back?.setup).toEqual(setup);
          }
        }
      }
    }
  });

  it('is readable', () => {
    const link = encodeLink({ ...defaultSetup('cinema'), guides: { thirds: true, golden: false, centre: true, safe: false } });
    expect(link).toBe('v=1&mode=cinema&cam=arri/alexa-35&fmt=4k-16-9&ar=2.39&sq=1&mm=35&entry=actual&g=thirds,centre&col=accent&mask=0.55&d=3');
  });

  it('carries a custom camera', () => {
    const custom = { id: 'custom/k3f9a', name: 'Rig & co #1', width: 30.2, height: 20, squeeze: 1.5 };
    const setup = sanitizeSetup({ ...defaultSetup('stills'), sensorId: custom.id, formatId: 'custom', aspect: '3:2', squeeze: 1.5, focal: 28 }, [custom]);
    const back = decodeLink(`#${encodeLink(setup, custom)}`)!;
    expect(back.custom).toEqual({ ...custom, id: 'custom/link' });
    expect(back.setup).toEqual({ ...setup, sensorId: 'custom/link' });
    expect(back.unknownCamera).toBe(false);
  });

  it('opens a link to an unknown camera on the default one, keeping the rest', () => {
    const back = decodeLink('v=1&mode=cinema&cam=red/raptor-x&fmt=8k&ar=1.85&mm=50&col=red')!;
    expect(back.unknownCamera).toBe(true);
    expect(back.setup.sensorId).toBe('arri/alexa-35');
    expect(back.setup.aspect).toBe('1.85');
    expect(back.setup.focal).toBe(50);
    expect(back.setup.frameColor).toBe('red');
  });

  it('ignores anything that is not a CapXer link and survives junk', () => {
    expect(decodeLink('')).toBeNull();
    expect(decodeLink('#main')).toBeNull();
    expect(decodeLink('#v=7&mode=cinema')).toBeNull();
    const junk = decodeLink('#v=1&mm=%E0%A4%A&mask=99&d=-1&g=<script>&mode=stills')!;
    expect(junk.setup.mode).toBe('stills');
    expect(junk.setup.mask).toBe(0.9);
    expect(junk.setup.distance).toBe(0.1);
    expect(junk.setup.guides).toEqual({ thirds: false, golden: false, centre: false, safe: false });
  });
});

describe('export and import', () => {
  const mine = (): SaveFile => sanitizeSave(structuredClone(SAMPLE_V1), NOW)!;

  it('names the file by date and round-trips it', () => {
    expect(exportName(new Date(2026, 10, 5))).toBe('capxer-2026-11-05.json');
    const parsed = parseFile(exportText(mine(), NOW), NOW);
    expect(parsed).toEqual({ ok: true, file: { ...mine(), savedAt: NOW.toISOString() } });
  });

  it('explains files it cannot use', () => {
    expect(parseFile('not json')).toEqual({ ok: false, reason: 'notCapxer' });
    expect(parseFile('{"hello":1}')).toEqual({ ok: false, reason: 'notCapxer' });
    expect(parseFile('{"app":"capxer","v":3}')).toEqual({ ok: false, reason: 'newer' });
  });

  it('merges: adds setups, renames clashes, keeps the current setup, takes calibration and aids', () => {
    const base = mine();
    const theirs = { ...emptySave(NOW), setups: [{ id: 'zzz999', name: 'A-cam wide', savedAt: NOW.toISOString(), setup: defaultSetup('stills') }], calibration: { webcam: { kind: 'equivalent' as const, mm: 28 } }, aids: { ...base.aids, peaking: false } };
    expect(summarize(base, theirs)).toEqual({ setups: 1, renamed: 1, cameras: 0, lenses: 0, phone: false, webcam: true });
    const out = mergeSave(base, theirs, 'merge', NOW);
    expect(out.setups.map((s) => s.name)).toEqual(['A-cam wide', 'My rig', 'A-cam wide (2)']);
    expect(out.current).toEqual(base.current);
    expect(out.calibration).toEqual({ phone: base.calibration.phone, webcam: { kind: 'equivalent', mm: 28 } });
    expect(out.aids.peaking).toBe(false);
    expect(out.gear).toEqual(base.gear);
  });

  it('re-importing your own backup adds nothing, and a newer copy of a setup wins', () => {
    const base = mine();
    expect(mergeSave(base, base, 'merge', NOW).setups).toEqual(base.setups);
    const newer = structuredClone(base);
    newer.setups[0] = { ...newer.setups[0]!, savedAt: NOW.toISOString(), setup: { ...newer.setups[0]!.setup, focal: 32 } };
    const out = mergeSave(base, newer, 'merge', NOW);
    expect(out.setups).toHaveLength(2);
    expect(out.setups[0]!.setup.focal).toBe(32);
  });

  it('replace swaps everything', () => {
    const theirs = emptySave(NOW);
    expect(mergeSave(mine(), theirs, 'replace', NOW)).toEqual(theirs);
  });

  it('finds a free name', () => {
    expect(uniqueName('A', new Set())).toBe('A');
    expect(uniqueName('A', new Set(['A', 'A (2)']))).toBe('A (3)');
    expect(uniqueName('x'.repeat(60), new Set(['x'.repeat(60)]))).toHaveLength(60);
  });
});

describe('local storage adapter', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  it('writes and reads the file back', () => {
    const store = memory();
    const a = localAdapter(store);
    expect(a.available).toBe(true);
    expect(a.read()).toBeNull();
    const f = sanitizeSave(structuredClone(SAMPLE_V1), NOW)!;
    expect(a.write(f)).toBe(true);
    expect(a.read()).toEqual(f);
    a.clear();
    expect(a.read()).toBeNull();
  });

  it('works without storage and survives a full or blocked store', () => {
    const none = localAdapter(null);
    expect(none.available).toBe(false);
    expect(none.write(emptySave())).toBe(false);
    const blocked = localAdapter({ getItem: () => null, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} });
    expect(blocked.available).toBe(false);
    const store = memory();
    const full = localAdapter({ ...store, setItem: (k, v) => { if (k === 'capxer.save') throw new Error('quota'); store.setItem(k, v); } });
    expect(full.write(emptySave())).toBe(false);
    expect(full.available).toBe(false);
  });

  it('ignores corrupt stored text', () => {
    const store = memory();
    store.setItem('capxer.save', '{broken');
    expect(localAdapter(store).read()).toBeNull();
  });
});

