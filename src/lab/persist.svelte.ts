import { getSensor } from '../data/index.ts';
import { defaultSetup } from '../setup/presets.ts';
import { SAVE_KEY, type LabState } from '../storage/schema.ts';
import { readSave, REPLACED_EVENT, updateSave } from '../storage/store.ts';
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
  lastWritten = keyOf(lab.toState());

  openLink();

  const reload = () => {
    if (lab.shared) return;
    const f = readSave();
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

/** A link that opens the lab exactly as it is now. */
export function labShareUrl(): string {
  return `${location.origin}${location.pathname}#${encodeLabLink(lab.setup, lab.toState())}`;
}
