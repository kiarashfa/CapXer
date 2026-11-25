import { getDevice, getSensor } from '../data/index.ts';
import { cropFactor } from '../optics/index.ts';
import { focalRange, round } from '../setup/focal.ts';
import { aspectPreset, defaultSetup, FRAME_COLORS } from '../setup/presets.ts';
import type { Calibration } from '../camera/lens.ts';
import { ZEBRA_LEVELS } from '../analysis/levels.ts';
import type { CustomSensor, FrameColor, Mode, Setup } from '../setup/types.ts';
import {
  APP_ID,
  DELETED_DAYS,
  LIMITS,
  SAVE_VERSION,
  TINTS,
  type AidsPrefs,
  type Calibrations,
  type Deleted,
  type LabLightEdit,
  type LabState,
  type Profile,
  type SaveFile,
  type SavedLab,
  type SavedSetup,
} from './schema.ts';

// Everything read from storage, a file or a link is untrusted: it may be old,
// hand-edited, cut off or hostile. These functions never throw; they keep what
// is valid, clamp numbers into range, swap unknown ids for defaults and drop
// the rest. (zod stays a build-time tool, so this is plain code.)

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      ? Number(v)
      : undefined;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/** Trimmed text without control characters, cut to the name limit. */
export function cleanName(v: unknown, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  const s = v
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, LIMITS.name);
  return s || fallback;
}

const CUSTOM_ID = /^custom\/[a-z0-9]{1,12}$/;

export function sanitizeCustom(raw: unknown): CustomSensor | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !CUSTOM_ID.test(raw.id)) return null;
  const width = num(raw.width);
  const height = num(raw.height);
  if (
    width === undefined ||
    height === undefined ||
    width < 1 ||
    width > 100 ||
    height < 1 ||
    height > 100
  )
    return null;
  return {
    id: raw.id,
    name: cleanName(raw.name, 'My sensor'),
    width,
    height,
    squeeze: clamp(num(raw.squeeze) ?? 1, 1, 2),
  };
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
  let formats: { id: string; width: number; height: number; squeeze?: number }[] = getSensor(
    def.sensorId,
  )!.formats;
  if (typeof r.sensorId === 'string') {
    const custom = customs.find((c) => c.id === r.sensorId);
    const sensor = getSensor(r.sensorId);
    if (custom) {
      sensorId = custom.id;
      formats = [
        {
          id: 'custom',
          width: custom.width,
          height: custom.height,
          squeeze: custom.squeeze > 1 ? custom.squeeze : undefined,
        },
      ];
    } else if (sensor) {
      sensorId = sensor.id;
      formats = sensor.formats;
    }
  }
  const format =
    formats.find((f) => f.id === r.formatId) ??
    (sensorId === def.sensorId ? formats.find((f) => f.id === def.formatId) : undefined) ??
    formats[0]!;
  const squeeze = round2(clamp(num(r.squeeze) ?? format.squeeze ?? 1, 1, 2));
  const aspect =
    typeof r.aspect === 'string' && aspectPreset(mode, r.aspect)
      ? r.aspect
      : sensorId === def.sensorId
        ? def.aspect
        : 'full';

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
  if (
    raw.kind === 'device' &&
    typeof raw.deviceId === 'string' &&
    typeof raw.cameraId === 'string'
  ) {
    const cam = getDevice(raw.deviceId)?.cameras.find((c) => c.id === raw.cameraId);
    return cam ? { kind: 'device', deviceId: raw.deviceId, cameraId: cam.id } : undefined;
  }
  const v = num(raw.kind === 'equivalent' ? raw.mm : raw.degrees);
  if (raw.kind === 'equivalent' && v !== undefined && v >= 5 && v <= 300)
    return { kind: 'equivalent', mm: v };
  if (raw.kind === 'diagonal' && v !== undefined && v > 5 && v < 175)
    return { kind: 'diagonal', degrees: v };
  return undefined;
}

export const DEFAULT_AIDS: AidsPrefs = {
  histogram: false,
  histMode: 'luma',
  picture: 'off',
  zebra: 95,
  peaking: false,
  peakColor: 'red',
  peakSens: 'medium',
};

export function sanitizeAids(raw: unknown): AidsPrefs {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_AIDS;
  const zebra = num(r.zebra);
  return {
    histogram: typeof r.histogram === 'boolean' ? r.histogram : d.histogram,
    histMode: oneOf(r.histMode, ['luma', 'rgb'] as const, d.histMode),
    picture: oneOf(r.picture, ['off', 'zebras', 'falseColour'] as const, d.picture),
    zebra:
      zebra !== undefined && (ZEBRA_LEVELS as readonly number[]).includes(zebra) ? zebra : d.zebra,
    peaking: typeof r.peaking === 'boolean' ? r.peaking : d.peaking,
    peakColor: oneOf(r.peakColor, COLORS, d.peakColor),
    peakSens: oneOf(r.peakSens, ['low', 'medium', 'high'] as const, d.peakSens),
  };
}

const ISO = (v: unknown, fallback: string) =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : fallback;

/** A small picture as a base64 data: URL. Anything else (remote links, SVG, huge strings) is dropped. */
const PICTURE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

/** One or two letters or digits, upper case ("SK", "K", "7"). */
export function cleanInitials(v: unknown): string {
  if (typeof v !== 'string') return '';
  return [...v.normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '')]
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('en-GB');
}

/** "Sam Kade" -> "SK", "Sam" -> "SA", "" -> "". */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '';
  const first = [...words[0]!];
  const last = words.length > 1 ? [...words.at(-1)!] : [];
  return cleanInitials(last.length ? first[0]! + last[0]! : first.slice(0, 2).join(''));
}

export function cleanProfileName(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.profileName)
    .trim();
}

export function sanitizeProfile(raw: unknown, now = new Date()): Profile | undefined {
  if (!isObj(raw)) return undefined;
  const picture =
    typeof raw.picture === 'string' &&
    raw.picture.length <= LIMITS.picture &&
    PICTURE.test(raw.picture)
      ? raw.picture
      : null;
  const ini = isObj(raw.initials) ? raw.initials : null;
  const letters = cleanInitials(ini?.letters);
  return {
    name: cleanProfileName(raw.name),
    picture,
    initials: letters ? { letters, tint: oneOf(ini?.tint, TINTS, 'blue') } : null,
    changedAt: ISO(raw.changedAt, now.toISOString()),
  };
}

export const emptyDeleted = (): Deleted => ({ setups: {}, labSetups: {}, cameras: {}, lenses: {} });

const LAB_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const labId = (v: unknown, fallback: string) =>
  typeof v === 'string' && v.length <= 40 && LAB_ID.test(v) ? v : fallback;
const thirds = (v: number) => Math.round(v * 3) / 3;

/** The lab's defaults (f/2.8, 1/50 s or 180 degrees at 24 fps, ISO 400, 5600 K, focus on the subject). */
export function defaultLab(now = new Date()): LabState {
  return {
    set: 'studio',
    subject: 'figure',
    lighting: 'three-point',
    exposure: { fNumber: 2.8, shutter: 1 / 50, angle: 180, fps: 24, iso: 400, kelvin: 5600 },
    focus: 'subject',
    lights: {},
    ambient: 0,
    camera: null,
    aids: { histogram: false, histMode: 'luma', picture: 'off', zebra: 95 },
    changedAt: now.toISOString(),
  };
}

/** A safe lab state: ids checked by shape (the lab itself swaps unknown ones for defaults), numbers clamped. */
export function sanitizeLab(raw: unknown, now = new Date()): LabState | undefined {
  if (!isObj(raw)) return undefined;
  const d = defaultLab(now);
  const e = isObj(raw.exposure) ? raw.exposure : {};
  const n = (v: unknown, def: number, min: number, max: number) => clamp(num(v) ?? def, min, max);
  const lights: Record<string, LabLightEdit> = {};
  if (isObj(raw.lights)) {
    for (const [id, v] of Object.entries(raw.lights).slice(0, 12)) {
      if (!LAB_ID.test(id) || id.length > 40 || !isObj(v)) continue;
      const edit: LabLightEdit = {};
      if (typeof v.on === 'boolean') edit.on = v.on;
      if (num(v.stops) !== undefined) edit.stops = thirds(clamp(num(v.stops)!, -3, 3));
      if (num(v.size) !== undefined) edit.size = round2(clamp(num(v.size)!, 0, 2));
      if (num(v.kelvin) !== undefined) edit.kelvin = Math.round(clamp(num(v.kelvin)!, 1500, 12000));
      if (num(v.x) !== undefined) edit.x = round2(clamp(num(v.x)!, -50, 50));
      if (num(v.z) !== undefined) edit.z = round2(clamp(num(v.z)!, -50, 50));
      lights[id] = edit;
    }
  }
  const focusNum = num(raw.focus);
  const focus =
    raw.focus === 'infinity'
      ? 'infinity'
      : focusNum !== undefined && focusNum > 0
        ? round2(clamp(focusNum, 0.3, 1000))
        : 'subject';
  const camRaw = isObj(raw.camera) ? raw.camera : null;
  const cx = camRaw ? num(camRaw.x) : undefined;
  const cz = camRaw ? num(camRaw.z) : undefined;
  const camera =
    cx !== undefined && cz !== undefined
      ? { x: round2(clamp(cx, -50, 50)), z: round2(clamp(cz, -50, 50)) }
      : null;
  const a = isObj(raw.aids) ? raw.aids : {};
  const zebra = num(a.zebra);
  return {
    set: labId(raw.set, d.set),
    subject: labId(raw.subject, d.subject),
    lighting: labId(raw.lighting, d.lighting),
    exposure: {
      fNumber: n(e.fNumber, d.exposure.fNumber, 0.7, 64),
      shutter: n(e.shutter, d.exposure.shutter, 1 / 16000, 60),
      angle: n(e.angle, d.exposure.angle, 1, 360),
      fps: n(e.fps, d.exposure.fps, 1, 240),
      iso: Math.round(n(e.iso, d.exposure.iso, 25, 102400)),
      kelvin: Math.round(n(e.kelvin, d.exposure.kelvin, 1500, 12000)),
    },
    focus,
    lights,
    ambient: thirds(n(raw.ambient, 0, -3, 3)),
    camera,
    aids: {
      histogram: typeof a.histogram === 'boolean' ? a.histogram : d.aids.histogram,
      histMode: oneOf(a.histMode, ['luma', 'rgb'] as const, d.aids.histMode),
      picture: oneOf(a.picture, ['off', 'zebras', 'falseColour'] as const, d.aids.picture),
      zebra:
        zebra !== undefined && (ZEBRA_LEVELS as readonly number[]).includes(zebra)
          ? zebra
          : d.aids.zebra,
    },
    changedAt: ISO(raw.changedAt, now.toISOString()),
  };
}

/** Deletion records with valid keys and dates, without those older than DELETED_DAYS. */
export function sanitizeDeleted(raw: unknown, now = new Date()): Deleted {
  const r = isObj(raw) ? raw : {};
  const oldest = now.getTime() - DELETED_DAYS * 86_400_000;
  const part = (v: unknown, key: RegExp): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!isObj(v)) return out;
    for (const [k, when] of Object.entries(v).slice(0, 1000)) {
      if (!key.test(k) || typeof when !== 'string') continue;
      const t = Date.parse(when);
      if (!Number.isNaN(t) && t >= oldest) out[k] = new Date(t).toISOString();
    }
    return out;
  };
  return {
    setups: part(r.setups, /^[a-z0-9]{1,16}$/),
    labSetups: part(r.labSetups, /^[a-z0-9]{1,16}$/),
    cameras: part(r.cameras, /^custom\/[a-z0-9]{1,12}$/),
    lenses: part(r.lenses, /^\d{1,4}(\.\d)?$/),
  };
}

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
    deleted: emptyDeleted(),
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
    if (v !== undefined && v > 0 && v <= 2000 && !lenses.includes(Math.round(v * 10) / 10))
      lenses.push(Math.round(v * 10) / 10);
    if (lenses.length >= LIMITS.lenses) break;
  }

  const stamp = now.toISOString();
  const setups: SavedSetup[] = [];
  for (const s of Array.isArray(raw.setups) ? raw.setups : []) {
    if (
      !isObj(s) ||
      typeof s.id !== 'string' ||
      !/^[a-z0-9]{1,16}$/.test(s.id) ||
      setups.some((x) => x.id === s.id)
    )
      continue;
    setups.push({
      id: s.id,
      name: cleanName(s.name, 'Untitled'),
      setup: sanitizeSetup(s.setup, cameras),
      savedAt: ISO(s.savedAt, stamp),
    });
    if (setups.length >= LIMITS.setups) break;
  }

  const cal = isObj(raw.calibration) ? raw.calibration : {};
  const calibration: Calibrations = {};
  const phone = sanitizeCalibration(cal.phone);
  const webcam = sanitizeCalibration(cal.webcam);
  if (phone) calibration.phone = phone;
  if (webcam) calibration.webcam = webcam;

  const profile = sanitizeProfile(raw.profile, now);
  const lab = sanitizeLab(raw.lab, now);
  // Lab setups use the camera database only (no custom sensors in the lab).
  const labSetups: SavedLab[] = [];
  for (const s of Array.isArray(raw.labSetups) ? raw.labSetups : []) {
    if (
      !isObj(s) ||
      typeof s.id !== 'string' ||
      !/^[a-z0-9]{1,16}$/.test(s.id) ||
      labSetups.some((x) => x.id === s.id)
    )
      continue;
    const labState = sanitizeLab(s.lab, now);
    if (!labState) continue;
    labSetups.push({
      id: s.id,
      name: cleanName(s.name, 'Untitled'),
      setup: sanitizeSetup(s.setup),
      lab: labState,
      savedAt: ISO(s.savedAt, stamp),
    });
    if (labSetups.length >= LIMITS.labSetups) break;
  }
  return {
    app: APP_ID,
    v: SAVE_VERSION,
    savedAt: ISO(raw.savedAt, stamp),
    ...(profile ? { profile } : {}),
    current: sanitizeSetup(raw.current, cameras),
    setups,
    gear: { cameras, lenses },
    calibration,
    aids: sanitizeAids(raw.aids),
    deleted: sanitizeDeleted(raw.deleted, now),
    ...(lab ? { lab } : {}),
    ...(labSetups.length ? { labSetups } : {}),
  };
}
