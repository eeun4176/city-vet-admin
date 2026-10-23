import { useRecordSelection,SelectionBar,exportSelectedCsv } from '../../lib/useRecordSelection';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useState } from 'react';
import { Loading, Notice, StatusBadge, btnGhost, btnPrimary, formatDate } from '../../components/ui';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n/messages';
import type { SubmissionSummary } from '../../lib/census';
import { useApi, useDebouncedValue } from '../../lib/useApi';
import { useReportBasket } from '../../lib/reportBasket';

const PAGE_SIZE = 20;
interface Page { data: SubmissionSummary[]; total: number; page: number; pageSize: number }

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const { t } = useT();
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (last === 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={btnGhost}>{t('common.previous')}</button>
      <span>{t('common.page', { page })} / {last}</span>
      <button type="button" disabled={page >= last} onClick={() => onPage(page + 1)} className={btnGhost}>{t('common.next')}</button>
    </div>
  );
}

function Counts({ s }: { s: SubmissionSummary }) {
  const { t } = useT();
  return <>{t('census.counts', { owners: s.ownerCount, pets: s.petCount })}{s.attachmentCount > 0 && ` · ${t('census.counts.photos', { photos: s.attachmentCount })}`}</>;
}

function ListFilters({ query, setQuery, year, setYear, month, setMonth, sort, setSort, dir, setDir, onClear }: {
  query: string; setQuery: (v: string) => void; year: string; setYear: (v: string) => void;
  month: string; setMonth: (v: string) => void; sort: string; setSort: (v: string) => void;
  dir: 'asc' | 'desc'; setDir: (v: 'asc' | 'desc') => void;
  onClear: () => void;
}) {
  return <div className="mt-4 flex flex-wrap items-end gap-3">
    <label className="text-xs text-slate-500">Search<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title, barangay, submitter" className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
    <label className="text-xs text-slate-500">Sort<select value={sort} onChange={(e) => setSort(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900">{[['created','Recently submitted'],['date','Census date'],['barangay','Barangay'],['title','Title'],['submitter','Submitter'],['status','Status'],['owners','Owner count'],['pets','Pet count']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label className="text-xs text-slate-500">Direction<select value={dir} onChange={(e) => setDir(e.target.value as 'asc' | 'desc')} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
    <label className="text-xs text-slate-500">Year<input type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 block w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
    <label className="text-xs text-slate-500">Month<select value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">All</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('en', { month: 'long' })}</option>)}</select></label>
    <button type="button" onClick={onClear} className={btnGhost}>Clear filters</button>
  </div>;
}

/** Paravet: their own submissions with status and the reviewer's reason when rejected. */
export function MySubmissionsPage() {
  const { t } = useT();
  const { addRows } = useReportBasket();
  const [basketMessage, setBasketMessage] = useState('');
  const location = useLocation();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim());
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [sort, setSort] = useState('created');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const search = new URLSearchParams({ status: 'all', page: String(page), pageSize: String(PAGE_SIZE), sort, dir });
  if (debouncedQuery) search.set('q', debouncedQuery);
  if (year) search.set('year', year);
  if (month) search.set('month', month);
  const { data, loading, error } = useApi<Page>(`/census/submissions?${search.toString()}`);
  const selectionScope=new URLSearchParams(search);selectionScope.delete('page');
  const bulk=useRecordSelection(selectionScope.toString());
  const bulkPath=`/census/submissions?${selectionScope}`;
  const notice = (location.state as { notice?: string } | null)?.notice;
  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('census.mine.title')}</h1>
        <div className="flex gap-2">
          <Link to="/census/new" className={btnPrimary}>{t('nav.censusSubmit')}</Link>
          <Link to="/census/import" className={btnGhost}>{t('nav.censusImport')}</Link>
        </div>
      </div>
      {notice && <div className="mt-4"><Notice kind="success">{notice}</Notice></div>}
      {basketMessage && <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{basketMessage}</p>}
      <ListFilters query={query} setQuery={(value) => { setQuery(value); setPage(1); }} year={year} setYear={(value) => { setYear(value); setPage(1); }} month={month} setMonth={(value) => { setMonth(value); setPage(1); }} sort={sort} setSort={(value) => { setSort(value); setPage(1); }} dir={dir} setDir={(value) => { setDir(value); setPage(1); }} onClear={() => { setQuery(''); setYear(''); setMonth(''); setSort('created'); setDir('desc'); setPage(1); }} />
      <SelectionBar selection={bulk} total={data?.total??0} rows={data?.data??[]}><button className={btnGhost} disabled={!bulk.count(data?.total??0)} onClick={()=>void bulk.resolve<SubmissionSummary>(bulkPath,300).then(rows=>{addRows('Census submissions',rows.map(s=>({...s})));setBasketMessage('Selected submissions added to report basket.');}).catch(e=>setBasketMessage(e.message))}>Add selected to report</button><button className={btnGhost} disabled={!bulk.count(data?.total??0)} onClick={()=>void bulk.resolve<SubmissionSummary>(bulkPath).then(rows=>exportSelectedCsv(rows.map(s=>({...s})),'census-selected')).catch(e=>setBasketMessage(e.message))}>Export selected</button></SelectionBar>
      {loading && <Loading />}
      {error && <div className="mt-4"><Notice kind="error">{error.message}</Notice></div>}
      {data && !data.data.length && <p className="py-10 text-center text-sm text-slate-500">{t('census.mine.empty')}</p>}
      {data && data.data.length > 0 && (
        <ul className="mt-5 space-y-3">
          {data.data.map((s) => (
            <li key={s.id}><label className="mb-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`Select ${s.label}`} checked={bulk.has(s.id)} onChange={()=>bulk.toggle(s.id)}/>Select submission</label>
              <Link to={`/census/mine/${s.id}`} className="block rounded-2xl border border-slate-200 p-4 transition-colors hover:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{s.label}</span><StatusBadge status={s.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{formatDate(s.censusDate)} · {t(`census.source.${s.source}` as MessageKey)} · <Counts s={s} /></p>
                {s.status === 'rejected' && s.reviewNote && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{t('census.detail.reason')}: {s.reviewNote}</p>}
              </Link>
              <button type="button" className="mt-1 text-xs text-teal-800 underline dark:text-teal-300" onClick={() => { const result = addRows('Census submissions', [{ id: s.id, label: s.label, status: s.status, censusDate: s.censusDate, source: s.source, barangay: s.barangay, householdsVisited: s.householdsVisited, ownerCount: s.ownerCount, petCount: s.petCount, reviewNote: s.reviewNote ?? '' }]); setBasketMessage(`${result.added ? 'Submission added' : 'Submission updated'}.`); }}>Add submission to report</button>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
    </div>
  );
}

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;

/** Staff: submissions by status. The detail page lives under the same URL prefix so the menu stays highlighted. */
export function ReviewListPage({ status }: { status?: (typeof REVIEW_STATUSES)[number] }) {
  const { t } = useT();
  const { addRows } = useReportBasket();
  const [basketMessage, setBasketMessage] = useState('');
  const params = useParams();
  const current = status ?? (REVIEW_STATUSES.find((value) => value === params.status) ?? 'pending');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim());
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [sort, setSort] = useState('created');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const search = new URLSearchParams({ status: current, page: String(page), pageSize: String(PAGE_SIZE), sort, dir });
  if (debouncedQuery) search.set('q', debouncedQuery);
  if (year) search.set('year', year);
  if (month) search.set('month', month);
  const { data, loading, error } = useApi<Page>(`/census/submissions?${search.toString()}`);
  const selectionScope=new URLSearchParams(search);selectionScope.delete('page');
  const bulk=useRecordSelection(selectionScope.toString());
  const bulkPath=`/census/submissions?${selectionScope}`;
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t('census.review.title')} · {t(`census.status.${current}` as MessageKey)}</h1>
      <ListFilters query={query} setQuery={(value) => { setQuery(value); setPage(1); }} year={year} setYear={(value) => { setYear(value); setPage(1); }} month={month} setMonth={(value) => { setMonth(value); setPage(1); }} sort={sort} setSort={(value) => { setSort(value); setPage(1); }} dir={dir} setDir={(value) => { setDir(value); setPage(1); }} onClear={() => { setQuery(''); setYear(''); setMonth(''); setSort('created'); setDir('desc'); setPage(1); }} />
      {basketMessage && <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{basketMessage}</p>}
      <SelectionBar selection={bulk} total={data?.total??0} rows={data?.data??[]}><button className={btnGhost} disabled={!bulk.count(data?.total??0)} onClick={()=>void bulk.resolve<SubmissionSummary>(bulkPath,300).then(rows=>{addRows('Census submissions',rows.map(s=>({...s})));setBasketMessage('Selected submissions added to report basket.');}).catch(e=>setBasketMessage(e.message))}>Add selected to report</button><button className={btnGhost} disabled={!bulk.count(data?.total??0)} onClick={()=>void bulk.resolve<SubmissionSummary>(bulkPath).then(rows=>exportSelectedCsv(rows.map(s=>({...s})),'census-selected')).catch(e=>setBasketMessage(e.message))}>Export selected</button></SelectionBar>
      {loading && <Loading />}
      {error && <div className="mt-4"><Notice kind="error">{error.message}</Notice></div>}
      {data && !data.data.length && <p className="py-10 text-center text-sm text-slate-500">{t('census.review.empty')}</p>}
      {data && data.data.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
              <tr><th className="p-3">Select</th>{(['census.col.barangay', 'census.col.title', 'census.col.submitter', 'census.col.date', 'census.col.counts', 'census.col.status'] as MessageKey[]).map((key) => <th key={key} scope="col" className="px-4 py-2.5 font-medium">{t(key)}</th>)}<th className="px-4 py-2.5 font-medium">Report</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.data.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="p-3"><input type="checkbox" aria-label={`Select ${s.label}`} checked={bulk.has(s.id)} onChange={()=>bulk.toggle(s.id)}/></td>
                  <td className="px-4 py-3">{s.barangay}</td>
                  <td className="px-4 py-3"><Link to={`/census/review/${current}/${s.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-200">{s.label}</Link></td>
                  <td className="px-4 py-3">{s.submitter}</td>
                  <td className="px-4 py-3">{formatDate(s.censusDate)}</td>
                  <td className="px-4 py-3"><Counts s={s} /></td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3"><button type="button" className="text-teal-800 underline dark:text-teal-300" onClick={() => { const result = addRows('Census submissions', [{ id: s.id, label: s.label, status: s.status, censusDate: s.censusDate, source: s.source, barangay: s.barangay, submitter: s.submitter, householdsVisited: s.householdsVisited, ownerCount: s.ownerCount, petCount: s.petCount }]); setBasketMessage(`${result.added ? 'Submission added' : 'Submission updated'}.`); }}>Add</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
    </div>
  );
}
