import { useRecordSelection,SelectionBar,exportSelectedCsv } from '../lib/useRecordSelection';
import { ConfirmDialog } from '../components/ui';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Field, inputCls, Loading, Modal, Notice, Pagination, btnGhost, btnPrimary } from '../components/ui';
import { ReferenceInput } from '../components/ReferenceInput';
import { api } from '../lib/api';
import { roleLabel } from '../../shared/permissions';
import { useDebouncedValue } from '../lib/useApi';
import { useReportBasket } from '../lib/reportBasket';

interface AccountRow {
  id: number;
  accountKey: string | null;
  username: string | null;
  accountType: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  fullName: string;
  mobile: string | null;
  barangay: { id: number; name: string; acronym: string } | null;
  status: string;
  archived: boolean;
}

type AccountList = { data: AccountRow[]; total: number };
const PAGE_SIZE = 25;

export function AccountsPage() {
  const { addRows } = useReportBasket();
  const [basketMessage, setBasketMessage] = useState('');
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim());
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AccountRow | null>(null);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('created');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const bulk=useRecordSelection(`${debouncedQuery}:${sort}:${dir}:${year}:${month}:${type}:${status}`);
  const bulkPath=`/accounts?q=${encodeURIComponent(debouncedQuery)}&sort=${sort}&dir=${dir}${year?`&year=${year}`:''}${month?`&month=${month}`:''}${type?`&type=${type}`:''}${status?`&status=${status}`:''}`;
  const [undoToken, setUndoToken] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const search = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q: debouncedQuery, sort, dir });
      if (year) search.set('year', year);
      if (month) search.set('month', month);
      if (type) search.set('type', type);
      if (status) search.set('status', status);
      void api<AccountList>('GET', `/accounts?${search}`)
        .then((result) => { if (live) { setAccounts(result.data); setTotal(result.total); setError(''); } })
        .catch((reason: unknown) => { if (live) { setError(reason instanceof Error ? reason.message : 'Could not load accounts.'); setAccounts([]); } })
        .finally(() => { if (live) setLoading(false); });
    }, 150);
    return () => { live = false; window.clearTimeout(timer); };
  }, [debouncedQuery, reload, page, sort, dir, year, month, type, status]);

  useEffect(() => {
    const accountId = params.get('accountId');
    if (!accountId || loading) return;
    const match = accounts.find((account) => String(account.id) === accountId);
    if (match) {
      setSelected(match);
      setParams((current) => { current.delete('accountId'); return current; }, { replace: true });
    } else if (accounts.length) {
      void api<{ account: AccountRow }>('GET', `/accounts/${encodeURIComponent(accountId)}`)
        .then(({ account }) => setSelected(account))
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load account details.'))
        .finally(() => setParams((current) => { current.delete('accountId'); return current; }, { replace: true }));
    }
  }, [accounts, loading, params, setParams]);

  const clearFilters = () => {
    setQuery('');
    setPage(1);
    setSort('created');
    setDir('desc');
    setYear('');
    setMonth('');
    setType('');
    setStatus('');
  };

  return <div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Accounts</h1><p className="mt-1 text-sm text-slate-500">Select an account to view or edit its profile details.</p></div>
      <input aria-label="Search accounts" placeholder="Search name, account key, or mobile…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className={`${inputCls} max-w-sm`} />
      <button type="button" disabled={!accounts.length} onClick={() => { const result = addRows('Accounts', accounts.map((account) => ({ id: account.id, fullName: account.fullName, accountType: account.accountType, accountKey: account.accountKey, mobile: account.mobile, barangay: account.barangay?.name ?? '', status: account.status }))); setBasketMessage(`${result.added} accounts added${result.skipped ? `; ${result.skipped} skipped` : ''}.`); }} className={btnGhost}>Add visible accounts to report</button>
    </div>
    {basketMessage && <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{basketMessage}</p>}
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-xs text-slate-500">Sort<select value={sort} onChange={(e) => setSort(e.target.value)} className={`${inputCls} mt-1`}><option value="created">Date added</option><option value="name">Name</option><option value="key">Account key</option><option value="type">Account type</option><option value="barangay">Barangay</option><option value="status">Status</option></select></label>
      <label className="text-xs text-slate-500">Direction<select value={dir} onChange={(e) => setDir(e.target.value as 'asc' | 'desc')} className={`${inputCls} mt-1`}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
      <label className="text-xs text-slate-500">Type<select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className={`${inputCls} mt-1`}><option value="">All</option><option value="Paravet">Paravet</option></select></label>
      <label className="text-xs text-slate-500">Status<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={`${inputCls} mt-1`}><option value="">All</option><option value="Active">Active</option><option value="On hold">On hold</option></select></label>
      <label className="text-xs text-slate-500">Year<input type="number" min={2000} max={2100} value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }} className={`${inputCls} mt-1 w-24`} /></label>
      <label className="text-xs text-slate-500">Month<select value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} className={`${inputCls} mt-1`}><option value="">All</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('en', { month: 'long' })}</option>)}</select></label>
      <button type="button" onClick={clearFilters} className={btnGhost}>Clear filters</button>
    </div>
    {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
    <SelectionBar selection={bulk} total={total} rows={accounts}><button className={btnGhost} disabled={!bulk.count(total)} onClick={()=>void bulk.resolve<AccountRow>(bulkPath,300).then(rows=>{addRows('Accounts',rows.map(a=>({id:a.id,fullName:a.fullName,accountType:a.accountType,mobile:a.mobile,barangay:a.barangay?.name??'',status:a.status})));setBasketMessage('Selected accounts added to report basket.');}).catch(e=>setError(e.message))}>Add selected to report</button><button className={btnGhost} disabled={!bulk.count(total)} onClick={()=>void bulk.resolve<AccountRow>(bulkPath).then(rows=>exportSelectedCsv(rows as unknown as Record<string,unknown>[],'accounts-selected')).catch(e=>setError(e.message))}>Export selected</button></SelectionBar>
    {loading ? <Loading /> : <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="p-3">Select</th>{['Name','Account','Barangay','Mobile','Status','Actions'].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {accounts.map((account) => <tr key={account.id}><td className="p-3"><input type="checkbox" aria-label={`Select ${account.fullName}`} checked={bulk.has(account.id)} onChange={()=>bulk.toggle(account.id)}/></td>
            <td className="p-3 font-medium"><button type="button" onClick={() => setSelected(account)} className="text-left hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:text-brand-300">{account.fullName}</button></td>
            <td className="p-3">{roleLabel(account.accountType)}{account.accountKey || account.username ? ` · ${account.accountKey ?? account.username}` : ''}</td>
            <td className="p-3">{account.barangay?.name ?? '—'}</td>
            <td className="p-3">{account.mobile ?? '—'}</td>
            <td className="p-3">{account.status}</td>
            <td className="p-3"><button type="button" className="text-teal-800 underline dark:text-teal-300" onClick={() => { const result = addRows('Accounts', [{ id: account.id, fullName: account.fullName, accountType: account.accountType, accountKey: account.accountKey, mobile: account.mobile, barangay: account.barangay?.name ?? '', status: account.status }]); setBasketMessage(`${result.added ? 'Account added' : 'Account updated'}.`); }}>Add to report</button></td>
          </tr>)}
        </tbody>
      </table>
      {!accounts.length && <p className="p-8 text-center text-sm text-slate-500">No matching accounts.</p>}
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">Showing {accounts.length} of {total} accounts</p>
    </div>}
    {!loading && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
    {selected && <AccountDetails account={selected} onClose={() => setSelected(null)} onSaved={(token) => { setUndoToken(token); setSelected(null); setReload((value) => value + 1); }} />}
  </div>;
}

async function undoAccount(token: string, setToken: (value: string | null) => void, setError: (value: string) => void, setReload: (value: (current: number) => number) => void) {
  try {
    await api('POST', `/undo/${token}`, {});
    setToken(null);
    setReload((value) => value + 1);
  } catch (reason) {
    setError(reason instanceof Error ? reason.message : 'Could not undo the account change.');
  }
}

function AccountDetails({ account, onClose, onSaved }: { account: AccountRow; onClose: () => void; onSaved: (token: string) => void }) {
  const [draft, setDraft] = useState(account);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [archiveConfirm,setArchiveConfirm]=useState(false);
  const [confirmRenew, setConfirmRenew] = useState(false);
  const [renewedPassword, setRenewedPassword] = useState<string | null>(null);
  const editable = !account.archived;
  const canRenewPassword = account.accountType === 'Paravet' && !account.archived && !['Disabled', 'On hold'].includes(account.status);
  const hasBarangayAssignment = account.accountType === 'Paravet';
  const save = async () => {
    setError('');
    const changes: { firstName?: string; middleName?: string; lastName?: string; suffix?: string; mobile?: string; barangay?: string } = {};
    if (draft.firstName !== account.firstName) changes.firstName = draft.firstName;
    if ((draft.middleName ?? '') !== (account.middleName ?? '')) changes.middleName = draft.middleName ?? '';
    if (draft.lastName !== account.lastName) changes.lastName = draft.lastName;
    if ((draft.suffix ?? '') !== (account.suffix ?? '')) changes.suffix = draft.suffix ?? '';
    if ((draft.mobile ?? '') !== (account.mobile ?? '')) changes.mobile = draft.mobile ?? '';
    if (hasBarangayAssignment && draft.barangay?.name !== account.barangay?.name) changes.barangay = draft.barangay?.name ?? '';
    if (!Object.keys(changes).length) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ undoToken: string }>('PATCH', `/accounts/${account.id}`, changes);
      onSaved(result.undoToken);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save account details.');
    } finally {
      setBusy(false);
    }
  };
  const renewTemporaryPassword = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await api<{ temporaryPassword: string }>('POST', `/accounts/${account.id}/renew-temp-password`, {});
      setRenewedPassword(result.temporaryPassword);
      setConfirmRenew(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not renew the temporary password.');
    } finally {
      setBusy(false);
    }
  };

  return <Modal title={editable ? `Edit ${roleLabel(account.accountType)} account` : `${roleLabel(account.accountType)} account details`} onClose={onClose}>
    {error && <div className="mb-3"><Notice kind="error">{error}</Notice></div>}
    <div className="space-y-3">
      {editable ? <>
        <Field label="First name"><input className={inputCls} required maxLength={80} value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} /></Field>
        <Field label="Middle name"><input className={inputCls} maxLength={80} value={draft.middleName ?? ''} onChange={(event) => setDraft({ ...draft, middleName: event.target.value })} /></Field>
        <Field label="Last name"><input className={inputCls} required maxLength={80} value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} /></Field>
        <Field label="Suffix"><input className={inputCls} maxLength={80} value={draft.suffix ?? ''} onChange={(event) => setDraft({ ...draft, suffix: event.target.value })} /></Field>
        <Field label="Mobile number" hint="Use a Philippine mobile number like 0917-123-4567.">
          <input className={inputCls} required pattern="09[0-9]{2}[- ]?[0-9]{3}[- ]?[0-9]{4}" placeholder="0917-123-4567" value={draft.mobile ?? ''} onChange={(event) => setDraft({ ...draft, mobile: event.target.value })} onBlur={() => { const digits = String(draft.mobile ?? '').replace(/\D/g, ''); if (/^09\d{9}$/.test(digits)) setDraft({ ...draft, mobile: `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}` }); }} />
        </Field>
        {hasBarangayAssignment
          ? <Field label="Barangay">
            <ReferenceInput source="barangay" value={draft.barangay?.name ?? ''} onChange={(value) => setDraft({ ...draft, barangay: value ? { id: draft.barangay?.id ?? 0, name: value, acronym: draft.barangay?.acronym ?? '' } : null })} className={inputCls} />
          </Field>
          : <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Role and login ID:</strong> {roleLabel(account.accountType)} · {account.username ?? account.accountKey}</p>}
      </> : <>
        <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Name:</strong> {account.fullName}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Username / account key:</strong> {account.username ?? account.accountKey}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Mobile:</strong> {account.mobile ?? '—'}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Barangay:</strong> {account.barangay?.name ?? '—'}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Status:</strong> {account.status}</p>
        <p className="text-xs text-slate-500">Role, login ID, and password are managed separately and cannot be changed here.</p>
      </>}
      {canRenewPassword && <section className="border-t border-slate-200 pt-4 dark:border-slate-700">
        <h3 className="text-sm font-semibold">Temporary password</h3>
        <p className="mt-1 text-xs text-slate-500">Renewing invalidates the current password and issues a new one-time password. The Paravet must choose a new password at sign-in.</p>
        {renewedPassword && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" role="status">
          <p className="font-semibold">Show this password to the Paravet now. It is displayed only once and expires in 15 minutes.</p>
          <code className="mt-2 block select-all text-lg font-bold tracking-wider">{renewedPassword}</code>
        </div>}
        {confirmRenew && <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
          <p className="text-sm">Issue a fresh temporary password for {account.fullName}? Their current password will stop working immediately.</p>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setConfirmRenew(false)} className={btnGhost}>Cancel</button>
            <button type="button" disabled={busy} onClick={() => void renewTemporaryPassword()} className={btnPrimary}>{busy ? 'Renewing…' : 'Confirm renewal'}</button>
          </div>
        </div>}
        {!confirmRenew && <button type="button" disabled={busy} onClick={() => { setRenewedPassword(null); setConfirmRenew(true); }} className={`${btnGhost} mt-3`}>Renew temporary password</button>}
      </section>}
    </div>
    {archiveConfirm&&<ConfirmDialog title={account.archived?'Restore Paravet access?':'Remove Paravet access?'} message="Submissions and original actor/barangay history remain. Deactivation prevents sign-in; restoring re-enables the account subject to its status." confirmLabel={account.archived?'Restore access':'Deactivate account'} danger={!account.archived} busy={busy} onClose={()=>setArchiveConfirm(false)} onConfirm={()=>{setBusy(true);void api('POST','/accounts/archive',{ids:[account.id],restore:account.archived}).then(()=>onSaved('')).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}/>}
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      {account.accountType==='Paravet'&&<button className={btnGhost} disabled={busy} onClick={()=>setArchiveConfirm(true)}>{account.archived?'Restore access':'Remove access'}</button>}
      <button type="button" onClick={onClose} className={btnGhost}>{editable ? 'Cancel' : 'Close'}</button>
      {editable && <button type="button" onClick={() => void save()} disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Save account'}</button>}
    </div>
  </Modal>;
}
