// Plain constants shared by the schema (build time) and the app (browser).
// Kept free of zod so importing them never ships the validator to visitors.

export const SENSOR_KINDS = ['stills', 'cinema', 'film', 'phone'] as const;

export const DEVICE_KINDS = ['phone', 'webcam'] as const;

/** Format classes, largest first (also the picker's group order). */
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

/** "<maker>/<model>.json", lowercase kebab-case on both levels (sensors and devices). */
export const SENSOR_PATH = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
