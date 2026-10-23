import { randomUUID, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { startServer, client, type Resp } from './harness';
import { sql, closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
import { todayManila } from '../server/stubWorkflow';

const tag = `Dash${randomUUID().slice(0, 8)}`;
let call: ReturnType<typeof client>, close: () => Promise<void>;
let staff: string, superAdmin: string, field: string, invited: string, outside: string;
let area: any, remote: any, third: any, campaign: number, program: number, submission: string;
const actors: number[] = [], records: string[] = [], campaigns: number[] = [];
const yes = (r: Resp) => { expect(r.status, JSON.stringify(r.json)).toBe(200); return r.json; };
const overview = async (cookie = staff) => yes(await call('GET', '/api/v1/dashboard/overview', { cookie }));
async function makeProgram(suffix: string, status = 'Planned', date = todayManila(), archived = false, sample = false) {
  const recordId = `${tag}-${suffix}`; records.push(recordId);
  const [d] = await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data,archived)
    values('programs',${recordId},${sql().json({ id: recordId, title: recordId, date, status, barangayId: area.id, barangay: area.name, location: 'Synthetic clinic', startTime: '08:00', endTime: '12:00', _sampleData: sample, id_image: 'PRIVATE-IMAGE-CANARY', owner: 'PRIVATE-OWNER-CANARY' })},${archived}) returning id`;
  return Number(d.id);
}
beforeAll(async () => {
  const server = await startServer(); call = client(server.base); close = server.close;
  [area, remote, third] = await sql()`select id,name from ekapon.barangays order by id limit 3`;
  for (const [type, barangay] of [['Admin', null], ['SuperAdmin', null], ['Paravet', area.id], ['Paravet', remote.id], ['Paravet', third.id]] as const) {
    const [a] = await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${type === 'Paravet' ? null : `${tag}${actors.length}`},${type},${tag},${`${type}${actors.length}`},${barangay}) returning id`;
    actors.push(a.id);
    const cookie = (await sessionCookie({ id: a.id, type }, 'full')).split(';')[0];
    if (actors.length === 1) staff = cookie; else if (actors.length === 2) superAdmin = cookie; else if (actors.length === 3) field = cookie; else if (actors.length === 4) invited = cookie; else outside = cookie;
  }
  program = await makeProgram('active', 'In progress', '2020-01-01');
  const [c] = await sql()`insert into ekapon.program_interest_campaigns(reference,campaign_type,host_barangay_id,program_record_id,processes,status,created_by)
    values(${tag},'program_day',${area.id},${program},array['Microchipping'],'scheduled',${actors[0]}) returning id`; campaign = c.id; campaigns.push(c.id);
  await sql()`insert into ekapon.program_interest_allowed_barangays(campaign_id,barangay_id,added_by) values(${campaign},${remote.id},${actors[0]})`;
  await makeProgram('today'); await makeProgram('completed', 'Completed', '2020-01-02'); await makeProgram('cancelled', 'Cancelled');
  await makeProgram('archived', 'Planned', todayManila(), true); await makeProgram('sample', 'Planned', '2098-01-01', false, true);
  await makeProgram('past-open', 'Open', '2020-01-03');
  const made = await call('POST', '/api/v1/census/submissions', { cookie: field, json: { label: tag, source: 'form', censusDate: todayManila(), owners: [{ ownerName: tag, address: 'Synthetic address', pets: [{ petName: 'Bantay', species: 'Dog', sex: 'Male' }] }] } });
  expect([200, 201], JSON.stringify(made.json)).toContain(made.status); submission = made.json.submission.id;
});
afterAll(async () => {
  if (submission) await sql()`delete from ekapon.census_submissions where id=${submission}::uuid`;
  await sql()`delete from ekapon.stub_tickets where batch_id in(select id from ekapon.stub_batches where campaign_id=any(${campaigns}::bigint[]))`;
  await sql()`delete from ekapon.stub_batches where campaign_id=any(${campaigns}::bigint[])`;
  await sql()`delete from ekapon.program_interest_campaigns where id=any(${campaigns}::bigint[])`;
  await sql()`delete from ekapon.dashboard_records where record_id=any(${records}::text[])`;
  await sql()`delete from ekapon.accounts where id=any(${actors}::bigint[])`;
  await close(); await closeDb();
});
describe('role-specific dashboard overview', () => {
  it('requires a current staff session and matches sidebar unresolved queues', async () => {
    expect((await call('GET', '/api/v1/dashboard/overview')).status).toBe(401);
    const data = await overview(), badges = yes(await call('GET', '/api/v1/navigation-badges', { cookie: staff })).badges;
    expect(data.tasks.find((t: any) => t.id === 'census-pending').count).toBe(badges['census-pending'].pending);
    expect(data.tasks.every((t: any) => t.count > 0)).toBe(true);
    expect(data.tasks.some((t: any) => ['access', 'issues'].includes(t.id))).toBe(false);
    expect(data.waiting).toEqual([]);
  });
  it('projects only compact program details and sorts active programs first', async () => {
    const data = await overview();
    expect(data.programs[0]).toMatchObject({ id: program, status: 'In progress', to: `/program-day?program=${program}` });
    expect(data.programs.some((p: any) => p.title.endsWith('-today'))).toBe(true);
    for (const suffix of ['completed', 'cancelled', 'archived', 'sample', 'past-open']) expect(data.programs.some((p: any) => p.title.endsWith(`-${suffix}`))).toBe(false);
    const body = JSON.stringify(data); expect(body).not.toContain('PRIVATE-'); expect(body).not.toContain('record_data'); expect(body.length).toBeLessThan(7000);
  });
  it('separates Paravet pending submissions from corrections and hides other staff work', async () => {
    let data = await overview(field);
    expect(data.tasks.some((t: any) => t.id === 'census-pending')).toBe(false);
    expect(data.waiting.find((t: any) => t.id === 'census-pending').count).toBe(1);
    expect((await overview(invited)).waiting.some((t: any) => t.id === 'census-pending')).toBe(false);
    yes(await call('POST', `/api/v1/census/submissions/${submission}/review`, { cookie: staff, json: { decision: 'reject', note: 'Synthetic corrections required' } }));
    data = await overview(field);
    expect(data.tasks.find((t: any) => t.id === 'census-corrections').count).toBe(1);
    expect(data.waiting.some((t: any) => t.id === 'census-pending')).toBe(false);
    expect(data.tasks.some((t: any) => ['access', 'issues', 'quality'].includes(t.id))).toBe(false);
  });
  it('uses current invitations and reassignment on every read', async () => {
    expect((await overview(invited)).programs.map((p: any) => p.id)).toContain(program);
    expect((await overview(outside)).programs).toEqual([]);
    await sql()`delete from ekapon.program_interest_allowed_barangays where campaign_id=${campaign} and barangay_id=${remote.id}`;
    expect((await overview(invited)).programs).toEqual([]);
    await sql()`update ekapon.accounts set barangay_id=${third.id} where id=${actors[2]}`;
    expect((await overview(field)).programs).toEqual([]);
    await sql()`update ekapon.accounts set barangay_id=${area.id} where id=${actors[2]}`;
  });
  it('shows gathering lists and recipient-specific stub work without granting handover authority', async () => {
    const [c] = await sql()`insert into ekapon.program_interest_campaigns(reference,campaign_type,host_barangay_id,processes,status,created_by)
      values(${`${tag}-demand`},'program_request',${area.id},array['Microchipping'],'gathering',${actors[2]}) returning id`; campaigns.push(c.id);
    for (const [status, suffix] of [['Printed', 'collect'], ['Handed over', 'issue'], ['Requested', 'pending']] as const) {
      const [b] = await sql()`insert into ekapon.stub_batches(reference,campaign_id,recipient_id,recipient_name,barangay_id,requested_quantity,approved_quantity,status,program_snapshot,requested_by,printed_at,handed_over_at)
        values(${`${tag}-${suffix}`},${campaign},${actors[2]},'Synthetic Paravet',${area.id},2,${status === 'Requested' ? null : 2},${status},'{}'::jsonb,${actors[2]},${status === 'Requested' ? null : new Date()},${status === 'Handed over' ? new Date() : null}) returning id`;
      if (status === 'Handed over') await sql()`insert into ekapon.stub_tickets(batch_id,code) values(${b.id},${`CVS1.${randomBytes(16).toString('base64url')}`})`;
    }
    const data = await overview(field);
    for (const id of ['interest-drafts', 'stubs-collect', 'stubs-issue']) expect(data.tasks.find((t: any) => t.id === id)?.count, id).toBe(1);
    expect(data.waiting.find((t: any) => t.id === 'stubs-pending')?.count).toBe(1);
    expect((await overview(invited)).tasks.some((t: any) => t.id.startsWith('stubs-'))).toBe(false);
  });
  it('rechecks feature switches and applies the same operations restriction to the full calendar', async () => {
    const [old] = await sql()`select enabled from ekapon.role_feature_access where account_type='Admin' and feature_key='operations'`;
    try {
      await sql()`insert into ekapon.role_feature_access(account_type,feature_key,enabled) values('Admin','operations',false) on conflict(account_type,feature_key) do update set enabled=false`;
      const data = await overview(); expect(data.programsEnabled).toBe(false); expect(data.programs).toEqual([]);
      expect(data.tasks.some((t: any) => ['stubs', 'program-interest'].includes(t.id))).toBe(false);
      expect((await call('GET', '/api/v1/calendar/events', { cookie: staff })).status).toBe(403);
      expect((await overview(superAdmin)).programsEnabled).toBe(true);
    } finally {
      if (old) await sql()`update ekapon.role_feature_access set enabled=${old.enabled} where account_type='Admin' and feature_key='operations'`;
      else await sql()`delete from ekapon.role_feature_access where account_type='Admin' and feature_key='operations'`;
    }
  });
  it('bounds the upcoming list and points staff to the full workspace', async () => {
    for (let i = 0; i < 8; i++) await makeProgram(`future-${i}`, 'Open', `2099-01-${String(i + 1).padStart(2, '0')}`);
    const result = await call('GET', '/api/v1/dashboard/overview', { cookie: staff });
    const data = yes(result); expect(data.programs).toHaveLength(5); expect(data.programsHasMore).toBe(true);
    expect(result.headers.get('Cache-Control')).toContain('no-store'); expect(result.headers.get('X-Nav-Receipt')).toBeNull();
  });
});
