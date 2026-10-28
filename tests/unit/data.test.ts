import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { devices, displayName, fullFormat, getDevice, getSensor, makers, sensors } from '../../src/data/index.ts';
import { validateDatabase, type DataFile } from '../../src/data/validate.ts';
import { references } from '../../src/references/index.ts';
import { cropFactor } from '../../src/optics/index.ts';

function readData(sub: string): DataFile[] {
  const dir = fileURLToPath(new URL(`../../src/data/${sub}/`, import.meta.url));
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((p) => p.replaceAll('\\', '/'))
    .filter((p) => p.endsWith('.json'))
    .map((path) => ({ path, data: JSON.parse(readFileSync(dir + path, 'utf8')) }));
}
const realFiles = readData('sensors');
const deviceFiles = readData('devices');

const clone = <T>(x: T): T => structuredClone(x);
const nikon = () => clone(realFiles.find((f) => f.path === 'nikon/z6iii.json')!);
const validate = (files: DataFile[]) => validateDatabase(files, makers, references, deviceFiles);

describe('camera database', () => {
  it('is valid and fully cited', () => {
    expect(validate(realFiles)).toEqual([]);
  });

  it('loads every file with its id taken from the path', () => {
    expect(sensors).toHaveLength(realFiles.length);
    const alexa = getSensor('arri/alexa-35')!;
    expect(alexa.maker.name).toBe('ARRI');
    expect(displayName(alexa)).toBe('ARRI ALEXA 35');
    expect(displayName(getSensor('film/35mm')!)).toBe('35mm motion picture film');
  });

  it('orders the largest format class first', () => {
    expect(sensors[0]!.formatClass).toBe('medium-format');
    expect(sensors.at(-1)!.formatClass).toBe('phone');
  });

  it.each([
    ['nikon/z6iii', 1.0],
    ['fujifilm/x-t5', 1.53],
    ['om-system/om-1-mark-ii', 2.0],
    ['sony/rx100-vii', 2.73],
    ['fujifilm/gfx100-ii', 0.79],
  ])('%s has the crop factor of its class', (id, expected) => {
    expect(cropFactor(fullFormat(getSensor(id)!))).toBeCloseTo(expected, 1);
  });
});

describe('validateDatabase rejects bad data', () => {
  const run = (...files: DataFile[]) => validate(files).join('\n');

  it('a file outside <maker>/<model>.json', () => {
    expect(run({ ...nikon(), path: 'nikon-z6iii.json' })).toMatch(/path must be <maker>\/<model>\.json/);
    expect(run({ ...nikon(), path: 'Nikon/Z6III.json' })).toMatch(/lowercase/);
  });

  it('a maker missing from makers.json', () => {
    expect(run({ ...nikon(), path: 'canon/r5.json' })).toMatch(/maker "canon" is not in makers\.json/);
  });

  it('an unknown reference', () => {
    const f = nikon();
    (f.data as any).formats[0].citation.ref = 'made-up-source';
    expect(run(f)).toMatch(/unknown reference "made-up-source"/);
  });

  it('a missing citation', () => {
    const f = nikon();
    delete (f.data as any).formats[0].citation;
    expect(run(f)).toMatch(/citation/);
  });

  it('a format larger than the full area', () => {
    const f = nikon();
    (f.data as any).formats.push({ ...(f.data as any).formats[0], id: 'too-big', width: 40 });
    expect(run(f)).toMatch(/larger than the full area/);
  });

  it('photosites that contradict the size', () => {
    const f = nikon();
    (f.data as any).formats[0].photosites = [6048, 6048];
    expect(run(f)).toMatch(/aspect disagree/);
  });

  it('photosites x pitch that contradict the size', () => {
    const f = clone(realFiles.find((x) => x.path === 'arri/alexa-35.json')!);
    (f.data as any).pitch.value = 7;
    expect(run(f)).toMatch(/photosites x pitch/);
  });

  it('unknown fields and impossible numbers', () => {
    const f = nikon();
    (f.data as any).weight = 1;
    (f.data as any).formats[0].height = -1;
    expect(run(f)).toMatch(/weight/);
    expect(run(f)).toMatch(/height/);
  });

  it('a maker with no sensors', () => {
    expect(validateDatabase([nikon()], [...makers.filter((m) => m.id === 'nikon'), { id: 'leica', name: 'Leica' }], references).join('\n')).toMatch(
      /"leica" has no sensors or devices folder/,
    );
  });
});

describe('device database (phones and webcams)', () => {
  const run = (files: DataFile[]) => validateDatabase(realFiles, makers, references, files).join('\n');
  const s25 = () => clone(deviceFiles.find((f) => f.path === 'samsung/galaxy-s25.json')!);

  it('is valid and fully cited', () => {
    expect(run(deviceFiles)).toBe('');
  });

  it('loads phones first, with ids from the path', () => {
    expect(devices).toHaveLength(deviceFiles.length);
    expect(devices.at(-1)!.kind).toBe('webcam');
    expect(displayName(getDevice('samsung/galaxy-s25')!)).toBe('Samsung Galaxy S25');
  });

  it('rejects a camera with both a focal length and an angle', () => {
    const f = s25();
    (f.data as { cameras: Record<string, unknown>[] }).cameras[0]!.equivalent = 24;
    expect(run([f])).toMatch(/exactly one of equivalent or diagonalFov/);
  });

  it('rejects an unknown reference and duplicate camera ids', () => {
    const f = s25();
    const cams = (f.data as { cameras: { id: string; citation: { ref: string } }[] }).cameras;
    cams[0]!.citation.ref = 'nowhere';
    cams[1]!.id = cams[0]!.id;
    const out = run([f]);
    expect(out).toMatch(/unknown reference "nowhere"/);
    expect(out).toMatch(/duplicate camera id "wide"/);
  });
});
