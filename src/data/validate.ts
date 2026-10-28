import { z } from 'zod';
import { MakerSchema, SENSOR_PATH, SensorSchema, type SensorFile } from './schema.ts';
import { ReferenceSchema } from '../references/schema.ts';

// Validation for the camera database, beyond the schema shape:
// file paths follow sensors/<maker>/<model>.json with a known maker, every
// citation points at a real reference, recording formats fit inside the full
// image area, and published figures agree with each other
// (photosites x pitch = size, pixel aspect = mm aspect).
// Run by scripts/check-data.ts (npm run check) and tests/unit/data.test.ts.

export interface DataFile {
  /** Path relative to src/data/sensors/, e.g. "nikon/z6iii.json". */
  path: string;
  data: unknown;
}

/** Published sizes are rounded (often to 0.1 mm), so cross-checks allow this much slack. */
const MM_TOLERANCE = 0.06;
const RATIO_TOLERANCE = 0.02;

export function validateDatabase(sensorFiles: DataFile[], makersData: unknown, referencesData: unknown): string[] {
  const errors: string[] = [];

  const refs = z.array(ReferenceSchema).safeParse(referencesData);
  if (!refs.success) return [`references.json: ${z.prettifyError(refs.error)}`];
  const makers = z.array(MakerSchema).safeParse(makersData);
  if (!makers.success) return [`makers.json: ${z.prettifyError(makers.error)}`];

  const refIds = uniqueIds('references.json', refs.data, errors);
  const makerIds = uniqueIds('makers.json', makers.data, errors);

  const usedMakers = new Set<string>();
  for (const { path, data } of sensorFiles) {
    const match = SENSOR_PATH.exec(path);
    if (!match) {
      errors.push(`${path}: path must be <maker>/<model>.json in lowercase kebab-case`);
      continue;
    }
    if (!makerIds.has(match[1]!)) errors.push(`${path}: maker "${match[1]}" is not in makers.json`);
    usedMakers.add(match[1]!);

    const parsed = SensorSchema.safeParse(data);
    if (!parsed.success) {
      errors.push(`${path}: ${z.prettifyError(parsed.error)}`);
      continue;
    }
    errors.push(...checkSensor(path, parsed.data, refIds));
  }
  for (const id of makerIds) if (!usedMakers.has(id)) errors.push(`makers.json: "${id}" has no sensors folder`);
  return errors;
}

function uniqueIds(file: string, items: { id: string }[], errors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const { id } of items) {
    if (ids.has(id)) errors.push(`${file}: duplicate id "${id}"`);
    ids.add(id);
  }
  return ids;
}

function checkSensor(path: string, s: SensorFile, refIds: Set<string>): string[] {
  const errors: string[] = [];
  const at = (msg: string) => errors.push(`${path}: ${msg}`);

  const citations = [...(s.pitch ? [s.pitch.citation] : []), ...s.formats.map((f) => f.citation)];
  for (const c of citations) if (!refIds.has(c.ref)) at(`cites unknown reference "${c.ref}"`);

  const formatIds = new Set<string>();
  const full = s.formats[0]!;
  for (const f of s.formats) {
    if (formatIds.has(f.id)) at(`duplicate format id "${f.id}"`);
    formatIds.add(f.id);

    if (f.width > full.width + MM_TOLERANCE || f.height > full.height + MM_TOLERANCE) {
      at(`format "${f.id}" (${f.width} x ${f.height}) is larger than the full area "${full.id}"`);
    }
    if (f.photosites) {
      const [px, py] = f.photosites;
      const mismatch = Math.abs(px / py / (f.width / f.height) - 1);
      if (mismatch > RATIO_TOLERANCE) at(`format "${f.id}": photosite aspect and mm aspect disagree by ${(mismatch * 100).toFixed(1)}%`);
      if (s.pitch) {
        const w = (px * s.pitch.value) / 1000;
        const h = (py * s.pitch.value) / 1000;
        if (Math.abs(w - f.width) > MM_TOLERANCE || Math.abs(h - f.height) > MM_TOLERANCE) {
          at(`format "${f.id}": photosites x pitch gives ${w.toFixed(2)} x ${h.toFixed(2)} mm, data says ${f.width} x ${f.height}`);
        }
      }
    }
  }
  return errors;
}
