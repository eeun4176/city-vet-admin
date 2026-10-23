import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { messages, type Locale, type MessageKey } from './messages';

type Params = Record<string, string | number>;
interface I18n { locale: Locale; setLocale: (locale: Locale) => void; t: (key: MessageKey, params?: Params) => string }

const Ctx = createContext<I18n | null>(null);
const STORAGE_KEY = 'cv.locale';
function initialLocale(preferred?: Locale): Locale {
  if (preferred) return preferred;
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved === 'en' || saved === 'fil') return saved; } catch { /* storage unavailable */ }
  return 'en';
}

export function LocaleProvider({ preferred, onChange, children }: { preferred?: Locale; onChange?: (locale: Locale) => void; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale(preferred));
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
    document.documentElement.lang = next === 'fil' ? 'fil' : 'en';
    onChange?.(next);
  }, [onChange]);
  const t = useCallback((key: MessageKey, params?: Params) => {
    let text = messages[locale][key] ?? messages.en[key];
    if (params) for (const [name, value] of Object.entries(params)) text = text.replace(`{${name}}`, String(value));
    return text;
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useT must be used inside LocaleProvider');
  return ctx;
}

export type { Locale, MessageKey };
