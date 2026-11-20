import type { Calibration } from '../camera/lens.ts';
import type { PeakSensitivity } from '../analysis/levels.ts';
import type { PictureAid } from '../analysis/aids.svelte.ts';
import type { CustomSensor, FrameColor, Setup } from '../setup/types.ts';

// The save file: everything CapXer keeps for the user, as one document.
// The same document is stored in localStorage, exported as a .json file and,
// from v1.1, synced to the user's own cloud. Bump SAVE_VERSION and add a step
// to migrate.ts whenever its shape changes; old files must keep opening.

export const SAVE_VERSION = 1;
export const APP_ID = 'capxer';

/** Hard caps for untrusted input (imported files, links, storage edited by hand). */
export const LIMITS = { setups: 200, cameras: 50, lenses: 40, name: 60 } as const;

export interface SavedSetup {
  id: string;
  name: string;
  setup: Setup;
  savedAt: string;
}

export interface AidsPrefs {
  histogram: boolean;
  histMode: 'luma' | 'rgb';
  picture: PictureAid;
  zebra: number;
  peaking: boolean;
  peakColor: FrameColor;
  peakSens: PeakSensitivity;
}

/** One calibration per kind of device, so a synced file never puts a phone lens on a webcam. */
export interface Calibrations {
  phone?: Calibration;
  webcam?: Calibration;
}

export interface SaveFile {
  app: typeof APP_ID;
  v: typeof SAVE_VERSION;
  /** When this copy was written; lets sync (v1.1) tell which copy is newer. */
  savedAt: string;
  current: Setup;
  setups: SavedSetup[];
  gear: { cameras: CustomSensor[]; lenses: number[] };
  calibration: Calibrations;
  aids: AidsPrefs;
}

/**
 * Where a save file lives. P6 ships the localStorage adapter (local.ts);
 * v1.1 adds Google Drive and Dropbox behind the same interface.
 */
export interface SaveAdapter {
  load(): Promise<SaveFile | null>;
  save(file: SaveFile): Promise<void>;
}

/** A short random id for saved setups and custom cameras ("k3f9a2"). */
export function newId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}
