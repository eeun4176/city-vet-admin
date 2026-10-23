import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Clock3 } from 'lucide-react';
import { useState } from 'react';
import { useVisibleNav } from '../components/AppShell';
import { Loading, EmptyState, LoadError, Modal, btnGhost, btnPrimary, formatDate } from '../components/ui';
import { useT } from '../i18n';
import { useAuth } from '../lib/auth';
import { flatten } from '../nav/nav';
import { useApi } from '../lib/useApi';
import { DataFreshness } from '../components/DataFreshness';
import { dashboardShortcutIds, type DashboardOverview, type DashboardWork } from '../../shared/dashboardOverview';
import type { SearchPage } from '../../shared/search';

const card = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-surface-dark sm:p-5';
const linkRow = 'group flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800';

export function DashboardWorkList({ items, waiting = false }: { items: DashboardWork[]; waiting?: boolean }) {
  return <ul className="space-y-1">{items.map(item => <li key={item.id}>
    <Link to={item.to} className={linkRow}>
      <span className={`flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl px-2 text-sm font-semibold tabular-nums ${waiting ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'}`}>{item.count.toLocaleString()}</span>
      <span className="min-w-0 flex-1"><strong className="block break-words text-sm font-medium">{item.title}</strong><span className="mt-1 block text-xs leading-relaxed text-slate-500">{item.description}</span></span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-brand-600" />
    </Link>
  </li>)}</ul>;
}

export function DashboardPage() {
  const { t } = useT();
  const { account } = useAuth();
  const location = useLocation(), navigate = useNavigate();
  const nodes = useVisibleNav();
  const links = flatten(nodes).filter(({ node }) => node.to && node.id !== 'dashboard');
  const shortcuts = dashboardShortcutIds(account?.type ?? '').flatMap(id => links.filter(({ node }) => node.id === id));
  const overview = useApi<DashboardOverview>('/dashboard/overview', { refreshIntervalMs: 60000 });
  const [recentHistory, setRecentHistory] = useState(false);
  const recent = useApi<SearchPage>(`/recently-added?includeHistory=${recentHistory}`, { refreshIntervalMs: 60000 });
  const resumePath = (location.state as { resumePath?: unknown } | null)?.resumePath;
  const closeResume = () => navigate('/dashboard', { replace: true, state: null });
  const programsLink = links.find(({ node }) => node.id === 'program-day');
  return <div className="mx-auto min-w-0 max-w-7xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">Your workspace</p>
        <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight">{t('dashboard.welcome', { name: account?.name ?? '' })}</h1>
        <p className="mt-2 text-sm text-slate-500">{t('common.signedInAs', { name: account?.type === 'SuperAdmin' ? 'Super Admin' : account?.type ?? '' })}{account?.barangay ? ` · ${account.barangay}` : ' · Citywide'}</p>
      </div>
      <DataFreshness updatedAt={overview.updatedAt} loading={overview.loading} onRefresh={overview.reload} maxAgeMs={60000} />
    </header>

    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section aria-labelledby="work-title" className={card} aria-busy={overview.loading}>
        <div className="mb-3 flex items-center gap-2"><ClipboardCheck aria-hidden className="h-5 w-5 text-brand-600" /><h2 id="work-title" className="text-lg font-semibold">Needs your attention</h2></div>
        <p className="mb-4 text-sm text-slate-500">{account?.type === 'Paravet' ? 'Your submissions, barangay interest lists, and assigned stub batches.' : 'Unresolved work within your current permissions.'}</p>
        {overview.error ? <LoadError message={overview.error.message} onRetry={overview.reload} /> : !overview.data ? <Loading label="Loading your pending work…" /> : <>
          {overview.data.tasks.length ? <DashboardWorkList items={overview.data.tasks} /> : <EmptyState title="No pending tasks in these queues" description="New work will appear here after the next refresh."><CheckCircle2 aria-hidden className="mx-auto h-6 w-6 text-brand-600" /></EmptyState>}
          {overview.data.waiting.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300"><Clock3 aria-hidden className="h-4 w-4" />Awaiting Admin</h3><DashboardWorkList items={overview.data.waiting} waiting /></div>}
        </>}
      </section>

      {programsLink && <section aria-labelledby="programs-title" className={card} aria-busy={overview.loading}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="programs-title" className="flex items-center gap-2 text-lg font-semibold"><CalendarDays aria-hidden className="h-5 w-5 text-brand-600" />Current & upcoming programs</h2><Link to="/calendar" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">Full calendar</Link></div>
        <p className="mb-4 mt-2 text-sm text-slate-500">Active programs first, followed by the next scheduled dates.</p>
        {overview.error ? <LoadError message="The program list could not be loaded." onRetry={overview.reload} /> : !overview.data ? <Loading label="Loading accessible programs…" /> : !overview.data.programsEnabled ? <EmptyState title="Program access is unavailable" description="Your access may have changed. Refresh your account or contact Admin." /> : overview.data.programs.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">{overview.data.programs.map(program => <li key={program.id}>
          <Link to={program.to} className={`${linkRow} items-start px-0`}>
            <span className="min-w-0 flex-1"><strong className="block break-words text-sm font-semibold">{program.title}</strong>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">{formatDate(program.date)}{program.startTime && ` · ${program.startTime}${program.endTime ? `–${program.endTime}` : ''}`} · {program.barangay}</span>
              {program.location && <span className="mt-1 block break-words text-xs text-slate-500">{program.location}</span>}
              <span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${program.status === 'In progress' ? 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}>{program.status}</span>
            </span><ArrowUpRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
          </Link>
        </li>)}</ul> : <EmptyState title="No current or upcoming programs" description="Check recent programs or open Program day to plan the next one." />}
        <Link to={programsLink.node.to!} className={`${btnGhost} mt-4 w-full`}>{overview.data?.programsHasMore ? 'View all programs' : 'Open Program day'}</Link>
      </section>}
    </div>

    <section aria-labelledby="shortcuts-title">
      <h2 id="shortcuts-title" className="text-lg font-semibold">Quick access</h2>
      <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">{shortcuts.map(({ node }) => { const Icon = node.icon; return <Link key={node.id} to={node.to!} className={`${linkRow} border border-slate-200 dark:border-slate-700`}>{Icon && <Icon aria-hidden className="h-5 w-5 shrink-0 text-brand-600" />}<span className="min-w-0 flex-1 break-words text-sm font-medium">{t(node.label)}</span><ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400" /></Link>; })}</div>
      <details className="mt-4"><summary className="w-fit cursor-pointer rounded-lg py-2 text-sm font-medium text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300">All sections</summary><ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{links.map(({ node, ancestors }) => <li key={node.id}><Link to={node.to!} className={linkRow}><span className="min-w-0"><strong className="block text-sm font-medium">{t(node.label)}</strong>{ancestors[0] && <span className="block text-xs text-slate-500">{t(ancestors[0].label)}</span>}</span></Link></li>)}</ul></details>
    </section>

    <section aria-labelledby="recent-title" className={card} aria-busy={recent.loading}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="recent-title" className="text-lg font-semibold">Recent updates</h2><p className="mt-1 text-sm text-slate-500">The 10 latest record updates within your current access.</p></div><DataFreshness updatedAt={recent.updatedAt} loading={recent.loading} onRefresh={recent.reload} maxAgeMs={60000} /></div>
      <label className="my-4 inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={recentHistory} onChange={e => setRecentHistory(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />{t('search.history')}</label>
      {recent.error ? <LoadError message={recent.error.message} onRetry={recent.reload} /> : !recent.data ? <Loading label="Loading recent updates…" /> : !recent.data.data.length ? <EmptyState title="No recent updates" description="Record changes within your access will appear here." /> : <ul className="divide-y divide-slate-100 dark:divide-slate-800">{recent.data.data.map(item => <li key={item.key}><Link to={item.to} className={`${linkRow} flex-wrap sm:flex-nowrap`}><span className="min-w-0 flex-1"><strong className="block break-words text-sm font-medium">{item.label}</strong><span className="mt-1 block text-xs text-slate-500">{item.source} · {item.status}{item.history ? ' · History' : ''}</span></span><time dateTime={item.updatedAt} className="shrink-0 text-xs text-slate-500">{formatDate(item.updatedAt)}</time><ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400" /></Link></li>)}</ul>}
    </section>
    {typeof resumePath === 'string' && <Modal title="Continue where you left off?" onClose={closeResume}><p className="break-words text-sm text-slate-600 dark:text-slate-300">You last visited <span className="font-medium">{resumePath.split('?')[0].replaceAll('/', ' › ').slice(3) || 'the dashboard'}</span>.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={closeResume} className={btnGhost}>Go to dashboard</button><button type="button" onClick={() => navigate(resumePath, { replace: true, state: null })} className={btnPrimary}>Continue</button></div></Modal>}
  </div>;
}
