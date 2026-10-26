import { useEffect, useState, type FormEvent } from 'react';
import { InfoTip, Field, inputCls, Loading, Notice, Pagination, btnGhost, btnPrimary, btnDanger, Select, districtOptions, statusLabel } from '../components/ui';
import { api } from '../lib/api';
import { GRANT_PERMISSIONS_BY_ROLE, type GrantPermission } from '../../shared/permissions';
import { useAuth } from '../lib/auth';

type Barangay = { id: number; name: string };
type PageResult<T> = { data: T[]; total: number };
type Grant = {
  id: number; granteeId: number; granteeName: string; granteeType: string; permission: string;
  barangayId: number | null; barangay: string | null; reason: string; grantedByName: string;
  grantedAt: string; expiresAt: string; revokedAt: string | null;
};
type Target = { id: number; name: string; type: string; barangayId: number | null };
type PermissionRequest = {
  id: number; requesterName: string; requesterType: string; permission: string; barangay: string | null;
  reason: string; status: string; decisionReason: string | null; remarks: string | null; createdAt: string;
};
type Issue = {
  id: number; reporterName: string; title: string; description: string; severity: string; status: string;
  resolution: string | null; resolvedByName: string | null; createdAt: string;
};
const permissions = ['archive', 'restore', 'delete_submission', 'export_with_ids'] as const;
const card = 'rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-surface-dark';
const PAGE_SIZE = 25;
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function AccessGrantsPage() {
  const [rows, setRows] = useState<Grant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [targets, setTargets] = useState<Target[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [granteeId, setGranteeId] = useState('');
  const [permission, setPermission] = useState<(typeof permissions)[number] | 'all'>('archive');
  const [barangayId, setBarangayId] = useState('');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(7);
  const [revokeId, setRevokeId] = useState<number | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const selectedTarget = targets.find((target) => String(target.id) === granteeId);
  const availablePermissions = selectedTarget ? GRANT_PERMISSIONS_BY_ROLE[selectedTarget.type as 'Admin' | 'Paravet'] ?? [] : [];
  const chooseTarget = (value: string) => {
    setGranteeId(value);
    const target = targets.find((item) => String(item.id) === value);
    setPermission('archive');
    setBarangayId(target?.type === 'Paravet' && target.barangayId ? String(target.barangayId) : '');
  };

  useEffect(() => {
    let live = true;
    void api<{ data: Grant[]; targets: Target[]; barangays: Barangay[]; total: number }>('GET', `/access/grants?page=${page}&pageSize=${PAGE_SIZE}`)
      .then((result) => { if (live) { setRows(result.data); setTotal(result.total); setTargets(result.targets); setBarangays(result.barangays); setError(''); } })
      .catch((failure: unknown) => { if (live) setError(errorMessage(failure, 'Could not load access grants.')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [page, reload]);
  const grant = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('POST', '/access/grants', { granteeId: Number(granteeId), permission, barangayId: barangayId ? Number(barangayId) : null, reason, days });
      setReason(''); setReload((value) => value + 1);
    } catch (failure) { setError(errorMessage(failure, 'Could not grant access.')); }
    finally { setBusy(false); }
  };
  const revoke = async (id: number) => {
    setBusy(true); setError('');
    try {
      await api('DELETE', `/access/grants/${id}`, { reason: revokeReason });
      setRevokeId(null); setRevokeReason(''); setReload((value) => value + 1);
    } catch (failure) { setError(errorMessage(failure, 'Could not revoke access.')); }
    finally { setBusy(false); }
  };

  return <div className="w-full space-y-5">
    <div><h1 className="text-2xl font-semibold">Temporary Access Grants<InfoTip>Grant a supported permission to an active Admin or Paravet for up to 30 days.</InfoTip></h1></div>
    {error && <Notice kind="error">{error}</Notice>}
    <form onSubmit={(event) => void grant(event)} className={`${card} grid gap-3 sm:grid-cols-2`}>
      <Field label="Account"><Select required className={inputCls} value={granteeId} onChange={(event) => chooseTarget(event.target.value)}><option value="">Choose an active staff account</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.name} · {target.type}</option>)}</Select></Field>
      <Field label="Permission"><Select disabled={!selectedTarget} className={inputCls} value={permission} onChange={(event) => setPermission(event.target.value as typeof permission)}>{availablePermissions.length > 1 && <option value="all">All permissions available to {selectedTarget?.type}</option>}{availablePermissions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></Field>
      <Field label="Barangay scope"><Select className={inputCls} value={barangayId} onChange={(event) => setBarangayId(event.target.value)}><option value="">All barangays</option>{districtOptions(barangays, (item) => item.id, (item) => `${item.name}${selectedTarget?.type === 'Paravet' && selectedTarget.barangayId === item.id ? ' · assigned barangay' : ''}`)}</Select></Field>
      <Field label="Duration (days)"><input className={inputCls} type="number" min={1} max={30} value={days} onChange={(event) => setDays(Number(event.target.value))} /></Field>
      <Field label="Reason"><input className={inputCls} required minLength={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <div className="flex items-end"><button className={btnPrimary} disabled={busy || !granteeId || reason.trim().length < 3}>Grant access</button></div>
    </form>
    {loading ? <Loading /> : <div className="space-y-3">
      {rows.map((row) => <article key={row.id} className={`${card} grid gap-3 md:grid-cols-[1fr_auto]`}>
        <div><h2 className="font-semibold">{row.permission} · {row.granteeName}</h2><p className="text-sm text-slate-500">{row.granteeType} · {row.barangay ?? 'All barangays'} · expires {date(row.expiresAt)}</p><p className="mt-1 text-sm">{row.reason}</p>
          {row.revokedAt && <p className="text-xs text-red-700">Revoked {date(row.revokedAt)}</p>}</div>
        {!row.revokedAt && <div className="flex items-end gap-2"><input aria-label="Revocation reason" className={`${inputCls} max-w-56`} placeholder="Reason to revoke" value={revokeId === row.id ? revokeReason : ''} onFocus={() => setRevokeId(row.id)} onChange={(event) => { setRevokeId(row.id); setRevokeReason(event.target.value); }} /><button type="button" disabled={busy || revokeId !== row.id || revokeReason.trim().length < 3} className={btnDanger} onClick={() => void revoke(row.id)}>Revoke</button></div>}
      </article>)}
      {!rows.length && <p className="py-8 text-center text-sm text-slate-500">No access grants have been issued.</p>}
    </div>}
    {!loading && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
  </div>;
}

export function AccessHubPage() {
  const { account } = useAuth();
  if (account?.type === 'SuperAdmin') return <div className="space-y-8"><AccessGrantsPage /><div className="border-t border-slate-200 pt-6 dark:border-slate-700"><AccessRequestsPage /></div></div>;
  return <AccessRequestsPage />;
}

export function AccessRequestsPage() {
  const { account } = useAuth();
  const isSuperAdmin = account?.type === 'SuperAdmin';
  const [rows, setRows] = useState<PermissionRequest[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [permission, setPermission] = useState<(typeof permissions)[number]>('archive');
  const [barangayId, setBarangayId] = useState('');
  const [reason, setReason] = useState('');
  const [drafts, setDrafts] = useState<Record<number, { reason: string; remarks: string; days: number }>>({});
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    void Promise.all([
      api<PageResult<PermissionRequest>>('GET', `/access/requests?status=${status}&page=${page}&pageSize=${PAGE_SIZE}`),
      api<{ data: Barangay[] }>('GET', '/barangays?pageSize=100'),
    ]).then(([result, reference]) => { if (live) { setRows(result.data); setTotal(result.total); setBarangays(reference.data); setError(''); } })
      .catch((failure: unknown) => { if (live) setError(errorMessage(failure, 'Could not load permission requests.')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [status, page, reload]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('POST', '/access/requests', { permission, barangayId: barangayId ? Number(barangayId) : null, reason });
      setReason(''); setReload((value) => value + 1);
    } catch (failure) { setError(errorMessage(failure, 'Could not submit permission request.')); }
    finally { setBusy(false); }
  };
  const decide = async (id: number, approve: boolean) => {
    const draft = drafts[id] ?? { reason: '', remarks: '', days: 7 };
    setBusy(true); setError('');
    try {
      await api('POST', `/access/requests/${id}/decision`, { approve, ...draft });
      setReload((value) => value + 1);
    } catch (failure) { setError(errorMessage(failure, 'Could not decide the permission request.')); }
    finally { setBusy(false); }
  };
  const draftFor = (id: number) => drafts[id] ?? { reason: '', remarks: '', days: 7 };
  const setDraft = (id: number, value: Partial<{ reason: string; remarks: string; days: number }>) =>
    setDrafts((current) => ({ ...current, [id]: { ...draftFor(id), ...value } }));

  return <div className="w-full space-y-5">
    <div><h1 className="text-2xl font-semibold">Permission Requests<InfoTip>{isSuperAdmin ? 'Review Admin requests. Approval creates a temporary access grant.' : 'Request temporary access to a supported staff permission.'}</InfoTip></h1></div>
    {error && <Notice kind="error">{error}</Notice>}
    {!isSuperAdmin && <form onSubmit={(event) => void submit(event)} className={`${card} grid gap-3 sm:grid-cols-2`}>
      <Field label="Permission"><Select className={inputCls} value={permission} onChange={(event) => setPermission(event.target.value as typeof permission)}>{permissions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></Field>
      <Field label="Barangay scope"><Select className={inputCls} value={barangayId} onChange={(event) => setBarangayId(event.target.value)}><option value="">All barangays</option>{districtOptions(barangays)}</Select></Field>
      <Field label="Reason"><input className={inputCls} required minLength={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <div className="flex items-end"><button className={btnPrimary} disabled={busy || reason.trim().length < 3}>Submit request</button></div>
    </form>}
    <div className="flex items-end gap-3"><Field label="Request status"><Select className={inputCls} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All</option></Select></Field><button type="button" className={btnGhost} onClick={() => setReload((value) => value + 1)}>Refresh</button><button type="button" className={btnGhost} onClick={() => { setStatus('pending'); setPage(1); }}>Clear filters</button></div>
    {loading ? <Loading /> : <div className="space-y-3">
      {rows.map((row) => {
        const draft = draftFor(row.id);
        return <article key={row.id} className={card}>
          <h2 className="font-semibold">{row.permission} · {row.requesterName}</h2>
          <p className="text-sm text-slate-500">{row.requesterType} · {row.barangay ?? 'All barangays'} · {statusLabel(row.status)} · {date(row.createdAt)}</p>
          <p className="mt-2 text-sm">{row.reason}</p>
          {row.decisionReason && <p className="mt-2 text-sm">Decision: {row.decisionReason} · {row.remarks}</p>}
          {isSuperAdmin && row.status === 'pending' && <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Decision reason"><input className={inputCls} minLength={3} maxLength={300} value={draft.reason} onChange={(event) => setDraft(row.id, { reason: event.target.value })} /></Field>
            <Field label="Remarks"><input className={inputCls} minLength={1} maxLength={500} value={draft.remarks} onChange={(event) => setDraft(row.id, { remarks: event.target.value })} /></Field>
            <Field label="Grant duration (days)"><input className={inputCls} type="number" min={1} max={30} value={draft.days} onChange={(event) => setDraft(row.id, { days: Number(event.target.value) })} /></Field>
            <div className="flex items-end gap-2"><button type="button" disabled={busy || draft.reason.trim().length < 3 || !draft.remarks.trim()} className={btnDanger} onClick={() => void decide(row.id, false)}>Reject</button><button type="button" disabled={busy || draft.reason.trim().length < 3 || !draft.remarks.trim()} className={btnPrimary} onClick={() => void decide(row.id, true)}>Approve and grant</button></div>
          </div>}
        </article>;
      })}
      {!rows.length && <p className="py-8 text-center text-sm text-slate-500">No requests in this status.</p>}
    </div>}
    {!loading && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
  </div>;
}

export function IssuesPage() {
  const [rows, setRows] = useState<Issue[]>([]);
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, { status: string; resolution: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    void api<PageResult<Issue>>('GET', `/issues?status=${status}&page=${page}&pageSize=${PAGE_SIZE}`)
      .then((result) => { if (live) { setRows(result.data); setTotal(result.total); setError(''); } })
      .catch((failure: unknown) => { if (live) setError(errorMessage(failure, 'Could not load issue reports.')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [status, page, reload]);
  const draftFor = (row: Issue) => drafts[row.id] ?? { status: row.status, resolution: row.resolution ?? '' };
  const update = async (row: Issue) => {
    const draft = draftFor(row);
    setBusy(row.id); setError('');
    try {
      await api('PATCH', `/issues/${row.id}`, draft);
      setReload((value) => value + 1);
    } catch (failure) { setError(errorMessage(failure, 'Could not update this issue.')); }
    finally { setBusy(null); }
  };
  return <div className="w-full">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Issue Reports<InfoTip>Track reports submitted by Admins and Paravets.</InfoTip></h1></div>
      <div className="flex items-end gap-2"><Field label="Status"><Select className={inputCls} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All</option></Select></Field><button type="button" className={btnGhost} onClick={() => { setStatus('open'); setPage(1); }}>Clear filters</button></div></div>
    {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
    {loading ? <Loading /> : <div className="mt-4 space-y-3">
      {rows.map((row) => {
        const draft = draftFor(row);
        return <article key={row.id} className={card}>
          <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{row.title}</h2><span className="text-xs text-slate-500">{statusLabel(row.severity)} · {statusLabel(row.status)}</span></div>
          <p className="mt-1 text-sm text-slate-500">From {row.reporterName} · {date(row.createdAt)}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm">{row.description}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <Field label="Status"><Select className={inputCls} value={draft.status} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, status: event.target.value } }))}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></Select></Field>
            <Field label="Resolution / update"><input className={inputCls} maxLength={1000} value={draft.resolution} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, resolution: event.target.value } }))} /></Field>
            <button type="button" className={btnPrimary} disabled={busy === row.id || (['resolved', 'dismissed'].includes(draft.status) && draft.resolution.trim().length < 3)} onClick={() => void update(row)}>{busy === row.id ? 'Saving…' : 'Save update'}</button>
          </div>
          {row.resolvedByName && <p className="mt-2 text-xs text-slate-500">Last resolved by {row.resolvedByName}</p>}
        </article>;
      })}
      {!rows.length && <p className="py-8 text-center text-sm text-slate-500">No issue reports in this status.</p>}
    </div>}
    {!loading && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
  </div>;
}

export function NewIssuePage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await api('POST', '/issues', { title, description, severity });
      setTitle(''); setDescription(''); setSeverity('normal'); setMessage('Your issue report was submitted to the system administrator.');
    } catch (failure) { setError(errorMessage(failure, 'Could not submit the issue report.')); }
    finally { setBusy(false); }
  };
  return <div className="max-w-3xl">
    <h1 className="text-2xl font-semibold">Report an Issue<InfoTip>Provide enough detail for the system administrator to investigate.</InfoTip></h1>
    <form onSubmit={(event) => void submit(event)} className={`${card} mt-4 space-y-4`}>
      {error && <Notice kind="error">{error}</Notice>}{message && <Notice kind="success">{message}</Notice>}
      <Field label="Short title"><input required minLength={3} maxLength={120} className={inputCls} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="What happened?"><textarea required minLength={10} maxLength={2000} rows={6} className={inputCls} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      <Field label="Severity"><Select className={inputCls} value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></Select></Field>
      <button type="submit" disabled={busy || title.trim().length < 3 || description.trim().length < 10} className={btnPrimary}>{busy ? 'Submitting…' : 'Submit issue report'}</button>
    </form>
  </div>;
}
