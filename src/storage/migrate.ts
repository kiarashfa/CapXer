import { APP_ID, SAVE_VERSION } from './schema.ts';

// Upgrades a save file written by an older CapXer, one version at a time.
// When SaveFile changes: bump SAVE_VERSION, add `steps[old]` that turns a
// version-`old` document into version `old + 1`, and keep a sample file of the
// old version in tests/unit/storage.test.ts. Never edit a published step.

type Doc = Record<string, unknown>;
const steps: Record<number, (doc: Doc) => Doc> = {
  // CapXer 1.1: no profile yet, nothing deleted.
  1: (doc) => ({ ...doc, v: 2, deleted: { setups: {}, cameras: {}, lenses: {} } }),
  // CapXer 2.0: the lab's state is optional, so nothing to add.
  2: (doc) => ({ ...doc, v: 3 }),
};

export type MigrateResult = { ok: true; doc: Doc } | { ok: false; reason: 'notCapxer' | 'newer' };

export function migrate(raw: unknown): MigrateResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return { ok: false, reason: 'notCapxer' };
  let doc = raw as Doc;
  if (doc.app !== APP_ID || typeof doc.v !== 'number' || !Number.isInteger(doc.v) || doc.v < 1)
    return { ok: false, reason: 'notCapxer' };
  if (doc.v > SAVE_VERSION) return { ok: false, reason: 'newer' };
  while ((doc.v as number) < SAVE_VERSION) {
    const step = steps[doc.v as number];
    if (!step) return { ok: false, reason: 'notCapxer' };
    doc = step(doc);
  }
  return { ok: true, doc };
}
