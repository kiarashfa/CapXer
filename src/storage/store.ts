import { localAdapter, type LocalAdapter } from './local.ts';
import { emptySave } from './sanitize.ts';
import type { Deleted, SaveFile } from './schema.ts';

// The save file in this browser, for every part of the site that changes it:
// the viewfinder (persist.svelte.ts), the profile page and the cloud sync
// (src/user/). Every write goes through writeSave(), which records deletions
// and tells the other parts.
//
// Events: see events.ts.
import { FLUSH_EVENT, REPLACED_EVENT, SAVE_EVENT } from './events.ts';
export { FLUSH_EVENT, REPLACED_EVENT, SAVE_EVENT };

let adapter: LocalAdapter | undefined;
export const local = (): LocalAdapter => (adapter ??= localAdapter());

export function readSave(): SaveFile | null {
  return local().read();
}

/** True when the save holds anything of the user's own (more than the last viewfinder setup). */
export function hasWork(file: SaveFile | null): boolean {
  return !!file && (!!file.profile || file.setups.length > 0 || file.gear.cameras.length > 0 || file.gear.lenses.length > 0 || !!file.calibration.phone || !!file.calibration.webcam);
}

const lensKey = (mm: number) => String(Math.round(mm * 10) / 10);

/**
 * Adds deletion records for what `base` (the file the writer started from)
 * had and `next` no longer has, and drops records for anything back again
 * (Undo). A setup that comes back gets a fresh savedAt, so it beats its own
 * deletion record on other devices.
 */
export function withDeletions(base: SaveFile | null, next: SaveFile, now = new Date()): SaveFile {
  const when = now.toISOString();
  const d: Deleted = structuredClone(next.deleted);
  const setups = next.setups.map((s) => {
    if (!(s.id in d.setups)) return s;
    delete d.setups[s.id];
    return { ...s, savedAt: when };
  });
  for (const c of next.gear.cameras) delete d.cameras[c.id];
  for (const l of next.gear.lenses) delete d.lenses[lensKey(l)];
  if (base) {
    const ids = new Set(next.setups.map((s) => s.id));
    for (const s of base.setups) if (!ids.has(s.id)) d.setups[s.id] = when;
    const cams = new Set(next.gear.cameras.map((c) => c.id));
    for (const c of base.gear.cameras) if (!cams.has(c.id)) d.cameras[c.id] = when;
    const lenses = new Set(next.gear.lenses.map(lensKey));
    for (const l of base.gear.lenses) if (!lenses.has(lensKey(l))) d.lenses[lensKey(l)] = when;
  }
  return { ...next, setups, deleted: d };
}

/**
 * Writes the save (stamped now) and tells the rest of the page. `base` is the
 * file the caller's state came from, so only its own deletions are recorded.
 * Returns the file as written, or null when the browser refused to store it.
 */
export function writeSave(next: SaveFile, base: SaveFile | null, now = new Date()): SaveFile | null {
  const file = { ...withDeletions(base, next, now), savedAt: now.toISOString() };
  if (!local().write(file)) return null;
  dispatchEvent(new CustomEvent(SAVE_EVENT));
  return file;
}

/**
 * Read, change and write the save in one go, from outside the viewfinder
 * (the profile page, the cloud). The viewfinder writes its pending changes
 * first and reloads afterwards.
 */
export function updateSave(change: (file: SaveFile) => SaveFile): SaveFile | null {
  dispatchEvent(new CustomEvent(FLUSH_EVENT));
  const base = readSave();
  const written = writeSave(change(structuredClone(base ?? emptySave())), base);
  if (written) dispatchEvent(new CustomEvent(REPLACED_EVENT));
  return written;
}

/** Removes the save from this browser (sign out, Clear all). */
export function clearSave(): void {
  dispatchEvent(new CustomEvent(FLUSH_EVENT));
  local().clear();
  dispatchEvent(new CustomEvent(SAVE_EVENT));
  dispatchEvent(new CustomEvent(REPLACED_EVENT));
}
