import { ParticipantRegistryPicker } from '../components/ParticipantRegistryPicker';
import { ConfirmDialog } from '../components/ui';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { Check, Field, inputCls, Loading, Modal, Notice, btnGhost, btnPrimary, btnDanger } from '../components/ui';
import { Link,useSearchParams } from 'react-router-dom';

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
};
type Pet = { name: string; species: 'Dog' | 'Cat'; sex?: 'Male' | 'Female'; ageMonths?: number; processes: Process[] };
type InterestPerson = { registry_owner_id?:string; id: number; owner_name: string; mobile: string | null; residence_barangay_id: number; residence_barangay: string; pets: Pet[]; status: string; duplicate_confirmed: boolean; created_at: string };
type Details = { campaign: Campaign; people: InterestPerson[]; activity: { id: number; actorName: string; action: string; createdAt: string }[] };
type PageData = { campaigns: Campaign[]; barangays: Barangay[]; programs: ProgramOption[]; role: string; assignedBarangayId: number | null };
type DraftPet = { name: string; species: 'Dog' | 'Cat'; sex: 'Male' | 'Female' | ''; ageMonths: string; processes: Process[] };

const card = 'rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-surface-dark';
const statusStyle: Record<string, string> = {
  gathering: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  requested: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  rejected: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
  scheduled: 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};
const emptyPet = (processes: Process[] = []): DraftPet => ({ name: '', species: 'Dog', sex: '', ageMonths: '', processes: [...processes] });
const dateLabel = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T12:00:00+08:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' }) : 'Date not set';
const durationLabel = (minutes: number | null | undefined) => minutes == null ? 'Not set' : `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} hr ` : ''}${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();

export function ProgramInterestPage() {
  const [params,setParams]=useSearchParams();
  const { account } = useAuth();
  const isParavet = account?.type === 'Paravet';
  const [reload, setReload] = useState(0);
  const [createMode, setCreateMode] = useState<'demand' | 'program-day' | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(()=>{const id=Number(params.get('campaignId'));setSelectedId(Number.isSafeInteger(id)&&id>0?id:null);},[params]);
  const openCampaign=(id:number)=>setParams(p=>{p.set('campaignId',String(id));return p;});
  const closeCampaign=()=>{setSelectedId(null);setParams(p=>{p.delete('campaignId');return p;},{replace:true});};
  const [hostBarangayId, setHostBarangayId] = useState('');
  const [targetPeople, setTargetPeople] = useState('100');
  const [selectedProcesses, setSelectedProcesses] = useState<Process[]>([...PROCESS_OPTIONS]);
  const [programRecordId, setProgramRecordId] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { data, loading, error: loadError, reload: reloadData } = useApi<PageData>(`/program-interest${reload ? `?refresh=${reload}` : ''}`);
  const campaigns = data?.campaigns ?? [];
  const programsForInterest = (data?.programs ?? []).filter((program) => !program.campaignId);
  const awaitingReview = campaigns.filter((campaign) => campaign.status === 'requested').length;
  const activeLists = campaigns.filter((campaign) => ['gathering', 'scheduled'].includes(campaign.status)).length;
  const totalInterests = campaigns.reduce((sum, campaign) => sum + campaign.ownerCount, 0);
  const barangayOptions = data?.barangays ?? [];
  const selectedProgram = programsForInterest.find((program) => String(program.programRecordId) === programRecordId);

  const toggleProcess = (process: Process) => setSelectedProcesses((current) => current.includes(process)
    ? current.filter((item) => item !== process) : [...current, process]);
  const toggleAllProcesses = (checked: boolean) => setSelectedProcesses(checked ? [...PROCESS_OPTIONS] : []);

  const createCampaign = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      let result: { campaignId: number; reference: string; existing?: boolean };
      if (createMode === 'demand') {
        result = await api<{ campaignId: number; reference: string; existing?: boolean }>('POST', '/program-interest', {
          action: 'create-demand',
          ...(isParavet ? {} : { hostBarangayId: Number(hostBarangayId) }),
          targetPeople: Number(targetPeople), processes: selectedProcesses, note: requestNote.trim() || undefined,
        });
      } else {
        result = await api<{ campaignId: number; reference: string; existing?: boolean }>('POST', '/program-interest', { action: 'create-program-day', programRecordId: Number(programRecordId) });
      }
      setCreateMode(null); setProgramRecordId(''); setRequestNote(''); setReload((value) => value + 1);
      setNotice(result.existing ? 'An interest list already exists for that program day.' : `Interest list ${result.reference} is ready.`);
      setSelectedId(result.campaignId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create the interest list.');
    } finally { setSaving(false); }
  };

  const startCreate = (mode: 'demand' | 'program-day') => {
    setError(''); setSelectedProcesses([...PROCESS_OPTIONS]); setHostBarangayId(String(data?.assignedBarangayId ?? ''));
    setTargetPeople('100'); setCreateMode(mode);
  };

  if (loading && !data) return <Loading label="Loading program interest lists…" />;
  if (loadError) return <div className="mx-auto max-w-6xl"><Notice kind="error">{loadError.message}</Notice></div>;

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Program interest</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">Record people interested in a scheduled program or gather barangay demand for a new request. An interest entry is not a confirmed appointment and does not issue or reserve a physical stub.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => startCreate('demand')} className={btnGhost}>Gather demand</button>
        <button type="button" onClick={() => startCreate('program-day')} className={btnPrimary}>Use a scheduled program</button>
      </div>
    </header>

    {notice && <Notice kind="success">{notice}</Notice>}{error && <Notice kind="error">{error}</Notice>}
    <section className="grid gap-3 sm:grid-cols-3" aria-label="Interest overview">
      {[['Active lists', activeLists], ['Requests awaiting review', awaitingReview], ['Owner interest entries', totalInterests]].map(([label, value]) =>
        <article key={String(label)} className={card}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></article>)}
    </section>

    <section className={`${card} p-0`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-700">
        <div><h2 className="font-semibold">Interest lists and requests</h2><p className="mt-1 text-xs text-slate-500">Demand targets can vary by request. Each owner is counted once per list; pets and requested processes are tracked separately.</p></div>
        <button type="button" onClick={() => { reloadData(); setReload((value) => value + 1); }} className={btnGhost}>Refresh</button>
      </div>
      {loading && <Loading label="Refreshing lists…" />}
      {!loading && campaigns.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No program interest lists yet. Start a demand list or attach one to a scheduled program.</p>}
      {!!campaigns.length && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr>{['List','Host barangay','Program access','Interest','Status',''].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{campaigns.map((campaign) => <tr key={campaign.id}>
          <td className="min-w-56 p-3"><p className="font-medium">{campaign.kind === 'program_request' ? 'New program request' : campaign.programTitle || 'Scheduled program'}</p><p className="font-mono text-xs text-slate-500">{campaign.reference}{campaign.programDate ? ` · ${dateLabel(campaign.programDate)}` : ''}</p></td>
          <td className="whitespace-nowrap p-3">{campaign.hostBarangay}</td>
          <td className="max-w-56 p-3 text-slate-600 dark:text-slate-300">{campaign.allowedBarangays.map((item) => item.name).join(', ')}</td>
          <td className="whitespace-nowrap p-3"><strong>{campaign.ownerCount}</strong>{campaign.kind === 'program_request' ? ` / ${campaign.targetPeople} owners` : ' owners'}<p className="text-xs text-slate-500">{campaign.petCount} pets</p></td>
          <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[campaign.status] ?? statusStyle.closed}`}>{campaign.status.replaceAll('_', ' ')}</span></td>
          <td className="whitespace-nowrap p-3"><button type="button" className="font-medium text-brand-700 underline dark:text-brand-300" onClick={() => openCampaign(campaign.id)}>Open</button></td>
        </tr>)}</tbody></table></div>}
    </section>

    {createMode && <Modal title={createMode === 'demand' ? 'Gather demand for a program' : 'Use an existing program day'} wide onClose={() => { if (!saving) { setCreateMode(null); setError(''); } }}>
      {error && <div className="mb-3"><Notice kind="error">{error}</Notice></div>}
      <form onSubmit={(event) => void createCampaign(event)} className="space-y-4">
        <p className="text-sm text-slate-500">{createMode === 'demand' ? 'Create a provisional interest list. When it reaches the target, the Paravet can submit it for Admin review.' : 'Select a future program day that is already scheduled. Interested owners will be recorded separately from stub issuance and attendance.'}</p>
        {createMode === 'demand' && !isParavet && <Field label="Host barangay"><select required className={inputCls} value={hostBarangayId} onChange={(event) => setHostBarangayId(event.target.value)}><option value="">Choose a barangay</option>{barangayOptions.map((barangay) => <option key={barangay.id} value={barangay.id}>{barangay.name}</option>)}</select></Field>}
        {createMode === 'demand' && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Owner target"><input className={inputCls} type="number" min={1} max={100000} required value={targetPeople} onChange={(event) => setTargetPeople(event.target.value)} /><span className="mt-1 block text-xs text-slate-500">Default 100; adjust for this request. Count owners, not pets.</span></Field>
          <Field label="Request note (optional)"><textarea className={inputCls} maxLength={1000} rows={3} value={requestNote} onChange={(event) => setRequestNote(event.target.value)} placeholder="Add context for the reviewer" /></Field>
        </div>}
        {createMode === 'program-day' && <>
          <Field label="Scheduled program"><select required className={inputCls} value={programRecordId} onChange={(event) => setProgramRecordId(event.target.value)}><option value="">Choose a program day</option>{programsForInterest.map((program) => <option key={program.programRecordId} value={program.programRecordId}>{program.title} · {dateLabel(program.date)} · {program.barangay}</option>)}</select>{programsForInterest.length === 0 && <span className="mt-1 block text-xs text-slate-500">No available future program days in your scope.</span>}</Field>
          {selectedProgram && <div className="grid gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700 sm:grid-cols-3">
            <p><span className="block text-xs text-slate-500">Slots used</span><strong>{selectedProgram.slotsUsed == null ? 'Not recorded' : selectedProgram.slotsUsed}{selectedProgram.slots == null ? '' : ` / ${selectedProgram.slots}`}</strong></p>
            <p><span className="block text-xs text-slate-500">Planned duration</span><strong>{durationLabel(selectedProgram.durationMinutes)}</strong></p>
            <p className="text-xs text-slate-500">Processes: {selectedProgram.processes.length ? selectedProgram.processes.join(', ') : 'Select processes in the program record first.'}<br />Interest entries do not reserve slots. Plan 90-minute service blocks, a 15-minute changeover buffer, and extend in 15-minute increments as needed.</p>
          </div>}
        </>}
        {createMode === 'demand' && <fieldset><legend className="text-sm font-medium">Processes included</legend><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2"><Check checked={selectedProcesses.length === PROCESS_OPTIONS.length} onChange={toggleAllProcesses}>All of the Above</Check>{PROCESS_OPTIONS.map((process) => <Check key={process} checked={selectedProcesses.includes(process)} onChange={() => toggleProcess(process)}>{process}</Check>)}</div></fieldset>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setCreateMode(null)}>Cancel</button><button type="submit" disabled={saving || !selectedProcesses.length} className={btnPrimary}>{saving ? 'Saving…' : createMode === 'demand' ? 'Start demand list' : 'Create interest list'}</button></div>
      </form>
    </Modal>}

    {selectedId !== null && <CampaignDetails key={selectedId} campaignId={selectedId} role={data?.role ?? ''} barangays={barangayOptions} programs={data?.programs ?? []} onClose={closeCampaign} onChanged={() => { setReload((value) => value + 1); setNotice('Program interest list updated.'); }} />}
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
    const normalizedPets = pets.map((pet) => ({ ...pet, sex: pet.sex || undefined, ageMonths: pet.ageMonths === '' ? undefined : Number(pet.ageMonths) }));
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
        ].map(([label, value]) => <article key={label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></article>)}
      </section>
      <p className="text-sm text-slate-500">Allowed barangays: {campaign.allowedBarangays.map((item) => item.name).join(', ')} · Processes: {campaign.processes.join(', ')}. Interest entries do not issue a stub or confirm attendance.</p>
      {campaign.programRecordId && <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div><h3 className="font-semibold">Paravets assigned in participating barangays</h3><p className="mt-1 text-xs text-slate-500">This roster follows current active Paravet assignments in the allowed barangays.</p></div>
        {campaign.assignedParavets.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{campaign.assignedParavets.map((paravet) => <li key={paravet.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900"><strong>{paravet.name}</strong><p className="text-xs text-slate-500">{paravet.accountKey} · {paravet.barangay}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No active Paravets are assigned to the current participating barangays.</p>}
      </section>}

      {campaign.kind==='program_request'&&['gathering','requested'].includes(campaign.status)&&<section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-sm text-slate-500">Assigned Paravets collaborate on this request. Editing returns it to gathering for resubmission. Changes stop after acceptance.</p><div className="flex flex-wrap gap-2"><button className={btnGhost} disabled={saving} onClick={()=>{setDemandTarget(String(campaign.requestedTargetPeople));setDemandNote(campaign.requestNote??'');setDemandProcesses(campaign.processes);setDemandEdit(true);}}>Edit request</button><button className={btnDanger} disabled={saving} onClick={()=>setCancelDemand(true)}>Cancel request</button></div>{demandEdit&&<form className="space-y-3" onSubmit={async e=>{e.preventDefault();setSaving(true);try{await api('POST','/program-interest',{action:'edit-demand',campaignId,expectedRevision:campaign.revision,targetPeople:Number(demandTarget),processes:demandProcesses,note:demandNote});setDemandEdit(false);reload();onChanged();}catch(e){setErrorText(e instanceof Error?e.message:'Unable to edit request.');}finally{setSaving(false);}}}><Field label="Owner target"><input type="number" min={1} max={100000} required className={inputCls} value={demandTarget} onChange={e=>setDemandTarget(e.target.value)}/></Field><Field label="Note"><textarea maxLength={1000} className={inputCls} value={demandNote} onChange={e=>setDemandNote(e.target.value)}/></Field><div className="flex flex-wrap gap-3">{PROCESS_OPTIONS.map(p=><Check key={p} checked={demandProcesses.includes(p)} onChange={v=>setDemandProcesses(a=>v?[...a,p]:a.filter(x=>x!==p))}>{p}</Check>)}</div><button disabled={saving||!demandProcesses.length} className={btnPrimary}>Save request changes</button><button type="button" className={btnGhost} onClick={()=>setDemandEdit(false)}>Cancel edit</button></form>}</section>}
      {cancelDemand&&<ConfirmDialog title="Cancel this demand request?" message="Its interests and activity history will remain. Your barangay can create a new request afterward." confirmLabel="Cancel request" danger busy={saving} onClose={()=>setCancelDemand(false)} onConfirm={()=>{setSaving(true);void api('POST','/program-interest',{action:'cancel-demand',campaignId,expectedRevision:campaign.revision,reason:'Cancelled by assigned staff after review.'}).then(()=>{setCancelDemand(false);reload();onChanged();}).catch(e=>setErrorText(e.message)).finally(()=>setSaving(false));}}/>}
      {campaign.kind === 'program_request' && campaign.status === 'gathering' && isParavet && <button type="button" disabled={saving || campaign.ownerCount < campaign.targetPeople} onClick={() => void submitRequest()} className={btnPrimary}>Submit request to Admin</button>}
      {campaign.kind === 'program_request' && campaign.status === 'gathering' && campaign.ownerCount < campaign.targetPeople && <p className="text-xs text-slate-500">{campaign.targetPeople - campaign.ownerCount} more owner interests are needed before this request can be submitted.</p>}

      {campaign.status === 'requested' && !isParavet && <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
        <div><h3 className="font-semibold">Review program request</h3><p className="text-xs text-slate-500">Set the approved owner target and any additional eligible barangays.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Approved owner target"><input className={inputCls} type="number" min={1} max={100000} value={reviewTarget || campaign.requestedTargetPeople} onChange={(event) => setReviewTarget(event.target.value)} /></Field>
          <Field label="Review note"><input className={inputCls} maxLength={1000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Required when rejecting" /></Field>
        </div>
        <fieldset><legend className="text-sm font-medium">Additional eligible barangays</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{barangays.filter((barangay) => barangay.id !== campaign.hostBarangayId).map((barangay) => <Check key={barangay.id} checked={eligibleIds.includes(barangay.id)} onChange={(checked) => setEligibleIds((current) => checked ? [...current, barangay.id] : current.filter((id) => id !== barangay.id))}>{barangay.name}</Check>)}</div></fieldset>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} className={btnDanger} onClick={() => void review('reject')}>Reject request</button><button type="button" disabled={saving} className={btnPrimary} onClick={() => void review('approve')}>Approve request</button></div>
      </section>}

      {campaign.status === 'approved' && !isParavet && <section className="flex flex-wrap items-end gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="min-w-64 flex-1"><Field label="Link to a scheduled program in the host barangay"><select className={inputCls} value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}><option value="">Choose a program day</option>{scopedPrograms.map((program) => <option key={program.programRecordId} value={program.programRecordId}>{program.title} · {dateLabel(program.date)}</option>)}</select></Field></div>
        <button type="button" disabled={saving || !scheduleId} onClick={() => void schedule()} className={btnPrimary}>Link program day</button>
      </section>}
      {campaign.status === 'scheduled' && isAdmin && <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div><h3 className="font-semibold">Participating barangays</h3><p className="mt-1 text-xs text-slate-500">The host barangay is always included. Add other barangays only when they are approved to participate.</p></div>
        <details className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><summary className="cursor-pointer text-sm font-medium">Manage participating barangays ({accessIds.length + 1} selected)</summary>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{barangays.filter((barangay) => barangay.id !== campaign.hostBarangayId).map((barangay) => <Check key={barangay.id} checked={accessIds.includes(barangay.id)} onChange={(checked) => setAccessIds((current) => checked ? [...current, barangay.id] : current.filter((id) => id !== barangay.id))}>{barangay.name}</Check>)}</div>
        <button type="button" disabled={saving} onClick={() => void saveProgramAccess()} className={`${btnPrimary} mt-3`}>Save participating barangays</button></details><div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void closeCampaign()} className={btnGhost}>Close interest list</button></div>
      </section>}
      {campaign.status === 'closed' && isAdmin && <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void reopenCampaign()} className={btnGhost}>Reopen program interest list</button></div>}

      {editable && <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <h3 className="font-semibold">{editing === null ? 'Add an interested owner' : 'Update interest details'}</h3>
        <p className="mt-1 text-xs text-slate-500">Save only the details needed for planning. The owner may join future programs again. Stub issuance and service attendance are recorded separately.</p>
        <form onSubmit={(event) => void submitPerson(event)} className="mt-3 space-y-3">
          {residenceBarangayId&&<ParticipantRegistryPicker key={residenceBarangayId} mode="interest" campaignId={campaignId} barangayId={Number(residenceBarangayId)} onOwner={o=>{setRegistryOwnerId(o.registryOwnerId);setOwnerName(o.name);setMobile(o.mobile);}} onPet={p=>setPets(current=>current.some(v=>v.name===p.name&&v.species===p.species)?current:[...current,{...p,sex:p.sex??'',ageMonths:p.ageMonths==null?'':String(p.ageMonths),processes:[...campaign.processes]}])}/>}
          {registryOwnerId&&<p className="text-xs text-brand-700">Linked owner: {registryOwnerId}. Saving logs this event in owner history.</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Owner name"><input required className={inputCls} maxLength={120} value={ownerName} onChange={(event) => {setOwnerName(event.target.value);setRegistryOwnerId(undefined);}} /></Field>
            <Field label="Mobile number (optional)"><input className={inputCls} inputMode="tel" placeholder="09XX-XXX-XXXX" value={mobile} onChange={(event) => setMobile(event.target.value)} /></Field>
            <Field label="Residence barangay"><select required className={inputCls} value={residenceBarangayId} onChange={(event) => {setResidenceBarangayId(event.target.value);setRegistryOwnerId(undefined);}}><option value="">Choose a barangay</option>{editableResidents.map((barangay) => <option key={barangay.id} value={barangay.id}>{barangay.name}</option>)}</select></Field>
          </div>
          <div className="space-y-2"><div className="flex items-center justify-between"><h4 className="text-sm font-medium">Pets (optional while gathering interest)</h4><button type="button" disabled={pets.length >= 10} className={btnGhost} onClick={() => setPets((current) => [...current, emptyPet(campaign.processes)])}>Add pet</button></div>
            {pets.map((pet, index) => <div key={index} className="grid gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-2">
              <div className="grid grid-cols-2 gap-2"><Field label={`Pet ${index + 1} name`}><input className={inputCls} maxLength={80} value={pet.name} onChange={(event) => setPetField(index, 'name', event.target.value)} /></Field><Field label="Species"><select className={inputCls} value={pet.species} onChange={(event) => setPetField(index, 'species', event.target.value)}><option>Dog</option><option>Cat</option></select></Field><Field label="Sex"><select className={inputCls} value={pet.sex} onChange={(event) => setPetField(index, 'sex', event.target.value)}><option value="">Not recorded</option><option>Female</option><option>Male</option></select></Field><Field label="Age in months"><input className={inputCls} type="number" min={0} max={600} value={pet.ageMonths} onChange={(event) => setPetField(index, 'ageMonths', event.target.value)} /></Field></div>
              <div><p className="text-xs font-medium text-slate-600 dark:text-slate-300">Requested processes</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{campaign.processes.map((process) => <Check key={process} checked={pet.processes.includes(process)} onChange={(checked) => setPetField(index, 'processes', checked ? [...pet.processes, process] : pet.processes.filter((item) => item !== process))}>{process}</Check>)}</div><button type="button" className="mt-3 text-xs text-red-700 underline dark:text-red-300" onClick={() => setPets((current) => current.filter((_, i) => i !== index))}>Remove pet</button></div>
            </div>)}
          </div>
          {duplicateCandidates.length > 0 && <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"><p className="font-semibold">Possible matching interest already exists</p><ul className="mt-1 list-inside list-disc">{duplicateCandidates.map((candidate) => <li key={candidate.id}>{candidate.ownerName} · {candidate.barangay}</li>)}</ul><p className="mt-2 text-xs">Review before continuing. Adding as separate records will not merge either entry.</p><button type="button" disabled={saving} className={`${btnGhost} mt-2`} onClick={(event) => void submitPerson(event, true)}>Confirm this is a different owner</button></section>}
          <div className="flex justify-end gap-2">{editing !== null && <button type="button" className={btnGhost} onClick={clearOwnerForm}>Cancel edit</button>}<button type="submit" disabled={saving || !editable} className={btnPrimary}>{saving ? 'Saving…' : editing === null ? 'Add interest' : 'Save changes'}</button></div>
        </form>
      </section>}

      <section>
        <div className="flex items-center justify-between"><h3 className="font-semibold">Interested owners ({campaign.ownerCount})</h3><span className="text-xs text-slate-500">{campaign.petCount} pets listed</span></div>
        {!data?.people.length ? <p className="py-5 text-center text-sm text-slate-500">No owner interests entered yet.</p> : <div className="mt-2 space-y-2">{data.people.map((person) => <article key={person.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{person.owner_name}{person.duplicate_confirmed && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-100">Marked distinct after review</span>}</p><p className="text-xs text-slate-500">{person.mobile || 'No mobile provided'} · {person.residence_barangay} · {person.pets.length} pets</p></div>{isAdmin&&<Link className="text-xs text-brand-700 underline" to={`/registry/owners?intakeSource=interest&intakeId=${person.id}`}>Verify / add to Owners</Link>}{editable && <div className="flex gap-3 text-xs"><button type="button" onClick={() => startEdit(person)} className="text-brand-700 underline dark:text-brand-300">Edit</button><button type="button" disabled={saving} onClick={() => void withdraw(person.id)} className="text-red-700 underline dark:text-red-300">Withdraw</button></div>}</div>
          {person.pets.length > 0 && <ul className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">{person.pets.map((pet, index) => <li key={`${person.id}-${index}`}><strong>{pet.name}</strong> · {pet.species}{pet.sex ? ` · ${pet.sex}` : ''}{pet.ageMonths == null ? '' : ` · ${pet.ageMonths} mo`} · {pet.processes.join(', ')}</li>)}</ul>}
        </article>)}</div>}
      </section>
    </div>
  </CampaignPanel>;
}
