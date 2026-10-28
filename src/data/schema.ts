import { z } from 'zod';
import { DEVICE_KINDS, FORMAT_CLASSES, SENSOR_KINDS } from './constants.ts';

export { DEVICE_KINDS, FORMAT_CLASSES, SENSOR_KINDS, SENSOR_PATH } from './constants.ts';

// Schemas for the camera database. Used at build/test time (scripts/check-data.ts,
// tests/unit/data.test.ts); the app imports only the inferred types, so zod is
// never shipped to visitors. Every number must carry a citation into
// src/references/references.json.

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase-kebab-case id');

/** Points at a reference plus where in it the value is found (table, section, line). */
export const CitationSchema = z.strictObject({
  ref: slug,
  locator: z.string().min(3),
});

export const FormatSchema = z.strictObject({
  id: slug,
  name: z.string().min(1),
  /** Image area in mm (on the sensor or film, not desqueezed). */
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
  /** Anamorphic squeeze factor; omitted for spherical. */
  squeeze: z.number().gt(1).max(2).optional(),
  /** Photosites across and down, when published. */
  photosites: z.tuple([z.int().positive(), z.int().positive()]).optional(),
  citation: CitationSchema,
});


/**
 * A maker (or, with generic: true, a family of formats such as film) from
 * src/data/makers.json. Its id is the folder name under src/data/sensors/.
 */
export const MakerSchema = z.strictObject({
  id: slug,
  name: z.string().min(1),
  /** Not a brand: its name is not put in front of model names. */
  generic: z.boolean().optional(),
});

/**
 * One file: src/data/sensors/<maker>/<model>.json. The path is the identity
 * (id "<maker>/<model>"), so the file does not repeat it.
 */
export const SensorSchema = z.strictObject({
  /** Model name as the maker writes it, without the maker, e.g. "ALEXA 35". */
  name: z.string().min(1),
  kind: z.enum(SENSOR_KINDS),
  formatClass: z.enum(FORMAT_CLASSES),
  /** Photosite pitch in micrometres, when published. Cross-checked against formats. */
  pitch: z.strictObject({ value: z.number().positive().max(20), citation: CitationSchema }).optional(),
  /** The first format is the full image area; the rest are modes within it. */
  formats: z.array(FormatSchema).min(1),
  /**
   * manufacturer: from the maker's own published specification.
   * standard: from a published standard (SMPTE, ISO).
   * derived: calculated from published figures (see notes).
   */
  confidence: z.enum(['manufacturer', 'standard', 'derived']),
  notes: z.string().min(1).optional(),
});

/**
 * One camera of a phone or webcam, for calibrating the live view. Makers
 * publish either a 35mm-equivalent focal length (Apple) or a field of view
 * (Google, Samsung, Logitech); the file stores whichever the source states.
 */
export const DeviceCameraSchema = z
  .strictObject({
    id: slug,
    name: z.string().min(1),
    facing: z.enum(['back', 'front']),
    /** 35mm-equivalent focal length, mm (diagonal convention). */
    equivalent: z.number().min(5).max(300).optional(),
    /** Diagonal angle of view, degrees. */
    diagonalFov: z.number().gt(5).lt(180).optional(),
    /** Shape of the image the figure describes, long side first. Default 4:3 (phone stills). */
    aspect: z.tuple([z.int().positive(), z.int().positive()]).optional(),
    citation: CitationSchema,
  })
  .refine((c) => (c.equivalent === undefined) !== (c.diagonalFov === undefined), 'give exactly one of equivalent or diagonalFov');

/** One file: src/data/devices/<maker>/<model>.json. The first camera is the main one. */
export const DeviceSchema = z.strictObject({
  name: z.string().min(1),
  kind: z.enum(DEVICE_KINDS),
  cameras: z.array(DeviceCameraSchema).min(1),
  confidence: z.enum(['manufacturer', 'derived']),
  notes: z.string().min(1).optional(),
});

export type Citation = z.infer<typeof CitationSchema>;
export type DeviceCamera = z.infer<typeof DeviceCameraSchema>;
export type DeviceFile = z.infer<typeof DeviceSchema>;
export type Device = DeviceFile & { id: string; maker: Maker };
export type Format = z.infer<typeof FormatSchema>;
export type Maker = z.infer<typeof MakerSchema>;
export type SensorFile = z.infer<typeof SensorSchema>;
/** A sensor as the app sees it: the file plus the identity taken from its path. */
export type Sensor = SensorFile & { id: string; maker: Maker };
export type SensorKind = Sensor['kind'];
export type FormatClass = Sensor['formatClass'];

