import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CensusSheetEditor, type SheetValues } from '../../components/CensusSheetEditor';
import { btnDanger, btnGhost, btnPrimary, ConfirmDialog, inputCls, Loading, Modal, Notice, StatusBadge, formatDate, Select } from '../../components/ui';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n/messages';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fromDetail, type SubmissionDetail } from '../../lib/census';
import { useApi } from '../../lib/useApi';
import { SubmissionForms } from './SubmissionForms';
import { CensusApprovalModal, CensusOwnerReviewCard, savedCensusChoice, type CensusChoice } from './CensusReviewWidgets';
import { matchAction, censusActionLabel, type CensusAction } from '../../../shared/censusReview';

type ReviewStatusInfo = {
  status: string;
  canUndo: boolean;
  canRedo: boolean;
  undoReason: string | null;
  redoReason: string | null;
  hasSnapshot: boolean;
  history: { actorName: string; fromStatus: string; toStatus: string; action: string; note: string | null; createdAt: string }[];
};

function Photo({ submissionId, attachmentId, onOpen }: { submissionId: string; attachmentId: number; onOpen: (src: string) => void }) {
  const { t } = useT();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ mime: string; data: string }>('GET', `/census/submissions/${submissionId}/attachments/${attachmentId}`)
      .then((r) => { if (live) setSrc(`data:${r.mime};base64,${r.data}`); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [submissionId, attachmentId]);
  if (failed) return <p className="grid h-40 place-items-center rounded-xl border border-slate-200 p-3 text-center text-xs text-slate-500 dark:border-night-border">{t('census.detail.photoFailed')}</p>;
  if (!src) return <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-night-tile" />;
  return (
    <button type="button" onClick={() => onOpen(src)} className="overflow-hidden rounded-xl border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-night-border">
      <img src={src} alt="" className="h-40 w-full object-cover" />
    </button>
  );
}

/** One submission. Paravets see their own and can correct, withdraw or resend; staff review and decide. */
export function SubmissionDetailPage() {
  const { t } = useT();
  const { id = '' } = useParams();
  const { account, can } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi<SubmissionDetail>(`/census/submissions/${id}`);
  const staff = can('census.review');
  const reviewStatus = useApi<ReviewStatusInfo>(staff ? `/census/submissions/${id}/status` : null);
  const [choices, setChoices] = useState<Record<string, CensusChoice>>({});
  const [dirty, setDirty] = useState(false);
  const [changedOwners, setChangedOwners] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [nextStatus, setNextStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'withdraw' | 'delete' | 'approve' | 'reject' | 'status' | null>(null);

  const isParavet = account?.type === 'Paravet';
  const pending = data?.submission.status === 'pending';

  useEffect(() => {
    if (!data || dirty) return;
    setChoices(Object.fromEntries(data.owners.map((o) => [o.id, savedCensusChoice(o)])));
    setNextStatus(data.submission.status === 'approved' || data.submission.status === 'rejected' ? data.submission.status : 'pending');
  }, [data, dirty]);

  const allChosen = useMemo(() => !!data && data.owners.length > 0 && data.owners.every((o) => (choices[o.id]?.decision ?? 'pending') !== 'pending'), [data, choices]);
  const canSave = changedOwners.size > 0 && [...changedOwners].every((id) => {
    const c = choices[id]; return c && c.decision !== 'pending' && (!matchAction(c.decision) || (!!c.matchedOwnerId && !!c.comparisonToken && c.reviewed && c.reason.trim().length >= 3));
  });

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true); setMessage(null);
    try { await action(); } catch (err) { setMessage({ kind: 'error', text: err instanceof Error ? err.message : t('common.loadFailed') }); } finally { setBusy(false); }
  }, [t]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice kind="error">{error?.message ?? t('common.loadFailed')}</Notice>;
  const { submission, owners, attachments } = data;
  const backTo = isParavet ? '/census/mine' : `/census/review/${submission.status === 'withdrawn' ? 'pending' : submission.status}`;

  const saveDecisions = () => run(async () => {
    const decisions = [...changedOwners].map((ownerId) => ({ ownerId, ...choices[ownerId] }));
    await api('PUT', `/census/submissions/${id}/decisions`, { decisions });
    setDirty(false); setChangedOwners(new Set());
    setMessage({ kind: 'success', text: t('census.detail.decisionsSaved') });
    reload();
  });
  const suggest = () => {
    const candidates = owners.filter((o) => !o.candidates.length && (choices[o.id]?.decision ?? 'pending') === 'pending');
    setChoices((current) => ({ ...current, ...Object.fromEntries(candidates.map((o) => [o.id, { decision: 'new', matchedOwnerId: null, reason: '', reviewed: false }])) }));
    setChangedOwners((current) => new Set([...current, ...candidates.map((o) => o.id)]));
    setDirty(true);
  };
  const review = (decision: 'approve' | 'reject', reviewToken?: string) => run(async () => {
    const result = await api<{ newOwners?: number; updatedOwners?: number; newPets?: number }>('POST', `/census/submissions/${id}/review`, { decision, note, reviewToken });
    setConfirm(null);
    setMessage({ kind: 'success', text: decision === 'approve' ? t('census.detail.approved', { newOwners: result.newOwners ?? 0, updatedOwners: result.updatedOwners ?? 0, newPets: result.newPets ?? 0 }) : t('census.detail.rejectedDone') });
    reload(); reviewStatus.reload();
  });
  const applyStatus = (status: 'pending' | 'approved' | 'rejected', reviewToken?: string) => run(async () => {
    await api('POST', `/census/submissions/${id}/status`, { action: 'set-status', status, note, reviewToken });
    setConfirm(null);
    setMessage({ kind: 'success', text: `Census status changed to ${status}.` });
    reload(); reviewStatus.reload();
    navigate(`/census/review/${status}/${id}`, { replace: true });
  });
  const reverseApproval = (action: 'undo' | 'redo') => run(async () => {
    await api('POST', `/census/submissions/${id}/status`, { action });
    const status = action === 'undo' ? 'pending' : 'approved';
    setMessage({ kind: 'success', text: action === 'undo' ? 'The approval was safely undone.' : 'The approval was safely redone.' });
    reload(); reviewStatus.reload();
    navigate(`/census/review/${status}/${id}`, { replace: true });
  });
  const encode = async (values: SheetValues) => { await api('PATCH', `/census/submissions/${id}`, { owners: values.owners }); setMessage({ kind: 'success', text: t('census.saved') }); reload(); };

  return (
    <div className="w-full">
      <Link to={backTo} className="text-sm text-brand-700 hover:underline dark:text-brand-500">← {t('common.back')}</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{submission.label}</h1><StatusBadge status={submission.status} />
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {submission.barangay} · {submission.submitter} · {formatDate(submission.censusDate)} · {t('census.meta.households')}: {submission.householdsVisited} · {t(`census.source.${submission.source}` as MessageKey)}
      </p>
      {submission.reviewerName && <p className="mt-1 text-sm text-slate-500">{t('census.detail.reviewedBy', { name: submission.reviewerName })}{submission.reviewedAt ? `, ${formatDate(submission.reviewedAt)}` : ''}</p>}
      {submission.reviewNote && <div className="mt-3"><Notice kind={submission.status === 'rejected' ? 'error' : 'info'}><span className="font-medium">{t('census.detail.reason')}:</span> {submission.reviewNote}</Notice></div>}
      {message && <div className="mt-3"><Notice kind={message.kind}>{message.text}</Notice></div>}

      {staff && (
        <section className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-night-border">
          <h2 className="text-sm font-semibold">Review status and history</h2>
          {reviewStatus.error && <div className="mt-3"><Notice kind="error">{reviewStatus.error.message}</Notice></div>}
          {nextStatus === 'rejected' && <label className="mt-3 block text-sm"><span className="font-medium">{t('census.detail.note')}</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} className={`${inputCls} mt-1`} />
          </label>}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-48 text-sm"><span className="font-medium">Change status</span>
              <Select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as typeof nextStatus)} className={`${inputCls} mt-1`}
                disabled={busy}>
                <option value="pending" disabled={submission.status === 'approved' && !reviewStatus.data?.canUndo}>Pending</option>
                <option value="approved" disabled={submission.status !== 'pending' && submission.status !== 'approved'}>Approved</option><option value="rejected" disabled={submission.status === 'approved' && !reviewStatus.data?.canUndo}>Rejected</option>
              </Select>
            </label>
            <button type="button" className={btnPrimary}
              disabled={busy || nextStatus === submission.status || (nextStatus === 'rejected' && note.trim().length < 3)
                || (nextStatus === 'approved' && submission.status === 'pending' && (dirty || !allChosen))}
              onClick={() => setConfirm('status')}>Save status</button>
            {reviewStatus.data?.canUndo && <button type="button" className={btnGhost} disabled={busy} onClick={() => void reverseApproval('undo')}>Undo approval</button>}
            {reviewStatus.data?.canRedo && <button type="button" className={btnGhost} disabled={busy} onClick={() => void reverseApproval('redo')}>Redo approval</button>}
          </div>
          {submission.status === 'approved' && reviewStatus.data?.undoReason && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{reviewStatus.data.undoReason}</p>}
          {submission.status === 'pending' && reviewStatus.data?.redoReason && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{reviewStatus.data.redoReason}</p>}
          {reviewStatus.data?.history.length ? <ol className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-xs dark:border-night-border">
            {reviewStatus.data.history.map((entry, index) => <li key={`${entry.createdAt}:${index}`}>
              <span className="font-medium">{entry.fromStatus} → {entry.toStatus}</span> · {entry.action} · {entry.actorName} · {formatDate(entry.createdAt)}
              {entry.note && <span className="block text-slate-500">{entry.note}</span>}
            </li>)}
          </ol> : reviewStatus.loading ? <p className="mt-3 text-xs text-slate-500">Loading review history…</p> : null}
        </section>
      )}

      {attachments.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">{t('census.detail.photos')}</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {attachments.map((a) => <Photo key={a.id} submissionId={id} attachmentId={a.id} onOpen={setViewer} />)}
          </div>
        </section>
      )}

      <details className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-night-border"><summary className="cursor-pointer text-sm font-semibold">Printable census forms</summary><SubmissionForms detail={data} /></details>

      {staff && pending && submission.source === 'image' && (
        <section className="mt-6 rounded-2xl border border-slate-200 p-4 dark:border-night-border">
          <h2 className="text-sm font-semibold">{t('census.detail.encode')}</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">{t('census.detail.encodeHelp')}</p>
          <CensusSheetEditor key={owners.map((o) => o.id).join()} showMeta={false} initial={{ label: '', censusDate: submission.censusDate, householdsVisited: 0, owners: fromDetail(owners) }} submitLabel={t('census.save')} onSubmit={encode} />
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold">{t('census.detail.owners')} ({owners.length})</h2>
        {owners.length === 0 ? <p className="py-6 text-sm text-slate-500">{t('census.detail.noOwners')}</p> : (
          <fieldset disabled={busy} className="mt-2"><legend className="sr-only">Owner approval decisions</legend><ul className="space-y-3">
            {owners.map((owner) => (
              <CensusOwnerReviewCard key={owner.id} submissionId={id} owner={owner} editable={staff && pending} choice={choices[owner.id] ?? savedCensusChoice(owner)}
                onChoose={(next) => { setChoices((current) => ({ ...current, [owner.id]: next })); setChangedOwners((current) => new Set([...current, owner.id])); setDirty(true); }} />
            ))}
          </ul></fieldset>
        )}
      </section>

      {staff && pending && owners.length > 0 && (
        <section className="mt-6 space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-night-border">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={suggest} className={btnGhost}>{t('census.detail.suggest')}</button>
            <button type="button" onClick={saveDecisions} disabled={busy || !dirty || !canSave} className={btnGhost}>{t('census.detail.saveDecisions')}</button>
          </div>
          <label className="block text-sm"><span className="font-medium">{t('census.detail.note')}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className={`${inputCls} mt-1`} />
            <span className="mt-1 block text-xs text-slate-500">{t('census.detail.noteHelp')}</span>
          </label>
          {dirty && <p className="text-sm text-amber-700 dark:text-amber-300">{t('census.detail.unsaved')}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setConfirm('approve')} disabled={busy || dirty || !allChosen} className={btnPrimary}>{t('census.detail.approve')}</button>
            <button type="button" onClick={() => setConfirm('reject')} disabled={busy || note.trim().length < 3} className={btnDanger}>{t('census.detail.reject')}</button>
          </div>
        </section>
      )}

      {staff && data.decisionHistory?.length > 0 && <details className="mt-6 rounded-xl border border-slate-200 p-4 dark:border-night-border"><summary className="cursor-pointer text-sm font-semibold">Owner decision history ({data.decisionHistory.length} most recent)</summary><ol className="mt-3 space-y-3">{data.decisionHistory.map((h) => <li key={h.id} className="border-l-2 border-brand-300 pl-3 text-sm"><p className="font-medium">{String(h.after.ownerName)} · {h.actor}</p><p>{censusActionLabel[h.after.decision as CensusAction] ?? String(h.after.decision)}</p><p>{String(h.after.reason ?? 'No match reason required for this action.')}</p><p className="text-xs text-slate-500">{formatDate(h.createdAt)}</p></li>)}</ol></details>}

      {staff && pending && owners.length === 0 && (
        <section className="mt-6"><button type="button" onClick={() => setConfirm('reject')} disabled={busy || note.trim().length < 3} className={btnDanger}>{t('census.detail.reject')}</button>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} aria-label={t('census.detail.note')} className={`${inputCls} mt-3`} /></section>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {isParavet && pending && (
          <>
            <Link to={`/census/mine/${id}/edit`} className={btnGhost}>{t('census.detail.edit')}</Link>
            <button type="button" onClick={() => setConfirm('withdraw')} className={btnDanger}>{t('census.detail.withdraw')}</button>
          </>
        )}
        {isParavet && submission.status === 'rejected' && (
          <button type="button" disabled={busy} className={btnPrimary} onClick={() => run(async () => {
            const copy = await api<{ id: string }>('POST', `/census/submissions/${id}/resubmit`, {});
            navigate(`/census/mine/${copy.id}/edit`);
          })}>{t('census.detail.resubmit')}</button>
        )}
        {can('census.delete') && submission.status !== 'approved' && <button type="button" onClick={() => setConfirm('delete')} className={btnDanger}>{t('census.detail.delete')}</button>}
      </div>

      {viewer && <Modal wide title={t('census.detail.photos')} onClose={() => setViewer(null)}><img src={viewer} alt="" className="mx-auto max-h-[75dvh] w-auto max-w-full" /></Modal>}
      {(confirm === 'approve' || (confirm === 'status' && nextStatus === 'approved')) ? <CensusApprovalModal submissionId={id} busy={busy} failure={message?.kind === 'error' ? message.text : undefined} onClose={() => setConfirm(null)} onConfirm={(token) => { if (confirm === 'status') void applyStatus('approved', token); else void review('approve', token); }}/> : confirm && (
        <ConfirmDialog danger title={confirm === 'status' ? 'Change census status' : confirm === 'reject' ? t('census.detail.reject') : t(confirm === 'withdraw' ? 'census.detail.withdraw' : 'census.detail.delete')} message={confirm === 'status' ? `Change this submission from ${submission.status} to ${nextStatus}? Approval changes will be safely reversed when possible.` : confirm === 'reject' ? 'The submission will be rejected and the note will be saved.' : t(confirm === 'withdraw' ? 'census.detail.confirmWithdraw' : 'census.detail.confirmDelete')}
          confirmLabel={confirm === 'status' ? `Change to ${nextStatus}` : confirm === 'reject' ? t('census.detail.reject') : t(confirm === 'withdraw' ? 'census.detail.withdraw' : 'census.detail.delete')} busy={busy} onClose={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === 'status') { const target = nextStatus; setConfirm(null); void applyStatus(target); return; }
            if (confirm === 'reject') { setConfirm(null); void review('reject'); return; }
            void run(async () => {
            await api('DELETE', `/census/submissions/${id}${confirm === 'delete' ? '?permanent=true' : ''}`);
            navigate(backTo, { replace: true });
          }); }} />
      )}
    </div>
  );
}
