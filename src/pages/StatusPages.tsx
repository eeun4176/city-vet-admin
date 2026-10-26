import { Link, useLocation } from 'react-router-dom';
import { useVisibleNav } from '../components/AppShell';
import { useT } from '../i18n';
import { useAuth } from '../lib/auth';
import { useState } from 'react';
import { ConfirmDialog } from '../components/ui';
import { findActive } from '../nav/nav';

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

export function NotFoundPage() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <h1 className="text-xl font-semibold">{t('page.notFound')}</h1>
      <p className="mt-2 text-sm text-slate-500">{t('page.notFoundBody')}</p>
      <Link to="/dashboard" className="mt-5 inline-block rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">{t('page.back')}</Link>
    </div>
  );
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
