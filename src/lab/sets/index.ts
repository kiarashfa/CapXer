import type { SetDef } from '../types.ts';
import { studio } from './studio/set.ts';

// Every set the lab offers. Manifests are small (layout numbers only); each
// set's 3D component loads with import() when the set is chosen. A new place
// (an outdoor farm, a street) = a new folder here plus one line below.

export const SETS: SetDef[] = [studio];

export const DEFAULT_SET = SETS[0]!;

export function getSet(id: string | undefined): SetDef {
  return SETS.find((s) => s.id === id) ?? DEFAULT_SET;
}
