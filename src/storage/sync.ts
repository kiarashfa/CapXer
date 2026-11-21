import { LIMITS, type Deleted, type SaveFile, type SavedSetup } from './schema.ts';
import { sanitizeDeleted } from './sanitize.ts';

// Joining two copies of the same person's save: this browser's and the one in
// their cloud. Nothing is overwritten wholesale:
// - saved setups: union by id, the newer savedAt wins; deleted ones stay deleted
// - custom cameras and lenses: union, minus deleted ones
// - profile: the newer one; calibration per device kind, from the newer file
//   when both have one; exposure-aid choices from the newer file
// - the current viewfinder setup stays this device's own
// Pure, so it is unit tested (tests/unit/storage.test.ts).

const t = (iso: string | undefined) => (iso ? Date.parse(iso) || 0 : 0);

function joinDeleted(a: Deleted, b: Deleted, now: Date): Deleted {
  const pick = (x: Record<string, string>, y: Record<string, string>) => {
    const out = { ...x };
    for (const [k, v] of Object.entries(y)) if (!out[k] || t(v) > t(out[k])) out[k] = v;
    return out;
  };
  return sanitizeDeleted({ setups: pick(a.setups, b.setups), cameras: pick(a.cameras, b.cameras), lenses: pick(a.lenses, b.lenses) }, now);
}

/** What the cloud brought in, for a short note ("2 setups from your other devices"). */
export interface SyncChanges {
  added: number;
  updated: number;
  removed: number;
}

export function mergeSync(mine: SaveFile | null, theirs: SaveFile, now = new Date()): { file: SaveFile; changes: SyncChanges } {
  const stamp = now.toISOString();
  if (!mine) return { file: { ...structuredClone(theirs), savedAt: stamp }, changes: { added: theirs.setups.length, updated: 0, removed: 0 } };
  const newerFile = t(theirs.savedAt) > t(mine.savedAt) ? theirs : mine;
  const deleted = joinDeleted(mine.deleted, theirs.deleted, now);
  const gone = (s: SavedSetup) => t(deleted.setups[s.id]) >= t(s.savedAt);
  const changes: SyncChanges = { added: 0, updated: 0, removed: 0 };

  const setups: SavedSetup[] = [];
  const theirsById = new Map(theirs.setups.map((s) => [s.id, s]));
  for (const s of mine.setups) {
    const other = theirsById.get(s.id);
    const winner = other && t(other.savedAt) > t(s.savedAt) ? other : s;
    if (gone(winner)) {
      changes.removed++;
      continue;
    }
    if (winner !== s && JSON.stringify(winner) !== JSON.stringify(s)) changes.updated++;
    setups.push(winner);
  }
  const mineIds = new Set(mine.setups.map((s) => s.id));
  for (const s of theirs.setups) {
    if (mineIds.has(s.id) || gone(s) || setups.length >= LIMITS.setups) continue;
    setups.push(s);
    changes.added++;
  }

  const cameras = [...mine.gear.cameras, ...theirs.gear.cameras.filter((c) => !mine.gear.cameras.some((m) => m.id === c.id))]
    .filter((c) => !deleted.cameras[c.id])
    .slice(0, LIMITS.cameras);
  const lensGone = (l: number) => !!deleted.lenses[String(Math.round(l * 10) / 10)];
  const lenses = [...mine.gear.lenses, ...theirs.gear.lenses.filter((l) => !mine.gear.lenses.includes(l))].filter((l) => !lensGone(l)).slice(0, LIMITS.lenses);

  const profile = !theirs.profile ? mine.profile : !mine.profile || t(theirs.profile.changedAt) > t(mine.profile.changedAt) ? theirs.profile : mine.profile;
  const older = newerFile === mine ? theirs : mine;

  return {
    file: structuredClone({
      ...mine,
      savedAt: stamp,
      ...(profile ? { profile } : {}),
      setups,
      gear: { cameras, lenses },
      calibration: { ...older.calibration, ...newerFile.calibration },
      aids: newerFile.aids,
      deleted,
    }),
    changes,
  };
}
