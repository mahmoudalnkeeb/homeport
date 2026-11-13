import { useEffect, useState } from 'preact/hooks';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'lab-theme';
const listeners = new Set<() => void>();
const darkQuery = () => matchMedia('(prefers-color-scheme: dark)');

export function getTheme(): ThemeChoice {
  const theme = document.documentElement.dataset.theme;
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

export function resolvedTheme(): ResolvedTheme {
  const theme = getTheme();
  if (theme !== 'system') return theme;
  return darkQuery().matches ? 'dark' : 'light';
}

export function setTheme(theme: ThemeChoice): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
  }
  listeners.forEach((listener) => listener());
}

export function initTheme(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch {
  }
  darkQuery().addEventListener('change', () => {
    if (getTheme() === 'system') listeners.forEach((listener) => listener());
  });
}

export function useTheme(): { choice: ThemeChoice; resolved: ResolvedTheme } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((tick) => tick + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return { choice: getTheme(), resolved: resolvedTheme() };
}
