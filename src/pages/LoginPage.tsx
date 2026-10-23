import { ParavetAgreement } from '../components/ParavetAgreement';
import { PARAVET_POLICY_VERSION } from '../../shared/paravetPolicy';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { landingPageForRole, type Role } from '../../shared/permissions';

type Step = 'signin' | 'first' | 'password';

const field = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const button = 'w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60';

export function LoginPage() {
  const { t } = useT();
  const { status, refresh, account } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? (account ? landingPageForRole(account.type) : '/dashboard');
  const [policyLanguage,setPolicyLanguage]=useState<'en'|'fil'>('en');
  const [step, setStep] = useState<Step>('signin');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  if (status === 'ready') return <Navigate to={from === '/dashboard' && account ? landingPageForRole(account.type) : from} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (step === 'signin') {
        await api('POST', '/auth/login', { identifier: String(data.get('identifier')).trim(), password: String(data.get('password')) });
        const current = await api<{ account: { id: number; type: Role } }>('GET', '/auth/me');
        let resumePath = '';
        try { resumePath = localStorage.getItem(`cv.last-page.${current.account.id}`) ?? ''; } catch { /* storage unavailable */ }
        await refresh();
        if (current.account.type !== 'User' && resumePath.startsWith('/') && !resumePath.startsWith('//') && resumePath !== '/login' && resumePath !== '/dashboard') {
          navigate('/dashboard', { replace: true, state: { resumePath } });
        } else {
          navigate(from === '/dashboard' ? landingPageForRole(current.account.type) : from, { replace: true });
        }
      } else if (step === 'first') {
        await api('POST', '/auth/first-signin', { accountKey: String(data.get('accountKey')).trim(), temporaryPassword: String(data.get('temporaryPassword')) });
        setStep('password');
      } else {
        await api('POST', '/auth/set-password', { newPassword: String(data.get('newPassword')), confirmPassword: String(data.get('confirmPassword')),acceptedTerms:data.get('acceptTerms')==='on',acknowledgedPrivacy:data.get('acknowledgePrivacy')==='on',policyVersion:PARAVET_POLICY_VERSION,policyLanguage });
        await refresh();
        const current = await api<{ account: { type: Role } }>('GET', '/auth/me');
        navigate(from === '/dashboard' ? landingPageForRole(current.account.type) : from, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'FIRST_SIGN_IN_REQUIRED') setStep('first');
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-panel dark:border-slate-800 dark:bg-surface-dark">
        <img src="/images.jpg" alt="" className="mx-auto h-16 w-16 rounded-2xl border border-brand-200 object-cover" />
        <p className="mt-3 text-center text-xs text-slate-500">{t('app.name')} · {t('app.city')}</p>
        <h1 className="mt-1 text-center text-xl font-semibold">
          {step === 'signin' ? t('login.title') : step === 'first' ? t('login.firstTitle') : t('login.newTitle')}
        </h1>
        {step !== 'signin' && <p className="mt-2 text-center text-sm text-slate-500">{step === 'first' ? t('login.firstHelp') : t('login.newHelp')}</p>}

        <form onSubmit={submit} className="mt-5 space-y-4" key={step}>
          {step === 'signin' && (
            <>
              <label className="block text-sm font-medium">{t('login.username')}
                <input name="identifier" autoComplete="username" required className={field} />
              </label>
              <label className="block text-sm font-medium">{t('login.password')}
                <div className="relative mt-1">
                  <input name="password" type={showPasswords ? 'text' : 'password'} autoComplete="current-password" required className={`${field} mt-0 pr-20`} />
                  <button type="button" onClick={() => setShowPasswords((visible) => !visible)} className="absolute inset-y-0 right-2 px-2 text-xs font-medium text-brand-700 hover:underline">{t(showPasswords ? 'login.hidePassword' : 'login.showPassword')}</button>
                </div>
              </label>
            </>
          )}
          {step === 'first' && (
            <>
              <label className="block text-sm font-medium">{t('login.accountKey')}
                <input name="accountKey" autoComplete="off" required placeholder="PV2026-TMP001-3023" className={field} />
              </label>
              <label className="block text-sm font-medium">{t('login.tempPassword')}
                <div className="relative mt-1"><input name="temporaryPassword" type={showPasswords ? 'text' : 'password'} autoComplete="off" required className={`${field} mt-0 pr-20`} /><button type="button" onClick={() => setShowPasswords((visible) => !visible)} className="absolute inset-y-0 right-2 px-2 text-xs font-medium text-brand-700 hover:underline">{t(showPasswords ? 'login.hidePassword' : 'login.showPassword')}</button></div>
              </label>
            </>
          )}
          {step === 'password' && (
            <>
              <label className="block text-sm font-medium">{t('login.newPassword')}
                <div className="relative mt-1"><input name="newPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength={8} required className={`${field} mt-0 pr-20`} /><button type="button" onClick={() => setShowPasswords((visible) => !visible)} className="absolute inset-y-0 right-2 px-2 text-xs font-medium text-brand-700 hover:underline">{t(showPasswords ? 'login.hidePassword' : 'login.showPassword')}</button></div>
              </label>
              <label className="block text-sm font-medium">{t('login.confirmPassword')}
                <div className="relative mt-1"><input name="confirmPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength={8} required className={`${field} mt-0 pr-20`} /><button type="button" onClick={() => setShowPasswords((visible) => !visible)} className="absolute inset-y-0 right-2 px-2 text-xs font-medium text-brand-700 hover:underline">{t(showPasswords ? 'login.hidePassword' : 'login.showPassword')}</button></div>
              </label>
            </>
          )}
          {step==='password'&&<ParavetAgreement language={policyLanguage} onLanguage={setPolicyLanguage}/>}
          <p role="alert" className="min-h-5 text-sm text-red-600 dark:text-red-400">{error}</p>
          <button type="submit" disabled={busy} className={button}>
            {busy ? t('login.working') : step === 'signin' ? t('login.submit') : step === 'first' ? t('login.firstSubmit') : t('login.newSubmit')}
          </button>
        </form>

        {step !== 'password' && (
          <button type="button" onClick={() => { setError(''); setStep(step === 'signin' ? 'first' : 'signin'); }}
            className="mt-4 w-full text-center text-sm text-brand-700 hover:underline dark:text-brand-200">
            {step === 'signin' ? t('login.useFirst') : t('login.useNormal')}
          </button>
        )}
      </div>
    </div>
  );
}
