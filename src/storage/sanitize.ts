import { getDevice, getSensor } from '../data/index.ts';
import { cropFactor } from '../optics/index.ts';
import { focalRange, round } from '../setup/focal.ts';
import { aspectPreset, defaultSetup, FRAME_COLORS } from '../setup/presets.ts';
import type { Calibration } from '../camera/lens.ts';
import { ZEBRA_LEVELS } from '../analysis/levels.ts';
import type { CustomSensor, FrameColor, Mode, Setup } from '../setup/types.ts';
import { APP_ID, LIMITS, SAVE_VERSION, type AidsPrefs, type Calibrations, type SaveFile, type SavedSetup } from './schema.ts';

// Everything read from storage, a file or a link is untrusted: it may be old,
// hand-edited, cut off or hostile. These functions never throw; they keep what
// is valid, clamp numbers into range, swap unknown ids for defaults and drop
// the rest. (zod stays a build-time tool, so this is plain code.)

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** Trimmed text without control characters, cut to the name limit. */
export function cleanName(v: unknown, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIMITS.name);
  return s || fallback;
}

const CUSTOM_ID = /^custom\/[a-z0-9]{1,12}$/;

export function sanitizeCustom(raw: unknown): CustomSensor | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !CUSTOM_ID.test(raw.id)) return null;
  const width = num(raw.width);
  const height = num(raw.height);
  if (width === undefined || height === undefined || width < 1 || width > 100 || height < 1 || height > 100) return null;
  return { id: raw.id, name: cleanName(raw.name, 'My sensor'), width, height, squeeze: clamp(num(raw.squeeze) ?? 1, 1, 2) };
}

const MODES: readonly Mode[] = ['cinema', 'stills'];
const COLORS = Object.keys(FRAME_COLORS) as FrameColor[];

/** A setup that is safe to show. Unknown cameras, formats and frames fall back to the mode's defaults. */
export function sanitizeSetup(raw: unknown, customs: readonly CustomSensor[] = []): Setup {
  const r = isObj(raw) ? raw : {};
  const mode = oneOf(r.mode, MODES, 'cinema');
  const def = defaultSetup(mode);

  // Camera and format: from the database, or one of the user's own sensors.
  let sensorId = def.sensorId;
  let formats: { id: string; width: number; height: number; squeeze?: number }[] = getSensor(def.sensorId)!.formats;
  if (typeof r.sensorId === 'string') {
    const custom = customs.find((c) => c.id === r.sensorId);
    const sensor = getSensor(r.sensorId);
    if (custom) {
      sensorId = custom.id;
      formats = [{ id: 'custom', width: custom.width, height: custom.height, squeeze: custom.squeeze > 1 ? custom.squeeze : undefined }];
    } else if (sensor) {
      sensorId = sensor.id;
      formats = sensor.formats;
    }
  }
  const format = formats.find((f) => f.id === r.formatId) ?? (sensorId === def.sensorId ? formats.find((f) => f.id === def.formatId) : undefined) ?? formats[0]!;
  const squeeze = round2(clamp(num(r.squeeze) ?? format.squeeze ?? 1, 1, 2));
  const aspect = typeof r.aspect === 'string' && aspectPreset(mode, r.aspect) ? r.aspect : sensorId === def.sensorId ? def.aspect : 'full';

  const range = focalRange(cropFactor({ width: format.width, height: format.height }, squeeze));
  const focal = round(clamp(num(r.focal) ?? def.focal, range.min, range.max));

  const g = isObj(r.guides) ? r.guides : {};
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    v: 1,
    mode,
    sensorId,
    formatId: format.id,
    aspect,
    squeeze,
    focal,
    focalEntry: oneOf(r.focalEntry, ['actual', 'equivalent'] as const, 'actual'),
    guides: {
      thirds: bool(g.thirds, def.guides.thirds),
      golden: bool(g.golden, def.guides.golden),
      centre: bool(g.centre, def.guides.centre),
      safe: bool(g.safe, def.guides.safe),
    },
    frameColor: oneOf(r.frameColor, COLORS, def.frameColor),
    mask: Math.round(clamp(num(r.mask) ?? def.mask, 0, 0.9) * 100) / 100,
    distance: Math.round(clamp(num(r.distance) ?? def.distance, 0.1, 10000) * 100) / 100,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function sanitizeCalibration(raw: unknown): Calibration | undefined {
  if (!isObj(raw)) return undefined;
  if (raw.kind === 'device' && typeof raw.deviceId === 'string' && typeof raw.cameraId === 'string') {
    const cam = getDevice(raw.deviceId)?.cameras.find((c) => c.id === raw.cameraId);
    return cam ? { kind: 'device', deviceId: raw.deviceId, cameraId: cam.id } : undefined;
  }
  const v = num(raw.kind === 'equivalent' ? raw.mm : raw.degrees);
  if (raw.kind === 'equivalent' && v !== undefined && v >= 5 && v <= 300) return { kind: 'equivalent', mm: v };
  if (raw.kind === 'diagonal' && v !== undefined && v > 5 && v < 175) return { kind: 'diagonal', degrees: v };
  return undefined;
}

export const DEFAULT_AIDS: AidsPrefs = { histogram: false, histMode: 'luma', picture: 'off', zebra: 95, peaking: false, peakColor: 'red', peakSens: 'medium' };

export function sanitizeAids(raw: unknown): AidsPrefs {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_AIDS;
  const zebra = num(r.zebra);
  return {
    histogram: typeof r.histogram === 'boolean' ? r.histogram : d.histogram,
    histMode: oneOf(r.histMode, ['luma', 'rgb'] as const, d.histMode),
    picture: oneOf(r.picture, ['off', 'zebras', 'falseColour'] as const, d.picture),
    zebra: zebra !== undefined && (ZEBRA_LEVELS as readonly number[]).includes(zebra) ? zebra : d.zebra,
    peaking: typeof r.peaking === 'boolean' ? r.peaking : d.peaking,
    peakColor: oneOf(r.peakColor, COLORS, d.peakColor),
    peakSens: oneOf(r.peakSens, ['low', 'medium', 'high'] as const, d.peakSens),
  };
}

const ISO = (v: unknown, fallback: string) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback);

export function emptySave(now = new Date()): SaveFile {
  return {
    app: APP_ID,
    v: SAVE_VERSION,
    savedAt: now.toISOString(),
    current: defaultSetup('cinema'),
    setups: [],
    gear: { cameras: [], lenses: [] },
    calibration: {},
    aids: { ...DEFAULT_AIDS },
  };
}

/**
 * A complete, valid save file from a document of the current version
 * (run migrate() first). Returns null when it is not a CapXer save at all.
 */
export function sanitizeSave(raw: unknown, now = new Date()): SaveFile | null {
  if (!isObj(raw) || raw.app !== APP_ID || raw.v !== SAVE_VERSION) return null;
  const gear = isObj(raw.gear) ? raw.gear : {};

  const cameras: CustomSensor[] = [];
  for (const c of Array.isArray(gear.cameras) ? gear.cameras : []) {
    const ok = sanitizeCustom(c);
    if (ok && !cameras.some((x) => x.id === ok.id)) cameras.push(ok);
    if (cameras.length >= LIMITS.cameras) break;
  }
  const lenses: number[] = [];
  for (const l of Array.isArray(gear.lenses) ? gear.lenses : []) {
    const v = num(l);
    if (v !== undefined && v > 0 && v <= 2000 && !lenses.includes(Math.round(v * 10) / 10)) lenses.push(Math.round(v * 10) / 10);
    if (lenses.length >= LIMITS.lenses) break;
  }

  const stamp = now.toISOString();
  const setups: SavedSetup[] = [];
  for (const s of Array.isArray(raw.setups) ? raw.setups : []) {
    if (!isObj(s) || typeof s.id !== 'string' || !/^[a-z0-9]{1,16}$/.test(s.id) || setups.some((x) => x.id === s.id)) continue;
    setups.push({ id: s.id, name: cleanName(s.name, 'Untitled'), setup: sanitizeSetup(s.setup, cameras), savedAt: ISO(s.savedAt, stamp) });
    if (setups.length >= LIMITS.setups) break;
  }

  const cal = isObj(raw.calibration) ? raw.calibration : {};
  const calibration: Calibrations = {};
  const phone = sanitizeCalibration(cal.phone);
  const webcam = sanitizeCalibration(cal.webcam);
  if (phone) calibration.phone = phone;
  if (webcam) calibration.webcam = webcam;

  return {
    app: APP_ID,
    v: SAVE_VERSION,
    savedAt: ISO(raw.savedAt, stamp),
    current: sanitizeSetup(raw.current, cameras),
    setups,
    gear: { cameras, lenses },
    calibration,
    aids: sanitizeAids(raw.aids),
  };
}
