// Light/dark theme switch. v1.0 renders light by default (design system §2.3); dark tokens are
// prepared and selectable. The choice is a per-viewer convenience, so localStorage is fine here.

export type Theme = 'light' | 'dark';

const KEY = 'simario:theme';

export function getTheme(): Theme {
  // `?tema=gelap` / `?tema=terang` overrides the stored choice (demos and screenshot checks).
  const param = new URLSearchParams(window.location.search).get('tema');
  if (param === 'gelap') return 'dark';
  if (param === 'terang') return 'light';
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage unavailable (private mode): the theme still applies for this page view.
  }
}
