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
// v3 (CapXer 2.0): the lab's state (optional until the lab is first used).

export const SAVE_VERSION = 3;
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

/** One light of a lab scenario as the user changed it (only the changed parts). */
export interface LabLightEdit {
  on?: boolean;
  /** Brightness change, stops (thirds, -3 to +3). */
  stops?: number;
  /** Size of the light's face, metres (softness). */
  size?: number;
  kelvin?: number;
  /** Position on the floor, metres from the subject. */
  x?: number;
  z?: number;
}

/**
 * The lab's state. Ids, not list positions, and real values (f-number,
 * seconds), so new sets, subjects and steps never need a schema change;
 * unknown ids fall back to defaults when the lab opens.
 */
export interface LabState {
  set: string;
  subject: string;
  lighting: string;
  exposure: {
    fNumber: number;
    /** Shutter speed, seconds (Stills). */
    shutter: number;
    /** Shutter angle, degrees, and frame rate (Cinema). */
    angle: number;
    fps: number;
    iso: number;
    /** White balance, kelvin. */
    kelvin: number;
  };
  /** Focus: on the subject, at infinity, or a distance in metres. */
  focus: 'subject' | 'infinity' | number;
  /** Changes to the scenario's lights, by light id. */
  lights: Record<string, LabLightEdit>;
  /** Room bounce brightness change, stops. */
  ambient: number;
  /** Camera position on the floor when moved, metres from the subject. */
  camera: { x: number; z: number } | null;
  aids: { histogram: boolean; histMode: 'luma' | 'rgb'; picture: 'off' | 'zebras' | 'falseColour'; zebra: number };
  /** When the lab state last changed; the newer one wins in a sync. */
  changedAt: string;
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
  lab?: LabState;
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
