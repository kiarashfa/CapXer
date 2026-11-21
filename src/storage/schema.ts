import type { Calibration } from '../camera/lens.ts';
import type { PeakSensitivity } from '../analysis/levels.ts';
import type { PictureAid } from '../analysis/aids.svelte.ts';
import type { CustomSensor, FrameColor, Setup } from '../setup/types.ts';

// The save file: everything CapXer keeps for the user, as one document.
// The same document is stored in localStorage, exported as a .json file and,
// from v1.1, synced to the user's own cloud. Bump SAVE_VERSION and add a step
// to migrate.ts whenever its shape changes; old files must keep opening.
// v2 (CapXer 1.1): profile and deletion records (so a cloud sync never brings
// back something deleted on another device).

export const SAVE_VERSION = 2;
export const APP_ID = 'capxer';
/** localStorage key of the save file. */
export const SAVE_KEY = 'capxer.save';

/** Hard caps for untrusted input (imported files, links, storage edited by hand). */
export const LIMITS = { setups: 200, cameras: 50, lenses: 40, name: 60, profileName: 40, picture: 80_000 } as const;

/** Colours behind initials; each keeps white letters at WCAG AA (src/styles/user.css). */
export const TINTS = ['blue', 'teal', 'green', 'amber', 'rose', 'violet', 'slate'] as const;
export type Tint = (typeof TINTS)[number];

/** Who the save file belongs to. Shown in the site bar and on /user/. */
export interface Profile {
  name: string;
  /** A small square picture as a data: URL (192 px WebP or JPEG), or null. */
  picture: string | null;
  /** One or two letters on a colour, used when there is no picture. */
  initials: { letters: string; tint: Tint } | null;
  /** When the profile last changed; the newer profile wins in a sync. */
  changedAt: string;
}

/** Deletion records, id (or lens mm) -> when it was deleted. Pruned after DELETED_DAYS. */
export interface Deleted {
  setups: Record<string, string>;
  cameras: Record<string, string>;
  lenses: Record<string, string>;
}
export const DELETED_DAYS = 90;

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
  /** When this copy was written; lets sync tell which copy is newer. */
  savedAt: string;
  profile?: Profile;
  current: Setup;
  setups: SavedSetup[];
  gear: { cameras: CustomSensor[]; lenses: number[] };
  calibration: Calibrations;
  aids: AidsPrefs;
  deleted: Deleted;
}

/**
 * Where a save file lives: this browser (local.ts). The cloud copies
 * (src/user/cloud.ts) are synced through src/storage/store.ts.
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
