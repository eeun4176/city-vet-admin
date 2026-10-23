import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, client, type Resp } from './harness';
import { closeDb, sql } from '../server/db';
import { sessionCookie } from '../server/auth';
import { PROGRAM_PROCESSES } from '../shared/programs';
import { timingSummary } from '../shared/programWorkspace';

const tag = `Workspace${randomUUID().slice(0, 8)}`;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const offset = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
let call: ReturnType<typeof client>, close: () => Promise<void>;
let admin: string, superAdmin: string, paravet: string, other: string;
let adminId: number, paravetId: number, barangayId: number, otherBarangayId: number;
let barangay: string;
const accounts: number[] = [], programs: number[] = [];
let sequence = 0;
let futureSequence = 10, legacySequence = 100;
const success = (response: Resp) => { expect([200, 201], JSON.stringify(response.json)).toContain(response.status); return response.json; };
const post = (body: unknown, cookie = admin) => call('POST', '/api/v1/program-workspace', { json: body, cookie });
const detail = async (id: number, cookie = admin) => success(await call('GET', `/api/v1/program-workspace?id=${id}`, { cookie }));
const schedule = (changes = {}) => ({ title: `${tag} Program`, date: today, location: 'Test covered court', hostBarangayId: barangayId, startTime: '08:00', endTime: '16:00', slots: 10, processes: [...PROGRAM_PROCESSES], status: 'Open', ...changes });
async function create(changes = {}) {
  const result = success(await post({ action: 'create', schedule: schedule({ title: `${tag} Program ${++sequence}`, date: offset(++futureSequence), ...changes }) }));
  programs.push(result.programId); return result as { programId: number; campaignId: number };
}
async function legacy(date = offset(-++legacySequence), status = 'Open') {
  const id = `${tag}-${randomUUID()}`;
  const data = { ...schedule({ date, status, title: `${tag} Legacy ${++sequence}` }), id, barangayId, barangay };
  const [row] = await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('programs',${id},${sql().json(data)}) returning id`;
  programs.push(row.id); return row.id as number;
}

beforeAll(async () => {
  const server = await startServer(); call = client(server.base); close = server.close;
  const barangays = await sql()`select id,name from ekapon.barangays order by id limit 2`;
  barangayId = barangays[0].id; barangay = barangays[0].name; otherBarangayId = barangays[1].id;
  const rows = await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id)
    values(${`${tag}admin`},'Admin',${tag},'Admin',null),(${`${tag}super`},'SuperAdmin',${tag},'Super',null),
    (null,'Paravet',${tag},'Field',${barangayId}),(null,'Paravet',${tag},'Other',${otherBarangayId}) returning id,account_type::text as type,last_name`;
  accounts.push(...rows.map((row) => row.id));
  adminId = rows.find((row) => row.last_name === 'Admin')!.id;
  paravetId = rows.find((row) => row.last_name === 'Field')!.id;
  const cookie = async (lastName: string) => { const row = rows.find((r) => r.last_name === lastName)!; return (await sessionCookie({ id: row.id, type: row.type }, 'full')).split(';')[0]; };
  admin = await cookie('Admin'); superAdmin = await cookie('Super'); paravet = await cookie('Field'); other = await cookie('Other');
});
afterAll(async () => {
  if (programs.length) {
    const campaigns = (await sql()`select id from ekapon.program_interest_campaigns where program_record_id=any(${programs}) or created_by=${adminId}`).map((row) => row.id);
    const attendance = (await sql()`select id::text as id from ekapon.program_attendance where campaign_id=any(${campaigns})`).map((row) => row.id);
    if (attendance.length) await sql()`delete from ekapon.dashboard_records where record_data->>'attendanceId'=any(${attendance}) and record_data->>'workflow'='qr-stubs-v1'`;
    await sql()`delete from ekapon.stub_activity where campaign_id=any(${campaigns})`;
    await sql()`delete from ekapon.program_attendance where campaign_id=any(${campaigns})`;
    await sql()`delete from ekapon.stub_tickets where batch_id in(select id from ekapon.stub_batches where campaign_id=any(${campaigns}))`;
    await sql()`delete from ekapon.stub_batches where campaign_id=any(${campaigns})`;
    await sql()`delete from ekapon.program_interest_people where campaign_id=any(${campaigns})`;
    await sql()`delete from ekapon.program_interest_activity where campaign_id=any(${campaigns})`;
    await sql()`delete from ekapon.program_interest_allowed_barangays where campaign_id=any(${campaigns})`;
    await sql()`delete from ekapon.program_interest_campaigns where id=any(${campaigns})`;
    await sql()`delete from ekapon.program_workspace_activity where program_record_id=any(${programs})`;
    await sql()`delete from ekapon.program_runtime where program_record_id=any(${programs})`;
    await sql()`delete from ekapon.dashboard_records where id=any(${programs})`;
  }
  if (accounts.length) await sql()`delete from ekapon.accounts where id=any(${accounts})`;
  if (close) await close(); await closeDb();
});

describe('unified program workspace', () => {
  it('requires staff auth and creates a program, runtime, and interest list atomically', async () => {
    expect((await call('GET', '/api/v1/program-workspace')).status).toBe(401);
    expect((await post({ action: 'create', schedule: schedule() }, paravet)).status).toBe(403);
    const created = await create(); const result = await detail(created.programId);
    expect(result.program).toMatchObject({ campaignId: created.campaignId, status: 'Open', slotsUsed: 0, version: 1, actualStartedAt: null });
    expect(result.assignedParavets).toEqual(expect.arrayContaining([expect.objectContaining({ id: paravetId })]));
    expect(result.allowedBarangays).toEqual([{ id: barangayId, name: barangay }]);
    expect(result.stock.approved).toBe(0); expect(result.activity[0].action).toBe('created');
    expect((await detail(created.programId, paravet)).program.id).toBe(created.programId);
    const linked = success(await call('GET', `/api/v1/program-workspace?recordId=${result.program.recordId}`, { cookie: paravet }));
    expect(linked.program.id).toBe(created.programId);
    expect(result.barangayOptions.length).toBeGreaterThan(2);
    expect((await detail(created.programId, paravet)).barangayOptions).toEqual([{ id: barangayId, name: barangay }]);
    expect((await call('GET', `/api/v1/program-workspace?id=${created.programId}`, { cookie: other })).status).toBe(404);
  });

  it('explains the existing duplicate-day rule and rolls back unsuccessful creation', async () => {
    const created = await create(); const p = (await detail(created.programId)).program;
    const response = await post({ action: 'create', schedule: schedule({ date: p.date }) });
    expect(response.status).toBe(409); expect(response.json.error.code).toBe('PROGRAM_DAY_EXISTS');
    const [count] = await sql()`select count(*)::int as count from ekapon.dashboard_records where dataset='programs' and record_data->>'date'=${p.date} and record_data->>'barangay'=${barangay}`;
    expect(count.count).toBe(1);
  });

  it('enforces future schedules, fixed status/process options, paired times, and atomic failures', async () => {
    const [before] = await sql()`select count(*)::int as count from ekapon.dashboard_records where dataset='programs' and record_data->>'title' like ${`${tag}%`}`;
    for (const [changes, status] of [[{ date: offset(-1) }, 422], [{ status: 'whatever' }, 400], [{ status: 'Completed' }, 422], [{ endTime: '07:00' }, 400], [{ processes: [] }, 400], [{ hostBarangayId: 999999 }, 422]] as const) {
      expect((await post({ action: 'create', schedule: schedule(changes) })).status, JSON.stringify(changes)).toBe(status);
    }
    const [after] = await sql()`select count(*)::int as count from ekapon.dashboard_records where dataset='programs' and record_data->>'title' like ${`${tag}%`}`;
    expect(after.count).toBe(before.count);
  });

  it('paginates periods, scopes approved barangays, and does not return owner snapshots or QR tokens', async () => {
    const upcoming = await create({ date: offset(2), title: `${tag} Upcoming` });
    const recentId = await legacy(offset(-2), 'Completed');
    const listing = success(await call('GET', `/api/v1/program-workspace?group=upcoming&q=${tag}&pageSize=1`, { cookie: admin }));
    expect(listing.data).toHaveLength(1); expect(listing.data[0].id).toBe(upcoming.programId); expect(listing.counts.upcoming).toBeGreaterThan(0);
    const previous = success(await call('GET', `/api/v1/program-workspace?group=recent&q=${tag}`, { cookie: admin }));
    expect(previous.data.some((p: { id: number }) => p.id === recentId)).toBe(true);
    const snapshot = JSON.stringify(listing);
    expect(snapshot).not.toMatch(/owner_snapshot|pets_snapshot|CVS1\.|"mobile"|"address"/);
    success(await call('POST', '/api/v1/program-interest', { cookie: admin, json: { action: 'update-program-access', campaignId: upcoming.campaignId, allowedBarangayIds: [otherBarangayId] } }));
    expect((await detail(upcoming.programId, other)).allowedBarangays).toHaveLength(2);
    expect((await detail(upcoming.programId)).assignedParavets).toEqual(expect.arrayContaining([expect.objectContaining({ name: `${tag} Other` })]));
    const privateProgram = await create();
    const privateRecordId = (await detail(privateProgram.programId)).program.recordId;
    const calendar = success(await call('GET', '/api/v1/calendar/events', { cookie: other }));
    expect(calendar.data.some((record: { title: string }) => record.title === `${tag} Upcoming`)).toBe(true);
    expect(calendar.data.some((record: { id: string }) => record.id === privateRecordId)).toBe(false);
  });

  it('keeps an approved demand request and its existing participants when scheduling', async () => {
    const created = success(await call('POST', '/api/v1/program-interest', { cookie: admin, json: { action: 'create-demand', hostBarangayId: barangayId, targetPeople: 1, processes: ['Microchipping'] } }));
    const person = success(await call('POST', '/api/v1/program-interest', { cookie: paravet, json: { action: 'add-interest', campaignId: created.campaignId, ownerName: `${tag} Interested`, residenceBarangayId: barangayId, pets: [] } }));
    success(await call('POST', '/api/v1/program-interest', { cookie: paravet, json: { action: 'update-interest', campaignId: created.campaignId, personId: person.personId, ownerName: `${tag} Interested Owner`, residenceBarangayId: barangayId, pets: [] } }));
    success(await call('POST', '/api/v1/program-interest', { cookie: paravet, json: { action: 'submit-request', campaignId: created.campaignId } }));
    success(await call('POST', '/api/v1/program-interest', { cookie: admin, json: { action: 'review-request', campaignId: created.campaignId, decision: 'approve', allowedBarangayIds: [otherBarangayId] } }));
    const result = success(await post({ action: 'create', requestCampaignId: created.campaignId, schedule: schedule({ date: offset(30), processes: ['Microchipping'] }) }));
    programs.push(result.programId);
    const data = await detail(result.programId);
    expect(data.program).toMatchObject({ campaignId: created.campaignId, interestOwners: 1, campaignStatus: 'scheduled' });
    expect(data.allowedBarangays).toHaveLength(2);
    expect((await post({ action: 'create', requestCampaignId: created.campaignId, schedule: schedule({ processes: ['Microchipping'] }) })).status).toBe(409);
  });

  it('restricts actual timing to Admin/SuperAdmin, accepts past actuals, rejects future or reversed times, and preserves collection', async () => {
    const programId = await legacy(offset(-1));
    const connected = success(await post({ action: 'connect', programId, expectedVersion: 0 }));
    const start = { action: 'start', programId, expectedVersion: 1, actualAt: `${offset(-1)}T08:30:00+08:00` };
    expect((await post(start, paravet)).status).toBe(403);
    expect((await post({ ...start, actualAt: `${offset(1)}T08:00:00+08:00` })).status).toBe(422);
    success(await post(start));
    let data = await detail(programId);
    expect(data.program).toMatchObject({ status: 'In progress', version: 2 });
    expect((await post({ action: 'finish', programId, expectedVersion: 2, actualAt: `${offset(-1)}T08:00:00+08:00` })).status).toBe(422);
    success(await post({ action: 'finish', programId, expectedVersion: 2, actualAt: `${offset(-1)}T17:00:00+08:00` }, superAdmin));
    data = await detail(programId);
    expect(data.program).toMatchObject({ status: 'Completed', campaignStatus: 'scheduled', version: 3 });
    expect(timingSummary(data.program).overtimeMinutes).toBe(60);
    expect(timingSummary(data.program).elapsedMinutes).toBe(510);
    const response = success(await call('POST', '/api/v1/stub-workflow', { cookie: paravet, json: { action: 'walk-in', campaignId: connected.campaignId, requestId: randomUUID(), attendedOn: offset(-1), owner: { name: `${tag} Late paper`, barangayId }, pets: [{ name: 'Paper pet', species: 'Dog', processes: ['Microchipping'], outcome: 'Completed' }] } }));
    expect(response.attendanceId).toEqual(expect.any(Number));
  });

  it('uses optimistic versions to prevent concurrent or repeated start from overwriting times', async () => {
    const programId = await legacy();
    const payload = { action: 'start', programId, expectedVersion: 0, actualAt: `${offset(-1)}T08:00:00+08:00` };
    const results = await Promise.all([post(payload), post(payload)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const data = await detail(programId);
    expect(data.program.version).toBe(1);
    expect(data.activity.filter((a: { action: string }) => a.action === 'started')).toHaveLength(1);
  });

  it('keeps timing corrections reasoned and auditable without erasing previous values', async () => {
    const programId = await legacy(offset(-3), 'Completed');
    const payload = { action: 'correct-times', programId, expectedVersion: 0, startedAt: `${offset(-2)}T09:00:00+08:00`, finishedAt: `${offset(-2)}T18:00:00+08:00` };
    expect((await post(payload)).status).toBe(400);
    success(await post({ ...payload, reason: 'Backfilled from the signed paper log.' }));
    success(await post({ ...payload, expectedVersion: 1, finishedAt: `${offset(-2)}T17:30:00+08:00`, reason: 'Corrected against the original closing log.' }));
    const data = await detail(programId);
    expect(data.program.status).toBe('Completed'); expect(data.activity).toHaveLength(2);
    const [event] = await sql()`select before_data,after_data from ekapon.program_workspace_activity where program_record_id=${programId} order by id desc limit 1`;
    expect(event.before_data.finishedAt).not.toBe(event.after_data.finishedAt);
    expect((await post({ ...payload, expectedVersion: 2, finishedAt: undefined, reason: 'Attempt to clear finish' })).status).toBe(422);
  });

  it('records attendance above capacity, excludes voids from canonical totals, and filters embedded stub batches', async () => {
    const first = await create({ date: today, slots: 1 }), second = await create();
    const entry = success(await call('POST', '/api/v1/stub-workflow', { cookie: paravet, json: { action: 'walk-in', campaignId: first.campaignId, requestId: randomUUID(), attendedOn: today, owner: { name: `${tag} Capacity`, barangayId }, pets: ['One', 'Two'].map((name) => ({ name, species: 'Dog', processes: ['Microchipping'], outcome: 'Completed' })) } }));
    expect((await detail(first.programId)).program).toMatchObject({ slots: 1, slotsUsed: 2, ownerVisits: 1 });
    for (const campaignId of [first.campaignId, second.campaignId]) success(await call('POST', '/api/v1/stub-workflow', { cookie: paravet, json: { action: 'request-batch', campaignId, recipientId: paravetId, quantity: 1 } }));
    const scoped = success(await call('GET', `/api/v1/stub-workflow?campaignId=${first.campaignId}`, { cookie: paravet }));
    expect(scoped.programs).toHaveLength(1); expect(scoped.total).toBe(1); expect(scoped.batches.every((b: { campaignId: number }) => b.campaignId === first.campaignId)).toBe(true);
    expect((await call('GET', `/api/v1/stub-workflow?campaignId=${first.campaignId}`, { cookie: other })).status).toBe(404);
    success(await call('POST', '/api/v1/stub-workflow', { cookie: admin, json: { action: 'void-attendance', attendanceId: entry.attendanceId, reason: 'Duplicate paper slip entered in error.' } }));
    expect((await detail(first.programId)).program.slotsUsed).toBe(0);
  });

  it('protects physical stub schedule details while allowing capacity adjustments', async () => {
    const created = await create();
    const batch = success(await call('POST', '/api/v1/stub-workflow', { cookie: paravet, json: { action: 'request-batch', campaignId: created.campaignId, recipientId: paravetId, quantity: 1 } }));
    success(await call('POST', '/api/v1/stub-workflow', { cookie: admin, json: { action: 'review-batch', batchId: batch.batchId, decision: 'approve' } }));
    const data = await detail(created.programId); expect(data.scheduleLocked).toBe(true);
    expect((await post({ action: 'update', programId: created.programId, expectedVersion: 1, schedule: schedule({ title: 'Changed printed title' }) })).status).toBe(409);
    success(await post({ action: 'update', programId: created.programId, expectedVersion: 1, schedule: schedule({ title: data.program.title, date: data.program.date, slots: 100 }) }));
    expect((await detail(created.programId)).program.slots).toBe(100);
    expect((await post({ action: 'update', programId: created.programId, expectedVersion: 1, schedule: schedule({ title: data.program.title, date: data.program.date, slots: 200 }) })).status).toBe(409);
  });

  it('prevents generic edits and archive from bypassing program timing history', async () => {
    const created = await create(); const p = (await detail(created.programId)).program;
    const generic = await call('POST', '/api/v1/records/programs', { cookie: admin, json: { records: [{ ...schedule(), id: p.recordId, barangay, status: 'Completed' }] } });
    expect(generic.status).toBe(409); expect(generic.json.error.code).toBe('PROGRAM_WORKSPACE_MANAGED');
    const archived = await call('POST', '/api/v1/records/programs/archive', { cookie: superAdmin, json: { ids: [p.recordId], archived: true } });
    expect(archived.status).toBe(409);
    expect((await detail(created.programId)).program.status).toBe('Open');
  });
});

describe('duration display', () => {
  it('calculates planned, elapsed and overtime locally without inventing an unrecorded start', () => {
    const p = { date: '2026-10-17', startTime: '08:00', endTime: '16:00', actualStartedAt: null, actualFinishedAt: null };
    expect(timingSummary(p, Date.parse('2026-10-17T17:00:00+08:00'))).toEqual({ plannedMinutes: 480, elapsedMinutes: null, overtimeMinutes: null });
    expect(timingSummary({ ...p, actualStartedAt: '2026-10-17T09:00:00+08:00' }, Date.parse('2026-10-17T17:00:00+08:00'))).toEqual({ plannedMinutes: 480, elapsedMinutes: 480, overtimeMinutes: 60 });
  });
});
