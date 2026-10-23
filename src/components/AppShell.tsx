import { DocumentReaderButton } from './DocumentReaderButton';
import { ArrowLeft, ArrowUp, Bell, Menu, X } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useT } from '../i18n';
import { filterNav, findActive, flatten, NAV, type NavNode } from '../nav/nav';
import { Sidebar } from './Sidebar';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useReportBasket } from '../lib/reportBasket';
import { Loading, Spinner } from './ui';
import { isAbort,readQueries } from '../lib/readQueries';
import { useNavigationBadges } from '../lib/useNavigationBadges';
import { UniversalSearch,type SearchResult } from './UniversalSearch';
import { previewSection } from '../../shared/search';
import { PageErrorBoundary } from './PageErrorBoundary';

const COLLAPSE_KEY = 'cv.nav.collapsed';

type Toast = { message: string; kind: 'success' | 'error'; undoToken?: string;undoLabel?:string };

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
  const { items: reportItems } = useReportBasket();
  const location = useLocation();
  const navigate = useNavigate();
  const nodes = useVisibleNav();
  const navigationPath=location.pathname==='/records/view'?previewSection(new URLSearchParams(location.search).get('source')??'',account?.type??''):location.pathname;
  const trail = useMemo(() => findActive(nodes, navigationPath), [nodes,navigationPath]);
  const activeId = trail?.node.id ?? null;
  const activeAncestors = useMemo(() => trail?.ancestors.map((node) => node.id) ?? (navigationPath==='/census/review'?['census','census-review']:navigationPath==='/registry'?['registry']:[]), [trail,navigationPath]);
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
  const [dbState, setDbState] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [errorLog, setErrorLog] = useState('');
  const navUpdates=useNavigationBadges();
  const unread=navUpdates.badges.inbox?.pending??0;
  const [toast, setToast] = useState<Toast | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [showReturnTop, setShowReturnTop] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    const check = async () => {
      try { await api('GET', '/health'); if (live) setDbState('connected'); }
      catch { if (live) setDbState('offline'); }
    };
    void check();
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void check();
    }, 60000);
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; status?: number }>).detail;
      const message = `${new Date().toLocaleTimeString()} · ${detail?.status ?? 'API'} · ${detail?.message ?? 'Request failed'}`;
      setErrorLog(message);
      setToast({ message: detail?.message ?? 'Request failed', kind: 'error' });
    };
    const onSuccess = (event: Event) => { const detail = (event as CustomEvent<{ message?: string; undoToken?: string;undoLabel?:string }>).detail; setToast({ message: detail?.message ?? 'Action completed successfully.', kind: 'success', undoToken: detail?.undoToken,undoLabel:detail?.undoLabel }); };
    const onRequestStart = () => setPendingWrites((count) => count + 1);
    const onRequestEnd = () => setPendingWrites((count) => Math.max(0, count - 1));
    window.addEventListener('cv:api-error', onError);
    window.addEventListener('cv:api-success', onSuccess);
    window.addEventListener('cv:api-request-start', onRequestStart);
    window.addEventListener('cv:api-request-end', onRequestEnd);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('cv:api-error', onError);
      window.removeEventListener('cv:api-success', onSuccess);
      window.removeEventListener('cv:api-request-start', onRequestStart);
      window.removeEventListener('cv:api-request-end', onRequestEnd);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), toast.undoToken ? 5 * 60_000 : 6000);
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
    <div className="flex h-dvh gap-3 p-3 print:block print:h-auto print:p-0">
      <aside className={`hidden shrink-0 transition-[width] duration-200 md:block print:hidden ${collapsed ? 'w-[76px]' : 'w-72'}`}>
        <Sidebar nodes={nodes} activeId={activeId} activeAncestors={activeAncestors} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} badges={navUpdates.badges} badgeError={!!navUpdates.error} refreshBadges={navUpdates.reload}/>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col print:block">
        <header className="mb-3 flex items-center gap-3 md:hidden print:hidden">
          <button type="button" onClick={() => setDrawer(true)} aria-label={t('nav.menu')}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-800 dark:bg-surface-dark dark:text-slate-300">
            <Menu aria-hidden className="h-5 w-5" />
          </button>
          <p className="hidden truncate text-sm font-semibold sm:block">{t('app.name')}</p>
          <UniversalSearch value={search} onChange={changeSearch} results={searchResults} loading={searchLoading} error={searchError} includeHistory={includeHistory} onHistory={changeHistory} hasMore={searchHasMore} onRetry={()=>setSearchRevision(v=>v+1)} />
          <Link to="/report-basket" className="relative rounded-lg border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">Basket{reportItems.length > 0 && <span className="ml-1 rounded-full bg-brand-700 px-1.5 text-white">{reportItems.length}</span>}</Link>
          <Link to="/inbox" aria-label={`Notifications, ${unread} unread`} className="relative shrink-0 rounded-xl p-2.5 text-slate-600 dark:text-slate-300"><Bell aria-hidden className="h-5 w-5"/>{unread>0&&<span className="absolute right-0 top-0 rounded-full bg-red-600 px-1 text-[10px] text-white">{unread}</span>}</Link>
        </header>
        <header className="mb-3 hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-panel dark:border-slate-800 dark:bg-surface-dark md:flex print:hidden">
          <UniversalSearch value={search} onChange={changeSearch} results={searchResults} loading={searchLoading} error={searchError} includeHistory={includeHistory} onHistory={changeHistory} hasMore={searchHasMore} onRetry={()=>setSearchRevision(v=>v+1)} />
          <Link to="/report-basket" className="relative rounded-lg border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">Report basket{reportItems.length > 0 && <span className="ml-1 rounded-full bg-brand-700 px-1.5 text-white">{reportItems.length}</span>}</Link>
          <Link to="/inbox" aria-label={`Notifications, ${unread} unread`} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Bell aria-hidden className="h-5 w-5" />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] text-white">{unread}</span>}</Link>
          <span title={errorLog ? `Last API error: ${errorLog}` : 'API and database health'} className={`rounded-full px-2.5 py-1 text-xs ${dbState === 'connected' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : dbState === 'offline' ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-amber-50 text-amber-700'}`}>Database {dbState}</span>
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-panel dark:border-slate-800 dark:bg-surface-dark md:p-8 print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none">
          {!['/dashboard', '/programs', '/program-day'].includes(location.pathname) && <div className="mb-4 print:hidden"><button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300 dark:hover:bg-slate-800"><ArrowLeft aria-hidden className="h-4 w-4" />{t('common.back')}</button></div>}
          {pendingWrites > 0 && <div className="fixed left-4 bottom-4 z-[60] rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-medium text-brand-800 shadow-lg dark:border-brand-900 dark:bg-surface-dark dark:text-brand-100"><Spinner /></div>}
          <div key={location.pathname} className="page-transition"><PageErrorBoundary key={`${location.pathname}${location.search}`}><Suspense fallback={<Loading label="Loading page…" />}><div className="mb-4 flex justify-end print:hidden"><DocumentReaderButton/></div><Outlet /></Suspense></PageErrorBoundary></div>
        </main>
      </div>

      {toast && <div role={toast.kind === 'error' ? 'alert' : 'status'} aria-live={toast.kind === 'error' ? 'assertive' : 'polite'} className={`ui-toast fixed right-4 top-4 z-[61] flex w-[calc(100vw-2rem)] max-w-sm items-start gap-3 rounded-xl border p-3 text-sm shadow-lg ${toast.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'}`}><div className="min-w-0 flex-1 break-words">{toast.message}{toast.undoToken && <div className="mt-1"><button type="button" className="min-h-11 font-semibold underline" onClick={() => { const token = toast.undoToken!; setToast(null); void api<{undoToken:string;undoLabel:string}>('POST', `/undo/${token}`, {direction:toast.undoLabel==='Redo'?'redo':'undo'}).then(result => setToast({message:toast.undoLabel==='Redo'?'Change restored.':'Change undone.',kind:'success',undoToken:result.undoToken,undoLabel:result.undoLabel})); }}>{toast.undoLabel??'Undo'} · 5 min</button></div>}</div><button type="button" aria-label={t('common.close')} onClick={() => setToast(null)} className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><X aria-hidden className="h-4 w-4" /></button></div>}
      {showReturnTop && <button type="button" onClick={() => document.getElementById('main')?.scrollTo({ top: 0, behavior: 'smooth' })} className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 print:hidden"><ArrowUp aria-hidden className="h-4 w-4" />Return to Top</button>}

      {drawer && createPortal(
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
          <button type="button" aria-label={t('nav.close')} tabIndex={-1} onClick={() => setDrawer(false)} className="absolute inset-0 bg-slate-900/50" />
          <div className="absolute inset-y-0 left-0 w-[19rem] max-w-[88vw] p-3">
            <button ref={closeRef} type="button" onClick={() => setDrawer(false)} aria-label={t('nav.close')}
              className="absolute right-5 top-5 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800">
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
