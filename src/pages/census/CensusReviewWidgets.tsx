import { useState } from 'react';
import { Link } from 'react-router-dom';
import { btnGhost, btnPrimary, inputCls, Loading, Modal, Notice, Select } from '../../components/ui';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import type { Decision, OwnerDetail } from '../../lib/census';
import { censusActionEffect, censusActionLabel, censusReviewLabels, censusReviewValue, matchAction,
  type CensusApprovalPlan, type CensusComparison, type CensusReviewRecord } from '../../../shared/censusReview';

export type CensusChoice = { decision: Decision; matchedOwnerId: string | null; reason: string; comparisonToken?: string; reviewed: boolean };
export const savedCensusChoice = (o: OwnerDetail): CensusChoice => ({ decision: o.decision, matchedOwnerId: o.matchedOwnerId,
  reason: o.decisionReason ?? '', reviewed: o.matchReviewed });

export function CensusRecordDetails({ record, title }: { record: CensusReviewRecord; title: string }) {
  return <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-night-border">
    <h3 className="font-semibold">{title}</h3><p className="break-words font-medium">{record.name}</p>
    <dl className="space-y-1 text-sm"><div><dt className="text-slate-500">Address</dt><dd className="break-words">{censusReviewValue(record.address)}</dd></div>
      <div><dt className="text-slate-500">Contact</dt><dd>{censusReviewValue(record.contact)}</dd></div></dl>
    <h4 className="text-sm font-semibold">Linked pets ({record.pets.length})</h4>
    {record.pets.map((pet) => <details key={pet.id} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-night-border">
      <summary className="cursor-pointer font-medium">{pet.name} · {censusReviewValue(pet.fields.species)} · {censusReviewValue(pet.fields.sex)}{pet.archived ? ' · Archived' : ''}</summary>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(pet.fields).filter(([key]) => key !== 'lineNo').map(([key, value]) => <div key={key} className="min-w-0">
        <dt className="text-xs text-slate-500">{censusReviewLabels[key] ?? key.replaceAll('_', ' ')}</dt><dd className="break-words">{censusReviewValue(value)}</dd>
      </div>)}</dl></details>)}
    {!record.pets.length && <p className="text-sm text-slate-500">No linked pets.</p>}
  </section>;
}
function ComparisonModal({ submissionId, owner, choice, onClose, onConfirm }: { submissionId: string; owner: OwnerDetail; choice: CensusChoice;
  onClose: () => void; onConfirm: (token: string, reason: string) => void }) {
  const { data, loading, error, reload } = useApi<CensusComparison>(`/census/submissions/${submissionId}/decisions?ownerId=${owner.id}&matchedOwnerId=${choice.matchedOwnerId}&decision=${choice.decision}`);
  const [reason, setReason] = useState(choice.reason), [ack, setAck] = useState(false);
  return <Modal wide title="Compare census and registry records" onClose={onClose}>
    {loading ? <Loading label="Loading the owner and all linked pets…"/> : error ? <div className="space-y-3"><Notice kind="error">{error.message}</Notice><button className={btnGhost} onClick={reload}>Try again</button></div> : data && <div className="space-y-4">
      <Notice>{data.effect}</Notice>
      <div className="grid gap-4 md:grid-cols-2"><CensusRecordDetails title="Submitted census" record={data.incoming}/><CensusRecordDetails title="Selected registry owner" record={data.existing}/></div>
      <p className="text-xs text-slate-500">A matching name is not proof of identity. Check the owner and participating pets against the available records. Archived pets remain in history and are not updated by this approval.</p>
      <label className="block text-sm font-medium">Reason for this match and action<textarea required minLength={3} maxLength={1000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} mt-1`}/></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1"/>I compared the owner and pets and confirmed this is the intended registry owner and action.</label>
      <div className="flex flex-wrap justify-end gap-2"><button className={btnGhost} onClick={onClose}>Back</button><button className={btnPrimary} disabled={!ack || reason.trim().length < 3} onClick={() => onConfirm(data.token, reason.trim())}>Use this reviewed match</button></div>
    </div>}
  </Modal>;
}
export function CensusOwnerReviewCard({ submissionId, owner, editable, choice, onChoose }: { submissionId: string; owner: OwnerDetail; editable: boolean; choice: CensusChoice; onChoose: (value: CensusChoice) => void }) {
  const [compare, setCompare] = useState(false);
  const { can } = useAuth();
  const incoming: CensusReviewRecord = { id: owner.id, name: owner.ownerName, address: owner.address, contact: owner.contact,
    pets: owner.pets.map(({ id, petName, ...fields }) => ({ id, name: petName, fields })) };
  return <li className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-night-border">
    <CensusRecordDetails title={`Owner entry ${owner.lineNo}`} record={incoming}/>
    {editable ? <div className="space-y-3">
      <label className="block text-sm font-medium">Approval action<Select value={choice.decision} onChange={(e) => onChoose({ decision: e.target.value as Decision, matchedOwnerId: null, reason: '', reviewed: false })} className={`${inputCls} mt-1`}>
        {Object.entries(censusActionLabel).filter(([key]) => owner.candidates.length || !matchAction(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </Select></label>
      <p className="text-sm text-slate-500">{censusActionEffect[choice.decision]}</p>
      {matchAction(choice.decision) && <>
        <label className="block text-sm font-medium">Choose the registry owner<Select value={choice.matchedOwnerId ?? ''} onChange={(e) => onChoose({ ...choice, matchedOwnerId: e.target.value || null, reason: '', comparisonToken: undefined, reviewed: false })} className={`${inputCls} mt-1`}>
          <option value="">Select an owner explicitly</option>{owner.candidates.map((c) => <option key={c.registryOwnerId} value={c.registryOwnerId}>{c.ownerName} · {c.address} · {c.petCount} active pets · {c.registryOwnerId.slice(0,8)}</option>)}
        </Select></label>
        <button type="button" disabled={!choice.matchedOwnerId} className={btnGhost} onClick={() => setCompare(true)}>{choice.reviewed ? 'Review comparison again' : 'Compare owner and pets'}</button>
        {choice.reviewed ? <p className="text-sm text-brand-700 dark:text-brand-300">Comparison confirmed · {choice.reason}</p> : <p className="text-sm text-amber-700 dark:text-amber-300">Compare the records and provide a reason before saving this decision.</p>}
      </>}
      {!owner.candidates.length && <p className="text-xs text-slate-500">No suggested owner with this name in the census barangay. Suggestions are review cues only.</p>}
    </div> : <div className="space-y-2 text-sm"><p className="font-medium">{censusActionLabel[owner.decision]}</p>{owner.decisionReason && <p>Reason: {owner.decisionReason}</p>}
      {owner.registryOwnerId && can('registry.view') && <Link className="text-brand-700 underline dark:text-brand-300" to={`/registry/owners?recordId=${encodeURIComponent(owner.registryOwnerId)}`}>View registry owner and pets</Link>}
    </div>}
    {compare && <ComparisonModal key={`${choice.matchedOwnerId}:${choice.decision}`} submissionId={submissionId} owner={owner} choice={choice} onClose={() => setCompare(false)} onConfirm={(token, reason) => { onChoose({ ...choice, comparisonToken: token, reason, reviewed: true }); setCompare(false); }}/>} 
  </li>;
}

export function CensusApprovalModal({ submissionId, busy, failure, onClose, onConfirm }: { submissionId: string; busy: boolean; failure?: string; onClose: () => void; onConfirm: (token: string) => void }) {
  const { data, loading, error, reload } = useApi<CensusApprovalPlan>(`/census/submissions/${submissionId}/decisions`);
  return <Modal wide title="Review approval summary" onClose={onClose} dismissible={!busy}>
    {failure && <div className="mb-3"><Notice kind="error">{failure}</Notice></div>}
    {loading ? <Loading label="Checking saved decisions and current registry records…"/> : error ? <Notice kind="error">{error.message}</Notice> : data && <div className="space-y-4">
      <p className="text-sm">Approval applies these saved decisions together. Census entries and review history are retained.</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{(['new','merge','replace','keep','reject'] as const).map((key) => <div key={key} className="rounded-lg bg-slate-50 p-3 dark:bg-night-tile"><dt className="text-xs">{censusActionLabel[key]}</dt><dd className="text-xl font-semibold">{data.counts[key]}</dd></div>)}<div className="rounded-lg bg-slate-50 p-3 dark:bg-night-tile"><dt className="text-xs">Pets submitted (includes excluded entries)</dt><dd className="text-xl font-semibold">{data.petCount}</dd></div></dl>
      {data.issues.map((issue) => <Notice key={issue} kind="error">{issue}</Notice>)}
      <ul className="space-y-3">{data.owners.map((o) => <li key={o.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-night-border"><p className="font-medium">{o.name} · {o.petCount} {o.petCount === 1 ? 'pet' : 'pets'}</p><p>{censusActionLabel[o.decision]}{o.matchName ? ` → ${o.matchName}` : ''}</p><p className="mt-1 text-slate-500">{o.effect}</p>{o.reason && <p className="mt-1">Reason: {o.reason}</p>}</li>)}</ul>
      <div className="flex flex-wrap justify-end gap-2"><button className={btnGhost} disabled={busy} onClick={onClose}>Back to review</button><button className={btnGhost} disabled={busy} onClick={reload}>Refresh summary</button><button className={btnPrimary} disabled={busy || !data.ready || !data.token} onClick={() => onConfirm(data.token!)}>{busy ? 'Applying approval…' : 'Approve these reviewed decisions'}</button></div>
    </div>}
    {busy && <Loading label="Saving approval and registry records…"/>}
  </Modal>;
}
