import { getSensor } from '../data/index.ts';
import type { Setup } from '../setup/types.ts';
import type { LabState } from '../storage/schema.ts';
import { getSet } from './sets/index.ts';
import { APERTURES, SHUTTERS, nearestIndex } from './stops.ts';

// Words for a lab setup: a suggested name and a one-line summary for the
// Saved tool. Pure, unit-tested. Cinema says T-stop, shutter angle and EI;
// Stills says f-stop, shutter speed and ISO (the viewfinder's mode decides).

const cinema = (setup: Setup) => setup.mode === 'cinema';

export function apertureLabel(setup: Setup, fNumber: number): string {
  const label =
    APERTURES[
      nearestIndex(
        APERTURES.map((a) => a.value),
        fNumber,
      )
    ]!.label;
  return `${cinema(setup) ? 'T' : 'f/'}${label}`;
}

export function shutterLabel(setup: Setup, st: LabState): string {
  if (cinema(setup)) return `${st.exposure.angle}°`;
  return SHUTTERS[
    nearestIndex(
      SHUTTERS.map((s) => s.value),
      st.exposure.shutter,
    )
  ]!.label;
}

function lightingName(st: LabState): string {
  const set = getSet(st.set);
  return (set.lighting.find((l) => l.id === st.lighting) ?? set.lighting[0]!).name;
}

/** "Three-point, T2.8, 180°" */
export function suggestLabName(setup: Setup, st: LabState): string {
  return `${lightingName(st)}, ${apertureLabel(setup, st.exposure.fNumber)}, ${shutterLabel(setup, st)}`;
}

/** "ALEXA 35 · 35 mm · Three-point · T2.8 · 180° · EI 400 · 5600 K" */
export function labSummary(setup: Setup, st: LabState): string {
  const model = getSensor(setup.sensorId)?.name ?? '';
  const iso = `${cinema(setup) ? 'EI' : 'ISO'} ${st.exposure.iso}`;
  return [
    model,
    `${setup.focal} mm`,
    lightingName(st),
    apertureLabel(setup, st.exposure.fNumber),
    shutterLabel(setup, st),
    iso,
    `${st.exposure.kelvin} K`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The parts that make two lab setups look the same (not when they were saved, not the viewer's aids). */
export function labKey(setup: Setup, st: LabState): string {
  const { changedAt: _c, aids: _a, ...rest } = st;
  return JSON.stringify([setup, rest]);
}
