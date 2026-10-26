import { useRecordSelection,SelectionBar,exportSelectedCsv } from '../lib/useRecordSelection';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Copy } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useDebouncedValue } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { InfoTip, btnGhost, btnPrimary, Check, ConfirmDialog, DateInput, Loading, Modal, Notice, Pagination, Select } from '../components/ui';
import { ReferenceInput, type ReferenceSuggestion } from '../components/ReferenceInput';
import { AccountDetails, type AccountRow } from './AccountsPage';
import { normalizeProgramStatus, programProcessesFrom, PROGRAM_PROCESSES, PROGRAM_STATUSES } from '../../shared/programs';

type RecordRow = Record<string, unknown> & { id: string | number; _archived?: boolean };
type Response = { data: RecordRow[]; total: number; page: number; pageSize: number };
function newRecord(dataset: RecordDataset): RecordRow {
  const id = crypto.randomUUID();
  if (dataset === 'owners') return { id, name: '', address: '', barangay: '', contact: '', petName: '', species: 'Dog' };
  if (dataset === 'pets') return { id, petName: '', species: 'Dog', owner: '', barangay: '' };
  if (dataset === 'paravets') return { id, firstName: '', middleName: '', lastName: '', suffix: '', barangay: '', mobile: '' };
  if (dataset === 'respondents') return { id, name: '', mobile: '', barangay: '' };
  if (dataset === 'households') return { id, name: '', address: '', barangay: '', householdSize: 0 };
  if (dataset === 'animals') return { id, name: '', species: 'Dog', owner: '', barangay: '' };
  if (dataset === 'participants') return { id, name: '', program: '', date: '', barangay: '', status: 'Planned' };
  if (dataset === 'programs') return { id, title: '', date: '', startTime: '', endTime: '', location: '', slots: null, barangay: '', status: 'Planned', processes: [] };
  return { id, name: '', date: '', barangay: '', status: 'Planned', program: '' };
}

/** A Paravet's account key; clicking copies it to share with the Paravet. */
function CopyKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" title="Copy account key" aria-label={`Copy account key ${value}`} onClick={() => void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => window.prompt('Copy the account key:', value))} className="inline-flex items-center gap-1 rounded font-mono text-slate-700 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-200 dark:hover:text-brand-300">
    {value}{copied ? <ClipboardCheck aria-hidden className="h-3.5 w-3.5 text-brand-600" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}<span role="status" className="sr-only">{copied ? 'Copied' : ''}</span>
  </button>;
}

type RecordDataset = 'owners' | 'pets' | 'paravets' | 'respondents' | 'households' | 'animals' | 'stubs' | 'services' | 'programs' | 'participants';
const PAGE_SIZE = 25;
export function RecordsPage({ dataset, title, writeCap = 'registry.write', readOnly = false }: { dataset: RecordDataset; title: string; writeCap?: 'registry.write' | 'programs.manage' | 'stubs.manage' | 'services.manage' | 'paravets.manage'; readOnly?: boolean }) {
  const { can } = useAuth(); const [params, setParams] = useSearchParams(); const [search, setSearch] = useState(params.get('q') ?? ''); const query = useDebouncedValue(search.trim()); const [tick, setTick] = useState(0); const [archived, setArchived] = useState(false); const [confirm, setConfirm] = useState<RecordRow | null>(null); const [pendingArchive, setPendingArchive] = useState<RecordRow | null>(null); const [actionError, setActionError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ fullName: string; accountKey: string; temporaryPassword: string; expiresInMinutes: number } | null>(null);
  const editable = !readOnly && can(writeCap);
  const [sort, setSort] = useState('updatedAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const routeQuery = params.get('q') ?? '';
  useEffect(() => { setSearch(routeQuery); }, [routeQuery]);
  const { data, loading, error } = useApi<Response>(`/records/${dataset}?page=${page}&pageSize=${PAGE_SIZE}&archived=${archived}&q=${encodeURIComponent(query)}&sort=${sort}&dir=${direction}${year ? `&year=${year}` : ''}${month ? `&month=${month}` : ''}${tick ? `&refresh=${tick}` : ''}`);
  const rows = useMemo(() => data?.data ?? [], [data]);
  // A Paravet row shows its sign-in account (key, status, current barangay); Edit and Deactivate act on that account.
  // shortcut: looks up at most 500 active and 500 deactivated Paravet accounts; page the lookup if the office ever has more.
  const paravetAccounts = useApi<{ data: AccountRow[] }>(dataset === 'paravets' ? `/accounts?type=Paravet&pageSize=500${tick ? `&refresh=${tick}` : ''}` : null);
  const deactivatedParavets = useApi<{ data: AccountRow[] }>(dataset === 'paravets' ? `/accounts?type=Paravet&pageSize=500&archived=true${tick ? `&refresh=${tick}` : ''}` : null);
  const accountOf = (row: RecordRow) => row.accountId ? [...(paravetAccounts.data?.data ?? []), ...(deactivatedParavets.data?.data ?? [])].find((account) => account.id === Number(row.accountId)) : undefined;
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<AccountRow | null>(null);
  const todayManila = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const currentPrograms = rows.filter((row) => {
    const status = normalizeProgramStatus(String(row.status ?? ''));
    return status && ['Planned', 'Open', 'In progress'].includes(status) && String(row.date ?? row.programDate ?? '').slice(0, 10) >= todayManila;
  }).sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  const recentPrograms = rows.filter((row) => !currentPrograms.some((current) => current.id === row.id))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  const bulk=useRecordSelection(`${dataset}:${query}:${archived}:${sort}:${direction}:${year}:${month}`);
  const bulkPath=`/records/${dataset}?q=${encodeURIComponent(query)}&archived=${archived}&sort=${sort}&dir=${direction}${year?`&year=${year}`:''}${month?`&month=${month}`:''}`;
  const renderTable = (tableRows: RecordRow[]) => <><SelectionBar selection={bulk} total={data?.total??0} rows={tableRows}><button className={btnGhost} disabled={!bulk.count(data?.total??0)} onClick={()=>void bulk.resolve<RecordRow>(bulkPath).then(rows=>exportSelectedCsv(rows,`${dataset}-selected`)).catch(e=>setActionError(e.message))}>Export selected</button></SelectionBar><div className="mt-3 data-table overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="p-3">Select</th><th className="p-3">Name</th><th className="p-3">Details</th><th className="p-3">Barangay</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{tableRows.map((row) => {
    const programProcesses = programProcessesFrom(row.processes, row.program);
    const slots = Number(row.slots);
    const usedSlots = row._attendanceSlotsUsed !== null && row._attendanceSlotsUsed !== undefined ? Number(row._attendanceSlotsUsed) : row.booked !== null && row.booked !== undefined && Number.isFinite(Number(row.booked)) ? Number(row.booked) : Number.isFinite(slots) && row.left !== null && row.left !== undefined && Number.isFinite(Number(row.left)) ? Math.max(0, slots - Number(row.left)) : null;
    const duration = row.durationMinutes !== null && row.durationMinutes !== undefined && Number.isFinite(Number(row.durationMinutes)) ? Number(row.durationMinutes) : null;
    const durationText = duration == null ? '' : `${Math.floor(duration / 60) ? `${Math.floor(duration / 60)} hr ` : ''}${duration % 60 ? `${duration % 60} min` : ''}`.trim();
    const account = dataset === 'paravets' ? accountOf(row) : undefined;
    const detail = dataset === 'paravets' ? (account ? <>{account.accountKey && <><CopyKey value={account.accountKey} />{' · '}</>}{[account.mobile, account.archived ? 'Deactivated' : account.status, account.lastLoginAt ? `Last sign-in ${new Date(account.lastLoginAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })}` : 'Not signed in yet'].filter(Boolean).join(' · ')}</> : [String(row.mobile ?? ''), 'No sign-in account'].filter(Boolean).join(' · '))
      : dataset === 'owners' ? String(row.address ?? row.contact ?? '')
      : dataset === 'pets' ? `${String(row.species ?? '')} · ${String(row.owner ?? row.owner_name ?? row.owner_id ?? '')}`
        : dataset === 'programs' ? [String(row.date ?? ''), String(row.status ?? ''), programProcesses.join(', '), usedSlots == null ? '' : `Slots used ${usedSlots}${Number.isFinite(slots) ? ` / ${slots}` : ''}`, durationText ? `Duration ${durationText}` : 'Duration not set'].filter(Boolean).join(' · ')
          : `${String(row.program ?? row.date ?? '')} · ${String(row.status ?? '')}`;
    return <tr key={row.id}><td className="p-3"><input type="checkbox" aria-label={`Select ${row.name??row.id}`} checked={bulk.has(row.id)} onChange={()=>bulk.toggle(row.id)}/></td><td className="p-3 font-medium"><button type="button" onClick={() => { if (account) { setEditingAccount(account); return; } setCreating(false); setConfirm(row); }} className="text-left hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:text-brand-300">{account ? account.fullName : String(dataset === 'programs' ? row.title || row.name || row.program || row.id : row.name ?? row.petName ?? row.title ?? row.owner_name ?? row.pet_name ?? row.id)}</button></td><td className="max-w-md p-3 text-slate-500">{detail}</td><td className="p-3">{account ? account.barangay?.name ?? '—' : String(row.barangay ?? '')}</td><td className="whitespace-nowrap p-3">{editable && account && <><button type="button" onClick={() => setEditingAccount(account)} className="ml-3 text-brand-700 underline dark:text-brand-300">Edit</button><button type="button" onClick={() => setPendingDeactivate(account)} className="ml-3 text-slate-600 underline dark:text-slate-300">{account.archived ? 'Restore' : 'Deactivate'}</button></>}{editable && !(dataset==='paravets'&&row.accountId) && row.workflow !== 'qr-stubs-v1' && <><button type="button" onClick={() => { setCreating(false); setConfirm(row); }} className="ml-3 text-brand-700 underline dark:text-brand-300">Edit</button><button type="button" onClick={() => setPendingArchive(row)} className="ml-3 text-slate-600 underline dark:text-slate-300">{archived ? 'Restore' : 'Archive'}</button></>}</td></tr>;
  })}</tbody></table>{!loading && tableRows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No matching records.</p>}</div></>;
  useEffect(() => {
    const recordId = params.get('recordId');
    if (!recordId || !data) return;
    const match = rows.find((row) => String(row.id) === recordId);
    if (match) {
      setCreating(false);
      setConfirm(match);
      setParams((current) => { current.delete('recordId'); return current; }, { replace: true });
    } else {
      setParams((current) => { current.delete('recordId'); return current; }, { replace: true });
      setActionError('That search result is no longer available in this list.');
    }
  }, [data, params, rows, setParams]);
  const save = async () => {
    if (!confirm) return;
    setActionError('');
    try {
      if (dataset === 'paravets' && creating) {
        const result = await api<{ accountKey: string; temporaryPassword: string; expiresInMinutes: number; record: RecordRow }>('POST', `/records/${dataset}?createAccount=true`, { records: [confirm] });
        setCreatedCredentials({
          fullName: String(result.record.name ?? ''),
          accountKey: result.accountKey,
          temporaryPassword: result.temporaryPassword,
          expiresInMinutes: result.expiresInMinutes,
        });
        setUndoToken(null);
      } else {
        const result = await api<{ undoToken?: string }>('POST', `/records/${dataset}`, { records: [confirm] });
        setUndoToken(result.undoToken ?? null);
      }
      setConfirm(null);
      setCreating(false);
      setTick((n) => n + 1);
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Save failed.'); }
  };
  const undo = async () => { if (!undoToken) return; try { await api('POST', `/undo/${undoToken}`, {}); setUndoToken(null); setTick((n) => n + 1); } catch (e) { setActionError(e instanceof Error ? e.message : 'Could not undo the record change.'); } };
  const archive = async (row: RecordRow) => { setActionError(''); try { await api('POST', `/records/${dataset}/archive`, { ids: [row.id], archived: !archived }); setPendingArchive(null); setTick((n) => n + 1); } catch (e) { setActionError(e instanceof Error ? e.message : 'Action failed.'); } };
  const clearFilters = () => {
    setSearch('');
    setArchived(false);
    setSort('updatedAt');
    setDirection('desc');
    setYear('');
    setMonth('');
    setPage(1);
    setParams((current) => { current.delete('q'); return current; }, { replace: true });
  };
  return <div className="w-full"><div className="flex flex-wrap items-end gap-3"><div className="mr-auto"><h1 className="text-2xl font-semibold">{title}<InfoTip>{dataset === 'paravets' ? "Edit a Paravet to correct their details or assign them to another barangay; both barangays' Paravets are notified. Deactivate stops sign-in to e-Vet Field, and Restore turns it back on. Click an account key to copy it." : `Select a record to view its details${editable ? ' and edit it' : ''}.`}</InfoTip></h1></div><input aria-label={`Search ${title}`} placeholder={`Search ${title.toLowerCase()}…`} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /><button type="button" onClick={() => { setArchived(!archived); setPage(1); }} className={btnGhost}>{archived ? 'Show active' : 'Show archived'}</button>{editable && <button type="button" onClick={() => { setCreating(true); setConfirm(newRecord(dataset)); }} className={btnPrimary}>{dataset === 'paravets' ? 'Add Paravet' : dataset === 'programs' ? 'Add a program' : 'Add record'}</button>}</div>
    {(dataset === 'owners' || dataset === 'pets') && rows.some((row) => row._relationshipIssue) && <Notice kind="error">Some existing records have unmatched owner–pet links. They remain available for review; correct the owner or pet links before relying on these records.</Notice>}
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-xs text-slate-500">Sort by<Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option value="updatedAt">Last updated</option><option value="name">Name</option><option value="barangay">Barangay</option><option value="date">Date</option><option value="status">Status</option><option value="id">ID</option></Select></label>
      <label className="text-xs text-slate-500">Direction<Select value={direction} onChange={(e) => { setDirection(e.target.value as 'asc' | 'desc'); setPage(1); }} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option value="asc">Ascending</option><option value="desc">Descending</option></Select></label>
      <label className="text-xs text-slate-500">Year<input type="number" min={2000} max={2100} value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }} className="mt-1 block w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
      <label className="text-xs text-slate-500">Month<Select value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">All</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('en', { month: 'long' })}</option>)}</Select></label>
      <button type="button" onClick={clearFilters} className={btnGhost}>Clear filters</button>
    </div>
    {loading && <Loading />}{error && <div className="mt-4"><Notice kind="error">{error.message}</Notice></div>}{actionError && <div className="mt-4"><Notice kind="error">{actionError}</Notice></div>}<p className="mt-3 text-xs text-slate-500">Showing {rows.length} of {data?.total ?? 0}</p>
    {dataset === 'programs' ? <div className="space-y-6">
      <section><div><h2 className="font-semibold">Current and Upcoming Programs</h2><p className="mt-1 text-xs text-slate-500">Scheduled program days, their process checkboxes, current slot use, and planned duration.</p></div>{currentPrograms.length ? renderTable(currentPrograms) : <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700"><p className="font-medium">No current or upcoming program days.</p><p className="mt-1 text-sm text-slate-500">Add a program to create a schedule and collect program interest.</p>{editable && <button type="button" onClick={() => { setCreating(true); setConfirm(newRecord(dataset)); }} className={`${btnPrimary} mt-3`}>Add a program</button>}</div>}</section>
      <section><h2 className="font-semibold">Recent and Previous Programs</h2>{renderTable(recentPrograms)}</section>
    </div> : renderTable(rows)}
    {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />}
    {confirm && <RecordEditor record={confirm} dataset={dataset} editable={editable && !(dataset==='paravets'&&confirm.accountId&&!creating) && confirm.workflow !== 'qr-stubs-v1'} creating={creating} onClose={() => { setConfirm(null); setCreating(false); setActionError(''); }} onSave={(record) => setConfirm(record)} onSubmit={() => void save()} />}
    {editingAccount && <AccountDetails account={editingAccount} onClose={() => setEditingAccount(null)} onSaved={(token) => { setUndoToken(token || null); setEditingAccount(null); setTick((n) => n + 1); }} />}
    {pendingDeactivate && <ConfirmDialog title={pendingDeactivate.archived ? 'Restore Paravet access?' : 'Deactivate this Paravet?'} message={pendingDeactivate.archived ? `${pendingDeactivate.fullName} can sign in to e-Vet Field again.` : `${pendingDeactivate.fullName} can no longer sign in to e-Vet Field and stops counting as an active Paravet of their barangay. Submissions and history stay.`} confirmLabel={pendingDeactivate.archived ? 'Restore access' : 'Deactivate account'} danger={!pendingDeactivate.archived} onClose={() => setPendingDeactivate(null)} onConfirm={() => { const target = pendingDeactivate; setPendingDeactivate(null); setActionError(''); void api('POST', '/accounts/archive', { ids: [target.id], restore: target.archived }).then(() => setTick((n) => n + 1)).catch((e) => setActionError(e instanceof Error ? e.message : 'Could not change Paravet access.')); }} />}
    {createdCredentials && <Modal title="Paravet account created" onClose={() => setCreatedCredentials(null)}>
      <Notice kind="success">Give these sign-in details to the Paravet now. This temporary password is shown only once and expires in {createdCredentials.expiresInMinutes} minutes.</Notice>
      <dl className="mt-4 space-y-3 text-sm">
        <div><dt className="font-medium">Name</dt><dd>{createdCredentials.fullName}</dd></div>
        <div><dt className="font-medium">Account key</dt><dd><code className="select-all">{createdCredentials.accountKey}</code></dd></div>
        <div><dt className="font-medium">Temporary password</dt><dd><code className="select-all text-lg font-bold tracking-wider">{createdCredentials.temporaryPassword}</code></dd></div>
      </dl>
      <div className="mt-5 flex justify-end"><button type="button" onClick={() => setCreatedCredentials(null)} className={btnPrimary}>Done</button></div>
    </Modal>}
    {pendingArchive && <ConfirmDialog title={archived ? 'Restore this record?' : 'Archive this record?'} message={archived ? 'This record will return to active lists.' : 'This record will be hidden from active lists. You can restore it later.'} confirmLabel={archived ? 'Restore' : 'Archive'} onClose={() => setPendingArchive(null)} onConfirm={() => void archive(pendingArchive)} />}
  </div>;
}

function RecordEditor({ record, dataset, editable, creating, onClose, onSave, onSubmit }: { record: RecordRow; dataset: string; editable: boolean; creating: boolean; onClose: () => void; onSave: (record: RecordRow) => void; onSubmit: () => void }) {
  const protectedField = (key: string) => /^(id|_archived|archived|created_at|createdat|updated_at|updatedat)$/i.test(key)
    || key.startsWith('_')
    || /(?:password|credential|security|verification|verified|^role$|accounttype|(?:^|_)id$|id$)/i.test(key);
  const fields = [...new Set([...Object.keys(record), ...(dataset === 'programs' ? ['title', 'startTime', 'endTime', 'processes', 'location', 'slots'] : [])])].filter((key) => !protectedField(key) && !(dataset === 'programs' && ['durationMinutes', 'program', 'name'].includes(key)));
  const programStatus = normalizeProgramStatus(String(record.status ?? 'Planned')) ?? 'Planned';
  const programProcesses = programProcessesFrom(record.processes, record.program);
  const scheduleDateMin = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const updateFromSuggestion = (field: string, suggestion: ReferenceSuggestion) => {
    const values: Record<string, unknown> = { [field]: suggestion.name };
    if (dataset === 'owners' && field === 'name') {
      values.address = suggestion.address;
      values.contact = suggestion.contact;
      values.barangay = suggestion.barangay;
    } else if (dataset === 'pets' && field === 'name') {
      values.species = suggestion.species;
      values.owner = suggestion.owner ?? suggestion.owner_name;
      values.barangay = suggestion.barangay;
    } else if (dataset === 'pets' && field === 'owner') {
      values.barangay = suggestion.barangay;
    }
    onSave({ ...record, ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) });
  };
  return (
    <Modal title={dataset === 'paravets' && creating ? 'Create Paravet account' : editable ? record.id && record.name ? 'Edit record' : 'New record' : 'Record details'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); if (editable) onSubmit(); }} className="space-y-3">
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
        {dataset === 'paravets' && creating && <p className="text-sm text-slate-500">This creates a Paravet directory record and login account. The account key and one-time temporary password will be shown after saving.</p>}
        {fields.map((field) => {
          const value = dataset === 'programs' && field === 'title' ? record.title || record.name || record.program || '' : record[field];
          const label = dataset === 'programs' && field === 'slots' ? 'pet slot capacity (optional)' : field.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
          const setValue = (next: unknown) => onSave({ ...record, [field]: next });
          const mobile = /^(mobile|contact|phone|telephone)$/i.test(field);
          const onMobileBlur = () => { if (mobile) { const digits = String(record[field] ?? '').replace(/\D/g, ''); if (/^09\d{9}$/.test(digits)) setValue(`${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`); } };
          return <label key={field} className="block text-sm capitalize">
            {label}
            {editable && field === 'barangay' ? (
              <ReferenceInput source="barangay" value={String(value ?? '')} onChange={setValue} required={dataset === 'paravets' && creating} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
            ) : editable && field === 'owner' && dataset === 'pets' ? (
              <ReferenceInput source="owners" value={String(value ?? '')} onChange={setValue} onSelect={(suggestion) => updateFromSuggestion(field, suggestion)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
            ) : editable && field === 'name' && (dataset === 'owners' || dataset === 'pets') ? (
              <ReferenceInput source={dataset} value={String(value ?? '')} onChange={setValue} onSelect={(suggestion) => updateFromSuggestion(field, suggestion)} required maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
            ) : dataset === 'programs' && field === 'processes' ? (
              <fieldset className="mt-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"><legend className="px-1 text-xs text-slate-500">Select every process included in this program</legend><div className="flex flex-wrap gap-x-5 gap-y-2"><Check disabled={!editable} checked={programProcesses.length === PROGRAM_PROCESSES.length} onChange={(checked) => setValue(checked ? [...PROGRAM_PROCESSES] : [])}>All of the Above</Check>{PROGRAM_PROCESSES.map((process) => <Check disabled={!editable} key={process} checked={programProcesses.includes(process)} onChange={(checked) => setValue(checked ? [...programProcesses, process] : programProcesses.filter((item) => item !== process))}>{process}</Check>)}</div></fieldset>
            ) : dataset === 'programs' && field === 'slots' ? (
              <input readOnly={!editable} type="number" min={1} max={100000} value={value == null ? '' : String(value)} onChange={(event) => setValue(event.target.value === '' ? null : Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
            ) : dataset === 'programs' && field === 'status' ? (
              <Select disabled={!editable} value={programStatus} onChange={(event) => setValue(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800">{PROGRAM_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</Select>
            ) : /date/i.test(field) ? (
              <DateInput required={editable && field.toLowerCase() === 'date'} min={dataset === 'programs' && ['Planned', 'Open', 'In progress'].includes(programStatus) ? scheduleDateMin : undefined} readOnly={!editable} value={dateInputValue(value)} onChange={(event) => setValue(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 read-only:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:read-only:bg-slate-800" />
            ) : /time/i.test(field) && dataset === 'programs' ? (
              <input disabled={!editable} type="time" value={String(value ?? '')} onChange={(event) => setValue(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800" />
            ) : typeof value === 'boolean' ? (
              <Select disabled={!editable} value={String(value)} onChange={(event) => setValue(event.target.value === 'true')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:disabled:bg-slate-800"><option value="true">Yes</option><option value="false">No</option></Select>
            ) : (
              <input required={editable && (/^(name|petName|title)$/i.test(field) || dataset === 'paravets' && creating && /^(firstName|lastName|mobile)$/i.test(field))} readOnly={!editable} type={typeof value === 'number' ? 'number' : 'text'} value={String(value ?? '')} onChange={(event) => setValue(typeof value === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} onBlur={onMobileBlur} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 read-only:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:read-only:bg-slate-800" />
            )}
          </label>;
        })}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>{editable ? 'Cancel' : 'Close'}</button>
          {editable && <button type="submit" className={btnPrimary}>{dataset === 'paravets' && creating ? 'Create account' : 'Save'}</button>}
        </div>
      </form>
    </Modal>
  );
}

function dateInputValue(value: unknown): string {
  const date = String(value ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : '';
}
