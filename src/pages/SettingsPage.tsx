import { FileInput } from '../components/FileInput';
import { useState } from 'react';
import { useT, type Locale } from '../i18n';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { api } from '../lib/api';
import { shrinkImage } from '../lib/image';
import { Notice, Spinner, btnGhost, btnPrimary } from '../components/ui';

const choice = (selected: boolean) => `rounded-xl border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`;

export function SettingsPage() {
  const { account, can, refresh } = useAuth();
  const { t, locale, setLocale } = useT();
  const [theme, toggleTheme] = useTheme();
  const [error, setError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const savePhoto = async (file?: File) => {
    if (!file) return;
    setError(''); setPhotoBusy(true);
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
      // Re-encode locally so phone photos (including large camera images) use a
      // supported format and a small payload before they reach the API.
      const photo = await shrinkImage(file);
      await api('PUT', '/auth/photo', { mimeType: photo.mime, data: photo.data });
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your photo.'); }
    finally { setPhotoBusy(false); }
  };
  const removePhoto = async () => {
    setError('');
    try { await api('DELETE', '/auth/photo'); await refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not remove your photo.'); }
  };
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
  return <div className="mx-auto max-w-2xl space-y-8">
    <div><h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1><p className="mt-1 text-sm text-slate-500">Manage your staff preferences and account photo.</p></div>
    {error && <Notice kind="error">{error}</Notice>}

    <section aria-labelledby="profile-photo" className="space-y-3">
      <h2 id="profile-photo" className="text-sm font-semibold">Profile photo</h2>
      <p className="text-sm text-slate-500">This photo appears beside your name in the staff dashboard. It is visible to signed-in staff.</p>
      <div className="flex flex-wrap items-center gap-4">
        {account?.profilePhoto ? <img src={account.profilePhoto} alt="Your profile" className="h-16 w-16 rounded-full border border-slate-200 object-cover dark:border-slate-700" />
          : <span aria-hidden className="grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-xl font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-100">{account?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>}
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${btnPrimary} cursor-pointer ${photoBusy ? 'pointer-events-none opacity-50' : ''}`}>
            {photoBusy ? 'Saving photo…' : account?.profilePhoto ? 'Change photo' : 'Choose photo'}
            <FileInput type="file" accept="image/*" className="sr-only" disabled={photoBusy} onChange={(event) => { void savePhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          </label>
          {account?.profilePhoto && <button type="button" onClick={() => void removePhoto()} className={btnGhost}>Remove photo</button>}
          <span className="text-xs text-slate-500">Choose a photo from your device. It is resized securely before upload.</span>
        </div>
      </div>
    </section>

    <section aria-labelledby="lang" className="border-t border-slate-200 pt-6 dark:border-slate-700">
      <h2 id="lang" className="text-sm font-semibold">{t('settings.language')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('settings.languageHelp')}</p>
      <div className="mt-3 flex gap-2" role="radiogroup" aria-labelledby="lang">
        {([{ id: 'en', label: 'English' }, { id: 'fil', label: 'Filipino' }] as { id: Locale; label: string }[]).map((language) =>
          <button key={language.id} type="button" role="radio" aria-checked={locale === language.id} onClick={() => setLocale(language.id)} className={choice(locale === language.id)}>{language.label}</button>)}
      </div>
    </section>

    <section aria-labelledby="look" className="border-t border-slate-200 pt-6 dark:border-slate-700">
      <h2 id="look" className="text-sm font-semibold">{t('settings.appearance')}</h2>
      <div className="mt-3 flex gap-2" role="radiogroup" aria-labelledby="look">
        {(['light', 'dark'] as const).map((mode) => <button key={mode} type="button" role="radio" aria-checked={theme === mode} onClick={() => { if (theme !== mode) toggleTheme(); }} className={choice(theme === mode)}>{t(mode === 'light' ? 'theme.light' : 'theme.dark')}</button>)}
      </div>
    </section>

    {can('system.backup') && <section aria-labelledby="backup" className="space-y-3 border-t border-slate-200 pt-6 dark:border-slate-700">
      <h2 id="backup" className="text-sm font-semibold">Project data export</h2>
      <p className="text-sm text-slate-500">Download selected records and history. Keep a separate verified database backup for recovery, including account sign-in and stored photo files.</p>
      <button type="button" disabled={exportBusy} aria-busy={exportBusy} onClick={() => void download('/admin/backup', 'ekapon-data-export')} className={btnGhost}>{exportBusy ? <Spinner label="Preparing data export…" /> : 'Download data export'}</button>
    </section>}
  </div>;
}
