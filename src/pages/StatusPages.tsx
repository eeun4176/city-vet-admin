import { Link, useLocation } from 'react-router-dom';
import { useVisibleNav } from '../components/AppShell';
import { useT } from '../i18n';
import { useAuth } from '../lib/auth';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConfirmDialog } from '../components/ui';
import { findActive } from '../nav/nav';
import { ApiError } from '../lib/api';

export function PendingPage() {
  const { t } = useT();
  const nodes = useVisibleNav();
  const { pathname } = useLocation();
  const active = findActive(nodes, pathname);
  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <h1 className="text-xl font-semibold">{active ? t(active.node.label) : t('page.pending')}</h1>
      <p className="mt-2 text-sm text-slate-500">{t('page.pendingBody')}</p>
    </div>
  );
}

/**
 * An edited or old address: the page or record does not exist, or the account cannot open it (`noAccess`).
 * It is a screen of its own, never a page inside the system: it covers the whole window, and while it shows, the app
 * behind it (sidebar, search, notifications) is inert, so nothing of the system can be seen, clicked or tabbed to.
 */
export function NotFoundPage({ noAccess = false }: { noAccess?: boolean } = {}) {
  const { t } = useT();
  useEffect(() => {
    const app = document.getElementById('root');
    app?.setAttribute('inert', ''); app?.setAttribute('aria-hidden', 'true');
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { app?.removeAttribute('inert'); app?.removeAttribute('aria-hidden'); document.body.style.overflow = overflow; };
  }, []);
  return createPortal(
    <main role="alert" className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-canvas p-4 text-center dark:bg-canvas-dark">
      <div className="w-full max-w-md">
        <img src="/cityvet-logo.png" alt="" className="mx-auto h-14 w-14" />
        <p className="mt-6 font-mono text-sm font-semibold tracking-[0.2em] text-slate-400 dark:text-night-subtle">{noAccess ? '403' : '404'}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-night-text">{t(noAccess ? 'page.noAccess' : 'page.notFound')}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-night-muted">{t(noAccess ? 'page.noAccessBody' : 'page.notFoundBody')}</p>
        <Link to="/dashboard" replace className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">{t('page.back')}</Link>
        <p className="mt-8 text-xs text-slate-400 dark:text-night-subtle">{t('app.name')} {t('app.edition')} · {t('app.city')}</p>
      </div>
    </main>,
    document.body,
  );
}

/** The same, as one line for a dialog or a notice. */
export const blockedText = (error: Error) => {
  const status = error instanceof ApiError ? error.status : 0;
  return status === 403 ? 'Your account cannot open this record.' : status === 400 || status === 404 ? 'This record cannot be found. The address may have been changed, or the record removed.' : error.message;
};

/** What a failed record read means for the person: a bad or unknown address is "not found", a refusal is "no access"; anything else (offline, server error) returns null so the page shows its own message and retry. */
export function blockedPage(error: unknown) {
  const status = error instanceof ApiError ? error.status : 0;
  return status === 403 ? <NotFoundPage noAccess /> : status === 400 || status === 404 ? <NotFoundPage /> : null;
}

export function MaintenancePage() {
  const { t } = useT();
  const { logout } = useAuth();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid min-h-dvh place-items-center p-4 text-center">
      <div className="max-w-sm">
        <h1 className="text-xl font-semibold">{t('maintenance.title')}</h1>
        <p className="mt-2 text-sm text-slate-500">{t('maintenance.body')}</p>
        <button type="button" onClick={() => setConfirm(true)} className="mt-5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-night-border dark:hover:bg-night-tile">{t('nav.logout')}</button>
      </div>
      {confirm && <ConfirmDialog title="Sign out?" message="You will need to sign in again to continue." confirmLabel="Sign out" onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void logout(); }} />}
    </div>
  );
}
