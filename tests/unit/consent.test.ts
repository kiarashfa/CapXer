import { describe, expect, it } from 'vitest';
import { CONSENT_KEY, CONSENT_VERSION, readConsent, writeConsent } from '../../src/lib/consent.ts';

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('consent', () => {
  it('has no record by default', () => {
    expect(readConsent(memoryStore())).toBeNull();
    expect(readConsent(null)).toBeNull();
  });

  it('round-trips a choice', () => {
    const s = memoryStore();
    writeConsent('granted', s, new Date('2026-10-28T12:00:00Z'));
    expect(readConsent(s)).toEqual({ v: CONSENT_VERSION, analytics: 'granted', at: '2026-10-28T12:00:00.000Z' });
    writeConsent('denied', s);
    expect(readConsent(s)?.analytics).toBe('denied');
  });

  it('ignores records from another consent version, so the banner shows again', () => {
    const s = memoryStore();
    s.setItem(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION + 1, analytics: 'granted', at: '' }));
    expect(readConsent(s)).toBeNull();
  });

  it('ignores corrupt or unexpected values', () => {
    const s = memoryStore();
    s.setItem(CONSENT_KEY, '{not json');
    expect(readConsent(s)).toBeNull();
    s.setItem(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, analytics: 'yes' }));
    expect(readConsent(s)).toBeNull();
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(readConsent(broken)).toBeNull();
    expect(writeConsent('denied', broken).analytics).toBe('denied');
  });
});
