// Lesson citations in the browser. Each citation is a link to its source entry
// (#source-n), so everything works without JavaScript. With it:
// - Desktop (Sources rail beside the text): hover previews, click highlights the
//   entry in the rail and shows where in the source to look.
// - Phone/tablet: tap opens a small popover with the source and the locator.

const DESKTOP = '(min-width: 64rem)';

/** The lesson's "On this page" menu in the dock: closes on a pick, on Escape and on a click elsewhere. */
export function initLessonToc(): void {
  const toc = document.querySelector<HTMLDetailsElement>('.dock-toc');
  if (!toc) return;
  const close = () => (toc.open = false);
  toc.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  // Capture phase, so Escape closes the menu before the site bar sees it and closes the dock.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !toc.open) return;
      e.preventDefault();
      close();
      toc.querySelector('summary')?.focus();
    },
    true,
  );
  document.addEventListener('click', (e) => {
    if (toc.open && !toc.contains(e.target as Node)) close();
  });
}

export function initCitations(): void {
  const cites = [...document.querySelectorAll<HTMLAnchorElement>('a.cite')];
  const pop = document.querySelector<HTMLElement>('.cite-pop');
  if (!cites.length || !pop) return;
  const desktop = matchMedia(DESKTOP);
  const entry = (a: HTMLAnchorElement) => document.getElementById(`source-${a.dataset.source}`);
  let opener: HTMLAnchorElement | null = null;

  const mark = (a: HTMLAnchorElement, cls: 'is-active' | 'is-hover') => {
    const li = entry(a);
    if (!li) return;
    document.querySelectorAll(`.lesson-sources li.${cls}`).forEach((el) => el.classList.remove(cls));
    li.classList.add(cls);
    if (cls === 'is-active') {
      document.querySelectorAll('.lesson-sources .src-at').forEach((el) => ((el as HTMLElement).hidden = true));
      const at = li.querySelector<HTMLElement>('.src-at');
      if (at) {
        at.querySelector('b')!.textContent = a.dataset.locator ?? '';
        at.hidden = false;
      }
      cites.forEach((c) => c.classList.toggle('is-active', c === a));
      // Scroll inside the rail only; the rail itself is always on screen.
      const rail = li.closest<HTMLElement>('.lesson-sources-inner');
      if (rail) {
        const top = li.offsetTop - rail.clientHeight / 3;
        rail.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    }
  };

  const closePop = (returnFocus = true) => {
    if (pop.hidden) return;
    pop.hidden = true;
    if (returnFocus) opener?.focus();
    opener = null;
  };

  const openPop = (a: HTMLAnchorElement) => {
    const li = entry(a);
    if (!li) return;
    opener = a;
    pop.querySelector('.cite-pop-title')!.textContent = `${a.dataset.source}`;
    const body = pop.querySelector<HTMLElement>('.cite-pop-body')!;
    body.replaceChildren(...[...li.querySelectorAll('.src-text, .src-links')].map((n) => n.cloneNode(true)));
    pop.querySelector('.cite-pop-at')!.textContent = `${pop.dataset.citedAt}: ${a.dataset.locator ?? ''}`;
    pop.querySelector<HTMLAnchorElement>('.cite-pop-all')!.href = `#source-${a.dataset.source}`;
    pop.hidden = false;
    // Below the citation, inside the screen's 16 px gutters.
    const r = a.getBoundingClientRect();
    const w = Math.min(pop.offsetWidth, window.innerWidth - 32);
    const left = Math.min(Math.max(16, r.left), window.innerWidth - 16 - w);
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${r.bottom + window.scrollY + 8}px`;
    pop.querySelector<HTMLButtonElement>('.cite-pop-x')!.focus({ preventScroll: true });
  };

  for (const a of cites) {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      if (desktop.matches) mark(a, 'is-active');
      else if (opener === a && !pop.hidden) closePop();
      else openPop(a);
    });
    a.addEventListener('mouseenter', () => desktop.matches && mark(a, 'is-hover'));
    a.addEventListener('mouseleave', () => document.querySelectorAll('.lesson-sources li.is-hover').forEach((el) => el.classList.remove('is-hover')));
  }

  pop.querySelector('.cite-pop-x')!.addEventListener('click', () => closePop());
  pop.querySelector('.cite-pop-all')!.addEventListener('click', () => closePop(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) closePop();
  });
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Node;
    if (!pop.hidden && !pop.contains(target) && !(target instanceof Element && target.closest('a.cite'))) closePop(false);
  });
  desktop.addEventListener('change', () => closePop(false));
}
