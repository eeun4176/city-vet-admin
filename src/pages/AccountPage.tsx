import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { shrinkImage } from '../lib/image';
import { InfoTip, Field, Notice, btnGhost, btnPrimary, inputCls } from '../components/ui';
import { roleLabel } from '../../shared/permissions';

/** The signed-in person's account: profile details are locked (an Admin changes them in Accounts); the photo, username and password can be changed here. */
export function AccountPage() {
  const { account, refresh } = useAuth();
  const [error, setError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  if (!account) return null;

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
  const initials = account.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const details: [string, string | null][] = [['Full name', account.name], ['Role', roleLabel(account.type)], ['Account key', account.accountKey], ['Barangay', account.barangay]];

  return <div className="w-full space-y-5">
    <div><h1 className="text-2xl font-semibold tracking-tight">Account<InfoTip>How you appear to other staff. Change your photo, username and password here; an Admin changes your name, role or barangay.</InfoTip></h1></div>
    {error && <Notice kind="error">{error}</Notice>}
    <section aria-label="Your account" className="rounded-2xl p-5 shadow-panel ring-1 ring-slate-200 sm:p-6 dark:ring-slate-800">
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
        <span className="relative shrink-0">
          {account.profilePhoto ? <img src={account.profilePhoto} alt="Your profile" className="h-16 w-16 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
            : <span aria-hidden className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-xl font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-100">{initials}</span>}
          <span aria-hidden className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-brand-500 ring-2 ring-white dark:ring-surface-dark" />
        </span>
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{account.name}</p><p className="truncate text-sm text-slate-500">{[roleLabel(account.type), account.barangay].filter(Boolean).join(' · ')}</p></div>
        <div className="flex flex-wrap gap-2">
          <label className={`${btnGhost} cursor-pointer px-3 py-1.5 text-[13px] focus-within:ring-[3px] focus-within:ring-brand-500/40 ${photoBusy ? 'pointer-events-none opacity-50' : ''}`}>
            {photoBusy ? 'Saving photo…' : 'Upload photo'}
            <input type="file" accept="image/*" className="sr-only" disabled={photoBusy} onChange={(event) => { void savePhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          </label>
          {account.profilePhoto && <button type="button" onClick={() => void removePhoto()} className={`${btnGhost} px-3 py-1.5 text-[13px]`}>Remove</button>}
        </div>
      </div>
      <dl className="grid gap-4 pt-5 sm:grid-cols-2">
        {details.map(([label, value]) => <div key={label}>
          <dt className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</dt>
          <dd className="mt-1.5 flex h-11 cursor-not-allowed items-center gap-2 rounded-xl bg-slate-100/80 px-3.5 text-sm font-medium text-slate-900 dark:bg-slate-800/70 dark:text-white" title="Locked">
            <span className="min-w-0 flex-1 truncate">{value || <span className="font-normal text-slate-400">Not set</span>}</span><Lock aria-label="Locked" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </dd>
        </div>)}
      </dl>
      <p className="mt-4 text-xs text-slate-500">Photos are resized on your device before upload and are visible to signed-in staff.</p>
    </section>
    {account.username && <SignInDetails username={account.username} onSaved={refresh} />}
  </div>;
}

/** Change your own username and/or password; the current password confirms it is you. */
function SignInDetails({ username, onSaved }: { username: string; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const nextUsername = String(data.get('username')).trim();
    const newPassword = String(data.get('newPassword'));
    const body = { currentPassword: String(data.get('currentPassword')), ...(nextUsername !== username ? { username: nextUsername } : {}), ...(newPassword ? { newPassword, confirmPassword: String(data.get('confirmPassword')) } : {}) };
    if (!('username' in body) && !newPassword) { setMessage({ kind: 'error', text: 'Enter a new username or a new password.' }); return; }
    setBusy(true); setMessage(null);
    try {
      await api('PATCH', '/auth/credentials', body);
      form.reset();
      setMessage({ kind: 'success', text: newPassword ? 'Saved. Other devices signed in to this account were signed out.' : 'Username saved. Use it the next time you sign in.' });
      await onSaved();
    } catch (failure) { setMessage({ kind: 'error', text: failure instanceof Error ? failure.message : 'Could not save your sign-in details.' }); }
    finally { setBusy(false); }
  };
  return <form onSubmit={(event) => void submit(event)} aria-label="Sign-in details" className="rounded-2xl p-5 shadow-panel ring-1 ring-slate-200 sm:p-6 dark:ring-slate-800">
    <h2 className="font-semibold">Username and password</h2>
    {message && <div className="mt-3"><Notice kind={message.kind}>{message.text}</Notice></div>}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <Field label="Username"><input name="username" defaultValue={username} key={username} required minLength={3} maxLength={64} pattern="[A-Za-z0-9._\-]+" autoComplete="username" className={inputCls} /></Field>
      <Field label="Current password" hint="Required to save any change."><input name="currentPassword" type="password" required autoComplete="current-password" className={inputCls} /></Field>
      <Field label="New password" hint="Leave blank to keep it. At least 8 characters with a letter and a number."><input name="newPassword" type="password" minLength={8} maxLength={200} autoComplete="new-password" className={inputCls} /></Field>
      <Field label="Confirm new password"><input name="confirmPassword" type="password" maxLength={200} autoComplete="new-password" className={inputCls} /></Field>
    </div>
    <div className="mt-4 flex justify-end"><button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Save changes'}</button></div>
  </form>;
}
