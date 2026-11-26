// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GA_MEASUREMENT_ID } from '../../src/config/measurement-id.ts';

// The cookie bar's core (src/lib/consent.ts) on a stand-in for the bar in ConsentBar.astro.
// jsdom runs on localhost, where nothing is reported unless the debug flag is set.
const KEY = 'kfa-consent';
const DEBUG_KEY = 'kfa-consent-debug';

async function setup() {
  vi.resetModules();
  const consent = await import('../../src/lib/consent.ts');
  document.head.innerHTML = '';
  document.body.innerHTML = `
    <div data-consent hidden>
      <button type="button" data-consent-choice="denied">Reject</button>
      <button type="button" data-consent-choice="granted">Accept</button>
    </div>
    <button type="button" data-consent-open>Cookie settings</button>`;
  const bar = document.querySelector<HTMLElement>('[data-consent]')!;
  const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
  const gtagScripts = () =>
    [...document.querySelectorAll('script')].filter((s) => s.src.includes('googletagmanager.com'));
  return { consent, bar, click, gtagScripts };
}

const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown>;

describe('cookie bar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    history.replaceState(null, '', '/CapXer/');
  });
  afterEach(() => {
    vi.useRealTimers();
    delete window.dataLayer;
    delete window.gtag;
  });

  it('shows on a first visit and loads nothing', async () => {
    const { consent, bar, gtagScripts } = await setup();
    expect(consent.readConsent()).toBeNull();
    consent.initConsent(GA_MEASUREMENT_ID, bar);
    expect(bar.hidden).toBe(false);
    expect(gtagScripts()).toHaveLength(0);
  });

  it('reject: stores the answer, hides the bar and loads nothing', async () => {
    const { consent, bar, click, gtagScripts } = await setup();
    consent.initConsent(GA_MEASUREMENT_ID, bar);
    click('[data-consent-choice="denied"]');
    vi.advanceTimersByTime(300);
    expect(bar.hidden).toBe(true);
    expect(stored()).toMatchObject({ v: 1, analytics: 'denied' });
    expect(window[`ga-disable-${GA_MEASUREMENT_ID}`]).toBe(true);
    expect(gtagScripts()).toHaveLength(0);
  });

  it('accept on localhost: stores the answer but never reports without the debug flag', async () => {
    const { consent, bar, click, gtagScripts } = await setup();
    consent.initConsent(GA_MEASUREMENT_ID, bar);
    click('[data-consent-choice="granted"]');
    expect(stored()).toMatchObject({ v: 1, analytics: 'granted' });
    expect(gtagScripts()).toHaveLength(0);
  });

  it('accept with the debug flag: loads GA with this ID and sends only the origin and path', async () => {
    localStorage.setItem(DEBUG_KEY, '1');
    history.replaceState(null, '', '/CapXer/viewfinder/?ref=x#s=secret');
    const { consent, bar, click, gtagScripts } = await setup();
    consent.initConsent(GA_MEASUREMENT_ID, bar);
    click('[data-consent-choice="granted"]');
    expect(gtagScripts().map((s) => s.src)).toEqual([
      `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`,
    ]);
    const views = (window.dataLayer ?? [])
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((args) => args[0] === 'event' && args[1] === 'page_view');
    expect(views).toHaveLength(1);
    expect(views[0]![2]).toMatchObject({ page_location: `${location.origin}/CapXer/viewfinder/` });
  });

  it('a stored answer keeps the bar hidden on the next visit', async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, analytics: 'denied' }));
    const { consent, bar } = await setup();
    expect(consent.readConsent()).toBe('denied');
    consent.initConsent(GA_MEASUREMENT_ID, bar);
    expect(bar.hidden).toBe(true);
  });

  it('ignores answers from another version and unreadable values, so the bar asks again', async () => {
    const { consent } = await setup();
    localStorage.setItem(KEY, JSON.stringify({ v: 2, analytics: 'granted' }));
    expect(consent.readConsent()).toBeNull();
    localStorage.setItem(KEY, '{not json');
    expect(consent.readConsent()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ v: 1, analytics: 'yes' }));
    expect(consent.readConsent()).toBeNull();
  });

  it('cookie settings reopens the bar', async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, analytics: 'denied' }));
    const { consent, bar, click } = await setup();
    consent.initConsent(GA_MEASUREMENT_ID, bar);
    expect(bar.hidden).toBe(true);
    click('[data-consent-open]');
    expect(bar.hidden).toBe(false);
    expect(document.activeElement?.textContent).toBe('Reject');
  });
});
