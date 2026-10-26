import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, client, type Resp } from './harness';
import { closeDb, sql } from '../server/db';
import { sessionCookie } from '../server/auth';
import type { AttendancePet, StubOwner, StubPet, StubTicket } from '../shared/stubs';
import { PROGRAM_PROCESSES } from '../shared/programs';

const tag = `Stub${Math.random().toString(36).slice(2, 9)}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dateOffset = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
let call: ReturnType<typeof client>, close: () => Promise<void>;
let admin: string, superAdmin: string, paravet: string, otherParavet: string, resident: string;
let adminId: number, paravetId: number, otherParavetId: number;
let barangayId: number, otherBarangayId: number, thirdBarangayId: number;
let barangayName: string;
let campaignId: number;
const accounts: number[] = [], campaigns: number[] = [], programRecords: string[] = [];
let sequence = 0;
const owner = (name = `${tag} Owner ${++sequence}`, residence = barangayId): StubOwner => ({ name, mobile: '09171234567', address: `${tag} assessment address`, barangayId: residence });
const pet = (name = `${tag} Pet ${++sequence}`, processes: StubPet['processes'] = ['Microchipping']): StubPet => ({ name, species: 'Dog', sex: 'Female', ageMonths: 24, processes });
const attended = (pets: StubPet[], outcome: AttendancePet['outcome'] = 'Completed'): AttendancePet[] => pets.map((entry) => ({ ...entry, outcome }));
const cookieFor = async (id: number, type: string) => (await sessionCookie({ id, type }, 'full')).split(';')[0];
const success = (response: Resp) => { expect(response.status, JSON.stringify(response.json)).toBe(200); return response.json; };
const post = (json: unknown, cookie = admin) => call('POST', '/api/v1/stub-workflow', { cookie, json });
const lookup = (code: string, cookie = paravet) => call('GET', `/api/v1/stub-workflow?mode=lookup&code=${encodeURIComponent(code)}`, { cookie });

async function createProgram(date: string, status = 'Open', closed = false) {
  const id = `${tag}-program-${++sequence}`;
  programRecords.push(id);
  const record = { id, title: `${tag} Barangay program ${sequence}`, date, status, location: `${tag} covered court`, barangay: barangayName, barangayId, processes: [...PROGRAM_PROCESSES], slots: 100, startTime: '08:00', endTime: '12:00' };
  const [program] = await sql()`insert into ekapon.dashboard_records (dataset, record_id, record_data)
    values ('programs', ${id}, ${sql().json(record)}) returning id`;
  const [campaign] = await sql()`insert into ekapon.program_interest_campaigns
    (reference, campaign_type, host_barangay_id, program_record_id, processes, status, created_by)
    values (${`${tag}-campaign-${sequence}`}, 'program_day', ${barangayId}, ${program.id}, ${[...PROGRAM_PROCESSES]}, ${closed ? 'closed' : 'scheduled'}, ${adminId}) returning id`;
  campaigns.push(campaign.id);
  return campaign.id as number;
}

async function requestBatch(quantity = 3, programId = campaignId) {
  const result = success(await post({ action: 'request-batch', campaignId: programId, quantity, recipientId: paravetId, note: 'Assessed residents need physical stubs.' }, paravet));
  expect(result.batchId).toEqual(expect.any(Number));
  return result.batchId as number;
}

async function handedBatch(quantity = 3, programId = campaignId) {
  const batchId = await requestBatch(quantity, programId);
  success(await post({ action: 'review-batch', batchId, decision: 'approve', quantity }));
  // Stubs print only for a barangay with requested (or encoded) owners.
  await sql()`insert into ekapon.program_interest_people (campaign_id, owner_name, residence_barangay_id, pets, created_by) values (${programId}, ${`${tag} Requested ${++sequence}`}, ${barangayId}, '[]'::jsonb, ${paravetId})`;
  success(await post({ action: 'confirm-print', batchId }));
  success(await post({ action: 'handover', batchId }));
  const details = success(await call('GET', `/api/v1/stub-workflow?mode=batch&batchId=${batchId}`, { cookie: paravet }));
  return { batchId, stubs: details.stubs as StubTicket[] };
}

async function expectSlotProjections(programId = campaignId) {
  const [canonical] = await sql()`select coalesce(sum(jsonb_array_length(pets_snapshot)),0)::int as slots
    from ekapon.program_attendance where campaign_id=${programId} and status='Submitted'`;
  const interestDetails = success(await call('GET', `/api/v1/program-interest?id=${programId}`, { cookie: admin }));
  expect(interestDetails.campaign.programSlotsUsed).toBe(canonical.slots);
  const interestList = success(await call('GET', '/api/v1/program-interest', { cookie: admin }));
  expect(interestList.campaigns.find((campaign: { id: number }) => campaign.id === programId)?.programSlotsUsed).toBe(canonical.slots);
  expect(interestList.programs.find((program: { campaignId: number }) => program.campaignId === programId)?.slotsUsed).toBe(canonical.slots);
  const [linked] = await sql()`select d.record_id from ekapon.program_interest_campaigns c
    join ekapon.dashboard_records d on d.id=c.program_record_id where c.id=${programId}`;
  const programs = success(await call('GET', `/api/v1/records/programs?q=${encodeURIComponent(linked.record_id)}`, { cookie: admin }));
  expect(programs.data.find((program: { id: string }) => program.id === linked.record_id)?._attendanceSlotsUsed).toBe(canonical.slots);
}

beforeAll(async () => {
  const server = await startServer(); call = client(server.base); close = server.close;
  const barangays = await sql()`select id, name from ekapon.barangays order by id limit 3`;
  [barangayId, otherBarangayId, thirdBarangayId] = barangays.map((entry) => entry.id);
  barangayName = barangays[0].name;
  const rows = await sql()`insert into ekapon.accounts (username, account_type, first_name, last_name, barangay_id)
    values (${`${tag}admin`}, 'Admin', ${tag}, 'Admin', null),
           (${`${tag}super`}, 'SuperAdmin', ${tag}, 'Super', null),
           (null, 'Paravet', ${tag}, 'Field', ${barangayId}),
           (null, 'Paravet', ${tag}, 'Other', ${otherBarangayId}),
           (null, 'User', ${tag}, 'Resident', ${barangayId}) returning id, account_type::text as type, last_name`;
  accounts.push(...rows.map((row) => row.id));
  adminId = rows.find((row) => row.last_name === 'Admin')!.id;
  paravetId = rows.find((row) => row.last_name === 'Field')!.id;
  otherParavetId = rows.find((row) => row.last_name === 'Other')!.id;
  admin = await cookieFor(adminId, 'Admin');
  superAdmin = await cookieFor(rows.find((row) => row.last_name === 'Super')!.id, 'SuperAdmin');
  paravet = await cookieFor(paravetId, 'Paravet');
  otherParavet = await cookieFor(otherParavetId, 'Paravet');
  resident = await cookieFor(rows.find((row) => row.type === 'User')!.id, 'User');
  campaignId = await createProgram(today);
});

afterAll(async () => {
  if (campaigns.length) {
    const attendance = await sql()`select id::text as id from ekapon.program_attendance where campaign_id = any(${campaigns})`;
    if (attendance.length) await sql()`delete from ekapon.dashboard_records where record_data->>'workflow' = 'qr-stubs-v1'
      and record_data->>'attendanceId' = any(${attendance.map((row) => row.id)})`;
    await sql()`delete from ekapon.stub_activity where campaign_id = any(${campaigns})`;
    await sql()`delete from ekapon.program_attendance where campaign_id = any(${campaigns})`;
    await sql()`delete from ekapon.stub_tickets where batch_id in (select id from ekapon.stub_batches where campaign_id = any(${campaigns}))`;
    await sql()`delete from ekapon.stub_batches where campaign_id = any(${campaigns})`;
    await sql()`delete from ekapon.program_interest_people where campaign_id = any(${campaigns})`;
    await sql()`delete from ekapon.program_interest_activity where campaign_id = any(${campaigns})`;
    await sql()`delete from ekapon.program_interest_allowed_barangays where campaign_id = any(${campaigns})`;
    await sql()`delete from ekapon.program_interest_campaigns where id = any(${campaigns})`;
  }
  if (programRecords.length) await sql()`delete from ekapon.dashboard_records where dataset = 'programs' and record_id = any(${programRecords})`;
  if (accounts.length) await sql()`delete from ekapon.accounts where id = any(${accounts})`;
  if (close) await close();
  await closeDb();
});

describe('staff QR inventory and paper handover', () => {
  it('requires an active staff session and scopes program requests to the assigned barangay', async () => {
    expect((await call('GET', '/api/v1/stub-workflow')).status).toBe(401);
    expect((await call('GET', '/api/v1/stub-workflow', { cookie: resident })).status).toBe(401);
    const own = success(await call('GET', '/api/v1/stub-workflow', { cookie: paravet }));
    expect(own.programs).toEqual(expect.arrayContaining([expect.objectContaining({ id: campaignId })]));
    const outside = success(await call('GET', '/api/v1/stub-workflow', { cookie: otherParavet }));
    expect(outside.programs.some((program: { id: number }) => program.id === campaignId)).toBe(false);
    expect((await post({ action: 'request-batch', campaignId, recipientId: paravetId, quantity: 2 }, otherParavet)).status).toBe(404);
    expect((await post({ action: 'request-batch', campaignId, recipientId: otherParavetId, quantity: 2 }, paravet)).status).toBe(403);
    const [before] = await sql()`select count(*)::int as count from ekapon.stub_tickets t join ekapon.stub_batches b on b.id=t.batch_id where b.campaign_id=${campaignId}`;
    await sql()`insert into ekapon.program_interest_people (campaign_id, owner_name, mobile, residence_barangay_id, pets, created_by)
      values (${campaignId}, ${`${tag} Interest only`}, '0917-123-4567', ${barangayId}, '[]'::jsonb, ${paravetId})`;
    const [after] = await sql()`select count(*)::int as count from ekapon.stub_tickets t join ekapon.stub_batches b on b.id=t.batch_id where b.campaign_id=${campaignId}`;
    expect(after.count).toBe(before.count);
  });

  it('generates approved inventory and allows Paravet assignment/printing without mandatory handover', async () => {
    const batchId = await requestBatch(4);
    let details = success(await call('GET', `/api/v1/stub-workflow?mode=batch&batchId=${batchId}`, { cookie: paravet }));
    expect(details.batch.status).toBe('Requested'); expect(details.stubs).toEqual([]);
    expect((await post({ action: 'review-batch', batchId, decision: 'approve', quantity: 3 }, paravet)).status).toBe(403);
    success(await post({ action: 'review-batch', batchId, decision: 'approve', quantity: 3 }));
    details = success(await call('GET', `/api/v1/stub-workflow?mode=batch&batchId=${batchId}`, { cookie: paravet }));
    expect(details.batch).toMatchObject({ requestedQuantity: 4, approvedQuantity: 3, status: 'Approved' });
    expect(details.stubs).toHaveLength(3);
    expect(new Set(details.stubs.map((stub: StubTicket) => stub.code)).size).toBe(3);
    for (const stub of details.stubs) expect(stub.code).toMatch(/^CVS1\.[A-Za-z0-9_-]{22}$/);
    expect((await post({ action: 'handover', batchId })).status).toBe(409);
    expect((await post({ action: 'issue', stubId: details.stubs[0].id, owner: owner(), pets: [pet()] }, paravet)).status).toBe(200);
    expect((await post({ action: 'redeem', stubId: details.stubs[1].id, requestId: randomUUID(), attendedOn: today, owner: owner(), pets: attended([pet()]) }, paravet)).status).toBe(200);
    expect((await call('GET', `/api/v1/stub-workflow?mode=print&batchId=${batchId}`, { cookie: paravet })).status).toBe(200);
    const printable = success(await call('GET', `/api/v1/stub-workflow?mode=print&batchId=${batchId}`, { cookie: admin }));
    expect(printable.program).toMatchObject({ id: campaignId, date: today, location: `${tag} covered court` });
    expect(printable.stubs).toHaveLength(2);
    expect(JSON.stringify(printable)).not.toMatch(/"(?:owner|pets|mobile|address|owner_snapshot|pets_snapshot)"\s*:/);
    expect(printable.stubs.every((stub: Record<string, unknown>) => Object.keys(stub).sort().join(',') === 'code,id,ownerConfirmedAt,ownerName,services,status')).toBe(true);
    success(await post({ action: 'confirm-print', batchId })); success(await post({ action: 'handover', batchId }));
    const printedAgain = success(await call('GET', `/api/v1/stub-workflow?mode=print&batchId=${batchId}`, { cookie: superAdmin }));
    expect(printedAgain.stubs).toEqual(printable.stubs);
    const [inventory] = await sql()`select count(*)::int as count from ekapon.stub_tickets where batch_id=${batchId}`;
    expect(inventory.count).toBe(3);
  });

  it('issues one owner and up to three pets after assessment and protects their details from other barangays', async () => {
    const { batchId, stubs } = await handedBatch();
    const family = owner(); const pets = [pet(), pet(), pet()];
    expect((await post({ action: 'issue', stubId: stubs[0].id, owner: family, pets: [...pets, pet()] }, paravet)).status).toBe(400);
    expect((await post({ action: 'issue', stubId: stubs[0].id, owner: family, pets: [] }, paravet)).status).toBe(400);
    expect((await post({ action: 'issue', stubId: stubs[0].id, owner: owner(undefined, thirdBarangayId), pets }, paravet)).status).toBeGreaterThanOrEqual(400);
    success(await post({ action: 'issue', stubId: stubs[0].id, owner: family, pets }, paravet));
    const issued = success(await lookup(stubs[0].code));
    expect(issued.stub).toMatchObject({ status: 'Issued', owner: family, pets });
    const printAfterIssue = success(await call('GET', `/api/v1/stub-workflow?mode=print&batchId=${batchId}`, { cookie: admin }));
    expect(JSON.stringify(printAfterIssue)).toContain(family.name);
    expect(JSON.stringify(printAfterIssue)).not.toContain(family.address);
    expect(JSON.stringify(printAfterIssue)).not.toContain(pets[0].name);
    const search = success(await call('GET', `/api/v1/stub-workflow?mode=issued&campaignId=${campaignId}&q=${encodeURIComponent(family.name)}`, { cookie: paravet }));
    expect(JSON.stringify(search)).toContain(stubs[0].code);
    await sql()`insert into ekapon.program_interest_allowed_barangays (campaign_id,barangay_id,added_by) values (${campaignId},${otherBarangayId},${adminId})`;
    expect((await lookup(stubs[0].code, otherParavet)).status).toBe(404);
    expect((await call('GET', `/api/v1/stub-workflow?mode=batch&batchId=${batchId}`, { cookie: otherParavet })).status).toBe(404);
    expect((await post({ action: 'issue', stubId: stubs[1].id, owner: owner(undefined, otherBarangayId), pets: [pet()] }, otherParavet)).status).toBe(404);
    expect((await post({ action: 'issue', stubId: stubs[1].id, owner: owner(undefined, otherBarangayId), pets: [pet()] }, paravet)).status).toBe(403);
    const otherBatch = success(await post({ action: 'request-batch', campaignId, recipientId: otherParavetId, quantity: 1 }));
    success(await post({ action: 'review-batch', batchId: otherBatch.batchId, decision: 'approve' }));
    await sql()`insert into ekapon.program_interest_people (campaign_id, owner_name, residence_barangay_id, pets, created_by) values (${campaignId}, ${`${tag} Other requested`}, ${otherBarangayId}, '[]'::jsonb, ${otherParavetId})`;
    success(await post({ action: 'confirm-print', batchId: otherBatch.batchId }));
    success(await post({ action: 'handover', batchId: otherBatch.batchId }));
    const otherInventory = success(await call('GET', `/api/v1/stub-workflow?mode=batch&batchId=${otherBatch.batchId}`, { cookie: otherParavet }));
    const otherOwner = owner(undefined, otherBarangayId); const otherPets = [pet()];
    success(await post({ action: 'issue', stubId: otherInventory.stubs[0].id, owner: otherOwner, pets: otherPets }, otherParavet));
    const otherAttendance = success(await post({ action: 'redeem', stubId: otherInventory.stubs[0].id, requestId: randomUUID(), attendedOn: today, owner: otherOwner, pets: attended(otherPets) }, otherParavet));
    const otherAttendancePage = success(await call('GET', `/api/v1/stub-workflow?mode=attendance&campaignId=${campaignId}`, { cookie: otherParavet }));
    expect(otherAttendancePage.data).toEqual([expect.objectContaining({ id: otherAttendance.attendanceId, owner: otherOwner })]);
    expect((await lookup(otherInventory.stubs[0].code, paravet)).status).toBe(404);
    await sql()`delete from ekapon.program_interest_allowed_barangays where campaign_id=${campaignId} and barangay_id=${otherBarangayId}`;
    expect((await post({ action: 'cancel-stub', stubId: stubs[1].id, reason: 'Paper was damaged before assessment.' }, paravet)).status).toBe(403);
    success(await post({ action: 'cancel-stub', stubId: stubs[1].id, reason: 'Paper was damaged before assessment.' }, admin));
    expect((await lookup(stubs[1].code)).json.stub.status).toBe('Cancelled');
    expect((await post({ action: 'issue', stubId: stubs[1].id, owner: owner(), pets: [pet()] }, paravet)).status).toBe(409);
  });

  it('prints only for a barangay with requested or encoded owners, and counts encoded stubs not yet scanned', async () => {
    const programId = await createProgram(dateOffset(5));
    const batchId = await requestBatch(2, programId);
    success(await post({ action: 'review-batch', batchId, decision: 'approve', quantity: 2 }));
    expect(success(await call('GET', `/api/v1/stub-workflow?mode=print&batchId=${batchId}`, { cookie: paravet })).requestedOwners).toBe(0);
    expect((await post({ action: 'confirm-print', batchId })).json.error.code).toBe('NO_OWNERS');
    const { stubs } = success(await call('GET', `/api/v1/stub-workflow?mode=batch&batchId=${batchId}`, { cookie: paravet }));
    success(await post({ action: 'issue', stubId: stubs[0].id, owner: owner(), pets: [pet()] }, paravet));
    success(await post({ action: 'confirm-print', batchId }));
    const pack = success(await call('GET', `/api/v1/stub-workflow?mode=day-pack&campaignId=${programId}`, { cookie: paravet }));
    expect(pack.stubs.find((stub: { id: number }) => stub.id === stubs[0].id)).toMatchObject({ batchId, status: 'Issued' });
    const attendance = success(await call('GET', `/api/v1/stub-workflow?mode=attendance&campaignId=${programId}`, { cookie: paravet }));
    expect(attendance.summary.notScanned).toBe(1);
  });
});

describe('attendance encoding and integrity', () => {
  it('accepts assessed physical stubs with no prior computer issuance and records issuance and attendance atomically', async () => {
    const { stubs } = await handedBatch(1); const stub = stubs[0]; const family = owner(); const pets = [pet(), pet(), pet()];
    expect(success(await lookup(stub.code)).stub.status).toBe('Available');
    expect((await post({ action: 'redeem', stubId: stub.id, requestId: randomUUID(), attendedOn: today, owner: family, pets: attended([...pets, pet()]) }, paravet)).status).toBe(400);
    expect(success(await lookup(stub.code)).stub.status).toBe('Available');
    const saved = success(await post({ action: 'redeem', stubId: stub.id, requestId: randomUUID(), attendedOn: today, owner: family, pets: attended(pets) }, paravet));
    const consumed = success(await lookup(stub.code));
    expect(consumed.stub).toMatchObject({ status: 'Redeemed', owner: family, pets, issuedAt: expect.any(String), redeemedAt: expect.any(String) });
    const [attendance] = await sql()`select source,stub_id,owner_snapshot,pets_snapshot from ekapon.program_attendance where id=${saved.attendanceId}`;
    expect(attendance).toMatchObject({ source: 'Stub', stub_id: stub.id, owner_snapshot: family, pets_snapshot: attended(pets) });
    expect((await post({ action: 'redeem', stubId: stub.id, requestId: randomUUID(), attendedOn: today, owner: family, pets: attended(pets) }, paravet)).status).toBe(409);
  });

  it('keeps scans read only and atomically consumes a QR once, including concurrent submissions and retries', async () => {
    const { stubs } = await handedBatch(1); const stub = stubs[0];
    const family = owner(); const pets = [pet(undefined, [...PROGRAM_PROCESSES]), pet()];
    success(await post({ action: 'issue', stubId: stub.id, owner: family, pets }, paravet));
    expect(success(await lookup(stub.code)).stub.status).toBe('Issued');
    expect(success(await lookup(stub.code)).stub.status).toBe('Issued');
    const payload = { action: 'redeem', stubId: stub.id, attendedOn: today, owner: family, pets: [{ ...pets[0], outcome: 'Completed' }, { ...pets[1], outcome: 'Deferred' }] };
    expect((await post({ ...payload, requestId: randomUUID(), owner: { ...family, name: `${family.name} substitute` } }, paravet)).status).toBe(422);
    expect((await post({ ...payload, requestId: randomUUID(), pets: [{ ...payload.pets[0], name: 'A different pet' }, payload.pets[1]] }, paravet)).status).toBe(422);
    expect(success(await lookup(stub.code)).stub.status).toBe('Issued');
    const beforeAnalytics = success(await call('GET', `/api/v1/analytics?source=live&year=${today.slice(0, 4)}`, { cookie: admin }));
    const requests = [{ ...payload, requestId: randomUUID() }, { ...payload, requestId: randomUUID() }];
    const responses = await Promise.all(requests.map((entry) => post(entry, paravet)));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex((response) => response.status === 200);
    const saved = responses[winner].json;
    const replayed = success(await post(requests[winner], paravet));
    expect(replayed.attendanceId).toBe(saved.attendanceId); expect(replayed.replayed).toBe(true);
    expect((await post({ ...requests[winner], owner: { ...family, address: 'Changed payload with reused request ID' } }, paravet)).status).toBe(409);
    expect(success(await lookup(stub.code)).stub.status).toBe('Redeemed');
    const [rows] = await sql()`select count(*)::int as count from ekapon.program_attendance where stub_id=${stub.id}`;
    expect(rows.count).toBe(1);
    const mirrors = await sql()`select dataset, record_data from ekapon.dashboard_records where record_data->>'workflow'='qr-stubs-v1' and record_data->>'attendanceId'=${String(saved.attendanceId)}`;
    expect(mirrors.filter((row) => row.dataset === 'participants')).toHaveLength(2);
    expect(mirrors.filter((row) => row.dataset === 'services')).toHaveLength(3);
    expect(mirrors.filter((row) => row.dataset === 'services').every((row) => row.record_data.status === 'Completed')).toBe(true);
    const afterAnalytics = success(await call('GET', `/api/v1/analytics?source=live&year=${today.slice(0, 4)}`, { cookie: admin }));
    expect(afterAnalytics.comparison.spayNeuterServices.current).toBe(beforeAnalytics.comparison.spayNeuterServices.current + 1);
    expect(afterAnalytics.comparison.antiRabiesServices.current).toBe(beforeAnalytics.comparison.antiRabiesServices.current + 1);
    await expectSlotProjections();
    for (const dataset of ['participants', 'services']) {
      const mirror = mirrors.find((row) => row.dataset === dataset)!;
      const edited = { ...mirror.record_data, owner: 'Attempted generic edit' };
      delete edited.workflow;
      const edit = await call('POST', `/api/v1/records/${dataset}`, { cookie: admin, json: { records: [edited] } });
      expect(edit.status).toBe(409); expect(edit.json.error.code).toBe('WORKFLOW_RECORD_MANAGED');
      const imported = await call('POST', `/api/v1/records/${dataset}/import`, { cookie: admin, json: { batchId: randomUUID(), label: `${tag} managed record import`, records: [edited] } });
      expect(imported.status).toBe(409); expect(imported.json.error.code).toBe('WORKFLOW_RECORD_MANAGED');
      const archived = await call('POST', `/api/v1/records/${dataset}/archive`, { cookie: admin, json: { ids: [mirror.record_data.id], archived: true } });
      expect(archived.status).toBe(409); expect(archived.json.error.code).toBe('WORKFLOW_RECORD_MANAGED');
      const [untouched] = await sql()`select record_data,archived from ekapon.dashboard_records where dataset=${dataset} and record_id=${String(mirror.record_data.id)}`;
      expect(untouched).toMatchObject({ record_data: mirror.record_data, archived: false });
    }
    expect((await post({ action: 'cancel-stub', stubId: stub.id, reason: 'Cannot reuse completed QR.' }, admin)).status).toBe(409);
  });

  it('records mixed outcomes per process without counting deferred work as a completed service', async () => {
    const beforeAttendance = success(await call('GET', `/api/v1/stub-workflow?mode=attendance&campaignId=${campaignId}`, { cookie: paravet }));
    const beforeAnalytics = success(await call('GET', `/api/v1/analytics?source=live&year=${today.slice(0, 4)}`, { cookie: admin }));
    const family = owner();
    const mixed: AttendancePet = { ...pet(undefined, ['Microchipping', 'Neuter/Spay']), outcome: 'Deferred', processOutcomes: { Microchipping: 'Completed', 'Neuter/Spay': 'Deferred' } };
    const saved = success(await post({ action: 'walk-in', campaignId, requestId: randomUUID(), attendedOn: today, owner: family, pets: [mixed] }, paravet));
    const [attendance] = await sql()`select pets_snapshot from ekapon.program_attendance where id=${saved.attendanceId}`;
    expect(attendance.pets_snapshot).toEqual([mixed]);
    const mirrors = await sql()`select dataset,record_data from ekapon.dashboard_records
      where record_data->>'workflow'='qr-stubs-v1' and record_data->>'attendanceId'=${String(saved.attendanceId)}`;
    expect(mirrors.filter((row) => row.dataset === 'participants')).toHaveLength(1);
    expect(mirrors.find((row) => row.dataset === 'participants')!.record_data).toMatchObject({ status: 'Partially completed', processOutcomes: mixed.processOutcomes });
    const services = mirrors.filter((row) => row.dataset === 'services');
    expect(services).toHaveLength(1); expect(services[0].record_data).toMatchObject({ service: 'Microchipping', status: 'Completed' });
    const afterAttendance = success(await call('GET', `/api/v1/stub-workflow?mode=attendance&campaignId=${campaignId}`, { cookie: paravet }));
    expect(afterAttendance.summary.completedServices).toBe(beforeAttendance.summary.completedServices + 1);
    const afterAnalytics = success(await call('GET', `/api/v1/analytics?source=live&year=${today.slice(0, 4)}`, { cookie: admin }));
    expect(afterAnalytics.comparison.spayNeuterServices.current).toBe(beforeAnalytics.comparison.spayNeuterServices.current);
  });

  it('allows multiple stubs per owner and repeat participation across programs, while flagging same-program duplicate services', async () => {
    const { stubs } = await handedBatch(2); const family = owner(); const firstPet = pet(); const otherPet = pet();
    for (const [index, participant] of [firstPet, otherPet].entries()) {
      success(await post({ action: 'issue', stubId: stubs[index].id, owner: family, pets: [participant] }, paravet));
      success(await post({ action: 'redeem', stubId: stubs[index].id, requestId: randomUUID(), attendedOn: today, owner: family, pets: attended([participant]) }, paravet));
    }
    const repeated = { action: 'walk-in', campaignId, requestId: randomUUID(), attendedOn: today, owner: family, pets: attended([firstPet]) };
    const duplicate = await post(repeated, paravet); expect(duplicate.status).toBe(409); expect(duplicate.json.error.code).toBe('DUPLICATE_ATTENDANCE');
    expect((await post({ ...repeated, confirmDuplicate: true }, paravet)).status).toBeGreaterThanOrEqual(400);
    success(await post({ ...repeated, confirmDuplicate: true, duplicateReason: 'Supervisor reviewed distinct service paperwork.' }, paravet));
    const otherProgram = await createProgram(dateOffset(-1), 'Completed');
    success(await post({ action: 'walk-in', campaignId: otherProgram, requestId: randomUUID(), attendedOn: today, owner: family, pets: attended([firstPet]) }, paravet));
  });

  it('validates actual dates and eligible processes, supports larger walk-in households, and scopes attendance details', async () => {
    const family = owner(); const pets = Array.from({ length: 4 }, () => pet());
    const payload = { action: 'walk-in', campaignId, requestId: randomUUID(), attendedOn: today, owner: family, pets: attended(pets) };
    expect((await post({ ...payload, attendedOn: dateOffset(1) }, paravet)).status).toBe(422);
    expect((await post({ ...payload, attendedOn: dateOffset(-1) }, paravet)).status).toBe(422);
    expect((await post({ ...payload, attendedOn: '2026-02-30' }, paravet)).status).toBeGreaterThanOrEqual(400);
    expect((await post({ ...payload, pets: [...attended(pets), ...attended(Array.from({ length: 7 }, () => pet()))] }, paravet)).status).toBe(400);
    const samePet = pet();
    const duplicatePet = await post({ ...payload, pets: [{ ...samePet, outcome: 'Completed' }, { ...samePet, sex: undefined, outcome: 'Completed' }] }, paravet);
    expect(duplicatePet.status).toBe(422); expect(duplicatePet.json.error.code).toBe('DUPLICATE_PET_IN_ENTRY');
    const saved = success(await post(payload, paravet));
    const page = success(await call('GET', `/api/v1/stub-workflow?mode=attendance&campaignId=${campaignId}&pageSize=100`, { cookie: paravet }));
    expect(page.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: saved.attendanceId, source: 'Walk-in', owner: family, pets: attended(pets) })]));
    expect(page.summary.owners).toBeGreaterThanOrEqual(1); expect(page.summary.pets).toBeGreaterThanOrEqual(4);
    expect((await call('GET', `/api/v1/stub-workflow?mode=attendance&campaignId=${campaignId}`, { cookie: otherParavet })).status).toBe(404);
    const futureProgram = await createProgram(dateOffset(1), 'Planned');
    const futureBatch = await handedBatch(2, futureProgram);
    success(await post({ action: 'issue', stubId: futureBatch.stubs[0].id, owner: owner(), pets: [pet()] }, paravet));
    expect((await post({ ...payload, campaignId: futureProgram, requestId: randomUUID(), attendedOn: today }, paravet)).status).toBe(422);
    await sql()`update ekapon.dashboard_records set record_data=jsonb_set(record_data,'{processes}','["Microchipping"]'::jsonb)
      where id=(select program_record_id from ekapon.program_interest_campaigns where id=${futureProgram})`;
    const invalidProcess = await post({ action: 'issue', stubId: futureBatch.stubs[1].id, owner: owner(), pets: [pet(undefined, ['Neuter/Spay'])] }, paravet);
    expect(invalidProcess.status).toBe(422); expect(invalidProcess.json.error.code).toBe('PROCESS_NOT_OFFERED');
  });

  it('requires Admin correction reasons after closure and preserves consumed stubs and snapshots when attendance is voided', async () => {
    const { stubs } = await handedBatch(1); const stub = stubs[0]; const family = owner(); const pets = [pet()];
    success(await post({ action: 'issue', stubId: stub.id, owner: family, pets }, paravet));
    const saved = success(await post({ action: 'redeem', stubId: stub.id, requestId: randomUUID(), attendedOn: today, owner: family, pets: attended(pets) }, paravet));
    expect((await post({ action: 'void-attendance', attendanceId: saved.attendanceId, reason: 'Correcting an encoding mistake.' }, paravet)).status).toBe(403);
    success(await post({ action: 'void-attendance', attendanceId: saved.attendanceId, reason: 'Correcting an encoding mistake.' }, superAdmin));
    const [record] = await sql()`select status,owner_snapshot,pets_snapshot,void_reason from ekapon.program_attendance where id=${saved.attendanceId}`;
    expect(record).toMatchObject({ status: 'Voided', owner_snapshot: family, pets_snapshot: attended(pets), void_reason: 'Correcting an encoding mistake.' });
    expect(success(await lookup(stub.code)).stub.status).toBe('Redeemed');
    expect((await post({ action: 'redeem', stubId: stub.id, requestId: randomUUID(), attendedOn: today, owner: family, pets: attended(pets) }, paravet)).status).toBe(409);
    const mirrors = await sql()`select archived from ekapon.dashboard_records where record_data->>'workflow'='qr-stubs-v1' and record_data->>'attendanceId'=${String(saved.attendanceId)}`;
    expect(mirrors.length).toBeGreaterThan(0); expect(mirrors.every((row) => row.archived)).toBe(true);
    await expectSlotProjections();
    await sql()`update ekapon.program_interest_campaigns set status='closed',closed_at=now() where id=${campaignId}`;
    try {
      const late = { action: 'walk-in', campaignId, requestId: randomUUID(), attendedOn: today, owner: owner(), pets: attended([pet()]) };
      expect((await post(late, paravet)).status).toBe(403);
      expect((await post(late, admin)).status).toBe(422);
      success(await post({ ...late, lateEntryReason: 'Encoding signed paper attendance after program close.' }, admin));
    } finally {
      await sql()`update ekapon.program_interest_campaigns set status='scheduled',closed_at=null where id=${campaignId}`;
    }
  });
});
