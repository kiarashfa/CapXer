// Behaviour of the site bar (see src/styles/site-bar.css).
// Phone/tablet: the menu button opens a sheet with the page links.
// Desktop pages with a dock:
// - closed by default; the handle opens it (click, tap, Enter, Space) and, on
//   devices with a real pointer, hovering the handle opens it too
// - leaving the bar closes it after a short grace period, unless it is pinned,
//   a page panel is open (body[data-panel-open]) or focus is inside the bar
// - Esc closes it unless pinned; while a page panel is open, Esc closes only
//   the panel (one Esc closes one thing)
// - the pin is remembered on this device

export const PIN_KEY = 'capxer.dockPinned';
export const PANEL_CLOSED_EVENT = 'capxer:panel-closed';
const CLOSE_DELAY = 400;

function readPin(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === '1';
  } catch {
    return false;
  }
}

function writePin(on: boolean): void {
  try {
    localStorage.setItem(PIN_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the pin holds for this page only.
  }
}

function initMenu(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const sheet = document.getElementById('site-menu');
  if (!btn || !sheet) return;
  const set = (open: boolean) => {
    sheet.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => set(sheet.hidden !== false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.hidden) {
      set(false);
      btn.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!sheet.hidden && !sheet.contains(e.target as Node) && !btn.contains(e.target as Node)) set(false);
  });
}

function initDock(): void {
  const bar = document.querySelector<HTMLElement>('.site-bar[data-dock]');
  const tools = document.getElementById('dock-tools');
  const handle = bar?.querySelector<HTMLButtonElement>('.dock-handle');
  if (!bar || !tools || !handle) return;
  const pages = bar.querySelector<HTMLElement>('.bar-pages');
  const pinBtn = bar.querySelector<HTMLButtonElement>('[data-dock-pin]');
  const closeBtn = bar.querySelector<HTMLButtonElement>('[data-dock-close]');
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  let pinned = readPin();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hoverOpenedAt = 0;

  // The open step is as wide as the tools it holds.
  new ResizeObserver(() => bar.style.setProperty('--dock-w', `${tools.scrollWidth}px`)).observe(tools);

  const isOpen = () => bar.dataset.dock === 'open';
  const panelOpen = () => document.body.dataset.panelOpen === 'true';
  const set = (open: boolean) => {
    bar.dataset.dock = open ? 'open' : 'closed';
    handle.setAttribute('aria-expanded', String(open));
    tools.inert = !open;
    if (pages) pages.inert = open;
  };
  const syncPin = () => pinBtn?.setAttribute('aria-pressed', String(pinned));
  const scheduleClose = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (pinned || panelOpen() || bar.matches(':hover') || bar.contains(document.activeElement)) return;
      set(false);
    }, CLOSE_DELAY);
  };

  syncPin();
  set(pinned);

  handle.addEventListener('click', (e) => {
    if (Date.now() - hoverOpenedAt < 700) return; // the hover just opened it
    set(true);
    // Keyboard users land on the first tool.
    if (e.detail === 0) tools.querySelector<HTMLElement>('button, a, input')?.focus();
  });
  handle.addEventListener('mouseenter', () => {
    if (!hover.matches || isOpen()) return;
    clearTimeout(timer);
    hoverOpenedAt = Date.now();
    set(true);
  });
  closeBtn?.addEventListener('click', () => {
    pinned = false;
    writePin(false);
    syncPin();
    set(false);
    handle.focus();
  });
  pinBtn?.addEventListener('click', () => {
    pinned = !pinned;
    writePin(pinned);
    syncPin();
    if (pinned) set(true);
  });
  bar.addEventListener('mouseenter', () => clearTimeout(timer));
  bar.addEventListener('mouseleave', () => {
    if (hover.matches) scheduleClose();
  });
  bar.addEventListener('focusout', () => {
    if (!hover.matches) return;
    scheduleClose();
  });
  window.addEventListener(PANEL_CLOSED_EVENT, () => scheduleClose());
  document.addEventListener('keydown', (e) => {
    // A page panel closes first; this listener can run before the page's own.
    if (e.key !== 'Escape' || e.defaultPrevented || panelOpen() || !isOpen() || pinned) return;
    set(false);
    handle.focus();
  });
}

export function initSiteBar(): void {
  initMenu();
  initDock();
}
