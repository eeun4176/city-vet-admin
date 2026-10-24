import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { requireAuth, type Session } from '../../../server/auth';
import { sql, tx } from '../../../server/db';
import { conflict, forbidden, notFound, unprocessable } from '../../../server/errors';
import { jsonValue } from '../../../server/dashboard';
import { realDateSchema, todayManila } from '../../../server/stubWorkflow';
import { PROGRAM_PROCESSES, PROGRAM_STATUSES, normalizeProgramStatus, programProcessesFrom } from '../../../shared/programs';
import type { WorkspaceProgram } from '../../../shared/programWorkspace';
const id = z.number().int().positive();
const reason = z.string().trim().min(3).max(1000);
const timestamp = z.string().datetime({ offset: true });
const time = z.union([z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), z.literal('')]);
const schedule = z.object({
  title: z.string().trim().min(1).max(160), date: realDateSchema,
  location: z.string().trim().min(1).max(240), hostBarangayId: id,
  startTime: time, endTime: time, slots: z.number().int().min(1).max(100000).nullable(),
  processes: z.array(z.enum(PROGRAM_PROCESSES)).min(1).max(3).transform((items) => [...new Set(items)]),
  status: z.enum(PROGRAM_STATUSES),
}).refine((value) => (!value.startTime && !value.endTime) || (Boolean(value.startTime) && value.endTime > value.startTime), { message: 'Enter both planned times, with finish after start.', path: ['endTime'] });
const version = z.number().int().min(0);
const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), schedule, requestCampaignId: id.optional() }),
  z.object({ action: z.literal('update'), programId: id, expectedVersion: version, schedule, reason: reason.optional() }),
  z.object({ action: z.literal('connect'), programId: id, expectedVersion: version }),
  z.object({ action: z.literal('start'), programId: id, expectedVersion: version, actualAt: timestamp }),
  z.object({ action: z.literal('finish'), programId: id, expectedVersion: version, actualAt: timestamp }),
  z.object({ action: z.literal('correct-times'), programId: id, expectedVersion: version, startedAt: timestamp, finishedAt: timestamp.optional(), reason }),
]);
const filters = z.object({
  group: z.enum(['current', 'upcoming', 'recent']).default('current'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  q: z.string().trim().max(120).default(''),
});
// Summaries use canonical attendance. No owner/pet snapshots or QR codes are loaded here.
const base = `select d.id,d.record_id,d.record_data,c.id as campaign_id,c.status as campaign_status,
 b.id as host_id,b.name as host_name,r.actual_started_at,r.actual_finished_at,coalesce(r.version,0) as version,
 coalesce((select sum(jsonb_array_length(a.pets_snapshot)) from ekapon.program_attendance a where a.campaign_id=c.id and a.status='Submitted'),0)::int as slots_used,
 (select count(*)::int from ekapon.program_attendance a where a.campaign_id=c.id and a.status='Submitted') as owner_visits,
 (select count(*)::int from ekapon.program_interest_people p where p.campaign_id=c.id and p.status='interested') as interest_owners,
 coalesce((select sum(jsonb_array_length(p.pets)) from ekapon.program_interest_people p where p.campaign_id=c.id and p.status='interested'),0)::int as interest_pets,
 case when lower(coalesce(d.record_data->>'status','Planned')) in ('in progress','active') then 'current'
 when lower(coalesce(d.record_data->>'status','Planned')) in ('planned','open','scheduled','approved','draft','pending approval')
 and coalesce(d.record_data->>'date',d.record_data->>'programDate','')=to_char((now() at time zone 'Asia/Manila')::date,'YYYY-MM-DD') then 'current'
 when lower(coalesce(d.record_data->>'status','Planned')) in ('planned','open','scheduled','approved','draft','pending approval')
 and coalesce(d.record_data->>'date',d.record_data->>'programDate','')>to_char((now() at time zone 'Asia/Manila')::date,'YYYY-MM-DD') then 'upcoming'
 else 'recent' end as program_group
 from ekapon.dashboard_records d
 left join ekapon.program_interest_campaigns c on c.program_record_id=d.id
 left join ekapon.program_runtime r on r.program_record_id=d.id
 left join ekapon.barangays b on b.id=coalesce(case when coalesce(d.record_data->>'barangayId','') ~ '^[0-9]{1,6}$' then (d.record_data->>'barangayId')::int end,ekapon.find_barangay(d.record_data->>'barangay'))
 where d.dataset='programs' and d.archived=false
 and ($1 or b.id=$2 or exists(select 1 from ekapon.program_interest_allowed_barangays ab where ab.campaign_id=c.id and ab.barangay_id=$2))`;
const iso = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
function output(row: any): WorkspaceProgram {
  const d = row.record_data;
  const number = (value: unknown) => /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  return {
    id: row.id, recordId: row.record_id, title: String(d.title || d.name || d.program || 'Untitled program'),
    date: String(d.date || d.programDate || '').slice(0, 10), location: String(d.location || d.venue || ''),
    startTime: String(d.startTime || ''), endTime: String(d.endTime || ''),
    status: normalizeProgramStatus(String(d.status ?? 'Planned')) ?? String(d.status ?? ''),
    processes: programProcessesFrom(d.processes, d.program), hostBarangayId: row.host_id, hostBarangay: row.host_name ?? String(d.barangay ?? ''),
    campaignId: row.campaign_id, campaignStatus: row.campaign_status, slots: number(d.slots), slotsUsed: row.slots_used,
    ownerVisits: row.owner_visits, interestOwners: row.interest_owners, interestPets: row.interest_pets,
    actualStartedAt: iso(row.actual_started_at), actualFinishedAt: iso(row.actual_finished_at), version: row.version, group: row.program_group,
  };
}
async function find(q: any, session: Session, programId: number) {
  const [row] = await q.unsafe(`${base} and d.id=$3`, [session.type !== 'Paravet', session.barangayId ?? -1, programId]);
  if (!row) throw notFound('Program not found in your assigned area.');
  return row;
}
async function lock(q: any, session: Session, programId: number, expectedVersion: number) {
  // Match the QR workflow lock order to serialize finish/status changes with redemption.
  await q`select id from ekapon.program_interest_campaigns where program_record_id=${programId} for update`;
  await q`select id from ekapon.dashboard_records where id=${programId} and dataset='programs' for update`;
  const row = await find(q, session, programId);
  if (row.version !== expectedVersion) throw conflict('PROGRAM_CHANGED', 'This program has changed. Refresh before saving again.');
  return row;
}
async function log(q: any, session: Session, rowId: number, action: string, before: unknown, after: unknown, note?: string) {
  await q`insert into ekapon.program_workspace_activity(program_record_id,actor_id,action,reason,before_data,after_data)
    values(${rowId},${session.id},${action},${note ?? null},${before ? q.json(jsonValue(before)) : null},${q.json(jsonValue(after))})`;
}
async function runtime(q: any, session: Session, programId: number, started: string | null, finished: string | null) {
  await q`insert into ekapon.program_runtime as r(program_record_id,actual_started_at,actual_finished_at,updated_by)
    values(${programId},${started},${finished},${session.id}) on conflict(program_record_id) do update
    set actual_started_at=excluded.actual_started_at,actual_finished_at=excluded.actual_finished_at,version=r.version+1,updated_by=excluded.updated_by,updated_at=now()`;
}
async function connect(q: any, session: Session, row: any) {
  if (row.campaign_id) return row.campaign_id;
  const p = output(row);
  if (!p.hostBarangayId || !p.processes.length || !realDateSchema.safeParse(p.date).success) throw unprocessable('PROGRAM_DETAILS_REQUIRED', 'Save a valid host barangay, date, and processes before connecting this program.');
  const [campaign] = await q`insert into ekapon.program_interest_campaigns(reference,campaign_type,host_barangay_id,program_record_id,processes,status,created_by)
    values(${`PI-${randomUUID()}`},'program_day',${p.hostBarangayId},${p.id},${p.processes},'scheduled',${session.id}) returning id`;
  await q`insert into ekapon.program_interest_allowed_barangays(campaign_id,barangay_id,added_by) values(${campaign.id},${p.hostBarangayId},${session.id})`;
  return campaign.id;
}
export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    if (c.query.mode === 'options') {
      if (session.type === 'Paravet') throw forbidden();
      const [barangays, approvedRequests] = await Promise.all([
        sql()`select id,name from ekapon.barangays order by name`,
        sql()`select c.id,c.reference,c.host_barangay_id as "hostBarangayId",b.name as barangay,c.processes
          from ekapon.program_interest_campaigns c join ekapon.barangays b on b.id=c.host_barangay_id
          where c.campaign_type='program_request' and c.status='approved' and c.program_record_id is null order by c.created_at desc limit 200`,
      ]);
      return ok({ barangays, approvedRequests });
    }
    if (c.query.id !== undefined || c.query.recordId !== undefined) {
      let programId: number;
      if (c.query.id !== undefined) programId = parse(z.coerce.number().int().positive(), c.query.id);
      else {
        const recordId = parse(z.string().min(1).max(100), c.query.recordId);
        const [record] = await sql()`select id from ekapon.dashboard_records where dataset='programs' and record_id=${recordId} and archived=false`;
        if (!record) throw notFound('Program not found in your assigned area.');
        programId = record.id;
      }
      const row = await find(sql(), session, programId), program = output(row);
      const [allowedBarangays, assignedParavets, [stock], activity, [locked], barangayOptions] = await Promise.all([
        sql()`select b.id,b.name from ekapon.barangays b where b.id=${program.hostBarangayId} or exists(select 1 from ekapon.program_interest_allowed_barangays a where a.campaign_id=${program.campaignId} and a.barangay_id=b.id) order by b.name`,
        sql()`select a.id,a.full_name as name,b.name as barangay from ekapon.accounts a join ekapon.barangays b on b.id=a.barangay_id
          where a.account_type='Paravet' and a.status='Active' and a.archived_at is null and (b.id=${program.hostBarangayId} or exists(select 1 from ekapon.program_interest_allowed_barangays ab where ab.campaign_id=${program.campaignId} and ab.barangay_id=b.id)) order by b.name,a.full_name`,
        sql()`select (select count(*)::int from ekapon.stub_batches b where b.campaign_id=${program.campaignId}) as batches,
          (select coalesce(sum(requested_quantity),0)::int from ekapon.stub_batches b where b.campaign_id=${program.campaignId} and b.status='Requested') as requested,
          (select coalesce(sum(approved_quantity),0)::int from ekapon.stub_batches b where b.campaign_id=${program.campaignId}) as approved,
          count(*) filter(where t.status='Available')::int as available,count(*) filter(where t.issued_at is not null)::int as issued,
          count(*) filter(where t.status='Redeemed')::int as redeemed,count(*) filter(where t.status='Cancelled')::int as cancelled
          from ekapon.stub_tickets t join ekapon.stub_batches b on b.id=t.batch_id where b.campaign_id=${program.campaignId}`,
        sql()`select h.id,a.full_name as actor,h.action,h.reason,h.created_at as "createdAt" from ekapon.program_workspace_activity h join ekapon.accounts a on a.id=h.actor_id where h.program_record_id=${program.id} order by h.id desc limit 40`,
        sql()`select exists(select 1 from ekapon.stub_tickets t join ekapon.stub_batches b on b.id=t.batch_id where b.campaign_id=${program.campaignId}) or exists(select 1 from ekapon.program_attendance a where a.campaign_id=${program.campaignId}) as locked`,
        sql()`select id,name from ekapon.barangays where ${session.type !== 'Paravet'} or id=${session.barangayId ?? -1} order by name`,
      ]);
      return ok({ program, allowedBarangays, barangayOptions, assignedParavets, stock, activity, scheduleLocked: Boolean(locked.locked || program.actualStartedAt), serverNow: new Date().toISOString() });
    }
    const f = parse(filters, c.query);
    const args = [session.type !== 'Paravet', session.barangayId ?? -1, f.q, `%${f.q}%`];
    const scoped = `${base} and ($3='' or coalesce(d.record_data->>'title',d.record_data->>'name',d.record_data->>'program','') ilike $4 or b.name ilike $4)`;
    const [counts, rows] = await Promise.all([
      sql().unsafe(`with p as (${scoped}) select program_group,count(*)::int as total from p group by program_group`, args),
      sql().unsafe(`with p as (${scoped}) select * from p where program_group=$5 order by case when program_group='upcoming' then record_data->>'date' end asc nulls last,case when program_group<>'upcoming' then record_data->>'date' end desc nulls last,id desc limit $6 offset $7`, [...args, f.group, f.pageSize, (f.page - 1) * f.pageSize]),
    ]);
    const grouped = { current: 0, upcoming: 0, recent: 0, ...Object.fromEntries(counts.map((row) => [row.program_group, row.total])) };
    return ok({ data: rows.map(output), counts: grouped, total: grouped[f.group], page: f.page, pageSize: f.pageSize, today: todayManila(), serverNow: new Date().toISOString() });
  },
  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    if (session.type === 'Paravet') throw forbidden('Only an Admin can change schedules or actual start and finish times.');
    const input = parse(actions, c.body);
    return ok(await tx(session.id, async (q) => {
      if (input.action === 'create') {
        if (!input.schedule.startTime || !input.schedule.endTime) throw unprocessable('PLANNED_TIMES_REQUIRED', 'Set the planned start and finish for a new program.');
        if (input.schedule.date < todayManila()) throw unprocessable('SCHEDULE_IN_PAST', 'New schedules must be today or later.');
        if (!['Planned', 'Open'].includes(input.schedule.status)) throw unprocessable('INVALID_INITIAL_STATUS', 'Create a Planned or Open program. Use timing controls when it takes place.');
        const [barangay] = await q`select id,name from ekapon.barangays where id=${input.schedule.hostBarangayId}`;
        if (!barangay) throw unprocessable('INVALID_BARANGAY', 'Choose an official host barangay.');
        if (input.requestCampaignId) {
          const [request] = await q`select * from ekapon.program_interest_campaigns where id=${input.requestCampaignId} for update`;
          if (!request || request.campaign_type !== 'program_request' || request.status !== 'approved' || request.program_record_id) throw conflict('REQUEST_NOT_APPROVED', 'Choose an approved request that is not scheduled yet.');
          if (request.host_barangay_id !== barangay.id || [...request.processes].sort().join('|') !== [...input.schedule.processes].sort().join('|')) throw unprocessable('REQUEST_SCOPE_MISMATCH', 'Use the approved request’s host barangay and processes.');
        }
        const recordId = randomUUID();
        const durationMinutes = (Number(input.schedule.endTime.slice(0, 2)) * 60 + Number(input.schedule.endTime.slice(3))) - (Number(input.schedule.startTime.slice(0, 2)) * 60 + Number(input.schedule.startTime.slice(3)));
        const d = { ...input.schedule, id: recordId, barangayId: barangay.id, barangay: barangay.name, durationMinutes };
        const [saved] = await q`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('programs',${recordId},${q.json(jsonValue(d))}) returning id`;
        await runtime(q, session, saved.id, null, null);
        const campaignId = input.requestCampaignId ?? await connect(q, session, await find(q, session, saved.id));
        if (input.requestCampaignId) {
          await q`update ekapon.program_interest_campaigns set program_record_id=${saved.id},status='scheduled' where id=${campaignId}`;
          await q`insert into ekapon.program_interest_activity(campaign_id,actor_id,actor_name,action) values(${campaignId},${session.id},${session.name},'program-scheduled')`;
        }
        await log(q, session, saved.id, 'created', null, d);
        await q`select ekapon.workflow_notice(${campaignId}::bigint,null::int,'Program created — prepare stubs',${`${d.title} was created as ${d.status}. Prepare stubs here.`},${`/stubs?campaignId=${campaignId}`})`;
        return { programId: saved.id, campaignId };
      }
      const row = await lock(q, session, input.programId, input.expectedVersion), p = output(row);
      if (input.action === 'connect') {
        const campaignId = await connect(q, session, row);
        await runtime(q, session, p.id, p.actualStartedAt, p.actualFinishedAt);
        await log(q, session, p.id, 'connected', null, { campaignId });
        return { programId: p.id, campaignId };
      }
      if (input.action === 'update') {
        const s = input.schedule;
        if (s.date !== p.date && s.date < todayManila()) throw unprocessable('SCHEDULE_IN_PAST', 'A changed schedule must be today or later; actual times may be backdated.');
        if (['In progress', 'Completed'].includes(s.status) && s.status !== p.status) throw unprocessable('USE_TIMING_CONTROLS', 'Use Start or Finish to record actual times and change this status.');
        if (p.actualStartedAt && s.status !== p.status) throw conflict('PROGRAM_STARTED', 'Use the timing controls for a program that has started.');
        if (s.status !== p.status && ['Cancelled', 'Postponed'].includes(s.status) && !input.reason) throw unprocessable('REASON_REQUIRED', 'Explain the cancellation or postponement.');
        const [busy] = await q`select exists(select 1 from ekapon.stub_tickets t join ekapon.stub_batches b on b.id=t.batch_id where b.campaign_id=${p.campaignId}) or exists(select 1 from ekapon.program_attendance a where a.campaign_id=${p.campaignId}) as locked,
          exists(select 1 from ekapon.program_interest_people ip where ip.campaign_id=${p.campaignId}) or exists(select 1 from ekapon.stub_batches b where b.campaign_id=${p.campaignId}) as collecting`;
        const identityChanged = s.title !== p.title || s.date !== p.date || s.location !== p.location || s.startTime !== p.startTime || s.endTime !== p.endTime;
        const scopeChanged = s.hostBarangayId !== p.hostBarangayId || [...s.processes].sort().join('|') !== [...p.processes].sort().join('|');
        if ((busy.locked || p.actualStartedAt) && (identityChanged || scopeChanged)) throw conflict('SCHEDULE_LOCKED', 'Schedule details are protected after stubs are approved, attendance exists, or the program starts. Capacity can still be adjusted.');
        if (busy.collecting && scopeChanged) throw conflict('PROGRAM_SCOPE_LOCKED', 'Keep the host barangay and processes consistent with existing interest entries or stub requests.');
        const [barangay] = await q`select id,name from ekapon.barangays where id=${s.hostBarangayId}`;
        if (!barangay) throw unprocessable('INVALID_BARANGAY', 'Choose an official host barangay.');
        const durationMinutes = s.startTime && s.endTime ? (Number(s.endTime.slice(0, 2)) * 60 + Number(s.endTime.slice(3))) - (Number(s.startTime.slice(0, 2)) * 60 + Number(s.startTime.slice(3))) : null;
        const d = { ...row.record_data, ...s, id: p.recordId, barangayId: barangay.id, barangay: barangay.name, durationMinutes };
        await q`update ekapon.dashboard_records set record_data=${q.json(jsonValue(d))},updated_at=now() where id=${p.id}`;
        if (p.campaignId) {
          await q`update ekapon.program_interest_campaigns set host_barangay_id=${barangay.id},processes=${s.processes} where id=${p.campaignId}`;
          await q`insert into ekapon.program_interest_allowed_barangays(campaign_id,barangay_id,added_by) values(${p.campaignId},${barangay.id},${session.id}) on conflict do nothing`;
          if (p.hostBarangayId !== barangay.id) await q`delete from ekapon.program_interest_allowed_barangays where campaign_id=${p.campaignId} and barangay_id=${p.hostBarangayId}`;
        }
        await runtime(q, session, p.id, p.actualStartedAt, p.actualFinishedAt);
        await log(q, session, p.id, 'updated', row.record_data, d, input.reason);
        return { programId: p.id };
      }
      const started = input.action === 'start' ? input.actualAt : input.action === 'correct-times' ? input.startedAt : p.actualStartedAt;
      const finished = input.action === 'finish' ? input.actualAt : input.action === 'correct-times' ? input.finishedAt ?? null : null;
      if (input.action === 'start' && (p.actualStartedAt || !['Planned', 'Open', 'In progress'].includes(p.status))) throw conflict('PROGRAM_NOT_STARTABLE', 'This program has already started or is not ready to start.');
      if (input.action === 'finish' && (!p.actualStartedAt || p.actualFinishedAt || p.status !== 'In progress')) throw conflict('PROGRAM_NOT_FINISHABLE', 'Start this program before finishing it.');
      if (input.action === 'correct-times' && !['In progress', 'Completed'].includes(p.status)) throw conflict('TIMING_NOT_AVAILABLE', 'Actual times can be corrected for an in-progress or completed program.');
      if (input.action === 'correct-times' && p.status === 'Completed' && !finished) throw unprocessable('FINISH_TIME_REQUIRED', 'A completed program needs its actual finish time.');
      if (!started || !realDateSchema.safeParse(p.date).success || Date.parse(started) < Date.parse(`${p.date}T00:00:00+08:00`) || Date.parse(started) > Date.now() || (finished && (Date.parse(finished) < Date.parse(started) || Date.parse(finished) > Date.now()))) {
        throw unprocessable('ACTUAL_TIME_INVALID', 'Actual times must be on or after the scheduled date, no later than now, and finish must follow start.');
      }
      const status = finished ? 'Completed' : 'In progress';
      await q`update ekapon.dashboard_records set record_data=record_data || ${q.json({ status })}::jsonb,updated_at=now() where id=${p.id}`;
      await runtime(q, session, p.id, started, finished);
      await log(q, session, p.id, input.action === 'start' ? 'started' : input.action === 'finish' ? 'finished' : 'timing-corrected', { startedAt: p.actualStartedAt, finishedAt: p.actualFinishedAt, status: p.status }, { startedAt: started, finishedAt: finished, status }, input.action === 'correct-times' ? input.reason : undefined);
      return { programId: p.id, status };
    }).catch((error: unknown) => {
      const db = error as { code?: string; constraint_name?: string };
      if (db.code === '23505' && db.constraint_name === 'dashboard_program_date_unique') throw conflict('PROGRAM_DAY_EXISTS', 'A program already exists for this barangay and date. Open that program or choose another schedule.');
      throw error;
    }));
  },
});
