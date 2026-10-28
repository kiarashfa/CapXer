export type ConsentChoice = 'granted' | 'denied';

export interface ConsentRecord {
  v: number;
  analytics: ConsentChoice;
  at: string;
}

export const CONSENT_KEY = 'capxer.consent';

/** Bump when what we ask consent for changes; older records are then ignored and the banner shows again. */
export const CONSENT_VERSION = 1;

/** Fired on window to reopen the banner (footer "Privacy settings" link). */
export const CONSENT_OPEN_EVENT = 'capxer:consent-open';

type ReadStore = Pick<Storage, 'getItem'>;
type WriteStore = Pick<Storage, 'setItem' | 'removeItem'>;

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readConsent(store: ReadStore | null = browserStorage()): ConsentRecord | null {
  if (!store) return null;
  try {
    const raw = store.getItem(CONSENT_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as Partial<ConsentRecord>;
    if (rec.v !== CONSENT_VERSION) return null;
    if (rec.analytics !== 'granted' && rec.analytics !== 'denied') return null;
    return { v: rec.v, analytics: rec.analytics, at: String(rec.at ?? '') };
  } catch {
    return null;
  }
}

export function writeConsent(
  choice: ConsentChoice,
  store: WriteStore | null = browserStorage(),
  now: Date = new Date(),
): ConsentRecord {
  const rec: ConsentRecord = { v: CONSENT_VERSION, analytics: choice, at: now.toISOString() };
  try {
    store?.setItem(CONSENT_KEY, JSON.stringify(rec));
  } catch {
    // Storage blocked: the choice holds for this page only; the banner returns next visit.
  }
  return rec;
}
