import { invalidateColorCache } from './theme-colors';

export type Theme = 'dark';

export function getStoredTheme(): Theme {
  return 'dark';
}

export function getCurrentTheme(): Theme {
  return 'dark';
}

export function setTheme(): void {
  document.documentElement.dataset.theme = 'dark';
  invalidateColorCache();
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    const variant = document.documentElement.dataset.variant;
    meta.content = variant === 'happy' ? '#1A2332' : '#0a0f0a';
  }
}

export function applyStoredTheme(): void {
  document.documentElement.dataset.theme = 'dark';
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    const variant = document.documentElement.dataset.variant;
    meta.content = variant === 'happy' ? '#1A2332' : '#0a0f0a';
  }
}
