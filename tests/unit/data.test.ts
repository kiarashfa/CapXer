import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { displayName, fullFormat, getSensor, makers, sensors } from '../../src/data/index.ts';
import { validateDatabase, type DataFile } from '../../src/data/validate.ts';
import { references } from '../../src/references/index.ts';
import { cropFactor } from '../../src/optics/index.ts';

const dir = fileURLToPath(new URL('../../src/data/sensors/', import.meta.url));
const realFiles: DataFile[] = readdirSync(dir, { recursive: true, encoding: 'utf8' })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => p.endsWith('.json'))
  .map((path) => ({ path, data: JSON.parse(readFileSync(dir + path, 'utf8')) }));

const clone = <T>(x: T): T => structuredClone(x);
const nikon = () => clone(realFiles.find((f) => f.path === 'nikon/z6iii.json')!);
const validate = (files: DataFile[]) => validateDatabase(files, makers, references);

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
      /"leica" has no sensors folder/,
    );
  });
});
