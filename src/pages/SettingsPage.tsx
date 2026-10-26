import { useState, type ReactNode } from 'react';
import { Database, Languages, Moon, Palette, Sun, type LucideIcon } from 'lucide-react';
import { useT, type Locale } from '../i18n';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { InfoTip, Notice, Spinner, btnGhost, tabItem, tabList } from '../components/ui';

// Settings sections as e-Vet Field cards: an icon tile, the heading, then the controls. Choices are segmented switchers with the chosen one in green.
function SectionCard({ icon: Icon, title, id, children }: { icon: LucideIcon; title: string; id: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="rounded-2xl p-5 ring-1 ring-slate-200 dark:ring-slate-800">
    <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-brand-600 dark:bg-slate-800 dark:text-brand-300"><Icon aria-hidden className="h-5 w-5" /></span><h2 id={id} className="font-semibold">{title}</h2></div>
    <div className="mt-4">{children}</div>
  </section>;
}
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; icon?: LucideIcon }[]; onChange: (value: T) => void }) {
  return <div><p id={`${label}-label`} className="mb-2 text-sm font-medium">{label}</p>
    <div role="radiogroup" aria-labelledby={`${label}-label`} className={`${tabList} inline-flex w-auto`}>{options.map(({ value: option, label: text, icon: Icon }) =>
      <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)} className={`${tabItem(value === option)} ${value === option ? '!text-brand-600 dark:!text-brand-300' : ''}`}>{Icon && <Icon aria-hidden className="h-4 w-4" />}{text}</button>)}</div>
  </div>;
}

export function SettingsPage() {
  const { can } = useAuth();
  const { t, locale, setLocale } = useT();
  const [theme, toggleTheme] = useTheme();
  const [error, setError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  const download = async (path: string, name: string) => {
    if (exportBusy) return;
    setExportBusy(true); setError('');
    try {
      const backup = await api<Record<string, unknown>>('GET', path);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = href; link.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000); setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not create the data export.'); }
    finally { setExportBusy(false); }
  };
  return <div className="w-full space-y-5">
    <div><h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}<InfoTip>Language, appearance and data exports. Your name and photo are in Account.</InfoTip></h1></div>
    {error && <Notice kind="error">{error}</Notice>}

    <SectionCard icon={Palette} title={t('settings.appearance')} id="look">
      <p className="text-sm text-slate-500">Saved to your account, so it follows you to other devices.</p>
      <div className="mt-4"><Segmented label="Theme" value={theme} onChange={(mode) => { if (theme !== mode) toggleTheme(); }} options={[{ value: 'light', label: t('theme.light'), icon: Sun }, { value: 'dark', label: t('theme.dark'), icon: Moon }]} /></div>
    </SectionCard>

    <SectionCard icon={Languages} title={t('settings.language')} id="lang">
      <p className="text-sm text-slate-500">{t('settings.languageHelp')}</p>
      <div className="mt-4"><Segmented label={t('settings.language')} value={locale} onChange={(next: Locale) => setLocale(next)} options={[{ value: 'en', label: 'English' }, { value: 'fil', label: 'Filipino' }]} /></div>
    </SectionCard>

    {can('system.backup') && <SectionCard icon={Database} title="Project Data Export" id="backup">
      <p className="text-sm text-slate-500">Download selected records and history. Keep a separate verified database backup for recovery, including account sign-in and stored photo files.</p>
      <button type="button" disabled={exportBusy} aria-busy={exportBusy} onClick={() => void download('/admin/backup', 'ekapon-data-export')} className={`${btnGhost} mt-4`}>{exportBusy ? <Spinner label="Preparing data export…" /> : 'Download data export'}</button>
    </SectionCard>}
  </div>;
}
