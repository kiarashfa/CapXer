import { BASE_PATH, GA_MEASUREMENT_ID } from '../config/site.ts';

/**
 * The complete list of custom events CapXer may send. Nothing else goes to GA.
 * Never add camera, lens, sensor, setup, photo or free-text data here.
 */
export interface AnalyticsEvents {
  theme_change: { theme: 'light' | 'dark' };
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

const GA_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
let loaded = false;

/** Load GA4. Call only after the visitor granted analytics consent. Fails silently (offline, blockers). */
export function enableAnalytics(): void {
  window[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
  if (loaded) return;
  loaded = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // gtag.js expects the Arguments object itself, not an array.
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    // Scope cookies to this project, not every site on the same github.io host.
    cookie_path: BASE_PATH,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const s = document.createElement('script');
  s.async = true;
  s.src = GA_SRC;
  s.onerror = () => {
    // Offline or blocked. Nothing to do; analytics is optional.
  };
  document.head.appendChild(s);
}

/** Stop GA for the rest of this page and remove its cookies. */
export function disableAnalytics(): void {
  window[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
  const names = document.cookie
    .split(';')
    .map((c) => c.trim().split('=')[0] ?? '')
    .filter((n) => n === '_ga' || n.startsWith('_ga_'));
  const host = location.hostname;
  for (const name of names) {
    for (const path of [BASE_PATH, '/']) {
      for (const domain of ['', `; domain=${host}`, `; domain=.${host}`]) {
        document.cookie = `${name}=; Max-Age=0; path=${path}${domain}`;
      }
    }
  }
}

export function track<K extends keyof AnalyticsEvents>(name: K, params: AnalyticsEvents[K]): void {
  if (!loaded || window[`ga-disable-${GA_MEASUREMENT_ID}`]) return;
  window.gtag?.('event', name, params);
}
