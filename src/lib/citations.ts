// Lesson page behaviour (design E). Citations are links to their source entry
// (#source-n), so everything works without JavaScript. With it:
// - a click or tap on a raised number opens a popover with the source and the exact place;
// - a link into the Sources list opens it first if the reader collapsed it;
// - the desktop contents list marks the section being read.

/** Opens the collapsible Sources block when something points into it. */
function openSourcesFor(hash: string): void {
  if (!/^#(sources|source-\d+)$/.test(hash)) return;
  const box = document.querySelector<HTMLDetailsElement>('details.lesson-sources');
  if (box && !box.open) box.open = true;
}

export function initCitations(): void {
  const cites = [...document.querySelectorAll<HTMLAnchorElement>('a.cite')];
  const pop = document.querySelector<HTMLElement>('.cite-pop');
  // In-page links to the list (dock, contents, "All sources", plain links) and direct visits.
  openSourcesFor(location.hash);
  addEventListener('hashchange', () => openSourcesFor(location.hash));
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.<HTMLAnchorElement>('a[href^="#"]');
    if (a && !a.classList.contains('cite')) openSourcesFor(a.getAttribute('href')!);
  });
  if (!cites.length || !pop) return;

  const entry = (a: HTMLAnchorElement) => document.getElementById(`source-${a.dataset.source}`);
  let opener: HTMLAnchorElement | null = null;

  const closePop = (returnFocus = true) => {
    if (pop.hidden) return;
    pop.hidden = true;
    opener?.setAttribute('aria-expanded', 'false');
    if (returnFocus) opener?.focus();
    opener = null;
  };

  const openPop = (a: HTMLAnchorElement) => {
    const li = entry(a);
    if (!li) return;
    opener?.setAttribute('aria-expanded', 'false');
    opener = a;
    a.setAttribute('aria-expanded', 'true');
    pop.querySelector('.cite-pop-title')!.textContent = a.dataset.source ?? '';
    const body = pop.querySelector<HTMLElement>('.cite-pop-body')!;
    body.replaceChildren(...[...li.querySelectorAll('.src-text, .src-links')].map((n) => n.cloneNode(true)));
    pop.querySelector('.cite-pop-at')!.textContent = `${pop.dataset.citedAt}: ${a.dataset.locator ?? ''}`;
    pop.querySelector<HTMLAnchorElement>('.cite-pop-all')!.href = `#source-${a.dataset.source}`;
    pop.hidden = false;
    // Below the number, inside the screen's 16 px gutters.
    const r = a.getBoundingClientRect();
    const w = Math.min(pop.offsetWidth, window.innerWidth - 32);
    const left = Math.min(Math.max(16, r.left - 24), window.innerWidth - 16 - w);
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${r.bottom + window.scrollY + 10}px`;
    pop.querySelector<HTMLButtonElement>('.cite-pop-x')!.focus({ preventScroll: true });
  };

  for (const a of cites) {
    a.setAttribute('aria-haspopup', 'dialog');
    a.setAttribute('aria-expanded', 'false');
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      if (opener === a && !pop.hidden) closePop();
      else openPop(a);
    });
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
  addEventListener('resize', () => closePop(false));
}

/** Desktop contents list: marks the section being read (aria-current). */
export function initLessonToc(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.lesson-toc a')];
  if (!links.length) return;
  const targets = links.map((l) => document.getElementById(decodeURIComponent(l.hash.slice(1)))).filter((x): x is HTMLElement => !!x);
  // A section is "being read" once its heading passes this line (below the site bar;
  // in-page links land headings at 6rem, html scroll-padding-top).
  const update = () => {
    const line = 160;
    let cur = 0;
    targets.forEach((h, i) => {
      if (h.getBoundingClientRect().top <= line) cur = i;
    });
    // At the very end of the page the last section is the one being read.
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = targets.length - 1;
    links.forEach((l, i) => (i === cur ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')));
  };
  // A handful of rectangle reads per scroll event is cheap; no frame scheduling needed.
  addEventListener('scroll', update, { passive: true });
  addEventListener('hashchange', update);
  update();
}
