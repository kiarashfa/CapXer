import { FORMAT_CLASSES, SENSOR_PATH } from './constants.ts';
import type { Format, Maker, Sensor, SensorFile } from './schema.ts';
import makerList from './makers.json';

// The camera database: src/data/sensors/<maker>/<model>.json, one file per
// sensor. Adding a file is all it takes to add a sensor (plus a makers.json
// entry for a new maker). Validated at build time (scripts/check-data.ts);
// only types are imported here, so zod is not shipped to visitors.

export const makers = makerList as Maker[];
const makerById = new Map(makers.map((m) => [m.id, m]));

const files = import.meta.glob<SensorFile>('./sensors/*/*.json', { eager: true, import: 'default' });

const classOrder = new Map<string, number>(FORMAT_CLASSES.map((c, i) => [c, i]));

/** All sensors, largest format class first, then by display name. */
export const sensors: readonly Sensor[] = Object.entries(files)
  .map(([path, file]) => {
    const [, maker = '', model = ''] = SENSOR_PATH.exec(path.replace('./sensors/', '')) ?? [];
    return { ...file, id: `${maker}/${model}`, maker: makerById.get(maker)! };
  })
  .sort(
    (a, b) =>
      classOrder.get(a.formatClass)! - classOrder.get(b.formatClass)! || displayName(a).localeCompare(displayName(b)),
  );

const byId = new Map(sensors.map((s) => [s.id, s]));

/** Look up by "<maker>/<model>", e.g. "arri/alexa-35". */
export function getSensor(id: string): Sensor | undefined {
  return byId.get(id);
}

/** "ARRI ALEXA 35"; generic families (film) show the model name alone. */
export function displayName(sensor: Sensor): string {
  return sensor.maker.generic ? sensor.name : `${sensor.maker.name} ${sensor.name}`;
}

/** The full image area of a sensor (its first format). */
export function fullFormat(sensor: Sensor): Format {
  return sensor.formats[0]!;
}

export type { Format, Maker, Sensor, SensorKind, FormatClass, Citation } from './schema.ts';
