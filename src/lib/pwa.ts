import { BASE_PATH } from '../config/site.ts';
import { url } from './url.ts';

// Installable app and offline use. The service worker (dist/sw.js) is made by
// scripts/build-sw.ts after the build; it precaches the whole site.
//
// Updates never reload on their own: a new version waits until every CapXer
// tab is closed, or until the user presses Reload on the "Update ready" note.
// (A forced reload could cut a live-camera session, and the open page may
// still need lazily loaded code from its own version.)

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function initPwa(): void {
  initInstall();
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .register(url('sw.js'), { scope: BASE_PATH })
      .then(watchUpdates)
      .catch(() => {
        // No service worker (private mode, blocked): the site still works online.
      });
  }
}

function watchUpdates(reg: ServiceWorkerRegistration) {
  const note = document.querySelector<HTMLElement>('[data-update]');
  if (!note) return;
  let waiting: ServiceWorker | null = null;
  const show = (w: ServiceWorker) => {
    waiting = w;
    note.hidden = false;
  };

  // The first install is not an update: only offer one when a version already controls the page.
  if (reg.waiting && navigator.serviceWorker.controller) show(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) show(w);
    });
  });

  note.querySelector('[data-update-reload]')?.addEventListener('click', () => {
    if (!waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  });
  note.querySelector('[data-update-later]')?.addEventListener('click', () => {
    note.hidden = true;
  });

  // An installed app can stay open for days: look for a new version when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
}

/** "Install app" appears only where the browser offers installing (Chrome, Edge, Android); no banner. */
function initInstall() {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-install]');
  let prompt: InstallPrompt | null = null;
  const show = (on: boolean) => buttons.forEach((b) => (b.hidden = !on));

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e as InstallPrompt;
    show(true);
  });
  window.addEventListener('appinstalled', () => {
    prompt = null;
    show(false);
  });
  buttons.forEach((b) =>
    b.addEventListener('click', async () => {
      if (!prompt) return;
      const p = prompt;
      prompt = null;
      // Hidden either way: if the user declines, Chrome offers it again after a reload.
      show(false);
      await p.prompt().catch(() => {});
    }),
  );
}
