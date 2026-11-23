import { getSensor } from '../data/index.ts';
import { defaultSetup } from '../setup/presets.ts';
import { t } from '../i18n/en.ts';
import { uniqueName } from '../storage/file.ts';
import { cleanName } from '../storage/sanitize.ts';
import { LIMITS, SAVE_KEY, newId, type LabState, type SavedLab } from '../storage/schema.ts';
import { readSave, REPLACED_EVENT, updateSave } from '../storage/store.ts';
import { suggestLabName } from './describe.ts';
import { decodeLabLink, encodeLabLink } from './link.ts';
import { lab } from './store.svelte.ts';

// The lab in the save file (version 3, `lab`) and in share links.
// - Opening the lab brings back the last lab state and the shared camera setup.
// - Every change is saved a moment later (and so reaches the user's cloud, if connected).
// - A shared link shows its setup without saving it; "Keep it" saves, "Back to mine" restores.
// - A change made elsewhere (another tab, the cloud) is picked up.

const keyOf = (st: LabState) => JSON.stringify({ ...st, changedAt: '' });
let lastWritten = '';

function write(st: LabState) {
  lastWritten = keyOf(st);
  try {
    updateSave((file) => ({ ...file, lab: st }));
  } catch {
    // Storage refused (private browsing): the lab keeps working for this visit.
  }
}

/** Shows a shared link from the address (on opening, or when a link is opened in a tab already on the lab). */
function openLink() {
  const link = decodeLabLink(location.hash);
  if (!link) return;
  // The user's own lab is what we go back to, even when a second link replaces a first.
  const mine = lab.shared ?? { setup: lab.setup, state: lab.toState(), unknownCamera: false };
  lab.shared = { setup: mine.setup, state: mine.state, unknownCamera: link.unknownCamera };
  lab.setup = getSensor(link.setup.sensorId) ? link.setup : defaultSetup(link.setup.mode);
  lab.applyState(link.state);
  history.replaceState(history.state, '', location.pathname + location.search);
}

/** Restore the lab, take a shared link if the address has one, and follow changes made elsewhere. Returns a cleanup. */
export function startLabPersistence(): () => void {
  lab.load();
  const file = readSave();
  if (file?.lab) lab.applyState(file.lab);
  lab.savedLabs = file?.labSetups ?? [];
  lastWritten = keyOf(lab.toState());

  openLink();

  const reload = () => {
    const f = readSave();
    lab.savedLabs = f?.labSetups ?? [];
    if (lab.shared) return;
    if (f?.lab && keyOf(f.lab) !== lastWritten) {
      lastWritten = keyOf(f.lab);
      lab.applyState(f.lab);
    }
    if (f?.current && getSensor(f.current.sensorId) && JSON.stringify(f.current) !== JSON.stringify(lab.setup)) lab.setup = f.current;
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === SAVE_KEY) reload();
  };
  addEventListener(REPLACED_EVENT, reload);
  addEventListener('storage', onStorage);
  addEventListener('hashchange', openLink);
  return () => {
    removeEventListener(REPLACED_EVENT, reload);
    removeEventListener('storage', onStorage);
    removeEventListener('hashchange', openLink);
  };
}

/** Saves the lab a moment after each change (call during component setup). */
export function autosaveLab(delay = 600) {
  $effect(() => {
    const st = lab.toState();
    if (lab.shared || keyOf(st) === lastWritten) return;
    const timer = setTimeout(() => write(st), delay);
    return () => clearTimeout(timer);
  });
}

/** Keep the shared setup: it becomes the user's lab (and camera setup). */
export function keepShared() {
  if (!lab.shared) return;
  lab.shared = null;
  lab.setSetup(lab.setup);
  write(lab.toState());
}

/** Leave the shared setup and go back to the user's own lab. */
export function backToMine() {
  const mine = lab.shared;
  if (!mine) return;
  lab.shared = null;
  lab.setup = mine.setup;
  lab.applyState(mine.state);
  lastWritten = keyOf(mine.state);
}

/** A link that opens the lab exactly as it is now (or as a saved setup). */
export function labShareUrl(saved?: SavedLab): string {
  return `${location.origin}${location.pathname}#${encodeLabLink(saved?.setup ?? lab.setup, saved?.lab ?? lab.toState())}`;
}

// ---------- notes and named setups ----------

const N = t.lab.notice;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export function labNotify(n: typeof lab.notice, ms = 5000) {
  clearTimeout(noticeTimer);
  lab.notice = n;
  if (n && ms) noticeTimer = setTimeout(() => (lab.notice = null), ms);
}

/** Copies a link to the clipboard and says so. */
export async function shareLab(saved?: SavedLab) {
  try {
    await navigator.clipboard.writeText(labShareUrl(saved));
    labNotify({ title: N.copied, body: saved?.name });
  } catch {
    labNotify({ title: N.copyFailed });
  }
}

function writeSaved(list: SavedLab[]) {
  lab.savedLabs = list;
  try {
    updateSave((file) => ({ ...file, labSetups: list }));
  } catch {
    // Storage refused: the list lasts for this visit.
  }
}

const snapshot = (): { setup: typeof lab.setup; lab: LabState } => ({ setup: $state.snapshot(lab.setup), lab: lab.toState() });

export function suggestedLabName(): string {
  return suggestLabName(lab.setup, lab.toState());
}

export function saveLab(name: string): boolean {
  if (lab.savedLabs.length >= LIMITS.labSetups) {
    labNotify({ title: N.full });
    return false;
  }
  const taken = new Set(lab.savedLabs.map((s) => s.name));
  const entry: SavedLab = { id: newId(), name: uniqueName(cleanName(name, suggestedLabName()), taken), ...snapshot(), savedAt: new Date().toISOString() };
  writeSaved([...lab.savedLabs, entry]);
  if (lab.shared) keepShared();
  labNotify({ title: N.saved, body: entry.name });
  return true;
}

/** Shows a saved setup: its camera (shared with the viewfinder) and its lab; the viewer's aids stay. */
export function openLab(id: string) {
  const s = lab.savedLabs.find((x) => x.id === id);
  if (!s) return;
  lab.shared = null;
  lab.setSetup(s.setup);
  const aids = lab.toState().aids;
  lab.applyState({ ...s.lab, aids });
}

export function renameLab(id: string, name: string) {
  const s = lab.savedLabs.find((x) => x.id === id);
  const clean = cleanName(name);
  if (!s || !clean || clean === s.name) return;
  const taken = new Set(lab.savedLabs.filter((x) => x.id !== id).map((x) => x.name));
  writeSaved(lab.savedLabs.map((x) => (x.id === id ? { ...x, name: uniqueName(clean, taken), savedAt: new Date().toISOString() } : x)));
}

export function replaceLab(id: string) {
  const s = lab.savedLabs.find((x) => x.id === id);
  if (!s) return;
  writeSaved(lab.savedLabs.map((x) => (x.id === id ? { ...x, ...snapshot(), savedAt: new Date().toISOString() } : x)));
  labNotify({ title: N.replaced, body: s.name });
}

export function deleteLab(id: string) {
  const i = lab.savedLabs.findIndex((x) => x.id === id);
  if (i < 0) return;
  const gone = lab.savedLabs[i]!;
  writeSaved(lab.savedLabs.filter((x) => x.id !== id));
  labNotify({
    title: N.deleted,
    body: gone.name,
    undo: () => {
      const list = [...lab.savedLabs];
      list.splice(Math.min(i, list.length), 0, gone);
      writeSaved(list);
      labNotify(null);
    },
  });
}
