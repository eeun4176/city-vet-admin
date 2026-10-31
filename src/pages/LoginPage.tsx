import { ParavetAgreement } from '../components/ParavetAgreement';
import { SALIN_URL } from '../components/DocumentReaderButton';
import { PARAVET_POLICY_VERSION } from '../../shared/paravetPolicy';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Check, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { landingPageForRole, type Role } from '../../shared/permissions';

type Step = 'signin' | 'first' | 'password';

// Same sign-in as e-Vet Field: floating labels over 54px fields, a soft green focus ring, and a short welcome before the dashboard opens.
const field = 'peer h-[54px] w-full rounded-xl border border-slate-200 bg-white pb-1.5 pl-11 pt-[21px] text-[15px] text-slate-900 outline-none transition-[border-color,box-shadow] focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-night-border dark:bg-night-surface dark:text-night-text';
const button = 'relative isolate mt-2 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand-500 text-[15px] font-semibold text-white transition-colors duration-300 hover:bg-brand-600 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-default';
const WELCOME_MS = 1400;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));

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
  // Bumped on every failed attempt so the error shakes again even when the message repeats.
  const [attempt, setAttempt] = useState(0);
  const [welcome, setWelcome] = useState<string | null>(null);

  if (status === 'ready' && welcome === null) return <Navigate to={from === '/dashboard' && account ? landingPageForRole(account.type) : from} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (step === 'signin') {
        await api('POST', '/auth/login', { identifier: String(data.get('identifier')).trim(), password: String(data.get('password')) });
        const current = await api<{ account: { id: number; type: Role; name: string } }>('GET', '/auth/me');
        let resumePath = '';
        try { resumePath = localStorage.getItem(`cv.last-page.${current.account.id}`) ?? ''; } catch { /* storage unavailable */ }
        setWelcome(current.account.name);
        // Before refresh(): signing in remounts the app (it is keyed by account), which would drop the welcome.
        await wait(WELCOME_MS);
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
        const current = await api<{ account: { type: Role; name: string } }>('GET', '/auth/me');
        setWelcome(current.account.name);
        await wait(WELCOME_MS);
        await refresh();
        navigate(from === '/dashboard' ? landingPageForRole(current.account.type) : from, { replace: true });
      }
    } catch (err) {
      setWelcome(null);
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setAttempt((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const toggle = <button type="button" onClick={() => setShowPasswords((visible) => !visible)} aria-label={t(showPasswords ? 'login.hidePassword' : 'login.showPassword')} aria-pressed={showPasswords} className="grid h-9 min-h-0 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-night-tile dark:hover:text-night-text">{showPasswords ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}</button>;

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#f8faf9] dark:bg-[#121212]">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-40 -z-10 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgb(1_168_90/0.10),transparent)]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-40 -z-10 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgb(1_168_90/0.10),transparent)]" />

      <header className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/cityvet-logo.png" alt="" className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 whitespace-nowrap text-[18px] font-extrabold leading-5 tracking-[-0.02em] text-slate-900 dark:text-night-text">{t('app.name')}<span className="rounded-md bg-brand-50 px-1.5 text-[10px] font-bold uppercase leading-4 tracking-wide text-brand-700 dark:bg-brand-900 dark:text-brand-300">{t('app.edition')}</span></p>
            <p className="truncate text-xs text-slate-500 max-[600px]:hidden">{t('app.city')}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200 dark:bg-surface-dark dark:ring-night-border">Filipino / EN</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[420px] rounded-[22px] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgb(16_24_20/0.04),0_12px_32px_-12px_rgb(16_24_20/0.12)] dark:border-night-border dark:bg-surface-dark sm:p-8">
          {welcome !== null ? <div role="status" className="flex flex-col items-center py-4 text-center">
            <svg viewBox="0 0 52 52" className="h-16 w-16" aria-hidden="true">
              <circle cx="26" cy="26" r="24" fill="none" stroke="#01a85a" strokeWidth="2.5" pathLength={1} className="login-draw" />
              <path d="M15 27l7 7 15-16" fill="none" stroke="#01a85a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="login-draw [animation-delay:250ms]" />
            </svg>
            <h1 className="mt-5 text-[22px] font-semibold">{t('login.welcome', { name: welcome })}</h1>
            <p className="mt-1.5 text-sm text-slate-500">{t('login.opening')}</p>
            <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-night-tile"><div className="login-fill h-full rounded-full bg-brand-500" /></div>
          </div> : <>
            {/* The header hides the city on phones: show it here instead. */}
            <p className="mb-1 text-xs font-medium text-slate-500 min-[601px]:hidden">{t('app.city')}</p>
            <h1 className="text-[22px] font-semibold tracking-[-0.01em]">
              {step === 'signin' ? t('login.title') : step === 'first' ? t('login.firstTitle') : t('login.newTitle')}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">{step === 'signin' ? t('login.help') : step === 'first' ? t('login.firstHelp') : t('login.newHelp')}</p>

            <form onSubmit={submit} className="mt-5 space-y-4" key={step}>
              {step === 'signin' && (
                <>
                  <FloatingField id="identifier" label={t('login.username')} icon={<KeyRound />}>
                    <input id="identifier" name="identifier" placeholder=" " autoComplete="username" autoCapitalize="none" spellCheck={false} required className={`${field} pr-3.5`} />
                  </FloatingField>
                  <FloatingField id="password" label={t('login.password')} icon={<Lock />} trailing={toggle}>
                    <input id="password" name="password" placeholder=" " type={showPasswords ? 'text' : 'password'} autoComplete="current-password" required className={`${field} pr-12`} />
                  </FloatingField>
                </>
              )}
              {step === 'first' && (
                <>
                  <FloatingField id="accountKey" label={t('login.accountKey')} icon={<KeyRound />}>
                    <input id="accountKey" name="accountKey" placeholder=" " autoComplete="off" autoCapitalize="characters" spellCheck={false} required className={`${field} pr-3.5`} />
                  </FloatingField>
                  <FloatingField id="temporaryPassword" label={t('login.tempPassword')} icon={<Lock />} trailing={toggle}>
                    <input id="temporaryPassword" name="temporaryPassword" placeholder=" " type={showPasswords ? 'text' : 'password'} autoComplete="one-time-code" required className={`${field} pr-12`} />
                  </FloatingField>
                </>
              )}
              {step === 'password' && (
                <>
                  <FloatingField id="newPassword" label={t('login.newPassword')} icon={<Lock />} trailing={toggle}>
                    <input id="newPassword" name="newPassword" placeholder=" " type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength={8} required className={`${field} pr-12`} />
                  </FloatingField>
                  <FloatingField id="confirmPassword" label={t('login.confirmPassword')} icon={<Lock />}>
                    <input id="confirmPassword" name="confirmPassword" placeholder=" " type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength={8} required className={`${field} pr-3.5`} />
                  </FloatingField>
                </>
              )}
              {step==='password'&&<ParavetAgreement language={policyLanguage} onLanguage={setPolicyLanguage}/>}
              {error && <p key={attempt} role="alert" className="login-shake rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">{error}</p>}
              <button type="submit" disabled={busy} aria-live="polite" className={button}>
                {busy && <span aria-hidden="true" className="login-sheen absolute inset-y-0 -left-1/2 -z-10 w-1/2 bg-[linear-gradient(100deg,transparent,rgb(255_255_255/0.35),transparent)]" />}
                {busy ? t('login.checking') : step === 'signin' ? t('login.submit') : step === 'first' ? t('login.firstSubmit') : t('login.newSubmit')}
              </button>
            </form>

            {/* Paravets (first sign-in included) use the Salin app; this page is for staff. */}
            <a href={SALIN_URL} className="mt-3 flex h-9 w-full items-center justify-center rounded-lg text-center text-[13px] font-medium text-slate-500 hover:text-brand-700 dark:hover:text-brand-500">{t('login.useSalin')}</a>
          </>}
        </div>
      </main>
    </div>
  );
}

/** A field whose label rests inside it and lifts above the text on focus or once filled (the input carries placeholder=" "). */
function FloatingField({ id, label, icon, trailing, children }: { id: string; label: string; icon: ReactNode; trailing?: ReactNode; children: ReactNode }) {
  return <div className="relative">
    <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon}</span>
    {children}
    <label htmlFor={id} className="pointer-events-none absolute left-11 top-[17px] origin-left whitespace-nowrap text-[15px] leading-5 text-slate-500 transition-[transform,color] duration-[580ms] ease-[cubic-bezier(.32,.72,0,1)] peer-focus:-translate-y-[10px] peer-focus:scale-[0.74] peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:-translate-y-[10px] peer-[:not(:placeholder-shown)]:scale-[0.74] peer-[:not(:placeholder-shown)]:text-brand-600 motion-reduce:transition-none">{label}</label>
    {trailing && <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</span>}
  </div>;
}
