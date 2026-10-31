import { ArrowLeft, Bell, ChevronUp, CircleAlert, CircleCheck, Database, Menu, RefreshCw, X } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Lenis from 'lenis';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useT } from '../i18n';
import { filterNav, findActive, flatten, NAV, type NavNode } from '../nav/nav';
import { Sidebar } from './Sidebar';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Loading, Spinner } from './ui';
import { isAbort,readQueries } from '../lib/readQueries';
import { useNavigationBadges } from '../lib/useNavigationBadges';
import { databaseStatus } from '../lib/databaseStatus';
import { UniversalSearch,type SearchResult } from './UniversalSearch';
import { previewSection } from '../../shared/search';
import { PageErrorBoundary } from './PageErrorBoundary';

const COLLAPSE_KEY = 'cv.nav.collapsed';

type Toast = { message: string; kind: 'success' | 'error'; undoToken?: string;undoLabel?:string;refresh?:boolean };
const toastMs = (toast: Toast) => toast.undoToken ? 5 * 60_000 : toast.refresh ? 20_000 : 6000;

export function useVisibleNav(): NavNode[] {
  const { can, featureEnabled } = useAuth();
  return useMemo(
    () => filterNav(NAV.flatMap((section) => section.nodes), (node) => (!node.cap || can(node.cap)) && featureEnabled(node.feature)),
    [can, featureEnabled],
  );
}

export function AppShell() {
  const { t } = useT();
  const { account } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const nodes = useVisibleNav();
  const navigationPath=location.pathname==='/records/view'?previewSection(new URLSearchParams(location.search).get('source')??'',account?.type??''):location.pathname;
  const trail = useMemo(() => findActive(nodes, navigationPath), [nodes,navigationPath]);
  const activeId = trail?.node.id ?? null;
  const activeAncestors = useMemo(() => trail?.ancestors.map((node) => node.id) ?? (navigationPath==='/census/review'?['census']:navigationPath==='/registry'?['registry']:[]), [trail,navigationPath]);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [includeHistory,setIncludeHistory]=useState(false);
  const [searchHasMore,setSearchHasMore]=useState(false);
  const [searchRevision,setSearchRevision]=useState(0);
  const changeSearch=(value:string)=>{setSearch(value);setSearchResults([]);setSearchLoading(value.trim().length>=2);};
  const changeHistory=(value:boolean)=>{setIncludeHistory(value);setSearchResults([]);setSearchLoading(search.trim().length>=2);};
  useEffect(()=>readQueries.subscribe(()=>setSearchRevision(v=>v+1)),[]);
  useEffect(()=>{setSearch('');setSearchResults([]);setIncludeHistory(false);},[account?.id]);
  const [dbState, setDbState] = useState<'checking' | 'connected' | 'failed'>('checking');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [errorLog, setErrorLog] = useState('');
  const navUpdates=useNavigationBadges();
  const unread=navUpdates.badges.inbox?.pending??0;
  const [toast, setToast] = useState<Toast | null>(null);
  const toastKey = useMemo(() => Math.random(), [toast]);
  // Every page's reads, fetched again: the header button, and the toast when other staff add records.
  const refreshAll = () => { readQueries.invalidate('write'); navUpdates.reload(); };
  // Changes right after this user saved are their own, not news.
  const lastWrite = useRef(0);
  const seenBadges = useRef<Record<string, { pending: number; updated: boolean }> | null>(null);
  useEffect(() => {
    const badges = navUpdates.badges;
    if (!Object.keys(badges).length) return;
    const previous = seenBadges.current; seenBadges.current = badges;
    // The 60-second badge poll shows a section with new or more pending records than before (the inbox has its own bell).
    if (previous && Date.now() - lastWrite.current > 15_000 && Object.entries(badges).some(([node, badge]) => node !== 'inbox' && ((badge.updated && !previous[node]?.updated) || badge.pending > (previous[node]?.pending ?? 0)))) setToast({ message: 'New records were added by other staff.', kind: 'success', refresh: true });
  }, [navUpdates.badges]);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [showReturnTop, setShowReturnTop] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const db = databaseStatus(online, dbState);
  // Back only on pages reached from another page (a record, a submission); sidebar pages don't need it.
  const showBack = !['/dashboard', '/inbox', '/settings', '/account'].includes(location.pathname) && !flatten(nodes).some(({ node }) => node.to === location.pathname);
  // Opened directly (a bookmark, a new tab): there is no page to go back to inside the app.
  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? navigate(-1) : navigate(trail?.node.to ?? '/dashboard');
  // The database icon appears only when something is wrong.
  const dbProblem = db === 'error' || db === 'offline';
  const dbDot = <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${db === 'active' ? 'bg-brand-500' : db === 'loading' ? 'bg-amber-500 motion-safe:animate-pulse' : db === 'error' ? 'bg-red-600' : 'bg-slate-400'}`} />;

  useEffect(() => {
    let live = true;
    const check = async () => {
      try { await api('GET', '/health'); if (live) setDbState('connected'); }
      catch { if (live) setDbState('failed'); }
    };
    void check();
    const timer = window.setInterval(() => {
      if (document.hidden || !navigator.onLine) return;
      void check();
    }, 60000);
    const onOnline = () => { setOnline(true); setDbState('checking'); void check(); };
    const onOffline = () => setOnline(false);
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; status?: number }>).detail;
      const message = `${new Date().toLocaleTimeString()} · ${detail?.status ?? 'API'} · ${detail?.message ?? 'Request failed'}`;
      setErrorLog(message);
      setToast({ message: detail?.message ?? 'Request failed', kind: 'error' });
    };
    const onSuccess = (event: Event) => { const detail = (event as CustomEvent<{ message?: string; undoToken?: string;undoLabel?:string }>).detail; setToast({ message: detail?.message ?? 'Action completed successfully.', kind: 'success', undoToken: detail?.undoToken,undoLabel:detail?.undoLabel }); };
    const onRequestStart = () => setPendingWrites((count) => count + 1);
    const onRequestEnd = () => { lastWrite.current = Date.now(); setPendingWrites((count) => Math.max(0, count - 1)); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('cv:api-error', onError);
    window.addEventListener('cv:api-success', onSuccess);
    window.addEventListener('cv:api-request-start', onRequestStart);
    window.addEventListener('cv:api-request-end', onRequestEnd);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('cv:api-error', onError);
      window.removeEventListener('cv:api-success', onSuccess);
      window.removeEventListener('cv:api-request-start', onRequestStart);
      window.removeEventListener('cv:api-request-end', onRequestEnd);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), toastMs(toast));
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (!errorLog) return;
    const timeout = window.setTimeout(() => setErrorLog(''), 5 * 60_000);
    return () => window.clearTimeout(timeout);
  }, [errorLog]);
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearchError('');
      setSearchLoading(false);
      return;
    }
    let live = true;
    const pages = flatten(nodes)
      .filter(({ node }) => node.to && t(node.label).toLowerCase().includes(term.toLowerCase()))
      .map(({ node }) => ({ key:`page:${node.id}`,kind: 'page', dataset: 'navigation', id: node.id, label: t(node.label), detail: t('search.page'), to: node.to! }));
    const controller = new AbortController();
    setSearchLoading(true);setSearchResults([]);setSearchError('');
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      void api<{ data: SearchResult[];hasMore:boolean }>('GET', `/search?q=${encodeURIComponent(term)}&includeHistory=${includeHistory}`, undefined, { signal: controller.signal })
        .then((result) => { if (live) { setSearchResults([...pages, ...result.data].slice(0, 30));setSearchHasMore(result.hasMore||pages.length+result.data.length>30); setSearchError(''); } })
        .catch((error: unknown) => { if (live && !isAbort(error)) { setSearchResults([]); setSearchError(error instanceof Error ? error.message : t('search.failed')); } })
        .finally(() => { if (live) setSearchLoading(false); });
    }, 300);
    return () => { live = false; controller.abort(); window.clearTimeout(timer); };
  }, [search,includeHistory,searchRevision,account?.id,account?.barangayId,t,nodes]);

  const toggleCollapsed = () => setCollapsed((value) => {
    try { localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1'); } catch { /* storage unavailable */ }
    return !value;
  });

  useEffect(() => setDrawer(false), [location.pathname]);
  // Smooth wheel scrolling on the page area, as in e-Vet Field (skipped under reduced motion). Nested scroll areas, menus and dialogs keep native scrolling.
  useEffect(() => {
    const main = document.getElementById('main');
    if (!main || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ wrapper: main, content: main, autoRaf: true, lerp: 0.1, naiveDimensions: true, allowNestedScroll: true, prevent: (node) => node.closest('[role="dialog"], [data-lenis-prevent]') !== null });
    lenisRef.current = lenis;
    return () => { lenisRef.current = null; lenis.destroy(); };
  }, []);
  useEffect(() => {
    const main = document.getElementById('main');
    if (!main) return;
    const onScroll = () => setShowReturnTop(main.scrollTop > 500);
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!account || location.pathname === '/dashboard' || location.pathname === '/login') return;
    try { localStorage.setItem(`cv.last-page.${account.id}`, `${location.pathname}${location.search}`); } catch { /* storage unavailable */ }
  }, [account, location.pathname, location.search]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawer(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [drawer]);

  return (
    <div className="flex h-dvh print:block print:h-auto">
      <aside className={`hidden shrink-0 p-3 transition-[width] duration-[640ms] ease-spring motion-reduce:transition-none md:block print:hidden ${collapsed ? 'w-[88px]' : 'w-[288px]'}`}>
        <Sidebar nodes={nodes} activeId={activeId} activeAncestors={activeAncestors} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} badges={navUpdates.badges} badgeError={!!navUpdates.error} refreshBadges={navUpdates.reload}/>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col p-3 md:bg-white md:p-0 md:dark:bg-surface-dark print:block print:p-0">
        <header className="mb-3 flex items-center gap-3 md:hidden print:hidden">
          <button type="button" onClick={() => setDrawer(true)} aria-label={t('nav.menu')}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-night-border dark:bg-surface-dark dark:text-night-muted">
            <Menu aria-hidden className="h-5 w-5" />
          </button>
          <p className="hidden truncate text-sm font-semibold sm:block">{t('app.name')}</p>
          <UniversalSearch value={search} onChange={changeSearch} results={searchResults} loading={searchLoading} error={searchError} includeHistory={includeHistory} onHistory={changeHistory} hasMore={searchHasMore} onRetry={()=>setSearchRevision(v=>v+1)} />
          {dbProblem && <span role="status" aria-label={t(`db.${db}`)} title={errorLog ? t('db.lastError', { message: errorLog }) : t(`db.${db}`)} className="relative grid h-9 w-9 shrink-0 place-items-center text-slate-500 dark:text-night-muted"><Database aria-hidden strokeWidth={1.9} className="h-[18px] w-[18px]" /><span className="absolute right-1.5 top-1.5 flex rounded-full ring-2 ring-canvas dark:ring-canvas-dark">{dbDot}</span></span>}
          <button type="button" onClick={refreshAll} aria-label="Refresh data" title="Refresh data" className="shrink-0 rounded-xl p-2.5 text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-night-muted"><RefreshCw aria-hidden className="h-5 w-5" /></button>
          <Link to="/inbox" aria-label={`Notifications, ${unread} unread`} className="relative shrink-0 rounded-xl p-2.5 text-slate-600 dark:text-night-muted"><Bell aria-hidden className="h-5 w-5"/>{unread>0&&<span className="absolute right-0 top-0 rounded-full bg-red-600 px-1 text-[10px] text-white">{unread}</span>}</Link>
        </header>
        <header className="hidden h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-8 dark:border-night-border md:flex print:hidden">
          <UniversalSearch value={search} onChange={changeSearch} results={searchResults} loading={searchLoading} error={searchError} includeHistory={includeHistory} onHistory={changeHistory} hasMore={searchHasMore} onRetry={()=>setSearchRevision(v=>v+1)} />
          <button type="button" onClick={refreshAll} aria-label="Refresh data" title="Refresh data" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-night-muted dark:hover:bg-night-tile"><RefreshCw aria-hidden className="h-5 w-5" /></button>
          <Link to="/inbox" aria-label={`Notifications, ${unread} unread`} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-night-muted dark:hover:bg-night-tile"><Bell aria-hidden className="h-5 w-5" />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] text-white">{unread}</span>}</Link>
          {dbProblem && <span role="status" aria-label={t(`db.${db}`)} title={errorLog ? t('db.lastError', { message: errorLog }) : `${t('db.title')}: ${t(`db.${db}`)}`} className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 dark:text-night-muted"><Database aria-hidden strokeWidth={1.9} className="h-[18px] w-[18px]" /><span className="absolute right-1.5 top-1.5 flex rounded-full ring-2 ring-white dark:ring-surface-dark">{dbDot}</span></span>}
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-panel dark:border-night-border dark:bg-surface-dark md:rounded-none md:border-0 md:px-8 md:py-6 md:shadow-none print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none">
          {/* Back sits above the page. */}
          {showBack && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden"><button type="button" onClick={goBack} className="-ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-night-muted dark:hover:bg-night-tile"><ArrowLeft aria-hidden className="h-4 w-4" />{t('common.back')}</button></div>}
          {pendingWrites > 0 && <div className="fixed left-4 bottom-4 z-[60] rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-medium text-brand-800 shadow-lg dark:border-brand-900 dark:bg-surface-dark dark:text-brand-500"><Spinner /></div>}
          <div key={location.pathname} className="page-transition"><PageErrorBoundary key={location.pathname} resetKey={location.search}><Suspense fallback={<Loading label="Loading page…" />}><Outlet /></Suspense></PageErrorBoundary></div>
        </main>
      </div>

      {/* Bottom-centre toast as in e-Vet Field: a dark pill whose timer line shrinks until it closes. */}
      {toast && <div key={toastKey} role={toast.kind === 'error' ? 'alert' : 'status'} aria-live={toast.kind === 'error' ? 'assertive' : 'polite'} style={{ '--toast-ms': `${toastMs(toast)}ms` } as CSSProperties} className="ui-toast fixed inset-x-0 bottom-6 z-[61] mx-auto flex w-[calc(100vw-2rem)] max-w-md items-center gap-3 overflow-hidden rounded-xl bg-[#1d1f1e] px-4 py-3 text-sm text-white shadow-lg ring-1 ring-white/10 dark:bg-night-dialog print:hidden">
        {toast.kind === 'error' ? <CircleAlert aria-hidden className="h-4 w-4 shrink-0 text-red-400" /> : <CircleCheck aria-hidden className="h-4 w-4 shrink-0 text-[#5BE3A0]" />}
        <div className="min-w-0 flex-1 break-words">{toast.message}</div>
        {toast.refresh && <button type="button" className="shrink-0 rounded-md px-1.5 py-0.5 font-semibold text-[#5BE3A0] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5BE3A0]" onClick={() => { setToast(null); refreshAll(); }}>Refresh</button>}
        {toast.undoToken && <button type="button" title="Available for 5 minutes" className="shrink-0 rounded-md px-1.5 py-0.5 font-semibold text-[#5BE3A0] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5BE3A0]" onClick={() => { const token = toast.undoToken!; setToast(null); void api<{undoToken:string;undoLabel:string}>('POST', `/undo/${token}`, {direction:toast.undoLabel==='Redo'?'redo':'undo'}).then(result => setToast({message:toast.undoLabel==='Redo'?'Change restored.':'Change undone.',kind:'success',undoToken:result.undoToken,undoLabel:result.undoLabel})); }}>{toast.undoLabel??'Undo'}</button>}
        <button type="button" aria-label={t('common.close')} onClick={() => setToast(null)} className="shrink-0 rounded-md p-0.5 text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"><X aria-hidden className="h-4 w-4" /></button>
        <span aria-hidden className={`toast-timer absolute inset-x-0 bottom-0 h-[3px] ${toast.kind === 'error' ? 'bg-red-400' : 'bg-[#5BE3A0]'}`} />
      </div>}
      {showReturnTop && <button type="button" onClick={() => lenisRef.current ? lenisRef.current.scrollTo(0) : document.getElementById('main')?.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Return to top" title="Return to top" className="fixed bottom-6 right-6 z-40 grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-panel hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-night-border dark:bg-surface-bar dark:text-night-text dark:hover:bg-night-tile print:hidden"><ChevronUp aria-hidden strokeWidth={2.2} className="h-5 w-5" /></button>}

      {drawer && createPortal(
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
          <button type="button" aria-label={t('nav.close')} tabIndex={-1} onClick={() => setDrawer(false)} className="absolute inset-0 bg-slate-900/50" />
          <div className="absolute inset-y-0 left-0 w-[19rem] max-w-[88vw] p-3">
            <button ref={closeRef} type="button" onClick={() => setDrawer(false)} aria-label={t('nav.close')}
              className="absolute right-5 top-5 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-night-tile">
              <X aria-hidden className="h-4 w-4" />
            </button>
            <Sidebar nodes={nodes} activeId={activeId} activeAncestors={activeAncestors} collapsed={false} onNavigate={() => setDrawer(false)} badges={navUpdates.badges} badgeError={!!navUpdates.error} refreshBadges={navUpdates.reload}/>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
