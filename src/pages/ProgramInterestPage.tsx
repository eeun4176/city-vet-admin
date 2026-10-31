import { ParticipantRegistryPicker } from '../components/ParticipantRegistryPicker';
import { InfoTip, ConfirmDialog, Select, mobileInput, mobileDigits, StatusPill } from '../components/ui';
import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { Check, Field, inputCls, Loading, Modal, Notice, TONE, btnIcon, btnGhost, btnPrimary, btnDanger } from '../components/ui';
import { Link,useNavigate,useSearchParams } from 'react-router-dom';

import { ChevronRight, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Sheet, sheetAdd, sheetCell } from '../components/PetSheet';
const ScheduleModal = lazy(() => import('./ProgramWorkspacePage').then(module => ({ default: module.ScheduleModal })));

const PROCESS_OPTIONS = ['Microchipping', 'Anti-Rabies Vaccine', 'Neuter/Spay'] as const;
type Process = typeof PROCESS_OPTIONS[number];
type Barangay = { id: number; name: string };
type ProgramOption = { programRecordId: number; recordId: string; title: string; date: string; location: string; barangayId: number; barangay: string; status: string; campaignId: number | null; slots: number | null; slotsUsed: number | null; durationMinutes: number | null; processes: Process[] };
type ParavetAssignment = { id: number; name: string; accountKey: string; barangayId: number; barangay: string };
type Campaign = {
  id: number; revision:number; reference: string; kind: 'program_request' | 'program_day'; hostBarangayId: number; hostBarangay: string;
  programRecordId: number | null; programTitle: string | null; programDate: string | null; programLocation: string | null; programStatus: string;
  requestedTargetPeople: number; approvedTargetPeople: number | null; targetPeople: number; processes: Process[]; status: string;
  requestNote: string | null; reviewNote: string | null; ownerCount: number; petCount: number;
  allowedBarangays: Barangay[]; programSlots: number | null; programSlotsUsed: number | null; programDurationMinutes: number | null;
  assignedParavets: ParavetAssignment[];
  createdByName: string | null; submittedByName: string | null; lastEditedBy: string | null; lastEditedAt: string | null;
  mergedIntoId: number | null; mergedInto: { reference: string; hostBarangay: string } | null;
};
type Pet = { name: string; species: 'Dog' | 'Cat'; sex?: 'Male' | 'Female'; ageMonths?: number; processes: Process[] };
type InterestPerson = { registry_owner_id?:string; id: number; owner_name: string; mobile: string | null; residence_barangay_id: number; residence_barangay: string; pets: Pet[]; status: string; duplicate_confirmed: boolean; created_at: string; added_by_name?: string | null; updated_by_name?: string | null };
type Details = { campaign: Campaign; people: InterestPerson[]; activity: { id: number; actorName: string; action: string; createdAt: string }[] };
type PageData = { campaigns: Campaign[]; barangays: Barangay[]; programs: ProgramOption[]; role: string; assignedBarangayId: number | null };
type DraftPet = { name: string; species: 'Dog' | 'Cat'; sex: 'Male' | 'Female' | ''; ageMonths: string; processes: Process[] };

const card = 'rounded-2xl border border-slate-200 bg-white p-4 dark:border-night-border dark:bg-surface-dark';
const whoLine = (campaign: Campaign) => [campaign.createdByName && `Filed by ${campaign.createdByName}`, campaign.submittedByName && `Sent by ${campaign.submittedByName}`, campaign.lastEditedBy && `Last edited by ${campaign.lastEditedBy}${campaign.lastEditedAt ? ` · ${new Date(campaign.lastEditedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })}` : ''}`].filter(Boolean).join(' · ');
const emptyPet = (processes: Process[] = []): DraftPet => ({ name: '', species: 'Dog', sex: '', ageMonths: '', processes: [...processes] });
const dateLabel = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T12:00:00+08:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' }) : 'Date not set';
const durationLabel = (minutes: number | null | undefined) => minutes == null ? 'Not set' : `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} hr ` : ''}${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();

export function ProgramInterestPage() {
  const [params,setParams]=useSearchParams();
  const { account } = useAuth();
  const isParavet = account?.type === 'Paravet';
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(()=>{const id=Number(params.get('campaignId'));setSelectedId(Number.isSafeInteger(id)&&id>0?id:null);},[params]);
  const openCampaign=(id:number)=>setParams(p=>{p.set('campaignId',String(id));return p;});
  const closeCampaign=()=>{setSelectedId(null);setParams(p=>{p.delete('campaignId');return p;},{replace:true});};
  const [programRecordId, setProgramRecordId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [merging, setMerging] = useState(false);
  const { data, loading, error: loadError, reload: reloadData } = useApi<PageData>(`/program-interest${reload ? `?refresh=${reload}` : ''}`);
  const campaigns = data?.campaigns ?? [];
  const programsForInterest = (data?.programs ?? []).filter((program) => !program.campaignId);
  const awaitingReview = campaigns.filter((campaign) => campaign.status === 'requested').length;
  const activeLists = campaigns.filter((campaign) => ['gathering', 'scheduled'].includes(campaign.status)).length;
  const totalInterests = campaigns.reduce((sum, campaign) => sum + campaign.ownerCount, 0);
  const barangayOptions = data?.barangays ?? [];
  const selectedProgram = programsForInterest.find((program) => String(program.programRecordId) === programRecordId);

  // Demand lists start in e-Vet Field (Paravets' program requests); staff only attach interest lists to scheduled programs here.
  const createCampaign = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await api<{ campaignId: number; reference: string; existing?: boolean }>('POST', '/program-interest', { action: 'create-program-day', programRecordId: Number(programRecordId) });
      setCreating(false); setProgramRecordId(''); setReload((value) => value + 1);
      setNotice(result.existing ? 'An interest list already exists for that program day.' : `Interest list ${result.reference} is ready.`);
      setSelectedId(result.campaignId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create the interest list.');
    } finally { setSaving(false); }
  };

  if (loading && !data) return <Loading label="Loading program interest lists…" />;
  if (loadError) return <div className="w-full"><Notice kind="error">{loadError.message}</Notice></div>;

  return <div className="w-full space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Program interest<InfoTip>Program requests from e-Vet Field and interest lists for scheduled programs. An interest entry is not a confirmed appointment and does not issue or reserve a physical stub.</InfoTip></h1></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setError(''); setCreating(true); }} className={btnPrimary}>Use a scheduled program</button>
        {!isParavet && <button type="button" onClick={() => setMerging(true)} className={btnGhost}>Merge requests</button>}
      </div>
    </header>

    {notice && <Notice kind="success">{notice}</Notice>}{error && <Notice kind="error">{error}</Notice>}
    <section className="grid gap-3 sm:grid-cols-3" aria-label="Interest overview">
      {[['Active lists', activeLists], ['Requests awaiting review', awaitingReview], ['Owner interest entries', totalInterests]].map(([label, value]) =>
        <article key={String(label)} className={card}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></article>)}
    </section>

    <section className={`${card} p-0`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-night-border">
        <h2 className="font-semibold">Interest lists and requests<InfoTip>Demand targets can vary by request. Each owner is counted once per list; pets and requested processes are tracked separately.</InfoTip></h2>
        <button type="button" title="Refresh" aria-label="Refresh lists and requests" onClick={() => { reloadData(); setReload((value) => value + 1); }} className={btnIcon}><RefreshCw aria-hidden className="h-4 w-4" /></button>
      </div>
      {loading && <Loading label="Refreshing lists…" />}
      {!loading && campaigns.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No program interest lists yet. Start a demand list or attach one to a scheduled program.</p>}
      {!!campaigns.length && <div className="record-table overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-night-surface"><tr>{['List','Host barangay','Program access','Interest','Status',''].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-night-border">{campaigns.map((campaign) => <tr key={campaign.id}>
          <td className="min-w-56 p-3"><p className="font-medium">{campaign.kind === 'program_request' ? 'New program request' : campaign.programTitle || 'Scheduled program'}</p><p className="font-mono text-xs text-slate-500">{campaign.reference}</p>{campaign.programDate && <p className="text-xs text-slate-500">{dateLabel(campaign.programDate)}</p>}{campaign.createdByName && <p className="text-xs text-slate-500">Filed by {campaign.createdByName}</p>}{campaign.mergedInto && <p className="text-xs text-violet-700 dark:text-violet-300">Merged into {campaign.mergedInto.reference}</p>}</td>
          <td className="whitespace-nowrap p-3">{campaign.hostBarangay}</td>
          <td className="max-w-56 p-3 text-slate-600 dark:text-night-muted">{campaign.allowedBarangays.map((item) => item.name).join(', ')}</td>
          <td className="whitespace-nowrap p-3"><strong>{campaign.ownerCount}</strong>{campaign.kind === 'program_request' ? ` / ${campaign.targetPeople} owners` : ' owners'}<p className="text-xs text-slate-500">{campaign.petCount} pets</p></td>
          <td className="p-3"><StatusPill status={campaign.status} /></td>
          <td className="whitespace-nowrap p-3"><button type="button" className={btnIcon} title="Open" aria-label={`Open ${campaign.programTitle || campaign.reference}`} onClick={() => openCampaign(campaign.id)}><ChevronRight aria-hidden className="h-4 w-4" /></button></td>
        </tr>)}</tbody></table></div>}
    </section>

    {creating && <Modal title="Use an existing program day" wide onClose={() => { if (!saving) { setCreating(false); setError(''); } }}>
      {error && <div className="mb-3"><Notice kind="error">{error}</Notice></div>}
      <form onSubmit={(event) => void createCampaign(event)} className="space-y-4">
        <p className="text-sm text-slate-500">Select a future program day that is already scheduled. Interested owners will be recorded separately from stub issuance and attendance.</p>
          <Field label="Scheduled program"><Select required className={inputCls} value={programRecordId} onChange={(event) => setProgramRecordId(event.target.value)}><option value="">Choose a program day</option>{programsForInterest.map((program) => <option key={program.programRecordId} value={program.programRecordId}>{program.title} · {dateLabel(program.date)} · {program.barangay}</option>)}</Select>{programsForInterest.length === 0 && <span className="mt-1 block text-xs text-slate-500">No available future program days in your scope.</span>}</Field>
          {selectedProgram && <div className="grid gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-night-border sm:grid-cols-3">
            <p><span className="block text-xs text-slate-500">Slots used</span><strong>{selectedProgram.slotsUsed == null ? 'Not recorded' : selectedProgram.slotsUsed}{selectedProgram.slots == null ? '' : ` / ${selectedProgram.slots}`}</strong></p>
            <p><span className="block text-xs text-slate-500">Planned duration</span><strong>{durationLabel(selectedProgram.durationMinutes)}</strong></p>
            <p className="text-xs text-slate-500">Processes: {selectedProgram.processes.length ? selectedProgram.processes.join(', ') : 'Select processes in the program record first.'}<br />Interest entries do not reserve slots. Plan 90-minute service blocks, a 15-minute changeover buffer, and extend in 15-minute increments as needed.</p>
          </div>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setCreating(false)}>Cancel</button><button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Create interest list'}</button></div>
      </form>
    </Modal>}

    {merging && <MergeRequests campaigns={campaigns} onClose={() => setMerging(false)} onMerged={(reference) => { setMerging(false); setReload((value) => value + 1); setNotice(`Requests merged into ${reference}.`); }} />}
    {selectedId !== null && <CampaignDetails key={selectedId} campaignId={selectedId} role={data?.role ?? ''} barangays={barangayOptions} programs={data?.programs ?? []} onClose={closeCampaign} onChanged={() => { setReload((value) => value + 1); setNotice('Program interest list updated.'); }} />}
  </div>;
}

/** Admin: run several barangays' sent or approved requests as one program. Owners keep their barangay; services and targets combine. */
function MergeRequests({ campaigns, onClose, onMerged }: { campaigns: Campaign[]; onClose: () => void; onMerged: (reference: string) => void }) {
  const mergeable = campaigns.filter((campaign) => campaign.kind === 'program_request' && ['requested', 'approved'].includes(campaign.status));
  // The request with the most owners is kept by default; the smaller ones merge into it.
  const [targetId, setTargetId] = useState([...mergeable].sort((a, b) => b.ownerCount - a.ownerCount)[0]?.id ?? 0);
  const [sourceIds, setSourceIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const target = mergeable.find((campaign) => campaign.id === targetId);
  const chosen = mergeable.filter((campaign) => sourceIds.includes(campaign.id) && campaign.id !== targetId);
  const all = target ? [target, ...chosen] : chosen;
  const merge = async () => {
    if (!target) return;
    setSaving(true); setError('');
    try {
      await api('POST', '/program-interest', { action: 'merge-requests', targetId: target.id, expectedRevision: target.revision, sources: chosen.map((campaign) => ({ id: campaign.id, expectedRevision: campaign.revision })) });
      onMerged(target.reference);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not merge these requests.'); }
    finally { setSaving(false); }
  };
  return <Modal title="Merge program requests" wide onClose={() => { if (!saving) onClose(); }}>
    <div className="space-y-4">
      {error && <Notice kind="error">{error}</Notice>}
      {mergeable.length < 2 ? <p className="text-sm text-slate-500">At least two sent or approved requests are needed to merge.</p> : <>
        <Field label="Keep this request (its barangay hosts the program)"><Select className={inputCls} value={targetId} onChange={(event) => { setTargetId(Number(event.target.value)); setSourceIds([]); }}>{mergeable.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.reference} · {campaign.hostBarangay} · {campaign.status}</option>)}</Select></Field>
        <fieldset><legend className="text-sm font-medium">Merge into it</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{mergeable.filter((campaign) => campaign.id !== targetId).map((campaign) => <Check key={campaign.id} checked={sourceIds.includes(campaign.id)} onChange={(checked) => setSourceIds((current) => checked ? [...current, campaign.id] : current.filter((id) => id !== campaign.id))}>{campaign.reference} · {campaign.hostBarangay} ({campaign.ownerCount} owners)</Check>)}</div></fieldset>
        {chosen.length > 0 && <p className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-night-surface">{all.length} barangays · {all.reduce((sum, campaign) => sum + campaign.ownerCount, 0)} owners · {all.reduce((sum, campaign) => sum + campaign.petCount, 0)} pets · {[...new Set(all.flatMap((campaign) => campaign.processes))].join(', ')}. The merged requests end when this one is closed, rejected or cancelled.</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} disabled={saving} onClick={onClose}>Cancel</button><button type="button" className={btnPrimary} disabled={saving || !target || !chosen.length} onClick={() => void merge()}>{saving ? 'Merging…' : 'Merge requests'}</button></div>
      </>}
    </div>
  </Modal>;
}

function BarangayChecklist({ options, selected, onChange }: { options: Barangay[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const all = options.length > 0 && options.every((barangay) => selected.includes(barangay.id));
  return <div className="mt-2 space-y-2">
    <div className="border-b border-slate-200 pb-2 dark:border-night-border"><Check checked={all} onChange={(checked) => onChange(checked ? options.map((barangay) => barangay.id) : [])}><span className="font-medium">Select all ({selected.length} of {options.length} selected)</span></Check></div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{options.map((barangay) => <Check key={barangay.id} checked={selected.includes(barangay.id)} onChange={(checked) => onChange(checked ? [...selected, barangay.id] : selected.filter((id) => id !== barangay.id))}>{barangay.name}</Check>)}</div>
  </div>;
}

function CampaignPanel({ embedded, title, onClose, children }: { embedded: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return embedded ? <section className={`${card} space-y-4`}>{children}</section> : <Modal title={title} wide onClose={onClose}>{children}</Modal>;
}

export function CampaignDetails({ campaignId, role, barangays, programs, onClose, onChanged, embedded = false }: {
  campaignId: number; role: string; barangays: Barangay[]; programs: ProgramOption[]; onClose: () => void; onChanged: () => void; embedded?: boolean;
}) {
  const isParavet = role === 'Paravet';
  const { data, loading, error, reload } = useApi<Details>(`/program-interest?id=${campaignId}`);
  const campaign = data?.campaign;
  const [ownerName, setOwnerName] = useState('');
  const [registryOwnerId,setRegistryOwnerId]=useState<string|undefined>();
  const [demandEdit,setDemandEdit]=useState(false);
  const [demandTarget,setDemandTarget]=useState('100');
  const [demandNote,setDemandNote]=useState('');
  const [demandProcesses,setDemandProcesses]=useState<Process[]>([]);
  const [cancelDemand,setCancelDemand]=useState(false);
  const [mobile, setMobile] = useState('');
  const [residenceBarangayId, setResidenceBarangayId] = useState('');
  const [pets, setPets] = useState<DraftPet[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [duplicateCandidates, setDuplicateCandidates] = useState<{ id: number; ownerName: string; barangay: string }[]>([]);
  const [reviewTarget, setReviewTarget] = useState('');
  const [eligibleIds, setEligibleIds] = useState<number[]>([]);
  const [accessIds, setAccessIds] = useState<number[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const navigate = useNavigate();

  const scopedPrograms = useMemo(() => programs.filter((item) => item.barangayId === campaign?.hostBarangayId && !item.campaignId), [campaign?.hostBarangayId, programs]);
  useEffect(() => {
    if (campaign) setAccessIds(campaign.allowedBarangays.map((barangay) => barangay.id).filter((id) => id !== campaign.hostBarangayId));
  }, [campaign?.id, campaign?.allowedBarangays, campaign?.hostBarangayId]);
  if (loading && !data) return <CampaignPanel embedded={embedded} title="Program interest" onClose={onClose}><Loading label="Loading interest details…" /></CampaignPanel>;
  if (error || !campaign) return <CampaignPanel embedded={embedded} title="Program interest" onClose={onClose}><Notice kind="error">{error?.message ?? 'Program interest list not found.'}</Notice></CampaignPanel>;

  const editable = campaign.status === 'gathering' || (campaign.status === 'scheduled' && ['Planned', 'Open', 'In progress'].includes(campaign.programStatus) && Boolean(campaign.programDate) && campaign.programDate! >= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }));
  const isAdmin = role === 'Admin' || role === 'SuperAdmin';
  const editableResidents = isParavet ? barangays : campaign.allowedBarangays;
  const setPetField = (index: number, key: keyof DraftPet, value: unknown) => setPets((current) => current.map((pet, i) => i === index ? { ...pet, [key]: value } as DraftPet : pet));
  const clearOwnerForm = () => { setRegistryOwnerId(undefined); setOwnerName(''); setMobile(''); setResidenceBarangayId(''); setPets([]); setEditing(null); setDuplicateCandidates([]); };
  const startEdit = (person: InterestPerson) => {
    setRegistryOwnerId(person.registry_owner_id);setEditing(person.id); setOwnerName(person.owner_name); setMobile(person.mobile ?? ''); setResidenceBarangayId(String(person.residence_barangay_id));
    setPets(person.pets.map((pet) => ({ ...pet, sex: pet.sex ?? '', ageMonths: pet.ageMonths == null ? '' : String(pet.ageMonths) })));
    setErrorText(''); setDuplicateCandidates([]);
  };

  const submitPerson = async (event: { preventDefault: () => void }, confirmDistinct = false) => {
    event.preventDefault(); setSaving(true); setErrorText('');
    const normalizedPets = pets.filter((pet) => pet.name.trim()).map((pet) => ({ ...pet, sex: pet.sex || undefined, ageMonths: pet.ageMonths === '' ? undefined : Number(pet.ageMonths) }));
    try {
      await api('POST', '/program-interest', editing === null
        ? { action: 'add-interest', campaignId,registryOwnerId, ownerName, mobile, residenceBarangayId: Number(residenceBarangayId), pets: normalizedPets, confirmDistinct }
        : { action: 'update-interest', campaignId,registryOwnerId, personId: editing, ownerName, mobile, residenceBarangayId: Number(residenceBarangayId), pets: normalizedPets, confirmDistinct });
      clearOwnerForm(); reload(); onChanged();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'POSSIBLE_DUPLICATE') {
        const details = failure.details as { candidates?: { id: number; ownerName: string; barangay: string }[] } | undefined;
        setDuplicateCandidates(details?.candidates ?? []); setErrorText(failure.message);
      } else setErrorText(failure instanceof Error ? failure.message : 'Could not save this interest entry.');
    } finally { setSaving(false); }
  };

  const submitRequest = async () => {
    setSaving(true); setErrorText('');
    try { await api('POST', '/program-interest', { action: 'submit-request', campaignId }); reload(); onChanged(); }
    catch (failure) { setErrorText(failure instanceof Error ? failure.message : 'Could not submit this request.'); }
    finally { setSaving(false); }
  };
  const review = async (decision: 'approve' | 'reject') => {
    setSaving(true); setErrorText('');
    try {
      await api('POST', '/program-interest', { action: 'review-request', campaignId, decision, approvedTargetPeople: Number(reviewTarget || campaign.requestedTargetPeople), allowedBarangayIds: eligibleIds, note: reviewNote });
      reload(); onChanged();
    } catch (failure) { setErrorText(failure instanceof Error ? failure.message : 'Could not review this request.'); }
    finally { setSaving(false); }
  };
  const schedule = async () => {
    setSaving(true); setErrorText('');
    try { await api('POST', '/program-interest', { action: 'schedule', campaignId, programRecordId: Number(scheduleId) }); reload(); onChanged(); }
    catch (failure) { setErrorText(failure instanceof Error ? failure.message : 'Could not schedule this request.'); }
    finally { setSaving(false); }
  };
  const closeCampaign = async () => {
    setSaving(true); setErrorText('');
    try { await api('POST', '/program-interest', { action: 'close', campaignId }); reload(); onChanged(); }
    catch (failure) { setErrorText(failure instanceof Error ? failure.message : 'Could not close this list.'); }
    finally { setSaving(false); }
  };
  const reopenCampaign = async () => {
    setSaving(true); setErrorText('');
    try { await api('POST', '/program-interest', { action: 'reopen', campaignId }); reload(); onChanged(); }
    catch (failure) { setErrorText(failure instanceof Error ? failure.message : 'Could not reopen this list.'); }
    finally { setSaving(false); }
  };
  const saveProgramAccess = async () => {
    setSaving(true); setErrorText('');
    try { await api('POST', '/program-interest', { action: 'update-program-access', campaignId, allowedBarangayIds: accessIds }); reload(); onChanged(); }
    catch (failure) { setErrorText(failure instanceof Error ? failure.message : 'Could not update program access.'); }
    finally { setSaving(false); }
  };
  const withdraw = async (personId: number) => {
    setSaving(true); setErrorText('');
    try { await api('POST', '/program-interest', { action: 'withdraw-interest', campaignId, personId }); reload(); onChanged(); }
    catch (failure) { setErrorText(failure instanceof Error ? failure.message : 'Could not withdraw the entry.'); }
    finally { setSaving(false); }
  };

  return <CampaignPanel embedded={embedded} title={`${campaign.programTitle || (campaign.kind === 'program_request' ? 'New program request' : 'Program day')} · ${campaign.reference}`} onClose={onClose}>
    <div className="space-y-4">
      {errorText && <Notice kind="error">{errorText}</Notice>}
      {campaign.status === 'scheduled' && !editable && <Notice>Interest gathering has ended for this program. Existing interests are preserved; permitted staff can still encode actual attendance through the Attendance section.</Notice>}
      {loading && <p role="status" className="text-sm text-slate-500">Refreshing interest details…</p>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Host barangay', campaign.hostBarangay],
          ['Interest', campaign.kind === 'program_request' ? `${campaign.ownerCount} / ${campaign.targetPeople} owners` : `${campaign.ownerCount} owners`],
          ['Pets listed', String(campaign.petCount)],
          ['Status', campaign.status.replaceAll('_', ' ')],
          ...(campaign.programRecordId ? [
            ['Slots used', campaign.programSlotsUsed == null ? 'Not recorded' : `${campaign.programSlotsUsed}${campaign.programSlots == null ? '' : ` / ${campaign.programSlots}`}`],
            ['Planned duration', durationLabel(campaign.programDurationMinutes)],
          ] : []),
        ].map(([label, value]) => <article key={label} className="rounded-xl border border-slate-200 p-3 dark:border-night-border"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></article>)}
      </section>
      <p className="text-sm text-slate-500">Allowed barangays: {campaign.allowedBarangays.map((item) => item.name).join(', ')} · Processes: {campaign.processes.join(', ')}. Interest entries do not issue a stub or confirm attendance.</p>
      {whoLine(campaign) && <p className="text-sm text-slate-600 dark:text-night-muted">{whoLine(campaign)}</p>}
      {campaign.mergedInto && <Notice>Merged into {campaign.mergedInto.reference} ({campaign.mergedInto.hostBarangay}). Its owners now continue on that request, and this barangay can start a new request when it finishes.</Notice>}
      {!!data?.activity.length && <details className="rounded-xl border border-slate-200 p-3 dark:border-night-border"><summary className="cursor-pointer text-sm font-medium">Activity history ({data.activity.length})</summary><ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-night-muted">{data.activity.map((item) => <li key={item.id}>{new Date(item.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })} · <strong>{item.actorName}</strong> · {item.action.replaceAll('-', ' ')}</li>)}</ul></details>}
      {campaign.programRecordId && <section className="rounded-xl border border-slate-200 p-4 dark:border-night-border">
        <h3 className="font-semibold">Paravets assigned in participating barangays<InfoTip>This roster follows current active Paravet assignments in the allowed barangays.</InfoTip></h3>
        {campaign.assignedParavets.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{campaign.assignedParavets.map((paravet) => <li key={paravet.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-night-surface"><strong>{paravet.name}</strong><p className="text-xs text-slate-500">{paravet.accountKey} · {paravet.barangay}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No active Paravets are assigned to the current participating barangays.</p>}
      </section>}

      {campaign.kind==='program_request'&&['gathering','requested'].includes(campaign.status)&&<section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-night-border"><p className="text-sm font-medium">Request<InfoTip>Assigned Paravets collaborate on this request. Editing returns it to gathering for resubmission. Changes stop after acceptance.</InfoTip></p><div className="flex flex-wrap gap-2"><button className={btnGhost} disabled={saving} onClick={()=>{setDemandTarget(String(campaign.requestedTargetPeople));setDemandNote(campaign.requestNote??'');setDemandProcesses(campaign.processes);setDemandEdit(true);}}>Edit request</button><button className={btnDanger} disabled={saving} onClick={()=>setCancelDemand(true)}>Cancel request</button></div>{demandEdit&&<form className="space-y-3" onSubmit={async e=>{e.preventDefault();setSaving(true);try{await api('POST','/program-interest',{action:'edit-demand',campaignId,expectedRevision:campaign.revision,targetPeople:Number(demandTarget),processes:demandProcesses,note:demandNote});setDemandEdit(false);reload();onChanged();}catch(e){setErrorText(e instanceof Error?e.message:'Unable to edit request.');}finally{setSaving(false);}}}><Field label="Owner target"><input type="number" min={1} max={100000} required className={inputCls} value={demandTarget} onChange={e=>setDemandTarget(e.target.value)}/></Field><Field label="Note"><textarea maxLength={1000} className={inputCls} value={demandNote} onChange={e=>setDemandNote(e.target.value)}/></Field><div className="flex flex-wrap gap-3">{PROCESS_OPTIONS.map(p=><Check key={p} checked={demandProcesses.includes(p)} onChange={v=>setDemandProcesses(a=>v?[...a,p]:a.filter(x=>x!==p))}>{p}</Check>)}</div><button disabled={saving||!demandProcesses.length} className={btnPrimary}>Save request changes</button><button type="button" className={btnGhost} onClick={()=>setDemandEdit(false)}>Cancel edit</button></form>}</section>}
      {cancelDemand&&<ConfirmDialog title="Cancel this demand request?" message="Its interests and activity history will remain. Your barangay can create a new request afterward." confirmLabel="Cancel request" danger busy={saving} onClose={()=>setCancelDemand(false)} onConfirm={()=>{setSaving(true);void api('POST','/program-interest',{action:'cancel-demand',campaignId,expectedRevision:campaign.revision,reason:'Cancelled by assigned staff after review.'}).then(()=>{setCancelDemand(false);reload();onChanged();}).catch(e=>setErrorText(e.message)).finally(()=>setSaving(false));}}/>}
      {campaign.kind === 'program_request' && campaign.status === 'gathering' && isParavet && <button type="button" disabled={saving || campaign.ownerCount < campaign.targetPeople} onClick={() => void submitRequest()} className={btnPrimary}>Submit request to Admin</button>}
      {campaign.kind === 'program_request' && campaign.status === 'gathering' && campaign.ownerCount < campaign.targetPeople && <p className="text-xs text-slate-500">{campaign.targetPeople - campaign.ownerCount} more owner interests are needed before this request can be submitted.</p>}

      {campaign.status === 'requested' && !isParavet && <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
        <h3 className="font-semibold">Review program request<InfoTip>Set the approved owner target and any additional eligible barangays.</InfoTip></h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Approved owner target"><input className={inputCls} type="number" min={1} max={100000} value={reviewTarget || campaign.requestedTargetPeople} onChange={(event) => setReviewTarget(event.target.value)} /></Field>
          <Field label="Review note"><input className={inputCls} maxLength={1000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Required when rejecting" /></Field>
        </div>
        <fieldset><legend className="text-sm font-medium">Additional eligible barangays</legend><BarangayChecklist options={barangays.filter((barangay) => barangay.id !== campaign.hostBarangayId)} selected={eligibleIds} onChange={setEligibleIds} /></fieldset>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} className={btnDanger} onClick={() => void review('reject')}>Reject request</button><button type="button" disabled={saving} className={btnPrimary} onClick={() => void review('approve')}>Approve request</button></div>
      </section>}

      {campaign.status === 'approved' && !isParavet && <section className="flex flex-wrap items-end gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900 dark:bg-brand-900/20">
        <div className="w-full"><button type="button" disabled={saving} onClick={() => setScheduling(true)} className={btnPrimary}>Schedule program</button><p className="mt-2 text-xs text-slate-500">Or link a program day that is already scheduled:</p></div>
        {scheduling && <Suspense fallback={null}><ScheduleModal request={{ id: campaign.id, reference: campaign.reference, hostBarangayId: campaign.hostBarangayId, hostBarangay: campaign.hostBarangay, processes: campaign.processes }} onClose={() => setScheduling(false)} onSaved={(programId) => { setScheduling(false); onChanged(); navigate(`/programs?program=${programId}`); }} /></Suspense>}
        <div className="min-w-64 flex-1"><Field label="Link to a scheduled program in the host barangay"><Select className={inputCls} value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}><option value="">Choose a program day</option>{scopedPrograms.map((program) => <option key={program.programRecordId} value={program.programRecordId}>{program.title} · {dateLabel(program.date)}</option>)}</Select></Field></div>
        <button type="button" disabled={saving || !scheduleId} onClick={() => void schedule()} className={btnPrimary}>Link program day</button>
      </section>}
      {campaign.status === 'scheduled' && isAdmin && <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-night-border">
        <h3 className="font-semibold">Participating barangays<InfoTip>The host barangay is always included. Add other barangays only when they are approved to participate.</InfoTip></h3>
        <details className="rounded-lg bg-slate-50 p-3 dark:bg-night-surface"><summary className="cursor-pointer text-sm font-medium">Manage participating barangays ({accessIds.length + 1} selected)</summary>
        <BarangayChecklist options={barangays.filter((barangay) => barangay.id !== campaign.hostBarangayId)} selected={accessIds} onChange={setAccessIds} />
        <button type="button" disabled={saving} onClick={() => void saveProgramAccess()} className={`${btnPrimary} mt-3`}>Save participating barangays</button></details><div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void closeCampaign()} className={btnGhost}>Close interest list</button></div>
      </section>}
      {campaign.status === 'closed' && isAdmin && <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void reopenCampaign()} className={btnGhost}>Reopen program interest list</button></div>}

      {editable && <section className="rounded-xl border border-slate-200 p-4 dark:border-night-border">
        <h3 className="font-semibold">{editing === null ? 'Add an interested owner' : 'Update interest details'}<InfoTip>Save only the details needed for planning. The owner may join future programs again. Stub issuance and service attendance are recorded separately.</InfoTip></h3>
        <form onSubmit={(event) => void submitPerson(event)} className="mt-3 space-y-3">
          {residenceBarangayId&&<ParticipantRegistryPicker key={residenceBarangayId} mode="interest" campaignId={campaignId} barangayId={Number(residenceBarangayId)} onOwner={o=>{setRegistryOwnerId(o.registryOwnerId);setOwnerName(o.name);setMobile(o.mobile);}} onPet={p=>setPets(current=>current.some(v=>v.name===p.name&&v.species===p.species)?current:[...current,{...p,sex:p.sex??'',ageMonths:p.ageMonths==null?'':String(p.ageMonths),processes:[...campaign.processes]}])}/>}
          {registryOwnerId&&<p className="text-xs text-brand-700 dark:text-brand-500">Linked owner: {registryOwnerId}. Saving logs this event in owner history.</p>}
          {/* One row per pet, as in the Owners sheet: the owner is typed on the first row; pets are optional while gathering interest. */}
          <Sheet minWidth={`${70 + campaign.processes.length * 9}rem`} heads={[['#', 'w-10 text-center'], ['Owner', 'w-52'], ['Mobile (optional)', 'w-40'], ['Residence barangay', 'w-48'], ['Pet (optional)', 'w-40'], ['Species', 'w-24'], ['Sex', 'w-32'], ['Age (mo)', 'w-24'], ...campaign.processes.map((process): [string, string] => [process, 'w-36 text-center']), ['', 'w-11']]}>
            {Array.from({ length: Math.max(1, pets.length) }, (_, index) => {
              const pet = pets[index] ?? emptyPet(campaign.processes), n = index + 1, td = '!h-10 !p-0';
              const setPet = (key: keyof DraftPet, value: unknown) => pets.length ? setPetField(index, key, value) : setPets([{ ...emptyPet(campaign.processes), [key]: value } as DraftPet]);
              return <tr key={index}>
                <td className={`${td} text-center text-xs tabular-nums text-slate-400`}>{n}</td>
                {index === 0 ? <>
                  <td className={td}><input required aria-label="Owner name" placeholder="Owner name" className={sheetCell} maxLength={120} value={ownerName} onChange={(event) => {setOwnerName(event.target.value);setRegistryOwnerId(undefined);}} /></td>
                  <td className={td}><input aria-label="Mobile number" className={sheetCell} {...mobileInput} value={mobile} onChange={(event) => setMobile(mobileDigits(event.target.value))} /></td>
                  <td className={td}><Select required aria-label="Residence barangay" className={sheetCell} value={residenceBarangayId} onChange={(event) => {setResidenceBarangayId(event.target.value);setRegistryOwnerId(undefined);}}><option value="">Choose</option>{editableResidents.map((barangay) => <option key={barangay.id} value={barangay.id}>{barangay.name}</option>)}</Select></td>
                </> : <td colSpan={3} className="h-10 px-2.5 text-xs text-slate-400">Same owner as above</td>}
                <td className={td}><input aria-label={`Row ${n} pet name`} placeholder="Pet name" className={sheetCell} maxLength={80} value={pet.name} onChange={(event) => setPet('name', event.target.value)} /></td>
                <td className={td}><Select aria-label={`Row ${n} species`} className={sheetCell} value={pet.species} onChange={(event) => setPet('species', event.target.value)}><option>Dog</option><option>Cat</option></Select></td>
                <td className={td}><Select aria-label={`Row ${n} sex`} className={sheetCell} value={pet.sex} onChange={(event) => setPet('sex', event.target.value)}><option value="">Not recorded</option><option>Female</option><option>Male</option></Select></td>
                <td className={td}><input aria-label={`Row ${n} age in months`} className={sheetCell} type="number" min={0} max={600} value={pet.ageMonths} onChange={(event) => setPet('ageMonths', event.target.value)} /></td>
                {campaign.processes.map((process) => <td key={process} className={td}><label className="flex h-10 cursor-pointer items-center justify-center"><input type="checkbox" aria-label={`Row ${n} ${process}`} checked={pet.processes.includes(process)} onChange={(event) => setPet('processes', event.target.checked ? [...pet.processes, process] : pet.processes.filter((item) => item !== process))} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" /></label></td>)}
                <td className={td}><button type="button" aria-label={`Remove row ${n}`} disabled={!pets.length} onClick={() => setPets((current) => current.filter((_, i) => i !== index))} className="grid h-10 w-11 place-items-center text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-night-text"><Trash2 aria-hidden className="h-4 w-4" /></button></td>
              </tr>;
            })}
          </Sheet>
          <button type="button" disabled={pets.length >= 10} className={sheetAdd} onClick={() => setPets((current) => [...(current.length ? current : [emptyPet(campaign.processes)]), emptyPet(campaign.processes)])}><Plus aria-hidden className="h-4 w-4" />Add pet row</button>
          {duplicateCandidates.length > 0 && <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"><p className="font-semibold">Possible matching interest already exists</p><ul className="mt-1 list-inside list-disc">{duplicateCandidates.map((candidate) => <li key={candidate.id}>{candidate.ownerName} · {candidate.barangay}</li>)}</ul><p className="mt-2 text-xs">Review before continuing. Adding as separate records will not merge either entry.</p><button type="button" disabled={saving} className={`${btnGhost} mt-2`} onClick={(event) => void submitPerson(event, true)}>Confirm this is a different owner</button></section>}
          <div className="flex justify-end gap-2">{editing !== null && <button type="button" className={btnGhost} onClick={clearOwnerForm}>Cancel edit</button>}<button type="submit" disabled={saving || !editable} className={btnPrimary}>{saving ? 'Saving…' : editing === null ? 'Add interest' : 'Save changes'}</button></div>
        </form>
      </section>}

      <section>
        <div className="flex items-center justify-between"><h3 className="font-semibold">Interested owners ({campaign.ownerCount})</h3><span className="text-xs text-slate-500">{campaign.petCount} pets listed</span></div>
        {!data?.people.length ? <p className="py-5 text-center text-sm text-slate-500">No owner interests entered yet.</p> : <div className="mt-2 space-y-2">{data.people.map((person) => <article key={person.id} className="rounded-xl border border-slate-200 p-3 dark:border-night-border">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{person.owner_name}{person.duplicate_confirmed && <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE.waiting}`}>Marked distinct after review</span>}</p><p className="text-xs text-slate-500">{person.mobile || 'No mobile provided'} · {person.residence_barangay} · {person.pets.length} pets</p></div>{isAdmin&&<Link className="text-xs text-brand-700 underline" to={`/registry/owners?intakeSource=interest&intakeId=${person.id}`}>Verify / add to Owners</Link>}{editable && <div className="flex gap-3 text-xs"><button type="button" onClick={() => startEdit(person)} className="text-brand-700 underline dark:text-brand-500">Edit</button><button type="button" disabled={saving} onClick={() => void withdraw(person.id)} className="text-red-700 underline dark:text-red-300">Withdraw</button></div>}</div>
          {(person.added_by_name || person.updated_by_name) && <p className="mt-1 text-[11px] text-slate-500">{[person.added_by_name && `Added by ${person.added_by_name}`, person.updated_by_name && `edited by ${person.updated_by_name}`].filter(Boolean).join(' · ')}</p>}
          {person.pets.length > 0 && <ul className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-night-muted sm:grid-cols-2">{person.pets.map((pet, index) => <li key={`${person.id}-${index}`}><strong>{pet.name}</strong> · {pet.species}{pet.sex ? ` · ${pet.sex}` : ''}{pet.ageMonths == null ? '' : ` · ${pet.ageMonths} mo`} · {pet.processes.join(', ')}</li>)}</ul>}
        </article>)}</div>}
      </section>
    </div>
  </CampaignPanel>;
}
