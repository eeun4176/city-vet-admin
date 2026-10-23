import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { startServer, client, type Resp } from './harness';
import { sql, closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
import { approvalToken, reviewedMatch } from './census-review-helpers';
import { censusReviewValue } from '../shared/censusReview';
import { readTraditionalExcel, readTraditionalCsv, TRADITIONAL_CSV } from '../src/lib/traditionalCensus';

const tag = `Review${randomUUID().slice(0,8)}`;
let call: ReturnType<typeof client>, close: () => Promise<void>, admin: string, secondAdmin: string, field: string, outsider: string, area: any, remote: any;
const actors: number[] = [], submissions: string[] = [], targets: string[] = [];
const good = (r: Resp) => { expect([200,201], JSON.stringify(r.json)).toContain(r.status); return r.json; };
const pet = (name: string) => ({ petName: name, species: 'Cat', sex: 'Female', ageMonths: 0, sterilized: null, vaccine1st: null, vaccine2nd: false, vaccine3rd: true, booster: null, laps: null });
const get = (path: string, cookie = admin) => call('GET', path, { cookie });
const put = (id: string, decisions: unknown[]) => call('PUT', `/api/v1/census/submissions/${id}/decisions`, { cookie: admin, json: { decisions } });
const approve = (id: string, token?: string, cookie = admin) => call('POST', `/api/v1/census/submissions/${id}/review`, { cookie, json: { decision: 'approve', reviewToken: token } });
async function target(suffix: string, barangay?: number) {
  const [r] = await sql()`insert into ekapon.registry_owners(barangay_id,owner_name,address) values(${barangay ?? area.id},${`${tag} ${suffix}`},'Existing address') returning id`;
  targets.push(r.id);
  await sql()`insert into ekapon.registry_pets(owner_id,pet_name,species,sex,age_months,vaccine_1st,vaccine_2nd) values(${r.id}::uuid,'Mochi','Cat',null,0,null,false)`;
  await sql()`insert into ekapon.registry_pets(owner_id,pet_name,species,sex,archived_at) values(${r.id}::uuid,'Archived pet','Dog','Male',now())`;
  return r.id as string;
}
async function prepare(suffix: string, others: any[] = []) {
  const result = good(await call('POST', '/api/v1/census/submissions', { cookie: field, json: { label: `${tag} ${suffix}`, censusDate: '2026-10-18', source: 'csv', owners: [{ ownerName: `${tag} ${suffix}`, address: 'Submitted address', pets: [pet('Mochi')] }, ...others] } }));
  const id = result.submission.id; submissions.push(id);
  return { id, detail: good(await get(`/api/v1/census/submissions/${id}`)) };
}
beforeAll(async () => {
  const server = await startServer(); call = client(server.base); close = server.close;
  [area, remote] = await sql()`select id,name from ekapon.barangays order by id limit 2`;
  for (const [role, barangay] of [['SuperAdmin',null],['Admin',null],['Paravet',area.id],['Paravet',remote.id]] as const) {
    const [r] = await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${role === 'Paravet' ? null : `${tag}${role}`},${role},${tag},${role},${barangay}) returning id`;
    actors.push(r.id); const cookie = (await sessionCookie({ id: r.id, type: role }, 'full')).split(';')[0];
    if (role === 'SuperAdmin') admin = cookie; else if (role === 'Admin') secondAdmin = cookie; else if (barangay === area.id) field = cookie; else outsider = cookie;
  }
});
afterAll(async () => {
  await sql()`delete from ekapon.census_submissions where id=any(${submissions}::uuid[])`;
  await sql()`delete from ekapon.registry_owners where owner_name like ${`${tag}%`}`;
  await sql()`delete from ekapon.registry_source_links l using ekapon.dashboard_records d where l.dataset=d.dataset and l.record_id=d.record_id and (d.record_data->>'name' like ${`${tag}%`} or d.record_data->>'owner' like ${`${tag}%`})`;
  await sql()`delete from ekapon.dashboard_records where record_data->>'name' like ${`${tag}%`} or record_data->>'owner' like ${`${tag}%`}`;
  await sql()`delete from ekapon.accounts where id=any(${actors}::bigint[])`; await close(); await closeDb();
});
describe('reviewed census decisions', () => {
  it('takes the downloadable Excel form and CSV through parsing, reviewed approval, and scoped registry search', async () => {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await readFile('public/templates/door-to-door-census.xlsx') as any);
    const sheet = workbook.worksheets[0];
    for (const [cell,value] of [['C5',area.name],['R5',new Date('2026-10-18T00:00:00Z')],['A7',`${tag} Workbook`],['E7','Synthetic workbook address'],['B10','Workbook pet'],['D10','/'],['J10','/'],['E10','0 months'],['Q10','No']] as const) sheet.getCell(cell).value=value;
    const buffer = await workbook.xlsx.writeBuffer();
    const excel = await readTraditionalExcel(Uint8Array.from(buffer as any).buffer);
    const csv = readTraditionalCsv(TRADITIONAL_CSV+`group1,${tag} CSV,Synthetic CSV address,,CSV pet,Cat,Female,0,months,,,no,,yes,,,,\r\n`);
    for (const parsed of [excel,csv]) {
      expect(parsed.issues).toEqual([]);
      const created = good(await call('POST','/api/v1/census/submissions',{cookie:field,json:{label:`${tag} Imported`,censusDate:'2026-10-18',source:'csv',owners:parsed.owners}}));
      const id=created.submission.id; submissions.push(id);
      const detail=good(await get(`/api/v1/census/submissions/${id}`));
      good(await put(id,detail.owners.map((o:any)=>({ownerId:o.id,decision:'new'}))));
      good(await approve(id,await approvalToken(call,id,admin)));
      const result=good(await get(`/api/v1/census/submissions/${id}`,field));
      const ownerId=result.owners[0].registryOwnerId; expect(ownerId).toBeTruthy();
      expect(good(await get(`/api/v1/search?q=${encodeURIComponent(parsed.owners[0].ownerName)}`,field)).data.some((r:any)=>r.id===ownerId)).toBe(true);
      const registry=good(await get(`/api/v1/registry-workspace?kind=owners&id=${ownerId}`,field));
      expect(registry.pets[0].data.age_months).toBe(0);
    }
  });
  it('shows full linked pets, unknowns, No, zero ages, and no private workspace fields; scopes comparisons to staff and barangay', async () => {
    const match = await target('Comparison'), { id, detail } = await prepare('Comparison'), ownerId = detail.owners[0].id;
    const path = `/api/v1/census/submissions/${id}/decisions?ownerId=${ownerId}&matchedOwnerId=${match}&decision=merge`;
    const result = good(await get(path)); expect(result.existing.pets).toHaveLength(2);
    expect(result.existing.pets.find((p: any) => p.name === 'Mochi').fields).toMatchObject({ sex: null, ageMonths: 0, vaccine1st: null, vaccine2nd: false });
    expect(result.existing.pets.some((p: any) => p.archived)).toBe(true);
    expect(censusReviewValue(null)).toBe('Not recorded'); expect(censusReviewValue(false)).toBe('No'); expect(censusReviewValue(0)).toBe('0');
    expect((await get(path, field)).status).toBe(403); expect((await get(path, outsider)).status).toBe(403);
    const other = await target('Elsewhere', remote.id);
    expect((await get(path.replace(match, other))).status).toBe(422);
    expect(good(await get(`/api/v1/census/submissions/${id}`, field)).owners[0].candidates).toEqual([]);
  });
  it('requires explicit selection, a reason, an actor/action-bound comparison and an atomic decision save', async () => {
    const match = await target('Required'), { id, detail } = await prepare('Required'), ownerId = detail.owners[0].id;
    const reviewed = await reviewedMatch(call, id, admin, ownerId, match);
    expect((await put(id, [{ ownerId, decision: 'merge' }])).status).toBe(422);
    expect((await put(id, [{ ...reviewed, reason: '' }])).status).toBe(422);
    expect((await put(id, [{ ...reviewed, comparisonToken: '' }])).status).toBe(409);
    expect((await put(id, [{ ...reviewed, decision: 'replace' }])).status).toBe(409);
    expect((await call('PUT', `/api/v1/census/submissions/${id}/decisions`, { cookie: secondAdmin, json: { decisions: [reviewed] } })).status).toBe(409);
    expect((await put(id, [reviewed, { ownerId: randomUUID(), decision: 'new' }])).status).toBe(422);
    let d = good(await get(`/api/v1/census/submissions/${id}`)); expect(d.owners[0].decision).toBe('pending'); expect(d.decisionHistory).toEqual([]);
    good(await put(id, [reviewed])); d = good(await get(`/api/v1/census/submissions/${id}`));
    expect(d.owners[0]).toMatchObject({ decision: 'merge', matchedOwnerId: match, decisionReason: reviewed.reason, matchReviewed: true });
    expect(d.decisionHistory[0].after.reason).toBe(reviewed.reason);
  });
  it('refuses stale comparisons and requires a new comparison after registry edits before approval', async () => {
    const match = await target('Stale'), { id, detail } = await prepare('Stale'), ownerId = detail.owners[0].id;
    const reviewed = await reviewedMatch(call, id, admin, ownerId, match);
    await sql()`update ekapon.registry_pets set color='Brown' where owner_id=${match}::uuid and archived_at is null`;
    expect((await put(id, [reviewed])).status).toBe(409);
    good(await put(id, [await reviewedMatch(call, id, admin, ownerId, match)]));
    const token = await approvalToken(call, id, admin);
    await sql()`update ekapon.registry_owners set address='A later verified address' where id=${match}::uuid`;
    const plan = good(await get(`/api/v1/census/submissions/${id}/decisions`)); expect(plan.ready).toBe(false); expect(plan.issues.join(' ')).toContain('changed');
    expect((await approve(id, token)).status).toBe(422);
    expect((await call('POST', `/api/v1/census/submissions/${id}/status`, { cookie: admin, json: { action: 'set-status', status: 'approved', reviewToken: token } })).status).toBe(422);
    good(await put(id, [await reviewedMatch(call, id, admin, ownerId, match)]));
    good(await approve(id, await approvalToken(call, id, admin)));
  });
  it('requires a current actor-bound approval summary and rejects changed saved decisions', async () => {
    const { id, detail } = await prepare('Summary'), ownerId = detail.owners[0].id;
    good(await put(id, [{ ownerId, decision: 'new' }])); const token = await approvalToken(call, id, admin);
    expect((await approve(id)).status).toBe(409); expect((await approve(id, token, secondAdmin)).status).toBe(409);
    good(await put(id, [{ ownerId, decision: 'reject' }])); good(await put(id, [{ ownerId, decision: 'new', reason: 'Confirmed separate owner' }]));
    expect((await approve(id, token)).status).toBe(409);
    good(await approve(id, await approvalToken(call, id, admin)));
  });
  it('summarizes all actions and links approved records without exposing excluded owners or other barangays', async () => {
    const merge = await target('Outcomes'), keep = await target('Keep'), replace = await target('Replace');
    const extra = ['New','Keep','Replace','Exclude'].map((suffix) => ({ ownerName: `${tag} ${suffix}`, address: 'Incoming address', pets: [pet(`${suffix} pet`)] }));
    const { id, detail } = await prepare('Outcomes', extra);
    good(await put(id, [await reviewedMatch(call,id,admin,detail.owners[0].id,merge), { ownerId:detail.owners[1].id,decision:'new' },
      await reviewedMatch(call,id,admin,detail.owners[2].id,keep,'keep'), await reviewedMatch(call,id,admin,detail.owners[3].id,replace,'replace'),
      { ownerId:detail.owners[4].id,decision:'reject' }]));
    const plan = good(await get(`/api/v1/census/submissions/${id}/decisions`)); expect(plan.ready).toBe(true);
    expect(plan.counts).toMatchObject({ new:1,merge:1,replace:1,keep:1,reject:1,pending:0 }); expect(plan.petCount).toBe(5);
    good(await approve(id,plan.token)); const result = good(await get(`/api/v1/census/submissions/${id}`,field));
    expect(result.owners.slice(0,4).every((o:any) => !!o.registryOwnerId)).toBe(true); expect(result.owners[4].registryOwnerId).toBeNull(); expect(result.decisionHistory).toEqual([]);
    const ownerId = result.owners[1].registryOwnerId;
    expect(good(await get(`/api/v1/search?q=${encodeURIComponent(`${tag} New`)}`,field)).data.some((r:any) => r.id===ownerId)).toBe(true);
    expect((await get(`/api/v1/registry-workspace?kind=owners&id=${ownerId}`,outsider)).status).toBe(404);
    const backup = good(await get('/api/v1/admin/backup')); expect(backup.data.censusDecisionActivity.some((h:any) => h.submission_id===id)).toBe(true);
  });
  it('blocks repeated targets and preserves previous decision reasons after a sheet correction', async () => {
    const match = await target('Repeat'), { id, detail } = await prepare('Repeat',[{ ownerName:`${tag} Repeat`, address:'Another section', pets:[pet('Other pet')] }]);
    good(await put(id, await Promise.all(detail.owners.map((o:any) => reviewedMatch(call,id,admin,o.id,match)))));
    const plan = good(await get(`/api/v1/census/submissions/${id}/decisions`)); expect(plan.ready).toBe(false); expect(plan.issues.join(' ')).toContain('more than one entry');
    good(await call('PATCH', `/api/v1/census/submissions/${id}`, { cookie:field,json:{owners:[{ownerName:`${tag} Corrected`,address:'Corrected sheet',pets:[pet('Corrected pet')]}]} }));
    const changed = good(await get(`/api/v1/census/submissions/${id}`)); expect(changed.owners[0].decision).toBe('pending'); expect(changed.decisionHistory).toHaveLength(2);
  });
});
