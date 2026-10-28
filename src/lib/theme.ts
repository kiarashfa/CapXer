export type Theme = 'light' | 'dark';

export const THEME_KEY = 'capxer.theme';

/**
 * A stored choice wins. Without one, follow the system only when it asks for
 * light; everything else defaults to dark. The inline script in
 * BaseLayout.astro mirrors this logic (it cannot import modules).
 */
export function resolveTheme(stored: string | null, prefersLight: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersLight ? 'light' : 'dark';
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked (private mode etc.): the theme still applies for this page.
  }
}
