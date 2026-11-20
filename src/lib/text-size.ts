// Lesson text size: a few fixed steps, remembered in this browser (a per-screen
// preference, so it is not part of the save file). Applied as --text-zoom on <html>;
// lesson.css sizes the lesson body from it. An inline script in LessonLayout applies
// the stored step before first paint so the text does not jump.

export const TEXT_SIZE_KEY = 'capxer.textSize';
export const TEXT_STEPS = [0.875, 1, 1.125, 1.25, 1.5] as const;

export function readTextSize(): number {
  try {
    const v = Number(localStorage.getItem(TEXT_SIZE_KEY));
    return (TEXT_STEPS as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

function apply(z: number): void {
  document.documentElement.style.setProperty('--text-zoom', String(z));
  try {
    if (z === 1) localStorage.removeItem(TEXT_SIZE_KEY);
    else localStorage.setItem(TEXT_SIZE_KEY, String(z));
  } catch {
    // Storage blocked: the size lasts for this page only.
  }
  for (const group of document.querySelectorAll<HTMLElement>('[data-text-size-group]')) {
    const i = TEXT_STEPS.indexOf(z as (typeof TEXT_STEPS)[number]);
    group.querySelector<HTMLButtonElement>('[data-text-size="down"]')!.disabled = i <= 0;
    group.querySelector<HTMLButtonElement>('[data-text-size="up"]')!.disabled = i >= TEXT_STEPS.length - 1;
    const reset = group.querySelector<HTMLButtonElement>('[data-text-size="reset"]')!;
    reset.textContent = `${Math.round(z * 100)}%`;
    reset.disabled = z === 1;
  }
}

/** Wires every text-size control on the page (dock and phone menu stay in step). */
export function initTextSize(): void {
  let z = readTextSize();
  apply(z);
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest?.<HTMLButtonElement>('[data-text-size]');
    if (!btn) return;
    const i = TEXT_STEPS.indexOf(z as (typeof TEXT_STEPS)[number]);
    const step = btn.dataset.textSize;
    z = step === 'reset' ? 1 : TEXT_STEPS[Math.min(TEXT_STEPS.length - 1, Math.max(0, i + (step === 'up' ? 1 : -1)))];
    apply(z);
  });
}
