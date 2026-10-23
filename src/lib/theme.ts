import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export type Theme = 'light' | 'dark';

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  useEffect(() => {
    const sync = (event: Event) => setTheme((event as CustomEvent<Theme>).detail);
    window.addEventListener('cv:theme', sync);
    return () => window.removeEventListener('cv:theme', sync);
  }, []);
  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    window.dispatchEvent(new CustomEvent('cv:theme', { detail: next }));
    try { localStorage.setItem('cv.theme', next); } catch { /* storage unavailable */ }
    setTheme(next);
    void api('PUT', '/auth/preferences', { theme: next }).catch((error: unknown) => {
      window.dispatchEvent(new CustomEvent('cv:api-error', { detail: { message: error instanceof Error ? error.message : 'Could not save appearance preference.' } }));
    });
  }, [theme]);
  return [theme, toggle];
}
