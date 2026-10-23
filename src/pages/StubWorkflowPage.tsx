import { PetHealthFields } from '../components/PetHealthFields';
import { emptyRegistryPet,type RegistryPet } from '../../shared/registry';
import { FileInput } from '../components/FileInput';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ClipboardCheck, Package, Plus, Printer, ScanLine, Search, Users, X } from 'lucide-react';
import { Link,useSearchParams } from 'react-router-dom';
import type { AttendancePageData, AttendancePet, ServiceOutcome, StubBatchDetails, StubLookup, StubOwner, StubPageData, StubPet, StubPrintData, StubProgram, StubTicket } from '../../shared/stubs';
import { PROGRAM_PROCESSES, type ProgramProcess } from '../../shared/programs';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { Check, Field, Loading, Modal, Notice, Pagination, Spinner, btnDanger, btnGhost, btnPrimary, formatDate, inputCls } from '../components/ui';
import { StubScanner } from '../components/StubScanner';
import { ParticipantRegistryPicker } from '../components/ParticipantRegistryPicker';
import { StubPrintSheet } from '../components/StubPrintSheet';
import { DataFreshness } from '../components/DataFreshness';
import './stub-workflow.css';

const card = 'rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-surface-dark';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const failureText = (failure: unknown) => failure instanceof Error ? failure.message : 'The request could not be completed. Please try again.';
const isClosed = (program: StubProgram) => program.campaignStatus === 'closed';
const isIssuable = (program: StubProgram) => program.campaignStatus === 'scheduled' && ['Planned', 'Open', 'In progress'].includes(program.status) && program.date >= today() && program.processes.length > 0;
const canAttend = (program: StubProgram) => ['Open', 'In progress', 'Completed'].includes(program.status) && Boolean(program.date) && program.date <= today();
const Badge = ({ children }: { children: string }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${['Redeemed', 'Submitted', 'Handed over'].includes(children) ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : ['Cancelled', 'Rejected', 'Voided'].includes(children) ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{children}</span>;
type DraftPet = Partial<Pick<RegistryPet,'breed'|'breedClass'|'vaccinationStatus'|'sterilizationStatus'|'vaccineType'|'vaccinationDate'|'color'>> & { registryId?:string; name: string; species: 'Dog' | 'Cat'; sex: '' | 'Male' | 'Female'; ageMonths: string; processes: ProgramProcess[]; outcome: ServiceOutcome; processOutcomes: Partial<Record<ProgramProcess, ServiceOutcome>> };
const newPet = (processes: ProgramProcess[]): DraftPet => ({ ...emptyRegistryPet(),name: '', species: 'Dog', sex: '', ageMonths: '', processes: [...processes], outcome: 'Completed', processOutcomes: {} });
const draftPets = (pets: StubPet[], processes: ProgramProcess[]): DraftPet[] => pets.length ? pets.map((pet): DraftPet => ({ ...pet, sex: pet.sex ?? '', ageMonths: pet.ageMonths == null ? '' : String(pet.ageMonths), outcome: 'Completed', processOutcomes: {} })) : [newPet(processes)];
const payloadPets = (pets: DraftPet[]): AttendancePet[] => pets.map((pet) => ({ name: pet.name.trim(), species: pet.species,breed:pet.breed??'Unknown',breedClass:pet.breedClass??'Unknown',vaccinationStatus:pet.vaccinationStatus??'Unknown',sterilizationStatus:pet.sterilizationStatus??'Unknown',vaccineType:pet.vaccineType??'',vaccinationDate:pet.vaccinationDate??'',color:pet.color??'', ...(pet.sex ? { sex: pet.sex } : {}), ...(pet.ageMonths !== '' ? { ageMonths: Number(pet.ageMonths) } : {}), processes: pet.processes, outcome: pet.outcome, processOutcomes: Object.fromEntries(pet.processes.map((process) => [process, pet.processOutcomes[process] ?? pet.outcome])) }));

export function StubWorkflowPage({ initialTab = 'batches', campaignId, embedded = false, onChanged }: { initialTab?: 'batches' | 'attendance'; campaignId?: number; embedded?: boolean; onChanged?: () => void }) {
  const [params,setParams]=useSearchParams();
  const { account } = useAuth();
  const isAdmin = account?.type === 'Admin' || account?.type === 'SuperAdmin';
  const [tab, setTab] = useState(initialTab);
  const [page, setPage] = useState(1);
  const [programId, setProgramId] = useState(campaignId ? String(campaignId) : '');
  const [requestOpen, setRequestOpen] = useState(false);
  const [batchId, setBatchId] = useState<number | null>(null);
  useEffect(()=>{if(embedded)return;const id=Number(params.get('batchId'));setBatchId(Number.isSafeInteger(id)&&id>0?id:null);},[params,embedded]);
  const closeBatch=()=>{setBatchId(null);if(!embedded)setParams(p=>{p.delete('batchId');return p;},{replace:true});};
  const [encode, setEncode] = useState<'redeem' | 'walk-in' | null>(null);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const { data, loading, error, reload } = useApi<StubPageData>(`/stub-workflow?page=${page}&pageSize=20&refresh=${revision}${campaignId ? `&campaignId=${campaignId}` : ''}`, { refreshIntervalMs: 30000, refreshWhen: (value) => Boolean(value?.programs.some((program) => ['Open','In progress'].includes(program.status) && program.date <= today() && !isClosed(program))) });
  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => { if (data && !data.programs.some((program) => String(program.id) === programId)) setProgramId(String(data.programs[0]?.id ?? '')); }, [data, programId]);
  const selectedProgram = data?.programs.find((program) => String(program.id) === programId);
  const changed = (message: string) => { setNotice(message); setRevision((value) => value + 1); onChanged?.(); };
  if (!data && loading) return <Loading label="Loading stub batches and programs…" />;
  if (!data && error) return <div className="mx-auto max-w-6xl space-y-3"><Notice kind="error">{error.message}</Notice><button className={btnGhost} onClick={reload}>Try again</button></div>;
  return <div className="mx-auto max-w-6xl space-y-5">
    {!embedded && <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Stubs and attendance</h1><p className="mt-1 text-sm text-slate-500">Manage physical stubs and record the owners, pets, and services at each program day.</p></div><button className={btnGhost} onClick={reload} disabled={loading}>{loading ? <Spinner label="Refreshing…" /> : 'Refresh'}</button></header>}
    {notice && <Notice kind="success"><div className="flex justify-between gap-3"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><X className="h-4 w-4" /></button></div></Notice>}
    {error && data && <Notice kind="error">{error.message}</Notice>}
    {!embedded && <div className="flex gap-2 border-b border-slate-200 pb-3 dark:border-slate-700" role="tablist" aria-label="Stub workflow">
      <button role="tab" aria-selected={tab === 'batches'} className={tab === 'batches' ? btnPrimary : btnGhost} onClick={() => setTab('batches')}><Package className="h-4 w-4" />Stub batches</button>
      <button role="tab" aria-selected={tab === 'attendance'} className={tab === 'attendance' ? btnPrimary : btnGhost} onClick={() => setTab('attendance')}><ClipboardCheck className="h-4 w-4" />Encode attendance</button>
    </div>}
    {tab === 'batches' && <section className={`${card} space-y-4`} role="tabpanel">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Barangay stub batches</h2><p className="mt-1 text-sm text-slate-500">Generate barangay batches, assign owners, and download or print. Physical hand-over is optional.</p></div><div className="flex flex-wrap items-center gap-3">{isAdmin && <Link className="text-xs text-slate-500 underline" to="/stubs/legacy">Historical stub records</Link>}<button className={btnPrimary} disabled={!data?.programs.some(isIssuable)} onClick={() => setRequestOpen(true)}><Plus className="h-4 w-4" />{isAdmin?'Generate stubs':'Request stubs'}</button></div></div>
      {!data?.programs.length && <Notice>No scheduled program is available. Create a program day in Program interest first.</Notice>}
      {!data?.batches.length ? <p className="py-8 text-center text-sm text-slate-500">No stub requests yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700"><tr>{['Program / batch', 'Recipient', 'Quantity', 'Status', ''].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.batches.map((batch) => <tr key={batch.id}><td className="p-3"><p className="font-medium">{batch.programTitle}</p><p className="mt-1 text-xs text-slate-500">{formatDate(batch.programDate)} · {batch.reference}</p></td><td className="p-3">{batch.recipientName}<p className="text-xs text-slate-500">{batch.barangay}</p></td><td className="p-3"><p>{batch.approvedQuantity ?? batch.requestedQuantity} stubs</p><p className="text-xs text-slate-500">{batch.issuedCount} issued · {batch.redeemedCount} redeemed</p></td><td className="p-3"><Badge>{batch.status}</Badge></td><td className="p-3"><button className="font-semibold text-brand-700 underline dark:text-brand-300" onClick={() => setBatchId(batch.id)}>Open</button></td></tr>)}</tbody></table></div>}
      <Pagination page={data?.page ?? page} pageSize={data?.pageSize ?? 20} total={data?.total ?? 0} onPage={setPage} />
    </section>}
    {tab === 'attendance' && <section className="space-y-4" role="tabpanel">
      <div className={`${card} space-y-4`}>{!embedded && <Field label="Program day"><select className={inputCls} value={programId} onChange={(event) => setProgramId(event.target.value)}><option value="">Choose a program day</option>{data?.programs.map((program) => <option key={program.id} value={program.id}>{program.title} · {formatDate(program.date)} · {program.hostBarangay}</option>)}</select></Field>}
        {selectedProgram && <><ProgramSummary program={selectedProgram} />{!canAttend(selectedProgram) && <Notice>Attendance is available for Open, In progress, or Completed programs on or after the scheduled date.</Notice>}<div className="flex flex-wrap gap-2"><button className={btnPrimary} disabled={!canAttend(selectedProgram) || (isClosed(selectedProgram) && !isAdmin)} onClick={() => setEncode('redeem')}><ScanLine className="h-4 w-4" />Redeem a stub</button><button className={btnGhost} disabled={!canAttend(selectedProgram) || (isClosed(selectedProgram) && !isAdmin)} onClick={() => setEncode('walk-in')}><Users className="h-4 w-4" />Encode a walk-in</button></div>{isClosed(selectedProgram) && <Notice>{isAdmin ? 'This program is closed. Late attendance needs a reason and remains part of the audit history.' : 'This program is closed. Ask an Admin to record or correct late attendance.'}</Notice>}</>}
        {!data?.programs.length && <Notice>No program days are available in your scope.</Notice>}
      </div>
      {selectedProgram && <AttendanceList key={`${selectedProgram.id}-${revision}`} campaignId={selectedProgram.id} isAdmin={isAdmin} onChanged={changed} />}
    </section>}
    {requestOpen && data && <RequestBatchModal data={data} accountId={account?.id ?? 0} isAdmin={isAdmin} onClose={() => setRequestOpen(false)} onSaved={() => { setRequestOpen(false); changed('Stub batch request submitted.'); }} />}
    {batchId !== null && <BatchModal batchId={batchId} isAdmin={isAdmin} accountId={account?.id ?? 0} onClose={closeBatch} onChanged={changed} />}
    {encode && selectedProgram && <AttendanceModal initialMode={encode} program={selectedProgram} isAdmin={isAdmin} onClose={() => setEncode(null)} onSaved={() => { setEncode(null); changed('Attendance saved. The owner, pets, and services are recorded together.'); }} />}
  </div>;
}

function ProgramSummary({ program }: { program: StubProgram }) {
  return <div className="grid gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900 sm:grid-cols-3"><p><span className="block text-xs text-slate-500">Program</span><strong>{program.title}</strong><span className="block text-xs text-slate-500">{formatDate(program.date)} · {program.location}</span></p><p><span className="block text-xs text-slate-500">Pet slots used</span><strong>{program.slotsUsed}{program.slots == null ? '' : ` / ${program.slots}`}</strong><span className="block text-xs text-slate-500">{program.durationMinutes == null ? 'Duration not set' : `${program.durationMinutes} minutes planned`}</span></p><p><span className="block text-xs text-slate-500">Eligible barangays</span>{program.allowedBarangays.map((barangay) => barangay.name).join(', ')}</p></div>;
}

function RequestBatchModal({ data, accountId, isAdmin, onClose, onSaved }: { data: StubPageData; accountId: number; isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const programs = data.programs.filter(isIssuable);
  const [programId, setProgramId] = useState(String(programs[0]?.id ?? ''));
  const [recipientId, setRecipientId] = useState(isAdmin ? '' : String(accountId));
  const [selectedAreas,setSelectedAreas]=useState<number[]>([]);
  const [quantity, setQuantity] = useState('100');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedProgram = programs.find((program) => String(program.id) === programId);
  const recipients = data.paravets.filter((paravet) => selectedProgram?.allowedBarangays.some((barangay) => barangay.id === paravet.barangayId));
  const save = async (event: FormEvent) => { event.preventDefault(); if (saving) return; setSaving(true); setError(''); try { await api('POST', '/stub-workflow', isAdmin?{action:'generate-batches',campaignId:Number(programId),barangayIds:selectedAreas,quantity:Number(quantity),note:note.trim()||undefined}:{ action: 'request-batch', campaignId: Number(programId), quantity: Number(quantity), recipientId: Number(recipientId), note: note.trim() || undefined }); onSaved(); } catch (failure) { setError(failureText(failure)); } finally { setSaving(false); } };
  return <Modal title={isAdmin?"Generate barangay stubs":"Request a stub batch"} onClose={() => { if (!saving) onClose(); }}><form className="stub-dialog-enter space-y-4" onSubmit={(event) => void save(event)}>
    {error && <Notice kind="error">{error}</Notice>}
    <Field label="Program day"><select required className={inputCls} value={programId} disabled={saving} onChange={(event) => { setProgramId(event.target.value); if (isAdmin) {setRecipientId('');setSelectedAreas([]);} }}><option value="">Choose a program</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.title} · {formatDate(program.date)}</option>)}</select></Field>
    {isAdmin&&<fieldset><legend className="text-sm font-semibold">Barangays receiving stubs</legend><p className="mt-1 text-xs text-slate-500">Every active Paravet assigned to a selected barangay can access its shared batch. Quantity is per barangay.</p><div className="mt-2 flex flex-wrap gap-3"><Check checked={!!selectedProgram?.allowedBarangays.length&&selectedAreas.length===selectedProgram.allowedBarangays.length} onChange={v=>setSelectedAreas(v?selectedProgram?.allowedBarangays.map(b=>b.id)??[]:[])}>All participating barangays</Check>{selectedProgram?.allowedBarangays.map(b=><Check key={b.id} checked={selectedAreas.includes(b.id)} onChange={v=>setSelectedAreas(a=>v?[...a,b.id]:a.filter(id=>id!==b.id))}>{b.name}</Check>)}</div></fieldset>}
    <Field label="Number of stubs"><input required className={inputCls} type="number" min={1} max={500} step={1} value={quantity} disabled={saving} onChange={(event) => setQuantity(event.target.value)} /></Field>
    <Field label="Note (optional)"><textarea className={inputCls} maxLength={1000} rows={2} value={note} disabled={saving} onChange={(event) => setNote(event.target.value)} /></Field>
    <div className="flex justify-end gap-2"><button type="button" className={btnGhost} disabled={saving} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={saving || !programId || (isAdmin?!selectedAreas.length:!recipientId)}>{saving ? <Spinner label="Submitting…" /> : isAdmin?'Generate stubs':'Submit request'}</button></div>
  </form></Modal>;
}

function BatchModal({ batchId, accountId, isAdmin, onClose, onChanged }: { batchId: number; accountId: number; isAdmin: boolean; onClose: () => void; onChanged: (message: string) => void }) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const { data, loading, error, reload } = useApi<StubBatchDetails>(`/stub-workflow?mode=batch&batchId=${batchId}&page=${page}&pageSize=20&refresh=${revision}`);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState<StubPrintData | null>(null);
  const [printError, setPrintError] = useState('');
  const [issueStub, setIssueStub] = useState<StubTicket | null>(null);
  const [cancelStub, setCancelStub] = useState<StubTicket | null>(null);
  const [reason, setReason] = useState('');
  const [confirmHandover, setConfirmHandover] = useState(false);
  useEffect(() => { if (data) setQuantity(String(data.batch.approvedQuantity ?? data.batch.requestedQuantity)); }, [data]);
  const changed = (message: string) => { setRevision((value) => value + 1); onChanged(message); };
  const act = async (body: Record<string, unknown>, message: string) => {
    if (saving) return false;
    setSaving(true); setErrorText('');
    try { await api('POST', '/stub-workflow', body); changed(message); return true; } catch (failure) { setErrorText(failureText(failure)); return false; } finally { setSaving(false); }
  };
  const startPrint = async () => { setPrintOpen(true); setPrintData(null); setPrintError(''); setErrorText(''); try { const result = await api<StubPrintData>('GET', `/stub-workflow?mode=print&batchId=${batchId}`); setPrintData(result); } catch (failure) { setPrintError(failureText(failure)); } };
  const canIssue = data && ['Approved','Printed','Handed over'].includes(data.batch.status) && isIssuable(data.program);
  return <><Modal title={data ? `Batch ${data.batch.reference}` : 'Loading stub batch'} wide onClose={() => { if (!saving && !printOpen && !issueStub && !cancelStub) onClose(); }}>
    {(loading && !data) ? <Loading label="Loading batch, stock, and program details…" /> : error && !data ? <div className="space-y-3"><Notice kind="error">{error.message}</Notice><button className={btnGhost} onClick={reload}>Try again</button></div> : data && <div className="stub-dialog-enter space-y-4">
      {errorText && <Notice kind="error">{errorText}</Notice>}
      <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{data.program.title}</h3><p className="text-sm text-slate-500">{formatDate(data.program.date)} · {data.batch.recipientName} · {data.batch.barangay}</p></div><Badge>{data.batch.status}</Badge></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[['Approved', data.batch.approvedQuantity ?? '—'], ['Available', data.batch.availableCount ?? '—'], ['Issued total', data.batch.issuedCount], ['Redeemed', data.batch.redeemedCount], ['Cancelled', data.batch.cancelledCount ?? '—']].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xs text-slate-500">{label}</p><strong className="text-lg">{value}</strong></div>)}</div>
      <div className="flex flex-wrap gap-2">{isAdmin&&<label className={`${btnGhost} cursor-pointer`}>Provide PDF<FileInput type="file" accept=".pdf,application/pdf" className="sr-only" disabled={saving} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>3*1024*1024)throw new Error('PDF must be 3 MB or smaller.');const bytes=new Uint8Array(await f.arrayBuffer());let raw='';for(const v of bytes)raw+=String.fromCharCode(v);await act({action:'attach-pdf',batchId,filename:f.name,data:btoa(raw)},'PDF made available to barangay Paravets.');}catch(e){setErrorText(failureText(e));}}}/></label>}<button className={btnGhost} onClick={async()=>{try{const pdf=await api<{data:string;filename:string}>('GET',`/stub-workflow?mode=pdf&batchId=${batchId}`);const bytes=Uint8Array.from(atob(pdf.data),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=pdf.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setErrorText(failureText(e));}}}>Download provided PDF</button></div>
      {data.batch.note && <p className="text-sm text-slate-500">Request note: {data.batch.note}</p>}{data.batch.reviewNote && <p className="text-sm text-slate-500">Review note: {data.batch.reviewNote}</p>}
      {isAdmin && data.batch.status === 'Requested' && <form className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700" onSubmit={(event) => { event.preventDefault(); void act({ action: 'review-batch', batchId, decision: 'approve', quantity: Number(quantity), note: reviewNote.trim() || undefined }, 'Stub request approved. The batch is ready to print.'); }}><div className="grid gap-3 sm:grid-cols-2"><Field label="Approved quantity"><input required type="number" min={1} max={500} step={1} className={inputCls} disabled={saving} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field><Field label="Review note"><input className={inputCls} maxLength={1000} disabled={saving} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></Field></div><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving || !reviewNote.trim()} className={btnDanger} onClick={() => void act({ action: 'review-batch', batchId, decision: 'reject', note: reviewNote.trim() }, 'Stub request rejected with a review note.')}>Reject with note</button><button className={btnPrimary} disabled={saving}>{saving ? <Spinner label="Saving…" /> : 'Approve batch'}</button></div></form>}
      <div className="flex flex-wrap gap-2">
        {['Approved', 'Printed', 'Handed over'].includes(data.batch.status) && <button className={btnGhost} disabled={saving || !isIssuable(data.program)} onClick={() => void startPrint()}><Printer className="h-4 w-4" />{data.batch.status === 'Approved' ? 'Print owner stubs' : 'Reprint owner stubs'}</button>}
        {isAdmin && data.batch.status === 'Printed' && <button className={btnPrimary} disabled={saving} onClick={() => setConfirmHandover(true)}><Package className="h-4 w-4" />Record physical hand-over (optional)</button>}
      </div>
      {confirmHandover && <div className="space-y-3 rounded-xl border border-brand-200 p-3"><p className="text-sm">Confirm that <strong>{data.batch.recipientName}</strong> has received all <strong>{data.batch.approvedQuantity}</strong> physical stubs.</p><div className="flex justify-end gap-2"><button className={btnGhost} disabled={saving} onClick={() => setConfirmHandover(false)}>Back</button><button className={btnPrimary} disabled={saving} onClick={async () => { if (await act({ action: 'handover', batchId }, 'Physical stub batch handed over.')) setConfirmHandover(false); }}>{saving ? <Spinner label="Saving…" /> : 'Confirm received'}</button></div></div>}
      {loading && <Loading label="Refreshing batch stock…" />}
      {!!data.stubs.length && <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700"><tr><th className="p-2">Stock item</th><th className="p-2">Owner / pets</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.stubs.map((stub, index) => <tr key={stub.id}><td className="p-2 text-slate-500">{(data.page - 1) * data.pageSize + index + 1}</td><td className="p-2">{stub.owner ? <><p className="font-medium">{stub.owner.name}</p><p className="text-xs text-slate-500">{stub.pets.map((pet) => pet.name).join(', ')}</p></> : <span className="text-slate-400">Unassigned</span>}</td><td className="p-2"><Badge>{stub.status}</Badge></td><td className="p-2"><div className="flex flex-wrap justify-end gap-2">{canIssue && stub.status === 'Available' && <button className="font-semibold text-brand-700 underline dark:text-brand-300" onClick={() => setIssueStub({ ...stub, barangayId: data.batch.barangayId })}>Issue after assessment</button>}{isAdmin&&stub.owner&&<Link className="text-xs text-brand-700 underline" to={`/registry/owners?intakeSource=stub&intakeId=${stub.id}`}>Verify / add to Owners</Link>}{isAdmin && ['Available', 'Issued'].includes(stub.status) && <button className="text-red-700 underline dark:text-red-300" onClick={() => { setReason(''); setCancelStub(stub); }}>Cancel stub</button>}</div></td></tr>)}</tbody></table></div><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></>}
      {!data.stubs.length && !['Requested', 'Rejected'].includes(data.batch.status) && <p className="py-5 text-center text-sm text-slate-500">No stubs available in this batch.</p>}
      {data.batch.status !== 'Handed over' && ['Approved', 'Printed'].includes(data.batch.status) && <p className="text-xs text-slate-500">Approved stubs can be assigned before printing. Assigned owner names appear on the PDF. Physical hand-over is optional.</p>}
    </div>}
  </Modal>
    {printOpen && !printData && <Modal title="Preparing print preview" onClose={() => setPrintOpen(false)}>{printError ? <Notice kind="error">{printError}</Notice> : <Loading label="Loading private batch QR data…" />}</Modal>}
    {printOpen && printData && <StubPrintSheet data={printData} saving={saving} actionError={errorText} onClose={() => { if (!saving) setPrintOpen(false); }} onConfirmPrinted={() => void act({ action: 'confirm-print', batchId }, 'Printing confirmed. Stubs remain available to assigned Paravets.').then((success) => { if (success) setPrintOpen(false); })} />}
    {issueStub && data && <OwnerPetForm title="Issue a physical stub" mode="issue" program={data.program} stub={issueStub} isAdmin={isAdmin} onClose={() => setIssueStub(null)} onSaved={() => { setIssueStub(null); changed('Stub issued after assessment. It is ready for attendance encoding.'); }} />}
    {cancelStub && <Modal title="Cancel this stub" onClose={() => { if (!saving) setCancelStub(null); }}><div className="space-y-4"><p className="text-sm text-slate-500">The QR will no longer be redeemable. The reason stays in the history.</p><Field label="Cancellation reason"><textarea required className={inputCls} rows={3} maxLength={1000} disabled={saving} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>{errorText && <Notice kind="error">{errorText}</Notice>}<button className={btnDanger} disabled={saving || reason.trim().length < 5} onClick={async () => { if (await act({ action: 'cancel-stub', stubId: cancelStub.id, reason: reason.trim() }, 'Stub cancelled.')) setCancelStub(null); }}>{saving ? <Spinner label="Cancelling…" /> : 'Cancel stub'}</button></div></Modal>}
  </>;
}

function AttendanceModal({ initialMode, program, isAdmin, onClose, onSaved }: { initialMode: 'redeem' | 'walk-in'; program: StubProgram; isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [lookup, setLookup] = useState<StubLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<StubTicket[]>([]);
  const [searched, setSearched] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = async (code: string) => { setLoading(true); setError(''); try { const result = await api<StubLookup>('GET', `/stub-workflow?mode=lookup&code=${encodeURIComponent(code)}`); if (!alive.current) return; if (!['Issued', 'Available'].includes(result.stub.status)) { setError(result.stub.status === 'Redeemed' ? 'This stub has already been redeemed. It cannot be used again.' : `This stub is ${result.stub.status.toLowerCase()} and cannot be redeemed.`); return; } if (result.program.id !== program.id) { setError(`This stub belongs to ${result.program.title} on ${formatDate(result.program.date)}. Select that program day before encoding.`); return; } setLookup(result); } catch (failure) { if (alive.current) setError(failureText(failure)); } finally { if (alive.current) setLoading(false); } };
  const find = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(''); try { const result = await api<{ stubs: StubTicket[]; program: StubProgram }>('GET', `/stub-workflow?mode=issued&campaignId=${program.id}&q=${encodeURIComponent(search.trim())}`); if (alive.current) { setMatches(result.stubs); setSearched(true); } } catch (failure) { if (alive.current) setError(failureText(failure)); } finally { if (alive.current) setLoading(false); } };
  if (initialMode === 'walk-in' || lookup) return <OwnerPetForm title={lookup ? 'Review stub attendance' : 'Encode a walk-in'} mode={lookup ? 'redeem' : 'walk-in'} program={lookup?.program ?? program} stub={lookup?.stub} isAdmin={isAdmin} onClose={onClose} onSaved={onSaved} />;
  return <Modal title="Redeem a program stub" wide onClose={onClose}><div className="stub-dialog-enter space-y-4">
    {loading ? <Loading label="Loading stub and owner details…" /> : <><StubScanner onCode={(code) => void load(code)} />{error && <Notice kind="error">{error}</Notice>}
      <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer text-sm font-medium">Find an issued stub without a camera</summary><form className="mt-3 flex items-end gap-2" onSubmit={(event) => void find(event)}><Field label="Owner name" className="flex-1"><input required className={inputCls} minLength={2} maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></Field><button className={btnGhost} disabled={search.trim().length < 2}><Search className="h-4 w-4" />Find</button></form>{searched && !matches.length && <p className="mt-3 text-sm text-slate-500">No issued stubs matched in this program.</p>}<ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">{matches.map((stub) => <li key={stub.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{stub.owner?.name}</p><p className="text-xs text-slate-500">{stub.owner?.address} · {stub.pets.map((pet) => pet.name).join(', ')}</p></div><button className={btnGhost} onClick={() => void load(stub.code)}>Review stub</button></li>)}</ul></details>
    </>}
  </div></Modal>;
}

function OwnerPetForm({ title, mode, program, stub, isAdmin, onClose, onSaved }: { title: string; mode: 'issue' | 'redeem' | 'walk-in'; program: StubProgram; stub?: StubTicket; isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const { account } = useAuth();
  const allAreas=useApi<{data:{id:number;name:string}[]}>('/barangays');
  const ownerBarangays = (mode==='walk-in'?(allAreas.data?.data??program.allowedBarangays):program.allowedBarangays).filter((barangay) => mode === 'walk-in' ? true : barangay.id === (stub?.barangayId ?? stub?.owner?.barangayId ?? account?.barangayId ?? program.hostBarangayId));
  const [owner, setOwner] = useState<StubOwner>(stub?.owner ?? { name: '', mobile: '', address: '', barangayId: ownerBarangays[0]?.id ?? program.hostBarangayId });
  const [pets, setPets] = useState<DraftPet[]>(() => draftPets(stub?.pets ?? [], program.processes));
  const [attendedOn, setAttendedOn] = useState(program.date <= today() ? program.date : today());
  const [lateReason, setLateReason] = useState('');
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState<unknown[] | null>(null);
  const [duplicateReason, setDuplicateReason] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const maximumPets = mode === 'walk-in' ? 10 : 3;
  const identityLocked = mode === 'redeem' && stub?.status === 'Issued';
  const late = mode !== 'issue' && isClosed(program);
  const petData = useMemo(() => payloadPets(pets), [pets]);
  const changePet = (index: number, patch: Partial<DraftPet>) => setPets((current) => current.map((pet, row) => row === index ? { ...pet, ...patch } : pet));
  const setOwnerField = <K extends keyof StubOwner>(field: K, value: StubOwner[K]) => setOwner((current) => ({ ...current, [field]: value,...(field==='name'||field==='barangayId'?{registryOwnerId:undefined}:{}) }));
  const back = () => { setReview(false); setDuplicate(null); setDuplicateReason(''); setRequestId(crypto.randomUUID()); setError(''); };
  const save = async (confirmDuplicate = false) => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      await api('POST', '/stub-workflow', {
        action: mode, ...(mode === 'walk-in' ? { campaignId: program.id } : { stubId: stub?.id }),
        owner: { ...owner, name: owner.name.trim(), mobile: owner.mobile.trim(), address: owner.address.trim() },
        pets: mode === 'issue' ? petData.map(({ outcome: _outcome, processOutcomes: _processOutcomes, ...pet }) => pet) : petData,
        ...(mode === 'issue' ? {} : { requestId, attendedOn, ...(lateReason.trim() ? { lateEntryReason: lateReason.trim() } : {}), ...(confirmDuplicate ? { confirmDuplicate: true, duplicateReason: duplicateReason.trim() } : {}) }),
      });
      onSaved();
    } catch (failure) {
      if (failure instanceof ApiError && ['POSSIBLE_DUPLICATE', 'DUPLICATE_ATTENDANCE'].includes(failure.code)) {
        const details = failure.details as { candidates?: unknown[]; matches?: unknown[] } | undefined;
        setDuplicate(details?.candidates ?? details?.matches ?? []); setError('Review the possible existing attendance before saving another record.');
      } else setError(failureText(failure));
    } finally { setSaving(false); }
  };
  return <Modal title={title} wide onClose={() => { if (!saving) onClose(); }}><div className="stub-dialog-enter space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{program.title} · {formatDate(program.date)}</p><Badge>{mode === 'walk-in' ? 'Walk-in' : mode === 'issue' ? 'Stub assessment' : 'Stub'}</Badge></div>
    {mode === 'redeem' && stub?.status === 'Available' && <Notice>Record a paper stub handed out after assessment. Submitting saves its owner, pets, issuance, and attendance together.</Notice>}
    {identityLocked && <p className="text-xs text-slate-500">This stub has an assessed owner and pets. Remove a pet if it did not attend; update contact details and service results as needed. Ask an Admin to cancel and reissue a stub for a different owner or pet.</p>}
    {error && <Notice kind="error">{error}</Notice>}
    {mode !== 'issue' && program.slots !== null && program.slotsUsed + pets.length > program.slots && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">This entry brings attendance to approximately <strong>{program.slotsUsed + pets.length} / {program.slots} pets</strong>. Capacity is a planning guide. You can still record pets that actually attended.</div>}
    {!review ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (pets.some((pet) => !pet.processes.length)) { setError('Choose at least one process for every pet.'); return; } setError(''); setReview(true); }}>
      {!identityLocked&&<ParticipantRegistryPicker key={owner.barangayId} campaignId={program.id} mode={mode==='walk-in'?'walk-in':'stub'} barangayId={owner.barangayId} onOwner={value=>{setOwner(value);setPets([newPet(program.processes)]);}} onPet={value=>{setPets(current=>{if(current.some(p=>p.registryId===value.id)){setError('This pet is already in the participating list. Review the entry before adding another.');return current;}const next={...newPet(program.processes),...value,registryId:value.id,ageMonths:value.ageMonths==null?'':String(value.ageMonths)};const filled=current.filter(p=>p.name.trim());if(filled.length>=maximumPets){setError(`This entry allows up to ${maximumPets} pets. Use another stub when needed.`);return current;}return [...filled,next];});}}/>}
      <fieldset disabled={saving} className="space-y-3"><legend className="mb-2 font-semibold">Owner information</legend><div className="grid gap-3 sm:grid-cols-2"><Field label="Full name"><input className={inputCls} required disabled={identityLocked} maxLength={120} value={owner.name} onChange={(event) => setOwnerField('name', event.target.value)} /></Field><Field label="Mobile (optional)"><input className={inputCls} type="tel" maxLength={20} pattern="09[0-9]{2}[- ]?[0-9]{3}[- ]?[0-9]{4}" placeholder="0917-123-4567" value={owner.mobile} onChange={(event) => setOwnerField('mobile', event.target.value)} /></Field><Field label="Residence barangay"><select required disabled={identityLocked} className={inputCls} value={owner.barangayId} onChange={(event) => setOwnerField('barangayId', Number(event.target.value))}>{ownerBarangays.map((barangay) => <option key={barangay.id} value={barangay.id}>{barangay.name}</option>)}</select></Field><Field label="Address (optional)"><input className={inputCls} maxLength={300} value={owner.address} onChange={(event) => setOwnerField('address', event.target.value)} /></Field></div></fieldset>
      <fieldset disabled={saving} className="space-y-3"><legend className="mb-2 font-semibold">Participating pets <span className="text-xs font-normal text-slate-500">{pets.length} / {maximumPets}</span></legend>{pets.map((pet, index) => <article key={index} className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Pet {index + 1}</h3>{pets.length > 1 && <button type="button" className="text-xs text-red-700 underline dark:text-red-300" onClick={() => setPets((current) => current.filter((_, row) => row !== index))}>Remove pet</button>}</div><div className="grid gap-3 sm:grid-cols-4"><Field label="Pet name"><input required disabled={identityLocked} className={inputCls} maxLength={80} value={pet.name} onChange={(event) => changePet(index, { name: event.target.value })} /></Field><Field label="Species"><select disabled={identityLocked} className={inputCls} value={pet.species} onChange={(event) => changePet(index, { species: event.target.value as DraftPet['species'] })}><option>Dog</option><option>Cat</option></select></Field><Field label="Sex (optional)"><select disabled={identityLocked} className={inputCls} value={pet.sex} onChange={(event) => changePet(index, { sex: event.target.value as DraftPet['sex'] })}><option value="">Not recorded</option><option>Male</option><option>Female</option></select></Field><Field label="Age in months (optional)"><input className={inputCls} type="number" min={0} max={600} step={1} value={pet.ageMonths} onChange={(event) => changePet(index, { ageMonths: event.target.value })} /></Field></div>
        <PetHealthFields pet={{...emptyRegistryPet(),...pet,ageMonths:pet.ageMonths===''?null:Number(pet.ageMonths),breed:pet.breed??'Unknown',color:pet.color??''}} onChange={v=>changePet(index,{breed:v.breed,breedClass:v.breedClass,vaccinationStatus:v.vaccinationStatus,sterilizationStatus:v.sterilizationStatus,vaccineType:v.vaccineType,vaccinationDate:v.vaccinationDate})}/>
        <fieldset><legend className="text-sm font-medium">{mode === 'issue' ? 'Assessed processes' : 'Processes received / assessed'}</legend><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2"><Check checked={program.processes.every((process) => pet.processes.includes(process))} onChange={(checked) => changePet(index, { processes: checked ? [...program.processes] : [] })}>All of the Above</Check>{PROGRAM_PROCESSES.filter((process) => program.processes.includes(process)).map((process) => <Check key={process} checked={pet.processes.includes(process)} onChange={(checked) => changePet(index, { processes: checked ? [...pet.processes, process] : pet.processes.filter((selected) => selected !== process) })}>{process}</Check>)}</div></fieldset>
        {mode !== 'issue' && !!pet.processes.length && <fieldset><legend className="text-sm font-medium">Result for each process</legend><div className="mt-2 grid gap-3 sm:grid-cols-3">{pet.processes.map((process) => <Field key={process} label={process}><select className={inputCls} value={pet.processOutcomes[process] ?? pet.outcome} onChange={(event) => changePet(index, { processOutcomes: { ...pet.processOutcomes, [process]: event.target.value as ServiceOutcome } })}><option>Completed</option><option>Deferred</option><option>Not eligible</option></select></Field>)}</div></fieldset>}
      </article>)}{!identityLocked && <button type="button" className={btnGhost} disabled={pets.length >= maximumPets} onClick={() => setPets((current) => [...current, newPet(program.processes)])}><Plus className="h-4 w-4" />Add participating pet</button>}</fieldset>
      {identityLocked && stub && pets.length < stub.pets.length && <button type="button" className={btnGhost} onClick={() => setPets(draftPets(stub.pets, program.processes))}>Restore assessed pet list</button>}
      {mode !== 'issue' && <Field label="Actual participation date"><input className={inputCls} required type="date" min={program.date} max={today()} value={attendedOn} onChange={(event) => setAttendedOn(event.target.value)} /></Field>}
      {late && <Field label="Reason for late entry"><textarea required minLength={5} maxLength={1000} className={inputCls} rows={2} value={lateReason} onChange={(event) => setLateReason(event.target.value)} /></Field>}
      {late && !isAdmin && <Notice kind="error">An Admin must encode attendance for a closed program.</Notice>}
      <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={saving || (late && !isAdmin)}>Review owner and pets</button></div>
    </form> : <>
      <Notice>{mode === 'issue' ? 'Confirm the assessed owner and all participating pets before issuing the physical stub.' : 'Confirm every owner and pet detail. Submitting a stub records attendance and marks its QR as redeemed.'}</Notice>
      <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><h3 className="font-semibold">{owner.name}</h3><p className="mt-1">{owner.mobile || 'Mobile not recorded'} · {program.allowedBarangays.find((barangay) => barangay.id === owner.barangayId)?.name}</p><p>{owner.address}</p>{mode !== 'issue' && <p className="mt-2">Participation date: <strong>{formatDate(attendedOn)}</strong></p>}{lateReason && <p className="mt-2">Late entry reason: {lateReason}</p>}</div>
      <div className="space-y-2">{petData.map((pet, index) => <article key={index} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900"><h3 className="font-semibold">{pet.name} · {pet.species}</h3><p className="mt-1 text-slate-500">{pet.sex ?? 'Sex not recorded'} · {pet.ageMonths == null ? 'Age not recorded' : `${pet.ageMonths} months`}</p>{mode === 'issue' ? <p className="mt-1">{pet.processes.join(' · ')}</p> : <ul className="mt-2 space-y-1">{pet.processes.map((process) => <li key={process} className="flex flex-wrap items-center justify-between gap-2"><span>{process}</span><Badge>{pet.processOutcomes?.[process] ?? pet.outcome}</Badge></li>)}</ul>}</article>)}</div>
      {duplicate && <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950"><h3 className="text-sm font-semibold">Possible attendance match</h3><p className="text-sm">Check the existing record. Continue only when this is a different attendance that needs its own record.</p>{duplicate.map((candidate, index) => <DuplicateCandidate key={index} candidate={candidate} />)}<Field label="Why a separate attendance is needed"><textarea className={inputCls} minLength={5} maxLength={1000} rows={2} disabled={saving} value={duplicateReason} onChange={(event) => setDuplicateReason(event.target.value)} /></Field></div>}
      <div className="flex flex-wrap justify-end gap-2"><button className={btnGhost} disabled={saving} onClick={back}>Edit details</button><button className={btnPrimary} disabled={saving || (!!duplicate && duplicateReason.trim().length < 5)} onClick={() => void save(!!duplicate)}>{saving ? <Spinner label={mode === 'issue' ? 'Issuing stub…' : 'Saving attendance…'} /> : duplicate ? 'Confirm separate attendance' : mode === 'issue' ? 'Confirm and issue stub' : mode === 'redeem' ? 'Submit and redeem stub' : 'Submit walk-in attendance'}</button></div>
    </>}
  </div></Modal>;
}

function DuplicateCandidate({ candidate }: { candidate: unknown }) {
  const value = (candidate && typeof candidate === 'object' ? candidate : {}) as Record<string, unknown>;
  const candidateOwner = value.owner as StubOwner | undefined;
  const candidatePets = value.pets as StubPet[] | undefined;
  return <p className="rounded-lg bg-white/60 p-2 text-sm dark:bg-slate-900"><strong>{String(value.ownerName ?? value.owner_name ?? value.name ?? candidateOwner?.name ?? 'Existing attendance')}</strong>{value.attendedOn ? ` · ${formatDate(String(value.attendedOn))}` : ''}{value.source ? ` · ${String(value.source)}` : ''}{value.barangay ? ` · ${String(value.barangay)}` : ''}{Array.isArray(value.petNames) ? ` · ${value.petNames.map(String).join(', ')}` : candidatePets?.length ? ` · ${candidatePets.map((pet) => pet.name).join(', ')}` : ''}</p>;
}

function AttendanceList({ campaignId, isAdmin, onChanged }: { campaignId: number; isAdmin: boolean; onChanged: (message: string) => void }) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [voidId, setVoidId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const { data, loading, error, reload, updatedAt } = useApi<AttendancePageData>(`/stub-workflow?mode=attendance&campaignId=${campaignId}&page=${page}&pageSize=20&refresh=${revision}`, { refreshIntervalMs: 30000, refreshWhen: (value) => Boolean(value && ['Open','In progress'].includes(value.program.status) && value.program.date <= today() && !isClosed(value.program)) });
  const voidRecord = async () => { if (!voidId || saving) return; setSaving(true); setErrorText(''); try { await api('POST', '/stub-workflow', { action: 'void-attendance', attendanceId: voidId, reason: reason.trim() }); setVoidId(null); setRevision((value) => value + 1); onChanged('Attendance voided. Its original details remain in the history.'); } catch (failure) { setErrorText(failureText(failure)); } finally { setSaving(false); } };
  return <section className={`${card} space-y-4`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Attendance records</h2>{data && <p className="text-sm text-slate-500">{data.summary.owners} owner visits · {data.summary.pets} pets · {data.summary.completedServices} completed services</p>}</div>
    <DataFreshness updatedAt={updatedAt} loading={loading} onRefresh={reload} />
    {loading && <Loading label="Loading participation records…" />}{error && <div className="space-y-3"><Notice kind="error">{error.message}</Notice><button className={btnGhost} onClick={reload}>Try again</button></div>}
    {data && !data.data.length && <p className="py-6 text-center text-sm text-slate-500">No attendance records yet.</p>}
    {data && !!data.data.length && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700"><tr>{['Owner', 'Pets and processes', 'Source / date', 'Record', ''].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.data.map((record) => <tr key={record.id} className={record.status === 'Voided' ? 'opacity-70' : ''}><td className="min-w-40 p-3"><p className="font-medium">{record.owner.name}</p><p className="text-xs text-slate-500">{record.owner.mobile || 'Mobile not recorded'}</p><p className="max-w-48 text-xs text-slate-500">{record.owner.address}</p></td><td className="min-w-64 p-3"><ul className="space-y-3">{record.pets.map((pet, index) => <li key={index}><strong>{pet.name}</strong> <span className="text-xs text-slate-500">{pet.species}{pet.sex ? ` · ${pet.sex}` : ''}{pet.ageMonths == null ? '' : ` · ${pet.ageMonths} months`}</span><ul className="mt-1 space-y-1">{pet.processes.map((process) => <li key={process} className="text-xs"><span className="text-slate-500">{process}</span> · <span className="font-medium">{pet.processOutcomes?.[process] ?? pet.outcome}</span></li>)}</ul></li>)}</ul></td><td className="whitespace-nowrap p-3"><Badge>{record.source}</Badge><p className="mt-2 text-xs text-slate-500">{formatDate(record.attendedOn)}</p></td><td className="p-3"><Badge>{record.status}</Badge><p className="mt-2 text-xs text-slate-500">By {record.encodedBy}</p>{record.voidReason && <p className="mt-1 max-w-48 text-xs text-red-700 dark:text-red-300">{record.voidReason}</p>}</td><td className="p-3">{isAdmin && record.status === 'Submitted' && <button className="text-xs text-red-700 underline dark:text-red-300" onClick={() => { setVoidId(record.id); setReason(''); setErrorText(''); }}>Void record</button>}</td></tr>)}</tbody></table></div>}
    <Pagination page={data?.page ?? page} pageSize={data?.pageSize ?? 20} total={data?.total ?? 0} onPage={setPage} />
    {voidId && <Modal title="Void attendance record" onClose={() => { if (!saving) setVoidId(null); }}><div className="space-y-4"><p className="text-sm text-slate-500">Use this for an incorrect or duplicate record. Original details are kept, and the record is excluded from attendance totals.</p><Field label="Reason"><textarea className={inputCls} rows={3} maxLength={1000} disabled={saving} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>{errorText && <Notice kind="error">{errorText}</Notice>}<button className={btnDanger} disabled={saving || reason.trim().length < 5} onClick={() => void voidRecord()}>{saving ? <Spinner label="Voiding…" /> : 'Void attendance'}</button></div></Modal>}
  </section>;
}
