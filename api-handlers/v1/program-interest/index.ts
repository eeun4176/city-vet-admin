import { logOwnerLink } from '../../../server/ownerHistory';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { route, ok, created, parse } from '../../../server/http';
import { sql, tx, type Tx } from '../../../server/db';
import { requireAuth, type Session } from '../../../server/auth';
import { conflict, forbidden, notFound, unprocessable } from '../../../server/errors';
import { normalizeProgramStatus, programProcessesFrom, PROGRAM_PROCESSES } from '../../../shared/programs';
import { cancelInterestStubs, syncInterestStubs } from '../../../server/stubWorkflow';
const processes = z.array(z.enum(PROGRAM_PROCESSES)).min(1).max(3);
const pet = z.object({
  name: z.string().trim().min(1).max(80),
  species: z.enum(['Dog', 'Cat']),
  sex: z.enum(['Male', 'Female']).optional(),
  ageMonths: z.number().int().min(0).max(600).optional(),
  processes,
});
const actions = z.discriminatedUnion('action', [
  z.object({action:z.literal('edit-demand'),campaignId:z.number().int().positive(),expectedRevision:z.number().int().positive(),targetPeople:z.number().int().min(1).max(100000),processes,note:z.string().trim().max(1000).default('')}),
  z.object({action:z.literal('cancel-demand'),campaignId:z.number().int().positive(),expectedRevision:z.number().int().positive(),reason:z.string().trim().min(3).max(1000)}),
  z.object({ action: z.literal('create-demand'), hostBarangayId: z.number().int().positive().optional(), targetPeople: z.number().int().min(1).max(100000).default(100), processes, note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal('create-program-day'), programRecordId: z.number().int().positive() }),
  z.object({ action: z.literal('add-interest'), requestId: z.string().uuid().optional(), campaignId: z.number().int().positive(), registryOwnerId:z.string().max(100).optional(), ownerName: z.string().trim().min(1).max(120), mobile: z.string().trim().max(20).optional().default(''), residenceBarangayId: z.number().int().positive(), pets: z.array(pet).max(10).default([]), confirmDistinct: z.boolean().default(false) }),
  z.object({ action: z.literal('update-interest'), campaignId: z.number().int().positive(), personId: z.number().int().positive(), registryOwnerId:z.string().max(100).optional(), ownerName: z.string().trim().min(1).max(120), mobile: z.string().trim().max(20).optional().default(''), residenceBarangayId: z.number().int().positive(), pets: z.array(pet).max(10), confirmDistinct: z.boolean().default(false), expectedUpdatedAt: z.string().datetime({ offset: true }).optional() }),
  z.object({ action: z.literal('withdraw-interest'), campaignId: z.number().int().positive(), personId: z.number().int().positive(), expectedUpdatedAt: z.string().datetime({ offset: true }).optional() }),
  z.object({ action: z.literal('merge-requests'), targetId: z.number().int().positive(), expectedRevision: z.number().int().positive(), sources: z.array(z.object({ id: z.number().int().positive(), expectedRevision: z.number().int().positive() })).min(1).max(61) }),
  z.object({ action: z.literal('submit-request'), campaignId: z.number().int().positive() }),
  z.object({ action: z.literal('review-request'), campaignId: z.number().int().positive(), decision: z.enum(['approve', 'reject']), approvedTargetPeople: z.number().int().min(1).max(100000).optional(), allowedBarangayIds: z.array(z.number().int().positive()).max(62).default([]), note: z.string().trim().max(1000).optional().default('') }),
  z.object({ action: z.literal('schedule'), campaignId: z.number().int().positive(), programRecordId: z.number().int().positive() }),
  z.object({ action: z.literal('close'), campaignId: z.number().int().positive() }),
  z.object({ action: z.literal('reopen'), campaignId: z.number().int().positive() }),
  z.object({ action: z.literal('update-program-access'), campaignId: z.number().int().positive(), allowedBarangayIds: z.array(z.number().int().positive()).max(62) }),
]);
type CampaignRow = {
  id: number; revision:number; reference: string; campaign_type: string; host_barangay_id: number; host_barangay: string;
  program_record_id: number | null; program_title: string | null; program_date: string | null; program_location: string | null; program_status: string;
  requested_target_people: number; approved_target_people: number | null; processes: string[]; status: string;
  request_note: string | null; review_note: string | null; created_by: number; created_at: Date | string;
  submitted_at: Date | string | null; reviewed_by: number | null; reviewed_at: Date | string | null;
  owner_count: number; pet_count: number; allowed_barangays: Array<{ id: number; name: string }>;
  program_slots: number | null; program_slots_used: number | null; program_duration_minutes: number | null;
  assigned_paravets: Array<{ id: number; name: string; accountKey: string; barangayId: number; barangay: string }>;
  created_by_name: string | null; submitted_by_name: string | null; last_activity_name: string | null; last_activity_at: Date | string | null;
  merged_into_id: number | null; merged_into_reference: string | null; merged_into_host: string | null;
};
const normalizePhone = (value: string) => value.replace(/\D/g, '');
const outputCampaign = (row: CampaignRow) => ({
  id: row.id,
  revision:row.revision,
  reference: row.reference,
  kind: row.campaign_type,
  hostBarangayId: row.host_barangay_id,
  hostBarangay: row.host_barangay,
  programRecordId: row.program_record_id,
  programTitle: row.program_title,
  programDate: row.program_date,
  programLocation: row.program_location,
  programStatus: normalizeProgramStatus(row.program_status) ?? row.program_status,
  requestedTargetPeople: row.requested_target_people,
  approvedTargetPeople: row.approved_target_people,
  targetPeople: row.approved_target_people ?? row.requested_target_people,
  processes: row.processes,
  status: row.status,
  requestNote: row.request_note,
  reviewNote: row.review_note,
  createdBy: row.created_by,
  createdAt: row.created_at,
  submittedAt: row.submitted_at,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  ownerCount: row.owner_count,
  petCount: row.pet_count,
  allowedBarangays: row.allowed_barangays,
  programSlots: row.program_slots,
  programSlotsUsed: row.program_slots_used,
  programDurationMinutes: row.program_duration_minutes,
  assignedParavets: row.assigned_paravets,
  createdByName: row.created_by_name,
  submittedByName: row.submitted_by_name,
  lastEditedBy: row.last_activity_name,
  lastEditedAt: row.last_activity_at,
  mergedIntoId: row.merged_into_id,
  mergedInto: row.merged_into_id ? { reference: row.merged_into_reference, hostBarangay: row.merged_into_host } : null,
});
async function getCampaign(q: any, id: number): Promise<CampaignRow | undefined> {
  const rows = await q`
    select c.id, c.revision, c.reference, c.campaign_type, c.host_barangay_id, hb.name as host_barangay,
           c.program_record_id,
           coalesce(d.record_data->>'title', d.record_data->>'name', d.record_data->>'program') as program_title,
           coalesce(d.record_data->>'date', d.record_data->>'programDate', '') as program_date,
           coalesce(d.record_data->>'location', d.record_data->>'venue', '') as program_location,
           coalesce(d.record_data->>'status', 'Planned') as program_status,
           case when coalesce(d.record_data->>'slots', '') ~ '^[0-9]+$' then (d.record_data->>'slots')::int end as program_slots,
           coalesce((select sum(jsonb_array_length(pa.pets_snapshot))::int from ekapon.program_attendance pa where pa.campaign_id=c.id and pa.status='Submitted'),0) as program_slots_used,
           case
             when coalesce(d.record_data->>'startTime', '') ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
              and coalesce(d.record_data->>'endTime', '') ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
              and (d.record_data->>'endTime')::time > (d.record_data->>'startTime')::time
               then floor(extract(epoch from ((d.record_data->>'endTime')::time - (d.record_data->>'startTime')::time)) / 60)::int
             when coalesce(d.record_data->>'durationMinutes', d.record_data->>'duration_minutes', '') ~ '^[0-9]+$'
               then coalesce(d.record_data->>'durationMinutes', d.record_data->>'duration_minutes')::int
           end as program_duration_minutes,
           c.requested_target_people, c.approved_target_people, c.processes, c.status,
           c.request_note, c.review_note, c.created_by, c.created_at, c.submitted_at, c.reviewed_by, c.reviewed_at,
           (select count(*)::int from ekapon.program_interest_people p
             where p.campaign_id = c.id and p.status = 'interested') as owner_count,
           (select coalesce(sum(jsonb_array_length(p.pets)), 0)::int from ekapon.program_interest_people p
             where p.campaign_id = c.id and p.status = 'interested') as pet_count,
           coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name)
                       from ekapon.program_interest_allowed_barangays a
                       join ekapon.barangays b on b.id = a.barangay_id
                      where a.campaign_id = c.id), '[]'::jsonb) as allowed_barangays
           ,coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.full_name,
                            'accountKey', a.account_key, 'barangayId', b.id, 'barangay', b.name)
                            order by b.name, a.full_name)
                       from ekapon.accounts a join ekapon.barangays b on b.id = a.barangay_id
                      where a.account_type = 'Paravet' and a.status = 'Active' and a.archived_at is null
                        and (b.id = c.host_barangay_id or exists (
                          select 1 from ekapon.program_interest_allowed_barangays pa
                           where pa.campaign_id = c.id and pa.barangay_id = b.id))), '[]'::jsonb) as assigned_paravets
           ,ca.full_name as created_by_name,
           (select act.actor_name from ekapon.program_interest_activity act where act.campaign_id = c.id and act.action = 'request-submitted' order by act.created_at desc, act.id desc limit 1) as submitted_by_name,
           (select act.actor_name from ekapon.program_interest_activity act where act.campaign_id = c.id order by act.created_at desc, act.id desc limit 1) as last_activity_name,
           (select act.created_at from ekapon.program_interest_activity act where act.campaign_id = c.id order by act.created_at desc, act.id desc limit 1) as last_activity_at,
           c.merged_into_id, mc.reference as merged_into_reference, mhb.name as merged_into_host
      from ekapon.program_interest_campaigns c
      join ekapon.barangays hb on hb.id = c.host_barangay_id
      left join ekapon.dashboard_records d on d.id = c.program_record_id
      left join ekapon.accounts ca on ca.id = c.created_by
      left join ekapon.program_interest_campaigns mc on mc.id = c.merged_into_id
      left join ekapon.barangays mhb on mhb.id = mc.host_barangay_id
     where c.id = ${id}`;
  return rows[0] as CampaignRow | undefined;
}
async function requireCampaignScope(q: any, session: Session, campaignId: number, residenceBarangayId?: number) {
  const campaign = await getCampaign(q, campaignId);
  if (!campaign) throw notFound('Program interest list not found.');
  const [access] = await q`
    select exists (
      select 1 from ekapon.program_interest_allowed_barangays
       where campaign_id = ${campaignId} and barangay_id = ${session.barangayId ?? -1}
    ) or ${campaign.host_barangay_id} = ${session.barangayId ?? -1} as allowed`;
  if (session.type === 'Paravet' && !access?.allowed) throw forbidden('This program is outside your assigned barangay.');
  if (residenceBarangayId !== undefined) {
    const [eligible] = await q`
      select ${campaign.host_barangay_id} = ${residenceBarangayId}
          or exists (select 1 from ekapon.program_interest_allowed_barangays
                      where campaign_id = ${campaignId} and barangay_id = ${residenceBarangayId}) as allowed`;
    if (!eligible?.allowed) throw unprocessable('BARANGAY_NOT_ELIGIBLE', 'This resident barangay is not included in the program.');
    if (session.type === 'Paravet' && residenceBarangayId !== session.barangayId) {
      throw forbidden('Paravets can encode interest only for residents of their assigned barangay.');
    }
  }
  return campaign;
}
async function logAction(q: Tx, session: Session, campaignId: number, personId: number | null, action: string) {
  await q`
    insert into ekapon.program_interest_activity (campaign_id, person_id, actor_id, actor_name, action)
    values (${campaignId}, ${personId}, ${session.id}, ${session.name}, ${action})`;
}
/** Why an entry could not be changed: someone else saved it since it was read (STALE_EDIT), or it is gone or out of scope. */
async function staleOrGone(q: Tx, session: Session, campaignId: number, personId: number): Promise<never> {
  const [entry] = await q`select updated_at from ekapon.program_interest_people
     where id = ${personId} and campaign_id = ${campaignId} and status = 'interested'
       and (${session.type !== 'Paravet'} or residence_barangay_id = ${session.barangayId ?? -1})`;
  if (entry) throw conflict('STALE_EDIT', 'Another Paravet changed this owner since you opened it. Review their changes and try again.', { updatedAt: entry.updated_at });
  throw notFound('This interest entry is no longer available.');
}
/** Requests merged into `targetId` end with it (closed, rejected or cancelled). */
async function finishMerged(q: Tx, targetId: number, status: 'closed' | 'rejected' | 'cancelled') {
  await q`update ekapon.program_interest_campaigns set status = ${status}, closed_at = now(), revision = revision + 1 where merged_into_id = ${targetId} and status = 'merged'`;
}
async function resolveProgram(q: any, programRecordId: number) {
  const [row] = await q`
    select d.id, d.record_data, b.id as barangay_id
      from ekapon.dashboard_records d
      left join ekapon.barangays b on b.id = coalesce(
        case when coalesce(d.record_data->>'barangayId', '') ~ '^[0-9]+$' then (d.record_data->>'barangayId')::int end,
        ekapon.find_barangay(d.record_data->>'barangay'))
     where d.id = ${programRecordId} and d.dataset = 'programs' and d.archived = false`;
  if (!row) throw unprocessable('PROGRAM_NOT_FOUND', 'Choose an active program record.');
  const data = row.record_data as Record<string, unknown>;
  const rawStatus = String(data.status ?? 'Planned');
  const status = normalizeProgramStatus(rawStatus);
  if (!status || !['Planned', 'Open', 'In progress'].includes(status) || ['draft', 'pending approval'].includes(rawStatus.trim().toLowerCase())) {
    throw unprocessable('PROGRAM_NOT_OPEN', 'Only a planned, open, or in-progress program can accept interest.');
  }
  const programDate = String(data.date ?? data.programDate ?? '').slice(0, 10);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(programDate) || programDate < today) {
    throw unprocessable('PROGRAM_DATE_REQUIRED', 'Choose a program scheduled for today or a future date.');
  }
  if (!row.barangay_id) throw unprocessable('PROGRAM_BARANGAY_REQUIRED', 'Add a valid host barangay to the program before collecting interest.');
  const selectedProcesses = programProcessesFrom(data.processes, data.program);
  if (!selectedProcesses.length) throw unprocessable('PROGRAM_PROCESS_REQUIRED', 'Select at least one process on the program record before collecting interest.');
  return { id: row.id as number, barangayId: row.barangay_id as number, data, processes: selectedProcesses };
}
export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const idRaw = c.query.id;
    if (idRaw !== undefined) {
      const id = Number(Array.isArray(idRaw) ? idRaw[0] : idRaw);
      if (!Number.isSafeInteger(id) || id < 1) throw unprocessable('INVALID_CAMPAIGN', 'Choose a valid program interest list.');
      const campaign = await getCampaign(sql(), id);
      if (!campaign) throw notFound('Program interest list not found.');
      await requireCampaignScope(sql(), session, id);
      const [people, activity] = await Promise.all([
        sql()`select p.id, p.registry_owner_id, p.owner_name, p.mobile, p.residence_barangay_id, b.name as residence_barangay,
                    p.pets, p.status, p.duplicate_confirmed, p.created_at, p.updated_at,
                    (select a.full_name from ekapon.accounts a where a.id = p.created_by) as added_by_name,
                    (select act.actor_name from ekapon.program_interest_activity act where act.person_id = p.id and act.action = 'interest-updated' order by act.created_at desc, act.id desc limit 1) as updated_by_name
               from ekapon.program_interest_people p
               join ekapon.barangays b on b.id = p.residence_barangay_id
              where p.campaign_id = ${id}
                and (${session.type !== 'Paravet'} or p.residence_barangay_id = ${session.barangayId ?? -1})
              order by p.created_at desc, p.id desc limit 500`,
        sql()`select id, person_id as "personId", actor_name as "actorName", action, created_at as "createdAt"
               from ekapon.program_interest_activity where campaign_id = ${id}
              order by created_at desc, id desc limit 100`,
      ]);
      return ok({ campaign: outputCampaign(campaign), people, activity });
    }
    const [campaignRows, barangayRows, programRows] = await Promise.all([
      sql()`select c.id, c.revision, c.reference, c.campaign_type, c.host_barangay_id, hb.name as host_barangay,
                  c.program_record_id,
                  coalesce(d.record_data->>'title', d.record_data->>'name', d.record_data->>'program') as program_title,
                  coalesce(d.record_data->>'date', d.record_data->>'programDate', '') as program_date,
                  coalesce(d.record_data->>'location', d.record_data->>'venue', '') as program_location,
                  coalesce(d.record_data->>'status', 'Planned') as program_status,
                  case when coalesce(d.record_data->>'slots', '') ~ '^[0-9]+$' then (d.record_data->>'slots')::int end as program_slots,
                  coalesce((select sum(jsonb_array_length(pa.pets_snapshot))::int from ekapon.program_attendance pa where pa.campaign_id=c.id and pa.status='Submitted'),0) as program_slots_used,
                  case
                    when coalesce(d.record_data->>'startTime', '') ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
                     and coalesce(d.record_data->>'endTime', '') ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
                     and (d.record_data->>'endTime')::time > (d.record_data->>'startTime')::time
                      then floor(extract(epoch from ((d.record_data->>'endTime')::time - (d.record_data->>'startTime')::time)) / 60)::int
                    when coalesce(d.record_data->>'durationMinutes', d.record_data->>'duration_minutes', '') ~ '^[0-9]+$'
                      then coalesce(d.record_data->>'durationMinutes', d.record_data->>'duration_minutes')::int
                  end as program_duration_minutes,
                  c.requested_target_people, c.approved_target_people, c.processes, c.status,
                  c.request_note, c.review_note, c.created_by, c.created_at, c.submitted_at, c.reviewed_by, c.reviewed_at,
                  (select count(*)::int from ekapon.program_interest_people p where p.campaign_id = c.id and p.status = 'interested') as owner_count,
                  (select coalesce(sum(jsonb_array_length(p.pets)), 0)::int from ekapon.program_interest_people p where p.campaign_id = c.id and p.status = 'interested') as pet_count,
                  coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name)
                              from ekapon.program_interest_allowed_barangays a
                              join ekapon.barangays b on b.id = a.barangay_id where a.campaign_id = c.id), '[]'::jsonb) as allowed_barangays,
                  coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.full_name,
                               'accountKey', a.account_key, 'barangayId', b.id, 'barangay', b.name)
                               order by b.name, a.full_name)
                              from ekapon.accounts a join ekapon.barangays b on b.id = a.barangay_id
                             where a.account_type = 'Paravet' and a.status = 'Active' and a.archived_at is null
                               and (b.id = c.host_barangay_id or exists (
                                 select 1 from ekapon.program_interest_allowed_barangays pa
                                  where pa.campaign_id = c.id and pa.barangay_id = b.id))), '[]'::jsonb) as assigned_paravets
                  ,ca.full_name as created_by_name,
           (select act.actor_name from ekapon.program_interest_activity act where act.campaign_id = c.id and act.action = 'request-submitted' order by act.created_at desc, act.id desc limit 1) as submitted_by_name,
           (select act.actor_name from ekapon.program_interest_activity act where act.campaign_id = c.id order by act.created_at desc, act.id desc limit 1) as last_activity_name,
           (select act.created_at from ekapon.program_interest_activity act where act.campaign_id = c.id order by act.created_at desc, act.id desc limit 1) as last_activity_at,
           c.merged_into_id, mc.reference as merged_into_reference, mhb.name as merged_into_host
             from ekapon.program_interest_campaigns c
             join ekapon.barangays hb on hb.id = c.host_barangay_id
             left join ekapon.dashboard_records d on d.id = c.program_record_id
      left join ekapon.accounts ca on ca.id = c.created_by
      left join ekapon.program_interest_campaigns mc on mc.id = c.merged_into_id
      left join ekapon.barangays mhb on mhb.id = mc.host_barangay_id
            where ${session.type !== 'Paravet'}
               or c.host_barangay_id = ${session.barangayId ?? -1}
               or exists (select 1 from ekapon.program_interest_allowed_barangays a
                           where a.campaign_id = c.id and a.barangay_id = ${session.barangayId ?? -1})
            order by case c.status when 'requested' then 0 when 'gathering' then 1 when 'approved' then 2 when 'merged' then 3 else 4 end,
                     c.created_at desc limit 200`,
      sql()`select id, name from ekapon.barangays
             where ${session.type !== 'Paravet'} or id = ${session.barangayId ?? -1}
             order by name`,
      sql()`select d.id as "programRecordId", d.record_id as "recordId",
                  coalesce(d.record_data->>'title', d.record_data->>'name', d.record_data->>'program', 'Program') as title,
                  coalesce(d.record_data->>'date', d.record_data->>'programDate', '') as date,
                  coalesce(d.record_data->>'location', d.record_data->>'venue', '') as location,
                  b.id as "barangayId", b.name as barangay,
                  coalesce(d.record_data->>'status', 'Planned') as status,
                  coalesce(d.record_data->'processes', '[]'::jsonb) as processes,
                  coalesce(d.record_data->>'program', '') as legacy_program,
                  c.id as "campaignId",
                  case when coalesce(d.record_data->>'slots', '') ~ '^[0-9]+$' then (d.record_data->>'slots')::int end as slots,
                  coalesce((select sum(jsonb_array_length(pa.pets_snapshot))::int from ekapon.program_attendance pa where pa.campaign_id=c.id and pa.status='Submitted'),0) as "slotsUsed",
                  case
                    when coalesce(d.record_data->>'startTime', '') ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
                     and coalesce(d.record_data->>'endTime', '') ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
                     and (d.record_data->>'endTime')::time > (d.record_data->>'startTime')::time
                      then floor(extract(epoch from ((d.record_data->>'endTime')::time - (d.record_data->>'startTime')::time)) / 60)::int
                    when coalesce(d.record_data->>'durationMinutes', d.record_data->>'duration_minutes', '') ~ '^[0-9]+$'
                      then coalesce(d.record_data->>'durationMinutes', d.record_data->>'duration_minutes')::int
                  end as "durationMinutes"
             from ekapon.dashboard_records d
             left join ekapon.barangays b on b.id = coalesce(
               case when coalesce(d.record_data->>'barangayId', '') ~ '^[0-9]+$' then (d.record_data->>'barangayId')::int end,
               ekapon.find_barangay(d.record_data->>'barangay'))
             left join ekapon.program_interest_campaigns c on c.program_record_id = d.id
            where d.dataset = 'programs' and d.archived = false
              and lower(coalesce(d.record_data->>'status', 'Planned')) in ('planned', 'open', 'in progress', 'scheduled', 'approved', 'active')
              and coalesce(nullif(d.record_data->>'date', ''), nullif(d.record_data->>'programDate', ''), '') >= to_char((now() at time zone 'Asia/Manila')::date, 'YYYY-MM-DD')
              and (${session.type !== 'Paravet'} or b.id = ${session.barangayId ?? -1}
                   or exists (select 1 from ekapon.program_interest_allowed_barangays a
                               where a.campaign_id = c.id and a.barangay_id = ${session.barangayId ?? -1}))
            order by date, title limit 200`,
    ]);
    return ok({
      campaigns: (campaignRows as unknown as CampaignRow[]).map(outputCampaign),
      barangays: barangayRows,
      programs: programRows.map((row) => ({ ...row, processes: programProcessesFrom(row.processes, row.legacy_program) })),
      role: session.type,
      assignedBarangayId: session.barangayId,
    });
  },
  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const body = parse(actions, c.body);
    if(body.action==='edit-demand'||body.action==='cancel-demand'){
      return ok(await tx(session.id,async q=>{
        const current=await requireCampaignScope(q,session,body.campaignId);
        const [locked]=await q`select * from ekapon.program_interest_campaigns where id=${body.campaignId} for update`;
        if(session.type==='Paravet'&&current.host_barangay_id!==session.barangayId)throw forbidden('Only Paravets currently assigned to the host barangay may change this request.');
        if(locked.campaign_type!=='program_request'||!['gathering','requested'].includes(locked.status))throw conflict('REQUEST_LOCKED','Only unaccepted requests can be edited or cancelled.');
        if(locked.revision!==body.expectedRevision)throw conflict('REQUEST_CHANGED','Another Paravet changed this request. Refresh before continuing.');
        if(body.action==='cancel-demand'){
          await q`update ekapon.program_interest_campaigns set status='cancelled',revision=revision+1,request_note=${body.reason},closed_at=now() where id=${body.campaignId}`;
          await finishMerged(q,body.campaignId,'cancelled');
          await logAction(q,session,body.campaignId,null,'request-cancelled');
        }else{
          const [invalid]=await q`select id from ekapon.program_interest_people p where campaign_id=${body.campaignId} and status='interested' and exists(select 1 from jsonb_array_elements(p.pets) pet cross join lateral jsonb_array_elements_text(pet->'processes') process(value) where not(process.value=any(${q.array(body.processes)}::text[]))) limit 1`;
          if(invalid)throw conflict('INTEREST_PROCESS_IN_USE','Existing interests use a process you removed. Update those entries first.');
          await q`update ekapon.program_interest_campaigns set requested_target_people=${body.targetPeople},processes=${q.array(body.processes)},request_note=${body.note||null},revision=revision+1,status='gathering',submitted_at=null where id=${body.campaignId}`;
          await logAction(q,session,body.campaignId,null,'request-edited');
        }
        return {saved:true};
      }));
    }
    if (body.action === 'create-demand') {
      const hostId = session.type === 'Paravet' ? session.barangayId : body.hostBarangayId;
      if (!hostId) throw unprocessable('HOST_BARANGAY_REQUIRED', 'Choose a host barangay for the program request.');
      if (session.type === 'Paravet' && body.hostBarangayId && body.hostBarangayId !== session.barangayId) {
        throw forbidden('Paravets can gather demand only in their assigned barangay.');
      }
      const [host] = await sql()`select id from ekapon.barangays where id = ${hostId}`;
      if (!host) throw unprocessable('BARANGAY_NOT_FOUND', 'Choose an official barangay.');
      const reference = `PI-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 4)}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      const campaignId = await tx(session.id, async (q) => {
        await q`select pg_advisory_xact_lock(73023,${hostId}::int)`;
        const [active]=await q`select c.id,c.reference,c.status,a.full_name as filed_by from ekapon.program_interest_campaigns c left join ekapon.accounts a on a.id=c.created_by where c.host_barangay_id=${hostId} and c.campaign_type='program_request' and c.status in ('gathering','requested','approved','scheduled','merged') limit 1`;
        if(active)throw conflict('ACTIVE_DEMAND_EXISTS',`An active request already exists: ${active.reference}. Open it to collaborate.`,{campaignId:active.id,reference:active.reference,status:active.status,filedBy:active.filed_by});
        const [row] = await q`
          insert into ekapon.program_interest_campaigns
            (reference, campaign_type, host_barangay_id, requested_target_people, processes, status, request_note, created_by)
          values (${reference}, 'program_request', ${hostId}, ${body.targetPeople}, ${q.array(body.processes)}, 'gathering', ${body.note || null}, ${session.id})
          returning id`;
        await q`insert into ekapon.program_interest_allowed_barangays (campaign_id, barangay_id, added_by)
                values (${row.id}, ${hostId}, ${session.id})`;
        await logAction(q, session, row.id, null, 'created');
        return row.id as number;
      });
      return created({ campaignId, reference });
    }
    if (body.action === 'create-program-day') {
      const program = await resolveProgram(sql(), body.programRecordId);
      const barangayAllowed = await sql()`
        select exists (select 1 from ekapon.program_interest_allowed_barangays a
                        join ekapon.program_interest_campaigns c on c.id = a.campaign_id
                       where c.program_record_id = ${program.id} and a.barangay_id = ${session.barangayId ?? -1}) as allowed`;
      if (session.type === 'Paravet' && program.barangayId !== session.barangayId && !barangayAllowed[0]?.allowed) {
        throw forbidden('This program is outside your assigned barangay.');
      }
      const [already] = await sql()`select id, reference from ekapon.program_interest_campaigns where program_record_id = ${program.id}`;
      if (already) return ok({ campaignId: already.id, reference: already.reference, existing: true });
      const reference = `PI-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 4)}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      const result = await tx(session.id, async (q) => {
        const [row] = await q`
          insert into ekapon.program_interest_campaigns
            (reference, campaign_type, host_barangay_id, program_record_id, processes, status, created_by)
          values (${reference}, 'program_day', ${program.barangayId}, ${program.id}, ${q.array(program.processes)}, 'scheduled', ${session.id})
          on conflict (program_record_id) where program_record_id is not null do nothing
          returning id`;
        if (!row) {
          const [existing] = await q`select id, reference from ekapon.program_interest_campaigns where program_record_id = ${program.id}`;
          if (!existing) throw conflict('CAMPAIGN_CREATE_CONFLICT', 'The program interest list could not be created. Refresh and try again.');
          return { campaignId: existing.id as number, reference: existing.reference as string, existing: true };
        }
        await q`insert into ekapon.program_interest_allowed_barangays (campaign_id, barangay_id, added_by)
                values (${row.id}, ${program.barangayId}, ${session.id})`;
        await logAction(q, session, row.id, null, 'created');
        return { campaignId: row.id as number, reference, existing: false };
      });
      return created(result);
    }
    if (body.action === 'add-interest') {
      const mobile = body.mobile.trim();
      if (mobile && !/^09\d{2}[- ]?\d{3}[- ]?\d{4}$/.test(mobile)) {
        throw unprocessable('INVALID_MOBILE', 'Enter a mobile number in the format 09XX-XXX-XXXX or leave it blank.', { field: 'mobile' });
      }
      const campaign = await requireCampaignScope(sql(), session, body.campaignId, body.residenceBarangayId);
      if (!['gathering', 'scheduled'].includes(campaign.status)) throw conflict('LIST_CLOSED', 'This interest list is no longer accepting entries.');
      if (body.pets.some((item) => item.processes.some((process) => !campaign.processes.includes(process)))) {
        throw unprocessable('PROCESS_NOT_AVAILABLE', 'Choose only processes included in this program.');
      }
      const phoneKey = normalizePhone(mobile);
      const pets = body.pets.map((item) => ({ ...item, processes: [...new Set(item.processes)] }));
      const personId = await tx(session.id, async (q) => {
        if (body.requestId) {
          const [prior] = await q`select id, created_by from ekapon.program_interest_people where request_id = ${body.requestId}::uuid`;
          if (prior && Number(prior.created_by) !== session.id) throw conflict('REQUEST_ID_REUSED', 'This request reference already belongs to another entry.');
          if (prior) return prior.id as number;
        }
        const [locked] = await q`select status, program_record_id from ekapon.program_interest_campaigns where id = ${body.campaignId} for update`;
        if (!locked || !['gathering', 'scheduled'].includes(locked.status)) throw conflict('LIST_CLOSED', 'This interest list is no longer accepting entries.');
        await q`select pg_advisory_xact_lock(hashtextextended(${'program-interest:' + body.campaignId}, 0))`;
        const current = await requireCampaignScope(q, session, body.campaignId, body.residenceBarangayId);
        if (locked.program_record_id) await resolveProgram(q, locked.program_record_id);
        if (body.pets.some((item) => item.processes.some((process) => !current.processes.includes(process)))) {
          throw unprocessable('PROCESS_NOT_AVAILABLE', 'Choose only processes included in this program.');
        }
        const candidates = await q`
          select p.id, p.owner_name as "ownerName", b.name as barangay
            from ekapon.program_interest_people p
            join ekapon.barangays b on b.id = p.residence_barangay_id
           where p.campaign_id = ${body.campaignId} and p.status = 'interested'
             and p.residence_barangay_id = ${body.residenceBarangayId}
             and (lower(btrim(p.owner_name)) = lower(btrim(${body.ownerName}))
                  or (${phoneKey} <> '' and regexp_replace(coalesce(p.mobile, ''), '[^0-9]', '', 'g') = ${phoneKey}))
           order by p.created_at desc limit 5`;
        if (candidates.length && !body.confirmDistinct) {
          throw conflict('POSSIBLE_DUPLICATE', 'A similar owner is already listed. Review the matches before adding a separate interest entry.', { candidates });
        }
        const [row] = await q`
          insert into ekapon.program_interest_people
            (campaign_id, owner_name, mobile, residence_barangay_id, pets, duplicate_confirmed, created_by, request_id)
          values (${body.campaignId}, ${body.ownerName}, ${mobile || null}, ${body.residenceBarangayId}, ${q.json(pets)}, ${candidates.length > 0}, ${session.id}, ${body.requestId ?? null})
          returning id`;
        await logOwnerLink(q,session,body.registryOwnerId,'interest-linked',`Interest ${row.id} · campaign ${body.campaignId}`,{name:body.ownerName,barangayId:body.residenceBarangayId});
        if(body.registryOwnerId)await q`update ekapon.program_interest_people set registry_owner_id=${body.registryOwnerId} where id=${row.id}`;
        await logAction(q, session, body.campaignId, row.id, 'interest-added');
        return row.id as number;
      });
      return created({ personId });
    }
    if (body.action === 'update-interest') {
      const campaign = await requireCampaignScope(sql(), session, body.campaignId, body.residenceBarangayId);
      if (!['gathering', 'scheduled'].includes(campaign.status)) throw conflict('LIST_CLOSED', 'This interest list is no longer editable.');
      if (body.pets.some((item) => item.processes.some((process) => !campaign.processes.includes(process)))) {
        throw unprocessable('PROCESS_NOT_AVAILABLE', 'Choose only processes included in this program.');
      }
      const mobile = body.mobile.trim();
      if (mobile && !/^09\d{2}[- ]?\d{3}[- ]?\d{4}$/.test(mobile)) throw unprocessable('INVALID_MOBILE', 'Enter a valid mobile number or leave it blank.');
      const phoneKey = normalizePhone(mobile);
      await tx(session.id, async (q) => {
        const [locked] = await q`select status, program_record_id from ekapon.program_interest_campaigns where id = ${body.campaignId} for update`;
        if (!locked || !['gathering', 'scheduled'].includes(locked.status)) throw conflict('LIST_CLOSED', 'This interest list is no longer editable.');
        await q`select pg_advisory_xact_lock(hashtextextended(${'program-interest:' + body.campaignId}, 0))`;
        const current = await requireCampaignScope(q, session, body.campaignId, body.residenceBarangayId);
        if (locked.program_record_id) await resolveProgram(q, locked.program_record_id);
        if (body.pets.some((item) => item.processes.some((process) => !current.processes.includes(process)))) {
          throw unprocessable('PROCESS_NOT_AVAILABLE', 'Choose only processes included in this program.');
        }
        const candidates = await q`
          select p.id, p.owner_name as "ownerName", b.name as barangay
            from ekapon.program_interest_people p
            join ekapon.barangays b on b.id = p.residence_barangay_id
           where p.campaign_id = ${body.campaignId} and p.id <> ${body.personId} and p.status = 'interested'
             and p.residence_barangay_id = ${body.residenceBarangayId}
             and (lower(btrim(p.owner_name)) = lower(btrim(${body.ownerName}))
                  or (${phoneKey} <> '' and regexp_replace(coalesce(p.mobile, ''), '[^0-9]', '', 'g') = ${phoneKey}))
           order by p.created_at desc limit 5`;
        if (candidates.length && !body.confirmDistinct) {
          throw conflict('POSSIBLE_DUPLICATE', 'A similar owner is already listed. Review the matches before saving a separate interest entry.', { candidates });
        }
        const [updated] = await q`
          update ekapon.program_interest_people
             set owner_name = ${body.ownerName}, mobile = ${mobile || null},
                 residence_barangay_id = ${body.residenceBarangayId}, pets = ${q.json(body.pets)},
                 duplicate_confirmed = duplicate_confirmed or ${candidates.length > 0}, updated_at = now()
           where id = ${body.personId} and campaign_id = ${body.campaignId} and status = 'interested'
             and (${session.type !== 'Paravet'} or residence_barangay_id = ${session.barangayId ?? -1})
             and (${body.expectedUpdatedAt ?? null}::timestamptz is null or date_trunc('milliseconds', updated_at) = ${body.expectedUpdatedAt ?? null}::timestamptz)
          returning id`;
        if (!updated) await staleOrGone(q, session, body.campaignId, body.personId);
        await logOwnerLink(q,session,body.registryOwnerId,'interest-linked',`Interest ${body.personId} updated · campaign ${body.campaignId}`,{name:body.ownerName,barangayId:body.residenceBarangayId});
        if(body.registryOwnerId)await q`update ekapon.program_interest_people set registry_owner_id=${body.registryOwnerId} where id=${body.personId}`;
        await syncInterestStubs(q, session, body.personId, { name: body.ownerName, mobile }, body.pets);
        await logAction(q, session, body.campaignId, body.personId, 'interest-updated');
      });
      return ok({ saved: true });
    }
    if (body.action === 'withdraw-interest') {
      const campaign = await requireCampaignScope(sql(), session, body.campaignId);
      if (!['gathering', 'scheduled'].includes(campaign.status)) throw conflict('LIST_CLOSED', 'This interest list is no longer editable.');
      await tx(session.id, async (q) => {
        const [locked] = await q`select status from ekapon.program_interest_campaigns where id = ${body.campaignId} for update`;
        if (!locked || !['gathering', 'scheduled'].includes(locked.status)) throw conflict('LIST_CLOSED', 'This interest list is no longer editable.');
        await requireCampaignScope(q, session, body.campaignId);
        const [entry] = await q`
          update ekapon.program_interest_people
             set status = 'withdrawn', updated_at = now()
           where id = ${body.personId} and campaign_id = ${body.campaignId} and status = 'interested'
             and (${session.type !== 'Paravet'} or residence_barangay_id = ${session.barangayId ?? -1})
             and (${body.expectedUpdatedAt ?? null}::timestamptz is null or date_trunc('milliseconds', updated_at) = ${body.expectedUpdatedAt ?? null}::timestamptz)
          returning id`;
        if (!entry) await staleOrGone(q, session, body.campaignId, body.personId);
        await cancelInterestStubs(q, session, body.personId);
        await logAction(q, session, body.campaignId, body.personId, 'interest-withdrawn');
      });
      return ok({ saved: true });
    }
    if (body.action === 'submit-request') {
      if (session.type !== 'Paravet') throw forbidden('Only a Paravet can submit a barangay program request.');
      const campaign = await requireCampaignScope(sql(), session, body.campaignId);
      if (campaign.campaign_type !== 'program_request' || campaign.status !== 'gathering') throw conflict('REQUEST_NOT_OPEN', 'This program request is not accepting submissions.');
      if (campaign.host_barangay_id !== session.barangayId) throw forbidden('You can submit requests only for your assigned barangay.');
      await tx(session.id, async (q) => {
        const [locked] = await q`
          select campaign_type, status, host_barangay_id, requested_target_people
            from ekapon.program_interest_campaigns where id = ${body.campaignId} for update`;
        if (!locked || locked.campaign_type !== 'program_request' || locked.status !== 'gathering'
            || locked.host_barangay_id !== session.barangayId) throw conflict('REQUEST_NOT_OPEN', 'This program request is no longer open for submission.');
        const [count] = await q`select count(*)::int as owners from ekapon.program_interest_people where campaign_id = ${body.campaignId} and status = 'interested'`;
        if (count.owners < locked.requested_target_people) {
          throw unprocessable('TARGET_NOT_REACHED', `Gather ${locked.requested_target_people - count.owners} more owner interests before submitting this request.`);
        }
        await q`update ekapon.program_interest_campaigns set status = 'requested', submitted_at = now() where id = ${body.campaignId}`;
        await logAction(q, session, body.campaignId, null, 'request-submitted');
      });
      return ok({ submitted: true });
    }
    if (body.action === 'review-request') {
      if (session.type === 'Paravet') throw forbidden('Only an Admin can review program requests.');
      const campaign = await getCampaign(sql(), body.campaignId);
      if (!campaign) throw notFound('Program request not found.');
      if (campaign.campaign_type !== 'program_request' || campaign.status !== 'requested') throw conflict('REQUEST_NOT_REVIEWABLE', 'This request is not waiting for review.');
      if (body.decision === 'reject' && body.note.trim().length < 3) throw unprocessable('REVIEW_NOTE_REQUIRED', 'Add a short reason when rejecting a request.');
      const eligibleIds = [...new Set([campaign.host_barangay_id, ...body.allowedBarangayIds])];
      const found = await sql()`select id from ekapon.barangays where id = any(${sql().array(eligibleIds, 23)})`;
      if (found.length !== eligibleIds.length) throw unprocessable('INVALID_BARANGAY', 'Choose only official barangays.');
      const target = body.approvedTargetPeople ?? campaign.requested_target_people;
      await tx(session.id, async (q) => {
        const [locked] = await q`select campaign_type, status from ekapon.program_interest_campaigns where id = ${body.campaignId} for update`;
        if (!locked || locked.campaign_type !== 'program_request' || locked.status !== 'requested') {
          throw conflict('REQUEST_NOT_REVIEWABLE', 'This request has already been reviewed. Refresh the list.');
        }
        await q`
          update ekapon.program_interest_campaigns
             set status = ${body.decision === 'approve' ? 'approved' : 'rejected'},
                 approved_target_people = ${body.decision === 'approve' ? target : null},
                 review_note = ${body.note.trim() || null}, reviewed_by = ${session.id}, reviewed_at = now()
           where id = ${body.campaignId}`;
        if (body.decision === 'approve') {
          await q`delete from ekapon.program_interest_allowed_barangays where campaign_id = ${body.campaignId}`;
          for (const barangayId of eligibleIds) {
            await q`insert into ekapon.program_interest_allowed_barangays (campaign_id, barangay_id, added_by)
                    values (${body.campaignId}, ${barangayId}, ${session.id})`;
          }
        }
        if (body.decision === 'reject') await finishMerged(q, body.campaignId, 'rejected');
        await logAction(q, session, body.campaignId, null, body.decision === 'approve' ? 'request-approved' : 'request-rejected');
      });
      return ok({ reviewed: true, allowedBarangays: eligibleIds, approvedTargetPeople: body.decision === 'approve' ? target : null });
    }
    if (body.action === 'schedule') {
      if (session.type === 'Paravet') throw forbidden('Only an Admin can schedule an approved request.');
      const campaign = await getCampaign(sql(), body.campaignId);
      if (!campaign || campaign.campaign_type !== 'program_request' || campaign.status !== 'approved') throw conflict('REQUEST_NOT_APPROVED', 'Approve the program request before scheduling it.');
      const program = await resolveProgram(sql(), body.programRecordId);
      if (program.barangayId !== campaign.host_barangay_id) throw unprocessable('HOST_BARANGAY_MISMATCH', 'Schedule the program in the request’s host barangay.');
      await tx(session.id, async (q) => {
        const [locked] = await q`select campaign_type, status, host_barangay_id from ekapon.program_interest_campaigns where id = ${body.campaignId} for update`;
        if (!locked || locked.campaign_type !== 'program_request' || locked.status !== 'approved' || locked.host_barangay_id !== program.barangayId) {
          throw conflict('REQUEST_NOT_APPROVED', 'This request is no longer ready to schedule. Refresh and try again.');
        }
        await resolveProgram(q, body.programRecordId);
        await q`update ekapon.program_interest_campaigns
                   set program_record_id = ${program.id}, status = 'scheduled'
                 where id = ${body.campaignId} and status = 'approved'`;
        await logAction(q, session, body.campaignId, null, 'program-scheduled');
      });
      return ok({ scheduled: true });
    }
    if (body.action === 'close') {
      if (session.type === 'Paravet') throw forbidden('Only an Admin can close a program interest list.');
      const campaign = await getCampaign(sql(), body.campaignId);
      if (!campaign || campaign.status !== 'scheduled') throw conflict('PROGRAM_NOT_ACTIVE', 'Only a scheduled program list can be closed.');
      await tx(session.id, async (q) => {
        const [locked] = await q`select status from ekapon.program_interest_campaigns where id = ${body.campaignId} for update`;
        if (!locked || locked.status !== 'scheduled') throw conflict('PROGRAM_NOT_ACTIVE', 'This interest list has already changed. Refresh and try again.');
        await q`update ekapon.program_interest_campaigns set status = 'closed', closed_at = now() where id = ${body.campaignId} and status = 'scheduled'`;
        await finishMerged(q, body.campaignId, 'closed');
        await logAction(q, session, body.campaignId, null, 'closed');
      });
      return ok({ closed: true });
    }
    if (body.action === 'reopen') {
      if (session.type === 'Paravet') throw forbidden('Only an Admin can reopen a program interest list.');
      const campaign = await getCampaign(sql(), body.campaignId);
      if (!campaign || campaign.status !== 'closed' || !campaign.program_record_id) {
        throw conflict('PROGRAM_NOT_REOPENABLE', 'Only a closed program day can be reopened.');
      }
      await resolveProgram(sql(), campaign.program_record_id);
      await tx(session.id, async (q) => {
        const [locked] = await q`select status, program_record_id from ekapon.program_interest_campaigns where id = ${body.campaignId} for update`;
        if (!locked || locked.status !== 'closed' || !locked.program_record_id) throw conflict('PROGRAM_NOT_REOPENABLE', 'This interest list has already changed. Refresh and try again.');
        await resolveProgram(q, locked.program_record_id);
        await q`update ekapon.program_interest_campaigns set status = 'scheduled', closed_at = null where id = ${body.campaignId} and status = 'closed'`;
        await logAction(q, session, body.campaignId, null, 'reopened');
      });
      return ok({ reopened: true });
    }
    if (body.action === 'merge-requests') {
      if (session.type === 'Paravet') throw forbidden('Only an Admin can merge program requests.');
      const ids = [body.targetId, ...body.sources.map((source) => source.id)];
      if (new Set(ids).size !== ids.length) throw unprocessable('INVALID_MERGE', 'Choose different requests to merge.');
      const result = await tx(session.id, async (q) => {
        const rows = await q`select id, campaign_type, status, revision, host_barangay_id, processes, requested_target_people, approved_target_people
                               from ekapon.program_interest_campaigns where id = any(${q.array(ids, 20)}::bigint[]) order by id for update`;
        const byId = new Map(rows.map((row) => [Number(row.id), row]));
        const expected = new Map([[body.targetId, body.expectedRevision], ...body.sources.map((source) => [source.id, source.expectedRevision] as [number, number])]);
        for (const id of ids) {
          const row = byId.get(id);
          if (!row) throw notFound('A program request to merge was not found.');
          if (row.campaign_type !== 'program_request' || !['requested', 'approved'].includes(row.status)) throw conflict('REQUEST_NOT_MERGEABLE', 'Only sent or approved requests can be merged.');
          if (row.revision !== expected.get(id)) throw conflict('REQUEST_CHANGED', 'A request changed since you opened it. Refresh before merging.');
        }
        const target = byId.get(body.targetId)!;
        const sources = body.sources.map((source) => byId.get(source.id)!);
        const processes = [...new Set([target, ...sources].flatMap((row) => row.processes as string[]))];
        const requested = sources.reduce((sum, row) => sum + row.requested_target_people, target.requested_target_people);
        const approved = target.status === 'approved' ? sources.reduce((sum, row) => sum + (row.approved_target_people ?? row.requested_target_people), target.approved_target_people ?? target.requested_target_people) : null;
        const sourceIds = sources.map((row) => Number(row.id));
        await q`update ekapon.program_interest_people set campaign_id = ${body.targetId}, updated_at = now() where campaign_id = any(${q.array(sourceIds, 20)}::bigint[])`;
        await q`insert into ekapon.program_interest_allowed_barangays (campaign_id, barangay_id, added_by)
                select distinct ${body.targetId}::bigint, a.barangay_id, ${session.id}::bigint from ekapon.program_interest_allowed_barangays a
                 where a.campaign_id = any(${q.array(sourceIds, 20)}::bigint[])
                on conflict (campaign_id, barangay_id) do nothing`;
        await q`update ekapon.program_interest_campaigns set status = 'merged', merged_into_id = ${body.targetId}, revision = revision + 1 where id = any(${q.array(sourceIds, 20)}::bigint[])`;
        await q`update ekapon.program_interest_campaigns
                   set processes = ${q.array(processes)}, requested_target_people = ${Math.min(requested, 100000)},
                       approved_target_people = ${approved === null ? null : Math.min(approved, 100000)}, revision = revision + 1
                 where id = ${body.targetId}`;
        for (const id of sourceIds) await logAction(q, session, id, null, 'request-merged');
        await logAction(q, session, body.targetId, null, 'requests-merged-in');
        return { merged: sourceIds.length, processes, requestedTargetPeople: Math.min(requested, 100000) };
      });
      return ok(result);
    }
    if (body.action === 'update-program-access') {
      if (session.type === 'Paravet') throw forbidden('Only an Admin can change program barangay access.');
      const campaign = await getCampaign(sql(), body.campaignId);
      if (!campaign || campaign.status !== 'scheduled') throw conflict('PROGRAM_NOT_ACTIVE', 'Only a scheduled program day can change barangay access.');
      const eligibleIds = [...new Set([campaign.host_barangay_id, ...body.allowedBarangayIds])];
      const found = await sql()`select id from ekapon.barangays where id = any(${sql().array(eligibleIds, 23)})`;
      if (found.length !== eligibleIds.length) throw unprocessable('INVALID_BARANGAY', 'Choose only official barangays.');
      await tx(session.id, async (q) => {
        const [locked] = await q`select status from ekapon.program_interest_campaigns where id = ${body.campaignId} for update`;
        if (!locked || locked.status !== 'scheduled') throw conflict('PROGRAM_NOT_ACTIVE', 'This program day has already changed. Refresh and try again.');
        await q`delete from ekapon.program_interest_allowed_barangays where campaign_id = ${body.campaignId}`;
        for (const barangayId of eligibleIds) {
          await q`insert into ekapon.program_interest_allowed_barangays (campaign_id, barangay_id, added_by)
                  values (${body.campaignId}, ${barangayId}, ${session.id})`;
        }
        await logAction(q, session, body.campaignId, null, 'program-access-updated');
      });
      return ok({ saved: true, allowedBarangays: eligibleIds });
    }
    return ok({ saved: true });
  },
});
