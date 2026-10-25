import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, startServer } from './harness';
import { closeDb, sql } from '../server/db';
import { sessionCookie } from '../server/auth';
import { approvalToken, reviewedMatch } from './census-review-helpers';

const tag = `T${Math.random().toString(36).slice(2, 7)}`;
let call: ReturnType<typeof client>, close: () => Promise<void>;
let superAdmin: string, admin: string, paravetA: string, paravetB: string;
let brgA: { id: number; name: string }, brgB: { id: number; name: string };
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

const cookieFor = async (id: number, type: string) => (await sessionCookie({ id, type }, 'full')).split(';')[0];
const pet = (name: string, extra: Record<string, unknown> = {}) => ({ petName: name, species: 'Dog', sex: 'Male', ...extra });
const owner = (name: string, pets: unknown[], extra: Record<string, unknown> = {}) => ({ ownerName: `${name} ${tag}`, address: 'Purok 1', pets, ...extra });
const body = (owners: unknown[], extra: Record<string, unknown> = {}) => ({ label: `Census ${tag}`, censusDate: today, source: 'form', householdsVisited: 30, owners, ...extra });

beforeAll(async () => {
  const s = await startServer(); close = s.close; call = client(s.base);
  const [a, b] = await sql()`select id, name::text as name from ekapon.barangays order by id limit 2`;
  brgA = { id: a.id, name: a.name }; brgB = { id: b.id, name: b.name };
  const made: number[] = [];
  for (const [first, barangay] of [['A', brgA.id], ['B', brgB.id]] as const) {
    const [row] = await sql()`
      insert into ekapon.accounts (account_type, first_name, last_name, barangay_id)
      values ('Paravet', ${first}, ${tag}, ${barangay}) returning id`;
    made.push(row.id);
  }
  const staff = await sql()`select id, username::text as username from ekapon.accounts where username in ('admin', 'encoder')`;
  superAdmin = await cookieFor(staff.find((x) => x.username === 'admin')!.id, 'SuperAdmin');
  admin = await cookieFor(staff.find((x) => x.username === 'encoder')!.id, 'Admin');
  paravetA = await cookieFor(made[0], 'Paravet');
  paravetB = await cookieFor(made[1], 'Paravet');
});

afterAll(async () => {
  await sql()`delete from ekapon.census_submissions where submitter_name like ${`% ${tag}`}`;
  await sql()`delete from ekapon.registry_owners where owner_name like ${`% ${tag}`}`;
  await sql()`delete from ekapon.accounts where last_name = ${tag}`;
  await close(); await closeDb();
});

describe('census submissions', () => {
  let id: string;

  it('lets only a Paravet submit, in their own barangay, and validates the sheet', async () => {
    expect((await call('POST', '/api/v1/census/submissions', { cookie: admin, json: body([owner('X', [pet('Rex')])]) })).status).toBe(403);
    expect((await call('POST', '/api/v1/census/submissions', { cookie: paravetA, json: body([]) })).status).toBe(400);
    expect((await call('POST', '/api/v1/census/submissions', { cookie: paravetA, json: body([owner('X', [pet('Rex')])], { censusDate: '2999-01-01' }) })).status).toBe(400);
    expect((await call('POST', '/api/v1/census/submissions', { cookie: paravetA, json: body([owner('X', [pet('Rex')], { contact: '123' })]) })).status).toBe(400);
    expect((await call('POST', '/api/v1/census/submissions', { cookie: paravetA, json: body([owner('X', [])]) })).status).toBe(400);

    const r = await call('POST', '/api/v1/census/submissions', {
      cookie: paravetA,
      json: body([
        owner('Juan', [pet('Bantay', { sterilized: true, confinement: 'Confined', booster: true, registeredYear: 2026 }), pet('Mingming', { species: 'Cat', sex: 'Female', laps: true, confinement: 'Free-roaming' })], { contact: '0917-123-4567' }),
        owner('Maria', [pet('Brownie', { sex: 'Female', ageMonths: 18, breedType: 'Mongrel', vaccine1st: true })]),
      ]),
    });
    expect(r.status).toBe(201);
    id = r.json.submission.id;
    expect(r.json.submission).toMatchObject({ status: 'pending', barangay: brgA.name, ownerCount: 2, petCount: 3, householdsVisited: 30 });
  });

  it('keeps submissions private to their Paravet and visible to staff', async () => {
    expect((await call('GET', `/api/v1/census/submissions/${id}`, { cookie: paravetB })).status).toBe(404);
    const own = await call('GET', '/api/v1/census/submissions?status=pending', { cookie: paravetA });
    expect(own.json.data.some((s: any) => s.id === id)).toBe(true);
    expect((await call('GET', '/api/v1/census/submissions?status=all', { cookie: paravetB })).json.data.some((s: any) => s.id === id)).toBe(false);
    const staff = await call('GET', '/api/v1/census/submissions?status=pending', { cookie: admin });
    expect(staff.json.data.some((s: any) => s.id === id)).toBe(true);
    const detail = await call('GET', `/api/v1/census/submissions/${id}`, { cookie: admin });
    expect(detail.json.owners).toHaveLength(2);
    expect(detail.json.owners[0].pets).toHaveLength(2);
  });

  it('returns the first submission when Salin resends the same requestId', async () => {
    const requestId = crypto.randomUUID();
    const first = await call('POST', '/api/v1/census/submissions', { cookie: paravetA, json: body([owner('Resend', [pet('Rex')])], { requestId }) });
    const again = await call('POST', '/api/v1/census/submissions', { cookie: paravetA, json: body([owner('Resend', [pet('Rex')])], { requestId }) });
    expect(again.json.submission.id).toBe(first.json.submission.id);
    const [{ n }] = await sql()`select count(*)::int as n from ekapon.census_submissions where request_id = ${requestId}::uuid`;
    expect(n).toBe(1);
    expect((await call('POST', '/api/v1/census/submissions', { cookie: paravetB, json: body([owner('Resend', [pet('Rex')])], { requestId }) })).json.error.code).toBe('REQUEST_ID_REUSED');
  });

  it('notifies staff when a census is submitted', async () => {
    const [{ n }] = await sql()`select count(*)::int as n from ekapon.notifications where kind = 'census' and body like ${`%Census ${tag}%`}`;
    expect(n).toBeGreaterThan(0);
  });

  it('refuses approval until every owner has a decision, then applies decisions atomically', async () => {
    const stats = async () => (await call('GET', `/api/v1/analytics?source=live&year=${today.slice(0, 4)}&fresh=1`, { cookie: admin })).json;
    const registrations = (s: any) => s.monthly[Number(today.slice(5, 7)) - 1].current.petRegistrations;
    const before = await stats();
    const pending = await call('POST', `/api/v1/census/submissions/${id}/review`, { cookie: admin, json: { decision: 'approve' } });
    expect(pending.status).toBe(422);
    const detail = (await call('GET', `/api/v1/census/submissions/${id}`, { cookie: admin })).json;
    const [juan, maria] = detail.owners;
    expect((await call('PUT', `/api/v1/census/submissions/${id}/decisions`, { cookie: admin, json: { decisions: [{ ownerId: juan.id, decision: 'merge' }] } })).status).toBe(422);
    expect((await call('PUT', `/api/v1/census/submissions/${id}/decisions`, { cookie: paravetA, json: { decisions: [{ ownerId: juan.id, decision: 'new' }] } })).status).toBe(403);
    const saved = await call('PUT', `/api/v1/census/submissions/${id}/decisions`, {
      cookie: admin, json: { decisions: [{ ownerId: juan.id, decision: 'new' }, { ownerId: maria.id, decision: 'reject' }] } });
    expect(saved.status).toBe(200);
    const approved = await call('POST', `/api/v1/census/submissions/${id}/review`, { cookie: admin, json: { decision: 'approve', note: 'Checked', reviewToken: await approvalToken(call,id,admin) } });
    expect(approved.json).toMatchObject({ status: 'approved', newOwners: 1, newPets: 2, skippedOwners: 1 });
    // Analytics: the approved census's pets count as this month's registrations, and its barangay as covered.
    const after = await stats();
    expect(registrations(after)).toBe(registrations(before) + 2);
    expect(after.censusCoverage.find((row: any) => row.barangay === brgA.name).approved).toBeGreaterThanOrEqual(1);
    expect((await call('POST', `/api/v1/census/submissions/${id}/review`, { cookie: superAdmin, json: { decision: 'reject', note: 'late' } })).status).toBe(422);
    expect((await call('PATCH', `/api/v1/census/submissions/${id}`, { cookie: paravetA, json: { label: 'changed' } })).status).toBe(409);
    expect((await call('DELETE', `/api/v1/census/submissions/${id}?permanent=true`, { cookie: superAdmin })).status).toBe(409);
  });

  it('audits guarded approval undo and redo, and refuses to overwrite later registry edits', async () => {
    expect((await call('GET', `/api/v1/census/submissions/${id}/status`, { cookie: paravetA })).status).toBe(403);
    const status = await call('GET', `/api/v1/census/submissions/${id}/status`, { cookie: admin });
    expect(status.json).toMatchObject({ status: 'approved', hasSnapshot: true, canUndo: true, canRedo: false });
    const undo = await call('POST', `/api/v1/census/submissions/${id}/status`, { cookie: admin, json: { action: 'undo' } });
    expect(undo.status).toBe(200);
    expect(undo.json).toMatchObject({ status: 'pending', changed: true });
    expect((await sql()`select count(*)::int as n from ekapon.registry_owners where source_submission_id = ${id}`)[0].n).toBe(0);
    expect((await call('GET', `/api/v1/census/submissions/${id}/status`, { cookie: admin })).json.canRedo).toBe(true);

    const redo = await call('POST', `/api/v1/census/submissions/${id}/status`, { cookie: admin, json: { action: 'redo' } });
    expect(redo.status).toBe(200);
    expect(redo.json).toMatchObject({ status: 'approved', changed: true });
    const [approvedOwner] = await sql()`select id from ekapon.registry_owners where source_submission_id = ${id}`;
    expect(approvedOwner).toBeTruthy();
    await sql()`update ekapon.registry_pets set remarks = 'Changed after approval' where owner_id = ${approvedOwner.id}`;
    const guarded = await call('GET', `/api/v1/census/submissions/${id}/status`, { cookie: admin });
    expect(guarded.json).toMatchObject({ status: 'approved', canUndo: false });
    expect(guarded.json.undoReason).toContain('changed after approval');
    const blockedUndo = await call('POST', `/api/v1/census/submissions/${id}/status`, { cookie: admin, json: { action: 'undo' } });
    expect(blockedUndo.status).toBe(409);
    expect(blockedUndo.json.error.code).toBe('CENSUS_REVIEW_CONFLICT');
  });

  it('marks older approvals without registry snapshots as not safely undoable', async () => {
    const created = await call('POST', '/api/v1/census/submissions', {
      cookie: paravetA, json: body([owner('Legacy', [pet('Older pet')])]),
    });
    const legacyId = created.json.submission.id;
    const [reviewer] = await sql()`select id,full_name from ekapon.accounts where username='encoder'`;
    await sql()`update ekapon.census_submissions set status='approved',reviewed_by=${reviewer.id},
      reviewer_name=${reviewer.full_name},reviewed_at=now() where id=${legacyId}::uuid`;
    const status = await call('GET', `/api/v1/census/submissions/${legacyId}/status`, { cookie: admin });
    expect(status.json).toMatchObject({ status: 'approved', hasSnapshot: false, canUndo: false });
    expect(status.json.undoReason).toContain('no saved registry snapshot');
    expect(status.json.undoReason).toContain('cannot be safely undone');
  });

  it('shows the approved owner as a match for the next census and merges only into the same barangay', async () => {
    const r = await call('POST', '/api/v1/census/submissions', {
      cookie: paravetA, json: body([owner('Juan', [pet('Bantay', { color: 'Brown', vaccine1st: true }), pet('Newpet')], { address: 'Purok 9' })], { source: 'csv' }) });
    const nid = r.json.submission.id;
    const detail = (await call('GET', `/api/v1/census/submissions/${nid}`, { cookie: admin })).json;
    expect((await call('GET', `/api/v1/census/submissions/${nid}`, { cookie: paravetA })).json.owners[0].candidates).toEqual([]);
    const candidate = detail.owners[0].candidates[0];
    expect(candidate).toMatchObject({ petCount: 2 });

    const [other] = await sql()`insert into ekapon.registry_owners (barangay_id, owner_name, address) values (${brgB.id}, ${`Elsewhere ${tag}`}, 'x') returning id`;
    const wrong = await call('PUT', `/api/v1/census/submissions/${nid}/decisions`, { cookie: admin, json: { decisions: [{ ownerId: detail.owners[0].id, decision: 'merge', matchedOwnerId: other.id }] } });
    expect(wrong.status).toBe(422);

    await call('PUT', `/api/v1/census/submissions/${nid}/decisions`, { cookie: admin, json: { decisions: [await reviewedMatch(call,nid,admin,detail.owners[0].id,candidate.registryOwnerId)] } });
    const merged = await call('POST', `/api/v1/census/submissions/${nid}/review`, { cookie: admin, json: { decision: 'approve', reviewToken: await approvalToken(call,nid,admin) } });
    expect(merged.json).toMatchObject({ status: 'approved', updatedOwners: 1, newPets: 1 });
    const [bantay] = await sql()`select color, vaccine_1st, sterilized, booster from ekapon.registry_pets where pet_name = 'Bantay' and owner_id = ${candidate.registryOwnerId}`;
    expect(bantay).toMatchObject({ color: 'Brown', vaccine_1st: true, sterilized: true, booster: true });
    const [{ n }] = await sql()`select count(*)::int as n from ekapon.registry_pets where owner_id = ${candidate.registryOwnerId}`;
    expect(n).toBe(3);
  });

  it('rejects with a reason, lets the Paravet resubmit once, and supports withdrawal', async () => {
    const r = await call('POST', '/api/v1/census/submissions', { cookie: paravetA, json: body([owner('Pedro', [pet('Max')])]) });
    const rid = r.json.submission.id;
    expect((await call('POST', `/api/v1/census/submissions/${rid}/review`, { cookie: admin, json: { decision: 'reject' } })).status).toBe(422);
    expect((await call('POST', `/api/v1/census/submissions/${rid}/review`, { cookie: admin, json: { decision: 'reject', note: 'Photo is blurry' } })).json.status).toBe('rejected');
    expect((await call('POST', `/api/v1/census/submissions/${rid}/resubmit`, { cookie: paravetB })).status).toBe(404);
    const again = await call('POST', `/api/v1/census/submissions/${rid}/resubmit`, { cookie: paravetA });
    expect(again.status).toBe(201);
    expect((await call('POST', `/api/v1/census/submissions/${rid}/resubmit`, { cookie: paravetA })).status).toBe(409);
    const copy = (await call('GET', `/api/v1/census/submissions/${again.json.id}`, { cookie: paravetA })).json;
    expect(copy.submission).toMatchObject({ status: 'pending', resubmitsId: rid });
    expect(copy.owners[0].pets[0].petName).toBe('Max');
    expect((await call('DELETE', `/api/v1/census/submissions/${again.json.id}`, { cookie: admin })).status).toBe(403);
    expect((await call('DELETE', `/api/v1/census/submissions/${again.json.id}`, { cookie: paravetA })).json.withdrawn).toBe(true);
    expect((await call('PATCH', `/api/v1/census/submissions/${again.json.id}`, { cookie: paravetA, json: { label: 'x' } })).status).toBe(409);
  });

  it('accepts photos of the paper sheet and lets staff encode the owners from them', async () => {
    const r = await call('POST', '/api/v1/census/submissions', { cookie: paravetA, json: body([], { source: 'image', label: `Photos ${tag}` }) });
    expect(r.status).toBe(201);
    const pid = r.json.submission.id;
    const bytes = Buffer.from('fake-jpeg-bytes');
    const up = await call('POST', `/api/v1/census/submissions/${pid}/attachments`, { cookie: paravetA, json: { mime: 'image/jpeg', data: bytes.toString('base64') } });
    expect(up.status).toBe(201);
    const big = Buffer.alloc(500_001, 1).toString('base64');
    expect((await call('POST', `/api/v1/census/submissions/${pid}/attachments`, { cookie: paravetA, json: { mime: 'image/jpeg', data: big } })).status).toBe(422);
    expect((await call('POST', `/api/v1/census/submissions/${pid}/attachments`, { cookie: admin, json: { mime: 'image/jpeg', data: bytes.toString('base64') } })).status).toBe(403);
    const shown = await call('GET', `/api/v1/census/submissions/${pid}/attachments/${up.json.id}`, { cookie: admin });
    expect(Buffer.from(shown.json.data, 'base64').toString()).toBe('fake-jpeg-bytes');
    expect((await call('GET', `/api/v1/census/submissions/${pid}/attachments/${up.json.id}`, { cookie: paravetB })).status).toBe(404);
    const encoded = await call('PATCH', `/api/v1/census/submissions/${pid}`, { cookie: admin, json: { owners: [owner('Encoded', [pet('Rex')])] } });
    expect(encoded.json.submission.ownerCount).toBe(1);
    const detail = (await call('GET', `/api/v1/census/submissions/${pid}`, { cookie: admin })).json;
    expect(detail.attachments).toHaveLength(1);
    expect((await call('DELETE', `/api/v1/census/submissions/${pid}?permanent=true`, { cookie: admin })).status).toBe(403);
    expect((await call('DELETE', `/api/v1/census/submissions/${pid}?permanent=true`, { cookie: superAdmin })).json.deleted).toBe(true);
  });

  it('stores a large sheet (750 pets) in a handful of queries', async () => {
    const owners = Array.from({ length: 150 }, (_, i) => owner(`Bulk${i}`, Array.from({ length: 5 }, (_, j) => pet(`P${j}`))));
    const started = Date.now();
    const r = await call('POST', '/api/v1/census/submissions', { cookie: paravetA, json: body(owners) });
    expect(r.status).toBe(201);
    expect(r.json.submission.petCount).toBe(750);
    expect(Date.now() - started).toBeLessThan(5000);
    await call('DELETE', `/api/v1/census/submissions/${r.json.submission.id}`, { cookie: paravetA });
  });

  it('produces the summary and front page from the approved registry for staff only', async () => {
    expect((await call('GET', `/api/v1/census/summary?barangayId=${brgA.id}`, { cookie: paravetA })).status).toBe(403);
    const summary = await call('GET', `/api/v1/census/summary?barangayId=${brgA.id}`, { cookie: admin });
    const juan = summary.json.data.find((row: any) => row.owner_name === `Juan ${tag}`);
    expect(juan).toMatchObject({ dogs: 2, cats: 1, castrated_dogs: 1 });
    expect(juan.remarks.split('; ').sort()).toEqual(['Booster', 'Laps', 'Registered 2026']);
    const front = await call('GET', `/api/v1/census/front-page?barangayId=${brgA.id}&year=${today.slice(0, 4)}`, { cookie: superAdmin });
    expect(front.json.barangay.name).toBe(brgA.name);
    expect(front.json.totals.households).toBeGreaterThanOrEqual(30);
    expect(front.json.totals.dogs).toBeGreaterThanOrEqual(2);
    expect(front.json.totals.laps_cats).toBeGreaterThanOrEqual(1);
  });
});
