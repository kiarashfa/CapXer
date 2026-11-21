import { SAVE_KEY } from '../storage/schema.ts';
import { TINTS, type Profile } from '../storage/schema.ts';

// What every page needs to know about the user without loading the cloud code:
// the profile (read straight from the save file in localStorage), the cloud
// connection and whether this browser has changes the cloud does not have yet.
// Kept small: the site bar imports it on every page.

export const CLOUD_KEY = 'capxer.cloud';
/** Fired on window when the cloud state or the save status changes in this tab. */
export const CLOUD_EVENT = 'capxer:cloud';

export const PROVIDERS = { google: 'Google Drive', dropbox: 'Dropbox' } as const;
export type Provider = keyof typeof PROVIDERS;

export interface CloudState {
  provider: Provider;
  account: { name: string; email: string } | null;
  /** savedAt of the local save as last uploaded (ISO), or null before the first upload. Compared with the local save to find new changes. */
  savedAt: string | null;
  /** When this browser last finished a sync with the cloud (ISO), for display. */
  syncedAt?: string | null;
  /** The cloud file's version as last seen here. */
  rev: string | null;
  /** Google Drive file id. */
  file: string | null;
  token: { access: string; expires: number } | null;
  /** Dropbox refresh token. */
  refresh: string | null;
  /** The last save failed: 'auth' needs a click to sign in again; 'error' is retried. */
  problem: 'auth' | 'error' | null;
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the connection lasts for this page only.
  }
}

export function cloudState(): CloudState | null {
  const s = readJson<CloudState>(CLOUD_KEY);
  return s && typeof s === 'object' && typeof s.provider === 'string' && s.provider in PROVIDERS ? s : null;
}

/** Forgets the cloud connection in this browser (the cloud file stays). */
export function forgetCloud(): void {
  writeJson(CLOUD_KEY, null);
  dispatchEvent(new CustomEvent(CLOUD_EVENT));
}

interface Head {
  profile?: Profile;
  savedAt?: string;
  setups?: unknown[];
  gear?: { cameras?: unknown[]; lenses?: unknown[] };
  calibration?: { phone?: unknown; webcam?: unknown };
}

/**
 * The save's profile and time stamp, read without validating the whole file
 * (that needs the camera database, too big for every page). `work` mirrors
 * hasWork() in src/storage/store.ts.
 */
export function savedHead(): { profile: Profile | null; savedAt: string | null; work: boolean } {
  const s = readJson<Head>(SAVE_KEY);
  const p = s?.profile;
  const profile = p && typeof p === 'object' && typeof p.name === 'string' ? p : null;
  const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const work = !!profile || n(s?.setups) + n(s?.gear?.cameras) + n(s?.gear?.lenses) > 0 || !!s?.calibration?.phone || !!s?.calibration?.webcam;
  return { profile, savedAt: typeof s?.savedAt === 'string' ? s.savedAt : null, work };
}

/** True when this browser holds changes that are not in the cloud yet. */
export function unsaved(s: CloudState | null = cloudState()): boolean {
  if (!s) return false;
  const local = Date.parse(savedHead().savedAt ?? '') || 0;
  return local > (Date.parse(s.savedAt ?? '') || 0);
}

export type Dot = 'saved' | 'pending' | 'auth' | null;

/** The small dot on the profile circle: null without a cloud. */
export function cloudDot(s: CloudState | null = cloudState()): Dot {
  if (!s) return null;
  if (s.problem === 'auth') return 'auth';
  return unsaved(s) || s.problem === 'error' ? 'pending' : 'saved';
}

/** "just now", "4 min ago", "3 h ago", "yesterday", "12 Oct". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  if (min < 48 * 60) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Draws a profile circle into an `.avatar` element: the picture, the initials
 * on their colour, or the person icon (already in the markup). Same result as
 * the inline pre-paint script in BaseLayout and Avatar.svelte.
 */
export function paintAvatar(el: HTMLElement, p: Profile | null): void {
  el.querySelector('.avatar-img, .avatar-glyph')?.remove();
  const tint = p?.initials && TINTS.includes(p.initials.tint) ? p.initials.tint : undefined;
  if (p?.picture) {
    el.dataset.kind = 'picture';
    delete el.dataset.tint;
    const img = document.createElement('img');
    img.className = 'avatar-img';
    img.alt = '';
    img.src = p.picture;
    el.append(img);
  } else if (p?.initials) {
    el.dataset.kind = 'initials';
    if (tint) el.dataset.tint = tint;
    const span = document.createElement('span');
    span.className = 'avatar-glyph';
    span.textContent = p.initials.letters;
    el.append(span);
  } else {
    delete el.dataset.kind;
    delete el.dataset.tint;
  }
}
