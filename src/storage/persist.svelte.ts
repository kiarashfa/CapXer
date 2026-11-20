import { tick } from 'svelte';
import { getSensor } from '../data/index.ts';
import { vf, resolveCamera } from '../setup/store.svelte.ts';
import { live } from '../camera/live.svelte.ts';
import { aids } from '../analysis/aids.svelte.ts';
import { aspectText, defaultSetup } from '../setup/presets.ts';
import type { CustomSensor, Setup } from '../setup/types.ts';
import { url } from '../lib/url.ts';
import { t } from '../i18n/en.ts';
import { decodeLink, encodeLink } from './link.ts';
import { exportName, exportText, mergeSave, parseFile, summarize, uniqueName, type ImportSummary } from './file.ts';
import { localAdapter, SAVE_KEY, type LocalAdapter } from './local.ts';
import { cleanName, DEFAULT_AIDS, emptySave } from './sanitize.ts';
import { LIMITS, newId, type Calibrations, type SaveFile, type SavedSetup } from './schema.ts';

// Connects the viewfinder's stores to the save file: restores on load, writes
// changes back (debounced), opens share links, and runs the Saved panel's
// actions. Browser only; started once by the viewfinder island.

const S = t.vf.saved;
const N = S.notice;

export type NoticeKind = 'shared' | 'info' | 'link' | 'undo';
export interface Notice {
  kind: NoticeKind;
  title: string;
  body?: string;
  /** The link to copy by hand when the clipboard is not available. */
  link?: string;
  undo?: () => void;
}

class SavedStore {
  setups = $state<SavedSetup[]>([]);
  /** False when the browser refuses storage: saving lasts for this page only. */
  available = $state(true);
  /** A shared link is showing. `previous` is the user's own setup, restored by "Back to mine". */
  shared = $state<{ previous: Setup; addedCamera?: string; unknownCamera: boolean } | null>(null);
  notice = $state<Notice | null>(null);
}

export const saved = new SavedStore();

let adapter: LocalAdapter | undefined;
/** The calibration slot of the other device kind, kept as loaded so it is never lost. */
let calibrations: Calibrations = {};
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

const kind = () => (live.phone ? 'phone' : 'webcam');
const clone = <T>(v: T): T => structuredClone($state.snapshot(v) as T);

export function notify(n: Notice | null, ms = n && (n.kind === 'shared' || n.kind === 'link') ? 0 : 5000) {
  clearTimeout(noticeTimer);
  saved.notice = n;
  if (n && ms) noticeTimer = setTimeout(() => (saved.notice = null), ms);
}

// ---------- describing setups ----------

/** "ARRI ALEXA 35 · 4K 16:9 · 2.39:1 · 35 mm" */
export function summaryOf(setup: Setup, customs: readonly CustomSensor[] = vf.customs): string {
  const cam = resolveCamera(setup.sensorId, [...customs]);
  const fmt = cam.formats.find((f) => f.id === setup.formatId) ?? cam.formats[0]!;
  const parts = cam.custom ? [cam.name] : [cam.name, fmt.name];
  return [...parts, aspectText(setup.mode, setup.aspect), `${setup.focal} mm`].join(' · ');
}

/** A suggested name: "ALEXA 35, 2.39:1, 35 mm". */
export function suggestName(setup: Setup = vf.setup): string {
  const model = getSensor(setup.sensorId)?.name ?? vf.customs.find((c) => c.id === setup.sensorId)?.name ?? '';
  return cleanName(`${model}, ${aspectText(setup.mode, setup.aspect)}, ${setup.focal} mm`);
}

export const sameSetup = (a: Setup, b: Setup) => JSON.stringify(a) === JSON.stringify(b);

// ---------- file <-> stores ----------

function snapshot(): SaveFile {
  const mine = live.calibration ? clone(live.calibration) : undefined;
  const cal: Calibrations = { ...calibrations };
  if (mine) cal[kind()] = mine;
  else delete cal[kind()];
  return {
    ...emptySave(),
    // While a shared link is showing, the stored current setup stays the user's own.
    current: clone(saved.shared ? saved.shared.previous : vf.setup),
    setups: clone(saved.setups),
    gear: { cameras: clone(vf.customs), lenses: clone(vf.customLenses) },
    calibration: cal,
    aids: { histogram: aids.histogram, histMode: aids.histMode, picture: aids.picture, zebra: aids.zebra, peaking: aids.peaking, peakColor: aids.peakColor, peakSens: aids.peakSens },
  };
}

function apply(file: SaveFile, opts: { current: boolean }) {
  vf.customs = file.gear.cameras;
  vf.customLenses = file.gear.lenses;
  saved.setups = file.setups;
  calibrations = file.calibration;
  live.calibration = file.calibration[kind()] ?? null;
  Object.assign(aids, file.aids);
  if (opts.current) vf.setup = file.current;
}

let writeTimer: ReturnType<typeof setTimeout> | undefined;
/** Set by clearAll: an emptied browser stays empty instead of saving the defaults back. */
let skipWrite = false;
function writeNow() {
  clearTimeout(writeTimer);
  writeTimer = undefined;
  if (!adapter) return;
  if (!adapter.write(snapshot()) && saved.available) saved.available = adapter.available;
}

/** Restores the save file and starts saving changes. Returns a cleanup function. */
export function startPersistence(): () => void {
  adapter = localAdapter();
  saved.available = adapter.available;
  const file = adapter.read();
  if (file) apply(file, { current: true });
  openLink(location.hash);

  const stop = $effect.root(() => {
    let first = true;
    $effect(() => {
      // Reading the whole snapshot subscribes to every value that is saved.
      JSON.stringify(snapshot());
      if (first || skipWrite) {
        first = skipWrite = false;
        return;
      }
      clearTimeout(writeTimer);
      writeTimer = setTimeout(writeNow, 300);
    });
  });

  // Another tab saved: take its library (setups, cameras, lenses), leave this tab's view alone.
  const onstorage = (e: StorageEvent) => {
    if (e.key !== SAVE_KEY) return;
    const other = adapter?.read();
    if (!other) return;
    vf.customs = other.gear.cameras;
    vf.customLenses = other.gear.lenses;
    saved.setups = other.setups;
  };
  const onhash = () => openLink(location.hash);
  const onhide = () => writeTimer && writeNow();
  window.addEventListener('storage', onstorage);
  window.addEventListener('hashchange', onhash);
  window.addEventListener('pagehide', onhide);

  // The page was hidden until the restore (no flash of the default setup).
  tick().then(() => delete document.documentElement.dataset.restoring);

  return () => {
    stop();
    onhide();
    window.removeEventListener('storage', onstorage);
    window.removeEventListener('hashchange', onhash);
    window.removeEventListener('pagehide', onhide);
  };
}

// ---------- share links ----------

function cameraFor(setup: Setup) {
  return vf.customs.find((c) => c.id === setup.sensorId);
}

export function linkFor(setup: Setup = vf.setup): string {
  return `${location.origin}${url('viewfinder')}#${encodeLink(setup, cameraFor(setup))}`;
}

export async function share(setup: Setup = vf.setup) {
  const link = linkFor(setup);
  if (live.phone && navigator.share) {
    try {
      await navigator.share({ title: `CapXer: ${suggestName(setup)}`, url: link });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    notify({ kind: 'info', title: N.copied, body: N.copiedBody });
  } catch {
    notify({ kind: 'link', title: N.copyFailed, link });
  }
}

function openLink(hash: string) {
  const link = decodeLink(hash);
  if (!link) return;
  history.replaceState(history.state, '', location.pathname + location.search);
  const previous = clone(saved.shared ? saved.shared.previous : vf.setup);
  let addedCamera: string | undefined;
  let setup = link.setup;
  if (link.custom) {
    const c = link.custom;
    const same = vf.customs.find((x) => x.name === c.name && x.width === c.width && x.height === c.height && x.squeeze === c.squeeze);
    const id = same?.id ?? `custom/${newId()}`;
    if (!same) {
      vf.customs.push({ ...c, id });
      addedCamera = id;
    }
    setup = { ...setup, sensorId: id };
  }
  vf.setup = setup;
  saved.shared = { previous, addedCamera, unknownCamera: link.unknownCamera };
  notify({ kind: 'shared', title: N.shared, body: link.unknownCamera ? N.sharedUnknown : summaryOf(setup) });
}

/** Keeps the shared setup as your own (the note's close button). */
export function keepShared() {
  saved.shared = null;
  notify(null);
}

export function saveShared() {
  saved.shared = null;
  saveCurrent(suggestName());
}

export function backToMine() {
  const s = saved.shared;
  if (!s) return;
  vf.setup = s.previous;
  if (s.addedCamera && !saved.setups.some((x) => x.setup.sensorId === s.addedCamera)) vf.customs = vf.customs.filter((c) => c.id !== s.addedCamera);
  saved.shared = null;
  notify(null);
}

// ---------- the saved list ----------

export function saveCurrent(name: string): boolean {
  if (saved.setups.length >= LIMITS.setups) {
    notify({ kind: 'info', title: N.full });
    return false;
  }
  const taken = new Set(saved.setups.map((s) => s.name));
  const entry: SavedSetup = { id: newId(), name: uniqueName(cleanName(name, suggestName()), taken), setup: clone(vf.setup), savedAt: new Date().toISOString() };
  saved.setups.push(entry);
  if (saved.shared) saved.shared = null;
  notify({ kind: 'info', title: N.saved, body: entry.name });
  return true;
}

export function openSaved(id: string) {
  const s = saved.setups.find((x) => x.id === id);
  if (!s) return;
  saved.shared = null;
  vf.setup = clone(s.setup);
}

export function renameSaved(id: string, name: string) {
  const s = saved.setups.find((x) => x.id === id);
  const clean = cleanName(name);
  if (!s || !clean || clean === s.name) return;
  s.name = uniqueName(clean, new Set(saved.setups.filter((x) => x.id !== id).map((x) => x.name)));
}

export function replaceSaved(id: string) {
  const s = saved.setups.find((x) => x.id === id);
  if (!s) return;
  s.setup = clone(vf.setup);
  s.savedAt = new Date().toISOString();
  notify({ kind: 'info', title: N.replaced, body: s.name });
}

export function deleteSaved(id: string) {
  const i = saved.setups.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [gone] = saved.setups.splice(i, 1);
  notify({
    kind: 'undo',
    title: N.deleted,
    body: gone!.name,
    undo: () => {
      saved.setups.splice(Math.min(i, saved.setups.length), 0, gone!);
      notify(null);
    },
  });
}

// ---------- export, import, clear ----------

export function exportFile() {
  const blob = new Blob([exportText(snapshot())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = exportName();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export interface PendingImport {
  file: SaveFile;
  name: string;
  summary: ImportSummary;
}

/** Reads a chosen file; shows a notice and returns null when it cannot be used. */
export async function readImport(f: File): Promise<PendingImport | null> {
  const text = f.size > 2_000_000 ? '' : await f.text();
  const r = parseFile(text);
  if (!r.ok) {
    notify({ kind: 'info', title: r.reason === 'newer' ? N.newer : N.notCapxer });
    return null;
  }
  return { file: r.file, name: f.name, summary: summarize(snapshot(), r.file) };
}

export function applyImport(p: PendingImport, how: 'merge' | 'replace') {
  const merged = mergeSave(snapshot(), p.file, how);
  saved.shared = null;
  apply(merged, { current: how === 'replace' });
  writeNow();
  notify({ kind: 'info', title: N.imported, body: p.name });
}

export function clearAll() {
  adapter?.clear();
  calibrations = {};
  saved.shared = null;
  vf.customs = [];
  vf.customLenses = [];
  saved.setups = [];
  live.calibration = null;
  Object.assign(aids, DEFAULT_AIDS);
  vf.setup = defaultSetup(vf.setup.mode);
  clearTimeout(writeTimer);
  writeTimer = undefined;
  skipWrite = true;
  notify({ kind: 'info', title: N.cleared });
}
