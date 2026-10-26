import { useRecordSelection,SelectionBar,exportSelectedCsv } from '../lib/useRecordSelection';
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarDays, Clock3, MapPin, Pencil, Play, RefreshCw, Square, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PROGRAM_PROCESSES, PROGRAM_STATUSES, type ProgramProcess } from '../../shared/programs';
import { timingSummary, type ProgramGroup, type WorkspaceDetail, type WorkspaceList, type WorkspaceProgram } from '../../shared/programWorkspace';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi, useDebouncedValue } from '../lib/useApi';
import { InfoTip, Check, Field, Loading, Modal, Notice, Pagination, Spinner, btnGhost, btnPrimary, formatDate, inputCls, tabItem, tabList, Select, districtOptions } from '../components/ui';
import { DataFreshness } from '../components/DataFreshness';
import './program-workspace.css';

const CampaignDetails = lazy(() => import('./ProgramInterestPage').then(module => ({default:module.CampaignDetails})));
const StubWorkflowPage = lazy(() => import('./StubWorkflowPage').then(module => ({default:module.StubWorkflowPage})));

const card = 'rounded-2xl border border-slate-200 bg-white p-5 dark:border-night-border dark:bg-surface-dark';
const groups: { id: ProgramGroup; label: string }[] = [{ id: 'current', label: 'Current' }, { id: 'upcoming', label: 'Upcoming' }, { id: 'recent', label: 'Recent and previous' }];
const tabs = ['Overview', 'Interest', 'Stubs', 'Attendance'] as const;
type Tab = typeof tabs[number];
const minutesLabel = (minutes: number | null) => minutes === null ? 'Not recorded' : `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} hr ` : ''}${minutes % 60 || minutes === 0 ? `${minutes % 60} min` : ''}`.trim();
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const localTime = (value = new Date().toISOString()) => new Date(value).toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).slice(0, 16).replace(' ', 'T');
const today = () => localTime().slice(0, 10);
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Could not save. Please try again.';
const Status = ({ status }: { status: string }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'In progress' ? 'bg-brand-50 text-brand-800 dark:bg-brand-900 dark:text-brand-300' : status === 'Completed' ? 'bg-slate-100 text-slate-700 dark:bg-night-tile dark:text-night-text' : ['Cancelled', 'Postponed'].includes(status) ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100' : 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200'}`}>{status}</span>;

export function ProgramWorkspacePage() {
  const { account } = useAuth();
  const isAdmin = account?.type === 'Admin' || account?.type === 'SuperAdmin';
  const [params, setParams] = useSearchParams();
  const rawId = params.get('program');
  const legacyRecordId = params.get('recordId');
  const programId = rawId && /^[1-9]\d*$/.test(rawId) ? Number(rawId) : null;
  const group = (groups.some((item) => item.id === params.get('group')) ? params.get('group') : 'current') as ProgramGroup;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const [notice, setNotice] = useState('');
  const { data, loading, error, reload } = useApi<WorkspaceList>(rawId || legacyRecordId ? null : `/program-workspace?group=${group}&page=${page}&q=${encodeURIComponent(debounced)}`);
  const bulk=useRecordSelection(`${group}:${debounced}`);
  const bulkPath=`/program-workspace?group=${group}&q=${encodeURIComponent(debounced)}&pageSize=50`;
  const changeParams = (values: Record<string, string | null>) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(values)) value === null ? next.delete(key) : next.set(key, value);
    return next;
  });
  const openProgram = (id: number) => changeParams({ program: String(id), tab: null });
  if (!rawId && legacyRecordId) return <ProgramLink recordId={legacyRecordId} onBack={() => changeParams({ recordId: null })} />;
  if (rawId) return programId ? <ProgramDetail key={programId} programId={programId} isAdmin={isAdmin} onBack={() => changeParams({ program: null, tab: null })} /> : <div className="space-y-3"><Notice kind="error">Choose a valid program.</Notice><button className={btnGhost} onClick={() => changeParams({ program: null, tab: null })}>Back to programs</button></div>;
  return <div className="w-full space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">Field operations</p><h1 className="text-2xl font-semibold">Programs<InfoTip>Plan the day, follow participation, and keep paper encoding connected. New programs are scheduled from approved requests in Program interest.</InfoTip></h1></div><div className="flex flex-wrap gap-2"><Link to="/program-interest" className={btnGhost}>Demand lists and requests</Link></div></header>
    {notice && <Notice kind="success">{notice}</Notice>}
    <section className={`${card} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className={tabList} role="tablist" aria-label="Program periods">{groups.map((item) => <button key={item.id} role="tab" aria-selected={group === item.id} className={tabItem(group === item.id)} onClick={() => changeParams({ group: item.id, page: null })}>{item.label}<span className="rounded-full bg-slate-500/10 px-2 text-xs tabular-nums">{data?.counts[item.id] ?? '—'}</span></button>)}</div><button className={btnGhost} disabled={loading} onClick={reload} aria-label="Refresh programs">{loading ? <Spinner label="Refreshing…" /> : <RefreshCw className="h-4 w-4" />}</button></div>
      <input className={`${inputCls} sm:max-w-sm`} type="search" value={search} onChange={(event) => { setSearch(event.target.value); changeParams({ page: null }); }} placeholder="Search title or barangay…" aria-label="Search programs" />
      <SelectionBar selection={bulk} total={data?.total??0} rows={data?.data??[]}><button className={btnGhost} disabled={!bulk.count(data?.total??0)} onClick={()=>void bulk.resolve<WorkspaceProgram>(bulkPath).then(rows=>exportSelectedCsv(rows.map(p=>({...p})),'programs-selected')).catch(e=>setNotice(e.message))}>Export selected</button></SelectionBar>
      {error && <Notice kind="error">{error.message}</Notice>}
      {loading ? <Loading label="Loading programs and slot usage…" /> : <div role="tabpanel" className="program-view-enter">
        {!data?.data.length ? <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-night-border"><CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-400" /><h2 className="font-semibold">{search ? 'No matching programs' : group === 'current' ? 'No current program' : group === 'upcoming' ? 'No upcoming programs' : 'No previous programs'}</h2><p className="mt-2 text-sm text-slate-500">{search ? 'Try another title or barangay.' : 'New programs are scheduled from approved requests in Program interest.'}</p></div> : <div className="grid gap-4 md:grid-cols-2">{data.data.map((program) => <article key={program.id} className="min-w-0"><label className="mb-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`Select ${program.title}`} checked={bulk.has(program.id)} onChange={()=>bulk.toggle(program.id)}/>Select program</label><button className="program-card w-full flex flex-col gap-4 rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-night-border" onClick={() => openProgram(program.id)}>
          <div className="flex w-full items-start justify-between gap-3"><h2 className="font-semibold">{program.title}</h2><Status status={program.status} /></div><div className="space-y-2 text-sm text-slate-500"><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" />{formatDate(program.date)}{program.startTime ? ` · ${program.startTime}–${program.endTime}` : ''}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" />{program.hostBarangay}{program.location ? ` · ${program.location}` : ''}</p></div>
          <div className="mt-auto w-full border-t border-slate-100 pt-3 text-sm dark:border-night-border"><div className="flex justify-between gap-2"><span><strong>{program.slotsUsed}</strong>{program.slots === null ? ' pets attended' : ` / ${program.slots} pet slots`}</span><span className="font-medium text-brand-700 dark:text-brand-300">Open program →</span></div>{program.slots !== null && program.slotsUsed >= program.slots && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{program.slotsUsed > program.slots ? 'Above planned capacity' : 'Planned capacity reached'} · attendance remains available</p>}</div>
        </button></article>)}</div>}
        <Pagination page={data?.page ?? page} pageSize={data?.pageSize ?? 12} total={data?.total ?? 0} onPage={(value) => changeParams({ page: String(value) })} />
      </div>}
    </section>
  </div>;
}

function ProgramLink({ recordId, onBack }: { recordId: string; onBack: () => void }) {
  const [, setParams] = useSearchParams();
  const { data, error } = useApi<WorkspaceDetail>(`/program-workspace?recordId=${encodeURIComponent(recordId)}`);
  useEffect(() => { if (data) setParams((previous) => { const next = new URLSearchParams(previous); next.delete('recordId'); next.set('program', String(data.program.id)); return next; }, { replace: true }); }, [data, setParams]);
  return <section className={`${card} w-full`}>{error ? <div className="space-y-3"><Notice kind="error">{error.message}</Notice><button className={btnGhost} onClick={onBack}>Back to programs</button></div> : <Loading label="Opening the selected program…" />}</section>;
}

function ProgramDetail({ programId, isAdmin, onBack }: { programId: number; isAdmin: boolean; onBack: () => void }) {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = tabs.find((item) => item.toLowerCase() === params.get('tab')) ?? 'Overview';
  const { data, error, loading, reload, updatedAt } = useApi<WorkspaceDetail>(`/program-workspace?id=${programId}`, { refreshIntervalMs: 30000, refreshWhen: (value) => Boolean(value && ['Open', 'In progress'].includes(value.program.status) && value.program.date <= today() && value.program.campaignStatus !== 'closed') });
  const [edit, setEdit] = useState(false);
  const [timing, setTiming] = useState<'start' | 'finish' | 'correct-times' | null>(null);
  const [notice, setNotice] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const base = data?.serverNow ? Date.parse(data.serverNow) : Date.now(), received = Date.now();
    const update = () => setNow(base + Date.now() - received);
    update(); const timer = window.setInterval(update, 30000); return () => window.clearInterval(timer);
  }, [data?.serverNow]);
  const changed = () => reload();
  const saved = (message: string) => { setNotice(message); setMutationError(''); reload(); };
  const connect = async () => {
    if (!data || saving) return;
    setSaving(true); setMutationError('');
    try { await api('POST', '/program-workspace', { action: 'connect', programId, expectedVersion: data.program.version }); saved('Interest, stubs, and attendance are connected to this program.'); } catch (failure) { setMutationError(errorText(failure)); } finally { setSaving(false); }
  };
  if (!data) return <div className="w-full space-y-4"><button className={btnGhost} onClick={onBack}><ArrowLeft className="h-4 w-4" />Programs</button><section className={card}>{loading ? <Loading label="Loading program, staff assignments, and attendance…" /> : <><Notice kind="error">{error?.message ?? 'Program not found.'}</Notice><button className={`${btnGhost} mt-3`} onClick={reload}>Try again</button></>}</section></div>;
  const p = data.program, duration = timingSummary(p, now);
  return <div className="w-full space-y-5">
    <button className={btnGhost} onClick={onBack}><ArrowLeft className="h-4 w-4" />Programs</button>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2"><Status status={p.status} /></div><h1 className="text-2xl font-semibold">{p.title}</h1><p className="mt-2 text-sm text-slate-500">{formatDate(p.date)} · {p.hostBarangay} · {p.location || 'Location not recorded'}</p></div>{isAdmin && <button className={btnGhost} disabled={loading || saving} onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Edit program</button>}</header>
    {notice && <Notice kind="success">{notice}</Notice>}{(error || mutationError) && <Notice kind="error">{mutationError || error?.message}</Notice>}
    <DataFreshness updatedAt={updatedAt} loading={loading} onRefresh={reload} maxAgeMs={['Open', 'In progress'].includes(p.status) ? 30000 : 0} />
    <div className="grid gap-3 sm:grid-cols-3">{[['Pet slots used', `${p.slotsUsed}${p.slots === null ? '' : ` / ${p.slots}`}`, p.slots === null ? 'Capacity not set' : p.slotsUsed >= p.slots ? 'Capacity reached · keep recording actual attendance' : `${p.slots - p.slotsUsed} planned slots remaining`], ['Owner visits', p.ownerVisits, 'Recorded attendance; interest is separate'], ['Interested owners', p.interestOwners, `${p.interestPets} pets listed · no automatic stub`]].map(([label, value, hint]) => <article key={String(label)} className={card}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></article>)}</div>
    {p.slots !== null && p.slotsUsed >= p.slots && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{p.slotsUsed > p.slots ? `${p.slotsUsed - p.slots} ${p.slotsUsed - p.slots === 1 ? 'pet' : 'pets'} above planned capacity.` : 'Planned capacity reached.'} Actual attendance can still be recorded.</div>}
    <nav className={`${tabList} w-full`} aria-label="Program sections" role="tablist">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tabItem(tab === item)} onClick={() => setParams((previous) => { const next = new URLSearchParams(previous); next.set('tab', item.toLowerCase()); return next; })}>{item}</button>)}</nav>
    <div className="program-view-enter" role="tabpanel" key={tab}><Suspense fallback={<Loading label={`Loading ${tab.toLowerCase()}…`}/> }>
      {tab === 'Overview' ? <div className="grid gap-5 lg:grid-cols-3">
        <section className={`${card} space-y-4 lg:col-span-2`}><h2 className="flex items-center gap-2 font-semibold"><Clock3 className="h-5 w-5 text-brand-600" />Schedule and actual duration</h2>
          <div className="grid gap-4 sm:grid-cols-3"><Metric label="Planned time" value={p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : 'Not recorded'} hint={minutesLabel(duration.plannedMinutes)} /><Metric label={p.actualFinishedAt ? 'Actual duration' : 'Elapsed time'} value={minutesLabel(duration.elapsedMinutes)} hint={p.actualStartedAt ? p.actualFinishedAt ? 'Program finished' : 'Program is running' : 'Start has not been recorded'} /><Metric label="Overtime" value={duration.overtimeMinutes === null ? p.actualStartedAt ? 'Not available' : 'Not started' : minutesLabel(duration.overtimeMinutes)} hint={p.endTime ? 'Beyond the planned finish time' : 'Planned finish was not recorded'} /></div>
          {!!duration.overtimeMinutes && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{p.actualFinishedAt ? `Finished ${minutesLabel(duration.overtimeMinutes)} after the planned finish.` : `${minutesLabel(duration.overtimeMinutes)} past the planned finish. The program stays open until staff finish it.`}</div>}
          <dl className="grid gap-3 border-t border-slate-100 pt-4 text-sm dark:border-night-border sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Actual start · Philippine time</dt><dd className="mt-1 font-medium">{dateTime(p.actualStartedAt)}</dd></div><div><dt className="text-xs text-slate-500">Actual finish · Philippine time</dt><dd className="mt-1 font-medium">{dateTime(p.actualFinishedAt)}</dd></div></dl>
          {isAdmin ? <div className="flex flex-wrap gap-2">{!p.actualStartedAt && ['Planned', 'Open', 'In progress'].includes(p.status) && <button className={btnPrimary} disabled={loading || p.date > today()} onClick={() => setTiming('start')}><Play className="h-4 w-4" />Record start</button>}{p.actualStartedAt && !p.actualFinishedAt && p.status === 'In progress' && <button className={btnPrimary} disabled={loading} onClick={() => setTiming('finish')}><Square className="h-4 w-4" />Record finish</button>}{['In progress', 'Completed'].includes(p.status) && <button className={btnGhost} disabled={loading} onClick={() => setTiming('correct-times')}>Correct / backfill actual times</button>}</div> : <p className="text-xs text-slate-500">Admin records the program start and finish.</p>}
          <p className="text-xs text-slate-500">Times do not close automatically. Finishing the program keeps paper attendance entry available until the collection list is closed.</p>
        </section>
        <section className={`${card} space-y-4`}><h2 className="font-semibold">Program Details</h2><div><h3 className="text-xs text-slate-500">Processes offered</h3><ul className="mt-2 space-y-2 text-sm">{p.processes.map((process) => <li key={process}>{process}</li>)}</ul></div><div><h3 className="text-xs text-slate-500">Participating barangays</h3><p className="mt-1 text-sm">{data.allowedBarangays.map((b) => b.name).join(', ') || 'Not set'}</p></div><div><h3 className="text-xs text-slate-500">Attendance collection</h3><p className="mt-1 text-sm">{p.campaignStatus === 'closed' ? 'Closed · Admin can record late entries with a reason' : p.campaignId ? 'Open for permitted staff' : 'Not connected yet'}</p></div></section>
        <section className={`${card} lg:col-span-2`}><h2 className="flex items-center gap-2 font-semibold"><Users className="h-5 w-5 text-brand-600" />Assigned Paravets</h2><p className="mt-1 text-xs text-slate-500">Active Paravets in the host and approved participating barangays appear automatically.</p>{data.assignedParavets.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">{data.assignedParavets.map((person) => <li key={person.id} className="rounded-xl bg-slate-50 p-3 dark:bg-night-surface"><p className="text-sm font-medium">{person.name}</p><p className="mt-1 text-xs text-slate-500">{person.barangay}</p></li>)}</ul> : <p className="mt-4 text-sm text-slate-500">No active Paravets assigned to these barangays.</p>}</section>
        <section className={card}><h2 className="font-semibold">Stub Stock</h2><dl className="mt-3 space-y-2 text-sm">{[['Requested, awaiting review', data.stock.requested], ['Approved total', data.stock.approved], ['Available', data.stock.available], ['Issued total', data.stock.issued], ['Redeemed', data.stock.redeemed], ['Cancelled', data.stock.cancelled]].map(([label, count]) => <div key={String(label)} className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="font-medium">{count}</dd></div>)}</dl></section>
        <section className={`${card} lg:col-span-3`}><h2 className="font-semibold">Program History</h2>{!data.activity.length ? <p className="mt-3 text-sm text-slate-500">No workspace changes recorded yet.</p> : <ul className="mt-3 divide-y divide-slate-100 dark:divide-night-border">{data.activity.map((event) => <li key={event.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{event.action.replaceAll('-', ' ')} · {event.actor}</p><time className="text-xs text-slate-500">{dateTime(event.createdAt)}</time></div>{event.reason && <p className="mt-1 text-slate-500">{event.reason}</p>}</li>)}</ul>}</section>
      </div> : !p.campaignId ? <section className={`${card} space-y-3`}><h2 className="font-semibold">Connect This Existing Program</h2><p className="text-sm text-slate-500">Create its shared interest list so stubs and attendance use the same program.</p>{isAdmin ? <button className={btnPrimary} disabled={saving || loading} onClick={() => void connect()}>{saving ? <Spinner label="Connecting…" /> : 'Connect program workflow'}</button> : <Notice>Ask an Admin to connect this program before collecting interest or attendance.</Notice>}</section>
      : tab === 'Interest' ? <CampaignDetails embedded campaignId={p.campaignId} role={account?.type ?? ''} barangays={data.barangayOptions} programs={[]} onClose={() => {}} onChanged={changed} />
      : <StubWorkflowPage embedded key={`${p.campaignId}-${tab}`} campaignId={p.campaignId} initialTab={tab === 'Stubs' ? 'batches' : 'attendance'} onChanged={changed} />}
    </Suspense></div>
    {edit && <ScheduleModal existing={data} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); saved('Program details saved.'); }} />}
    {timing && <TimingModal program={p} mode={timing} onClose={() => setTiming(null)} onSaved={() => { setTiming(null); saved('Actual program times saved. Attendance collection is unchanged.'); }} />}
  </div>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>;
}

type ScheduleDraft = { title: string; date: string; location: string; hostBarangayId: string; startTime: string; endTime: string; slots: string; processes: ProgramProcess[]; status: string };
/** Edits a program, or (with `request`) schedules an approved program request: new programs come only from requests. */
export function ScheduleModal({ existing, request, onClose, onSaved }: { existing?: WorkspaceDetail; request?: { id: number; reference: string; hostBarangayId: number; hostBarangay: string; processes: ProgramProcess[] }; onClose: () => void; onSaved: (id: number) => void }) {
  const p = existing?.program;
  const [draft, setDraft] = useState<ScheduleDraft>({ title: p?.title ?? '', date: p?.date ?? '', location: p?.location ?? '', hostBarangayId: p?.hostBarangayId ? String(p.hostBarangayId) : request ? String(request.hostBarangayId) : '', startTime: p?.startTime ?? '08:00', endTime: p?.endTime ?? '16:00', slots: p?.slots == null ? '' : String(p.slots), processes: p?.processes ?? (request ? [...request.processes] : [...PROGRAM_PROCESSES]), status: p?.status ?? 'Planned' });
  const { data: options, loading, error: loadError } = useApi<{ barangays: { id: number; name: string }[] }>('/program-workspace?mode=options');
  const requestId = request ? String(request.id) : '';
  const [reason, setReason] = useState('');
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const locked = existing?.scheduleLocked;
  const set = <K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const reviewSave = (event: FormEvent) => { event.preventDefault(); if ((draft.startTime || draft.endTime) && draft.endTime <= draft.startTime) { setError('End time must be after start time.'); return; } if (!draft.processes.length) { setError('Select at least one process.'); return; } setError(''); setReview(true); };
  const save = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const result = await api<{ programId: number }>('POST', '/program-workspace', { action: p ? 'update' : 'create', ...(p ? { programId: p.id, expectedVersion: p.version, ...(reason.trim() ? { reason: reason.trim() } : {}) } : requestId ? { requestCampaignId: Number(requestId) } : {}), schedule: { ...draft, hostBarangayId: Number(draft.hostBarangayId), slots: draft.slots ? Number(draft.slots) : null } });
      onSaved(result.programId);
    } catch (failure) { setError(errorText(failure)); } finally { setSaving(false); }
  };
  return <Modal title={p ? 'Edit program' : 'Schedule program'} wide onClose={() => { if (!saving) onClose(); }}><div className="program-view-enter space-y-4">
    {error && <Notice kind="error">{error}</Notice>}{loadError && <Notice kind="error">{loadError.message}</Notice>}
    {loading ? <Loading label="Loading barangay options…" /> : !review ? <form className="space-y-4" onSubmit={reviewSave}>
      {locked && <Notice>Schedule details are protected because stubs were approved, attendance exists, or the program has started. Capacity can still be adjusted.</Notice>}
      {request && <Notice>Scheduling approved request {request.reference} · {request.hostBarangay}. Its gathered interests and eligible barangays carry over.</Notice>}
      <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
        <Field label="Program title"><input required maxLength={160} disabled={locked} className={inputCls} value={draft.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Host barangay"><Select required disabled={locked || Boolean(requestId)} className={inputCls} value={draft.hostBarangayId} onChange={(e) => set('hostBarangayId', e.target.value)}><option value="">Choose a barangay</option>{districtOptions(options?.barangays)}</Select></Field>
        <Field label="Program date"><input required disabled={locked} type="date" className={inputCls} min={p && draft.date === p.date && p.date < today() ? p.date : today()} value={draft.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Location"><input required maxLength={240} disabled={locked} className={inputCls} value={draft.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Planned start · Philippine time"><input required={!p || Boolean(p.startTime || p.endTime)} disabled={locked} type="time" className={inputCls} value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} /></Field>
        <Field label="Planned finish · Philippine time"><input required={!p || Boolean(p.startTime || p.endTime)} disabled={locked} type="time" className={inputCls} value={draft.endTime} onChange={(e) => set('endTime', e.target.value)} /></Field>
        <Field label="Pet capacity (optional)" hint="Planning guide; actual attendance is never blocked."><input type="number" min={1} max={100000} step={1} className={inputCls} value={draft.slots} onChange={(e) => set('slots', e.target.value)} /></Field>
        <Field label="Status"><Select required disabled={Boolean(p?.actualStartedAt)} className={inputCls} value={draft.status} onChange={(e) => set('status', e.target.value)}>{PROGRAM_STATUSES.filter((status) => status === p?.status || (p ? !['In progress', 'Completed'].includes(status) : ['Planned', 'Open'].includes(status))).map((status) => <option key={status}>{status}</option>)}</Select></Field>
      </fieldset>
      <fieldset disabled={locked || saving || Boolean(requestId)}><legend className="text-sm font-medium">Processes offered</legend><div className="mt-2 flex flex-wrap gap-x-5 gap-y-3"><Check disabled={locked || Boolean(requestId)} checked={draft.processes.length === PROGRAM_PROCESSES.length} onChange={(checked) => set('processes', checked ? [...PROGRAM_PROCESSES] : [])}>All of the Above</Check>{PROGRAM_PROCESSES.map((process) => <Check key={process} disabled={locked || Boolean(requestId)} checked={draft.processes.includes(process)} onChange={(checked) => set('processes', checked ? [...draft.processes, process] : draft.processes.filter((item) => item !== process))}>{process}</Check>)}</div></fieldset>
      {p && ['Cancelled', 'Postponed'].includes(draft.status) && draft.status !== p.status && <Field label="Reason for cancellation / postponement"><textarea required minLength={3} maxLength={1000} className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
      <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={saving || Boolean(loadError)}>Review program</button></div>
    </form> : <>
      <h3 className="text-lg font-semibold">{draft.title}</h3><div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-night-surface"><p>{formatDate(draft.date)} · {draft.startTime}–{draft.endTime} Philippine time</p><p>{draft.location} · {options?.barangays.find((b) => b.id === Number(draft.hostBarangayId))?.name}</p><p>{draft.processes.join(' · ')}</p><p>{draft.slots ? `${draft.slots} pet slots` : 'Capacity not set'} · {draft.status}</p>{reason && <p>Reason: {reason}</p>}</div>{!p && <Notice>{requestId ? 'The approved request and its gathered interests will use this program schedule.' : 'The program and its interest list will be created together.'} This does not issue any stubs.</Notice>}<div className="flex justify-end gap-2"><button className={btnGhost} disabled={saving} onClick={() => setReview(false)}>Edit details</button><button className={btnPrimary} disabled={saving} onClick={() => void save()}>{saving ? <Spinner label="Saving program…" /> : p ? 'Confirm and save' : 'Create program'}</button></div>
    </>}
  </div></Modal>;
}

function TimingModal({ program: p, mode, onClose, onSaved }: { program: WorkspaceProgram; mode: 'start' | 'finish' | 'correct-times'; onClose: () => void; onSaved: () => void }) {
  const [actualAt, setActualAt] = useState(localTime());
  const [startedAt, setStartedAt] = useState(p.actualStartedAt ? localTime(p.actualStartedAt) : `${p.date}T${p.startTime || '08:00'}`);
  const [finishedAt, setFinishedAt] = useState(p.actualFinishedAt ? localTime(p.actualFinishedAt) : p.status === 'Completed' ? `${p.date}T${p.endTime || '16:00'}` : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError('');
    try { await api('POST', '/program-workspace', { action: mode, programId: p.id, expectedVersion: p.version, ...(mode === 'correct-times' ? { startedAt: new Date(`${startedAt}:00+08:00`).toISOString(), ...(finishedAt ? { finishedAt: new Date(`${finishedAt}:00+08:00`).toISOString() } : {}), reason } : { actualAt: new Date(`${actualAt}:00+08:00`).toISOString() }) }); onSaved(); }
    catch (failure) { setError(errorText(failure)); } finally { setSaving(false); }
  };
  return <Modal title={mode === 'start' ? 'Record actual start' : mode === 'finish' ? 'Record actual finish' : 'Correct actual times'} onClose={() => { if (!saving) onClose(); }}><form className="program-view-enter space-y-4" onSubmit={(event) => void submit(event)}><p className="text-sm text-slate-500">{p.title} · All times are Philippine time. Actual times can be backdated, but cannot be in the future.</p>{error && <Notice kind="error">{error}</Notice>}
    {mode === 'correct-times' ? <><Field label="Actual start"><input required type="datetime-local" disabled={saving} min={`${p.date}T00:00`} max={localTime()} className={inputCls} value={startedAt} onChange={(e) => setStartedAt(e.target.value)} /></Field><Field label="Actual finish"><input required={p.status === 'Completed'} disabled={saving} type="datetime-local" min={startedAt} max={localTime()} className={inputCls} value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} /></Field><Field label="Reason for correction / backfill"><textarea required disabled={saving} minLength={3} maxLength={1000} rows={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></> : <Field label={mode === 'start' ? 'Actual start' : 'Actual finish'}><input required disabled={saving} type="datetime-local" className={inputCls} min={mode === 'finish' && p.actualStartedAt ? localTime(p.actualStartedAt) : `${p.date}T00:00`} max={localTime()} value={actualAt} onChange={(e) => setActualAt(e.target.value)} /></Field>}
    <Notice>{mode === 'finish' ? 'This marks the program Completed. Staff can continue encoding paper attendance while its collection list remains open.' : 'This change is recorded in program history. It will not close the attendance collection list.'}</Notice><div className="flex justify-end gap-2"><button type="button" className={btnGhost} disabled={saving} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={saving}>{saving ? <Spinner label="Saving actual times…" /> : 'Confirm actual time'}</button></div>
  </form></Modal>;
}
