import { z } from 'zod';

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

export const SENSOR_KINDS = ['stills', 'cinema', 'film', 'phone'] as const;
export const FORMAT_CLASSES = [
  'medium-format',
  'full-frame',
  'super-35',
  'aps-c',
  'micro-four-thirds',
  'one-inch',
  'super-16',
  'phone',
] as const;

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

export type Citation = z.infer<typeof CitationSchema>;
export type Format = z.infer<typeof FormatSchema>;
export type Maker = z.infer<typeof MakerSchema>;
export type SensorFile = z.infer<typeof SensorSchema>;
/** A sensor as the app sees it: the file plus the identity taken from its path. */
export type Sensor = SensorFile & { id: string; maker: Maker };
export type SensorKind = Sensor['kind'];
export type FormatClass = Sensor['formatClass'];

/** "<maker>/<model>.json", lowercase kebab-case on both levels. */
export const SENSOR_PATH = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
