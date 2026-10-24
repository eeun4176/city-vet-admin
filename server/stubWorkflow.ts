import { BREED_CLASSES,HEALTH_STATUSES } from '../shared/petReferences';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Session } from './auth';
import type { Tx } from './db';
import { forbidden, notFound, unprocessable } from './errors';
import { PROGRAM_PROCESSES, normalizeProgramStatus, programProcessesFrom } from '../shared/programs';
import type { AttendancePet, StubBatch, StubOwner, StubPet, StubProgram, StubTicket, ProgramAttendance } from '../shared/stubs';

export const ownerSchema = z.object({
  registryOwnerId:z.string().max(100).optional(),
  name: z.string().trim().min(1).max(120),
  mobile: z.string().trim().max(20).default('').refine((value) => !value || /^09\d{2}[- ]?\d{3}[- ]?\d{4}$/.test(value), 'Use a Philippine mobile number such as 0917-123-4567.'),
  address: z.string().trim().max(300).default(''),
  barangayId: z.number().int().positive(),
});
export const stubPetSchema = z.object({
  breed:z.string().trim().max(100).optional(),breedClass:z.enum(BREED_CLASSES).optional(),vaccinationStatus:z.enum(HEALTH_STATUSES).optional(),sterilizationStatus:z.enum(HEALTH_STATUSES).optional(),vaccineType:z.string().max(100).optional(),vaccinationDate:z.string().max(10).optional(),color:z.string().max(100).optional(),
  name: z.string().trim().min(1).max(80), species: z.enum(['Dog','Cat']),
  sex: z.enum(['Male','Female']).optional(), ageMonths: z.number().int().min(0).max(600).optional(),
  processes: z.array(z.enum(PROGRAM_PROCESSES)).min(1).max(3).refine((values) => new Set(values).size === values.length, 'Select each process once.'),
});
const serviceOutcome=z.enum(['Completed','Deferred','Not eligible']);
export const attendancePetSchema = stubPetSchema.extend({
  outcome:serviceOutcome,
  processOutcomes:z.object({
    'Microchipping':serviceOutcome.optional(),
    'Anti-Rabies Vaccine':serviceOutcome.optional(),
    'Neuter/Spay':serviceOutcome.optional(),
  }).strict().optional(),
}).superRefine((pet,ctx)=>{
  for(const process of Object.keys(pet.processOutcomes ?? {})) {
    if(!pet.processes.includes(process as (typeof PROGRAM_PROCESSES)[number])) {
      ctx.addIssue({code:z.ZodIssueCode.custom,path:['processOutcomes',process],message:'Record an outcome only for a selected process.'});
    }
  }
});
export const realDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}, 'Enter a real date in YYYY-MM-DD format.');
export const todayManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
export const normalizedName = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export const normalizedPhone = (value: string) => value.replace(/\D/g,'');
export const ownerIdentity = (owner: StubOwner) => createHash('sha256').update(`${owner.barangayId}|${normalizedName(owner.name)}`).digest('hex');
export const canonicalOwner = (owner: StubOwner): StubOwner => ({ ...owner, name: owner.name.trim().replace(/\s+/g,' '), mobile: normalizedPhone(owner.mobile) });
export const payloadHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export type ProgramRow = { id:number; host_barangay_id:number; host_barangay:string; status:string; program_record_id:number|null; archived:boolean; record_data:Record<string,unknown>; processes:string[]; allowed_barangays:{id:number;name:string}[]; slots_used:number };

// The campaign row is locked before related inventory/attendance rows on every write.
// Locking the program row also serializes archive or status edits with this workflow.
export async function getProgram(q:any, campaignId:number, session:Session, lock=false):Promise<{program:StubProgram;row:ProgramRow}> {
  const [scope] = await q`select c.id from ekapon.program_interest_campaigns c
    where c.id=${campaignId} and (${session.type !== 'Paravet'} or c.host_barangay_id=${session.barangayId ?? -1}
      or exists(select 1 from ekapon.program_interest_allowed_barangays a where a.campaign_id=c.id and a.barangay_id=${session.barangayId ?? -1}))`;
  if (!scope) throw notFound('Program not found in your assigned area.');
  if (lock) {
    await q`select id from ekapon.program_interest_campaigns where id=${campaignId} for update`;
    await q`select d.id from ekapon.dashboard_records d join ekapon.program_interest_campaigns c on c.program_record_id=d.id where c.id=${campaignId} for share of d`;
  }
  const rows=await readPrograms(q,session,campaignId);
  const row=rows[0];
  if (!row) throw notFound('This list does not have a scheduled program.');
  return {program:outputProgram(row),row};
}

export async function readPrograms(q:any,session:Session,campaignId:number|null=null):Promise<ProgramRow[]> {
  return await q`select c.id,c.host_barangay_id,b.name as host_barangay,c.status,c.program_record_id,
    coalesce(d.archived,true) as archived,coalesce(d.record_data,'{}'::jsonb) as record_data,c.processes,
    coalesce((select jsonb_agg(jsonb_build_object('id',ab.id,'name',ab.name) order by ab.name)
      from ekapon.program_interest_allowed_barangays a join ekapon.barangays ab on ab.id=a.barangay_id where a.campaign_id=c.id),'[]'::jsonb) as allowed_barangays,
    coalesce((select sum(jsonb_array_length(p.pets_snapshot))::int from ekapon.program_attendance p where p.campaign_id=c.id and p.status='Submitted'),0)::int as slots_used
    from ekapon.program_interest_campaigns c join ekapon.barangays b on b.id=c.host_barangay_id
    left join ekapon.dashboard_records d on d.id=c.program_record_id
    where (${campaignId}::bigint is null or c.id=${campaignId}) and c.program_record_id is not null and c.status in ('scheduled','closed')
      and (${session.type !== 'Paravet'} or c.host_barangay_id=${session.barangayId ?? -1} or exists(select 1 from ekapon.program_interest_allowed_barangays a where a.campaign_id=c.id and a.barangay_id=${session.barangayId ?? -1}))
    order by c.created_at desc,c.id desc limit 200` as ProgramRow[];
}

export function outputProgram(row:ProgramRow):StubProgram {
  const data = row.record_data;
  const firstNonblank=(...values:unknown[])=>values.map((value)=>String(value ?? '').trim()).find(Boolean) ?? '';
  const numeric = (value:unknown) => /^\d+$/.test(String(value ?? '')) ? Number(value) : null;
  const selected = programProcessesFrom(data.processes,data.program);
  let duration = numeric(data.durationMinutes ?? data.duration_minutes);
  const start = String(data.startTime ?? ''), end = String(data.endTime ?? '');
  const clock = (time:string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
  if (clock(start) && clock(end)) {
    const minutes = (time:string) => Number(time.slice(0,2))*60+Number(time.slice(3,5));
    if (minutes(end)>minutes(start)) duration=minutes(end)-minutes(start);
  }
  const program:StubProgram = { id:row.id,title:firstNonblank(data.title,data.name,data.program),
    date:firstNonblank(data.date,data.programDate).slice(0,10),location:firstNonblank(data.location,data.venue),
    hostBarangayId:row.host_barangay_id,hostBarangay:row.host_barangay,status:normalizeProgramStatus(String(data.status ?? 'Planned')) ?? String(data.status ?? ''),
    campaignStatus:row.status,processes:selected.length ? selected : programProcessesFrom(row.processes),allowedBarangays:row.allowed_barangays,
    slots:numeric(data.slots),slotsUsed:Number(row.slots_used),durationMinutes:duration,startTime:clock(start),endTime:clock(end) };
  return program;
}

export function ensureIssuable(program:StubProgram,row:ProgramRow) {
  if (!program.title.trim() || !program.location.trim()) {
    throw unprocessable('PROGRAM_PRINT_DETAILS_REQUIRED','Add a program title and location before requesting or printing stubs.');
  }
  if (row.archived || program.campaignStatus !== 'scheduled' || !['Planned','Open','In progress'].includes(program.status)
      || !realDateSchema.safeParse(program.date).success || program.date<todayManila()) {
    throw unprocessable('PROGRAM_NOT_ISSUABLE','Stubs can be requested, printed, or issued only for an active program scheduled today or later.');
  }
  if (!program.processes.length) throw unprocessable('PROGRAM_PROCESS_REQUIRED','Select the processes offered by this program first.');
}

export function ensureAttendanceAllowed(program:StubProgram,row:ProgramRow,session:Session,attendedOn:string,lateEntryReason?:string) {
  const today=todayManila();
  if (row.archived || !['Open','In progress','Completed'].includes(program.status) || !realDateSchema.safeParse(program.date).success
      || program.date>today || attendedOn>today || attendedOn<program.date) {
    throw unprocessable('ATTENDANCE_DATE_INVALID','Record actual attendance on or after the program date and no later than today, for an open, in-progress, or completed program.');
  }
  if (program.campaignStatus==='closed') {
    if (session.type==='Paravet') throw forbidden('This program is closed. Ask an Admin to review a late entry.');
    if (!lateEntryReason?.trim() || lateEntryReason.trim().length<3) throw unprocessable('LATE_ENTRY_REASON_REQUIRED','Explain why attendance is being encoded after the program was closed.');
  }
}

export function ensureOwnerScope(program:StubProgram,session:Session,owner:StubOwner) {
  if (session.type==='Paravet' && owner.barangayId!==session.barangayId) throw forbidden('Encode residents of your assigned barangay only.');
  if (owner.barangayId!==program.hostBarangayId && !program.allowedBarangays.some((b)=>b.id===owner.barangayId)) {
    throw unprocessable('BARANGAY_NOT_ELIGIBLE','The owner must live in the host barangay or an additional barangay approved for this program.');
  }
}

export function ensurePetProcesses(program:StubProgram,pets:StubPet[]) {
  for (const pet of pets) if (pet.processes.some((process)=>!program.processes.includes(process))) {
    throw unprocessable('PROCESS_NOT_OFFERED','Choose only processes offered by the selected program.');
  }
  if (pets.some((pet,index)=>pets.slice(0,index).some((other)=>normalizedName(pet.name)===normalizedName(other.name)
      && pet.species===other.species && (!pet.sex || !other.sex || pet.sex===other.sex)))) {
    throw unprocessable('DUPLICATE_PET_IN_ENTRY','The same pet appears more than once. Combine its selected processes in one pet entry.');
  }
}

export const outputBatch = (r:any):StubBatch => ({id:r.id,reference:r.reference,campaignId:r.campaign_id,programTitle:r.program_snapshot.title,programDate:r.program_snapshot.date,
  recipientId:r.recipient_id,recipientName:r.recipient_name,barangayId:r.barangay_id,barangay:r.barangay,
  requestedQuantity:r.requested_quantity,approvedQuantity:r.approved_quantity,status:r.status,note:r.note,reviewNote:r.review_note,
  createdAt:r.created_at,issuedCount:Number(r.issued_count ?? 0),redeemedCount:Number(r.redeemed_count ?? 0),availableCount:Number(r.available_count ?? 0),cancelledCount:Number(r.cancelled_count ?? 0),sentAt:r.sent_at ?? null});
export const outputTicket = (r:any):StubTicket => ({id:r.id,batchId:r.batch_id,campaignId:r.campaign_id,barangayId:r.batch_barangay_id,code:r.code,status:r.status,owner:r.owner_snapshot,pets:r.pets_snapshot,issuedAt:r.issued_at,redeemedAt:r.redeemed_at});
export const outputAttendance = (r:any):ProgramAttendance => ({id:r.id,campaignId:r.campaign_id,source:r.source,stubId:r.stub_id,owner:r.owner_snapshot,pets:r.pets_snapshot,
  attendedOn:r.attended_on,encodedBy:r.encoded_by_name,createdAt:r.created_at,status:r.status,voidReason:r.void_reason});

export function overlappingAttendance(owner:StubOwner,pets:AttendancePet[],row:any) {
  const previous=row.owner_snapshot as StubOwner;
  const sameOwner=previous.barangayId===owner.barangayId && (normalizedName(previous.name)===normalizedName(owner.name)
    || Boolean(normalizedPhone(owner.mobile) && normalizedPhone(previous.mobile)===normalizedPhone(owner.mobile)));
  return sameOwner && pets.some((pet)=>(row.pets_snapshot as AttendancePet[]).some((old)=>normalizedName(old.name)===normalizedName(pet.name)
    && old.species===pet.species && (!old.sex || !pet.sex || old.sex===pet.sex) && old.processes.some((process)=>pet.processes.includes(process))));
}

/** A stub carries up to three pets: an owner with more is spread over several stubs, in order. */
export const petsPerStub = <T,>(pets: T[]) => Array.from({ length: Math.ceil(pets.length / 3) }, (_, index) => pets.slice(index * 3, index * 3 + 3));

/**
 * A paravet edited an interested owner (in Salin or e-Kapon): their issued stubs follow — the new name and mobile,
 * pets three per stub — and are marked for reprinting. A name the owner wrote on the stub is kept. A stub left with no pets is cancelled.
 */
export async function syncInterestStubs(q: Tx, session: Session, personId: number, owner: { name: string; mobile: string }, pets: StubPet[]) {
  const tickets = await q`select t.id, t.batch_id, b.campaign_id from ekapon.stub_tickets t join ekapon.stub_batches b on b.id = t.batch_id
    where t.interest_person_id = ${personId} and t.status = 'Issued' order by t.id for update of t`;
  const chunks = petsPerStub(pets);
  for (const [index, t] of tickets.entries()) {
    if (!chunks[index]) {
      await q`update ekapon.stub_tickets set status = 'Cancelled', cancelled_by = ${session.id}, cancelled_at = now(), cancel_reason = 'The owner has fewer pets after an edit.' where id = ${t.id} and status = 'Issued'`;
    } else {
      const details = { name: owner.name.trim().replace(/\s+/g, ' '), mobile: normalizedPhone(owner.mobile) };
      await q`update ekapon.stub_tickets set owner_snapshot = owner_snapshot || ${q.json(details)} || case when owner_confirmed_at is null then '{}'::jsonb else jsonb_build_object('name', owner_snapshot->'name') end, pets_snapshot = ${q.json(chunks[index] as never)}, details_updated_at = now() where id = ${t.id}`;
    }
    await q`insert into ekapon.stub_activity(campaign_id, batch_id, stub_id, actor_id, action) values(${t.campaign_id}, ${t.batch_id}, ${t.id}, ${session.id}, ${chunks[index] ? 'stub-details-updated' : 'stub-cancelled'})`;
  }
}

/** The owner withdrew from the program: their issued stubs can no longer be used. */
export async function cancelInterestStubs(q: Tx, session: Session, personId: number) {
  const cancelled = await q`update ekapon.stub_tickets t set status = 'Cancelled', cancelled_by = ${session.id}, cancelled_at = now(), cancel_reason = 'The owner withdrew from the program.'
    from ekapon.stub_batches b where b.id = t.batch_id and t.interest_person_id = ${personId} and t.status = 'Issued' returning t.id, t.batch_id, b.campaign_id`;
  for (const t of cancelled) await q`insert into ekapon.stub_activity(campaign_id, batch_id, stub_id, actor_id, action) values(${t.campaign_id}, ${t.batch_id}, ${t.id}, ${session.id}, 'stub-cancelled')`;
}
