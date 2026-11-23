import { migrate } from './migrate.ts';
import { sanitizeSave } from './sanitize.ts';
import { LIMITS, type SaveFile, type SavedLab, type SavedSetup } from './schema.ts';

// Export and import of the save file (the user's "login": their own file).

/** "capxer-2026-11-20.json", in the user's local date. */
export function exportName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `capxer-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export function exportText(file: SaveFile, now = new Date()): string {
  return `${JSON.stringify({ ...file, savedAt: now.toISOString() }, null, 2)}\n`;
}

export type ParseResult = { ok: true; file: SaveFile } | { ok: false; reason: 'notCapxer' | 'newer' };

/** Reads an imported file's text. Never throws. */
export function parseFile(text: string, now = new Date()): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'notCapxer' };
  }
  const m = migrate(raw);
  if (!m.ok) return m;
  const file = sanitizeSave(m.doc, now);
  return file ? { ok: true, file } : { ok: false, reason: 'notCapxer' };
}

const sameSetup = (a: SavedSetup, b: SavedSetup) => a.name === b.name && JSON.stringify(a.setup) === JSON.stringify(b.setup);

/** "Name", or "Name (2)", "Name (3)"... whichever is free. */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`;
    const candidate = name.slice(0, LIMITS.name - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface ImportSummary {
  setups: number;
  labSetups: number;
  /** Setups whose name is already used by one of yours; they get "(2)". */
  renamed: number;
  cameras: number;
  lenses: number;
  phone: boolean;
  webcam: boolean;
}

export function summarize(mine: SaveFile, theirs: SaveFile): ImportSummary {
  const plan = planSetups(mine, theirs);
  return {
    setups: theirs.setups.length,
    labSetups: (theirs.labSetups ?? []).length,
    renamed: plan.filter((p) => p.renamed).length,
    cameras: theirs.gear.cameras.length,
    lenses: theirs.gear.lenses.length,
    phone: !!theirs.calibration.phone,
    webcam: !!theirs.calibration.webcam,
  };
}

function planSetups(mine: SaveFile, theirs: SaveFile) {
  const taken = new Set(mine.setups.map((s) => s.name));
  const out: { setup: SavedSetup; replaces?: string; renamed: boolean }[] = [];
  for (const s of theirs.setups) {
    const same = mine.setups.find((m) => m.id === s.id);
    if (same) {
      // The same saved setup (an earlier export of this one): the newer copy wins.
      if (!sameSetup(same, s) && Date.parse(s.savedAt) > Date.parse(same.savedAt)) out.push({ setup: s, replaces: same.id, renamed: false });
      continue;
    }
    const name = uniqueName(s.name, taken);
    taken.add(name);
    out.push({ setup: { ...s, name }, renamed: name !== s.name });
  }
  return out;
}

/** Lab setups from a file: new ones added (clashing names numbered), a newer copy of one of yours replaces it. */
function planLabSetups(mine: SavedLab[], theirs: SavedLab[]): SavedLab[] {
  const taken = new Set(mine.map((s) => s.name));
  const out = [...mine];
  for (const s of theirs) {
    const i = out.findIndex((m) => m.id === s.id);
    if (i >= 0) {
      if (Date.parse(s.savedAt) > Date.parse(out[i]!.savedAt)) out[i] = s;
      continue;
    }
    if (out.length >= LIMITS.labSetups) break;
    const name = uniqueName(s.name, taken);
    taken.add(name);
    out.push({ ...s, name });
  }
  return out;
}

/**
 * "merge": your setups stay and theirs are added (same-name ones get "(2)");
 * the file's calibration, aid choices and lab state replace yours (yours stay when
 * the file has none); your current setup stays.
 * "replace": the file becomes everything.
 */
export function mergeSave(mine: SaveFile, theirs: SaveFile, how: 'merge' | 'replace', now = new Date()): SaveFile {
  if (how === 'replace') return { ...structuredClone(theirs), savedAt: now.toISOString() };
  const setups = [...mine.setups];
  for (const p of planSetups(mine, theirs)) {
    if (p.replaces) setups[setups.findIndex((s) => s.id === p.replaces)] = p.setup;
    else if (setups.length < LIMITS.setups) setups.push(p.setup);
  }
  const cameras = [...mine.gear.cameras];
  for (const c of theirs.gear.cameras) if (!cameras.some((m) => m.id === c.id) && cameras.length < LIMITS.cameras) cameras.push(c);
  const lenses = [...mine.gear.lenses];
  for (const l of theirs.gear.lenses) if (!lenses.includes(l) && lenses.length < LIMITS.lenses) lenses.push(l);
  // A profile only comes in when you have none, or theirs is newer.
  const profile = theirs.profile && (!mine.profile || Date.parse(theirs.profile.changedAt) > Date.parse(mine.profile.changedAt)) ? theirs.profile : mine.profile;
  return structuredClone({
    ...mine,
    ...(profile ? { profile } : {}),
    savedAt: now.toISOString(),
    setups,
    gear: { cameras, lenses },
    calibration: { ...mine.calibration, ...theirs.calibration },
    aids: theirs.aids,
    ...((theirs.lab ?? mine.lab) ? { lab: theirs.lab ?? mine.lab } : {}),
    ...(mine.labSetups?.length || theirs.labSetups?.length ? { labSetups: planLabSetups(mine.labSetups ?? [], theirs.labSetups ?? []) } : {}),
  });
}
