/** Space kept between the cookie bar and the notes stacked above it (px). */
const GAP = 10;

/**
 * Notes at the bottom of the screen (BaseLayout #toasts) rise above the cookie bar while it
 * shows: --toasts-bottom (global.css) follows the bar's height and is cleared once it hides.
 * Layout sizes are used, so the bar's entrance animation does not move the notes.
 */
export function followConsentBar(bar: HTMLElement | null): void {
  if (!bar || typeof ResizeObserver === 'undefined') return;
  const root = document.documentElement.style;
  const update = () => {
    const height = bar.offsetHeight;
    if (!height) {
      root.removeProperty('--toasts-bottom');
      return;
    }
    const margin = parseFloat(getComputedStyle(bar).marginBottom) || 0;
    root.setProperty('--toasts-bottom', `${Math.ceil(height + margin + GAP)}px`);
  };
  new ResizeObserver(update).observe(bar);
  update();
}
