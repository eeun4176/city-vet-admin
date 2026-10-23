import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, client } from './harness';
import { sql, closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
import { createBody } from '../server/census';
import { normalizeRecordInputs } from '../server/dashboard';

const tag = `Release${randomUUID().slice(0, 8)}`;
const accounts: number[] = [], submissions: string[] = [];
const cookies: Record<string, string> = {};
let call: ReturnType<typeof client>, close: () => Promise<void>, area: number, residentKey: string;
const password = 'SyntheticRelease!2026';
const photo = Buffer.from(`SYNTHETIC-DEDICATED-PHOTO-${tag}`);
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
const census = (date = today) => ({ label: tag, source: 'csv', censusDate: date, owners: [{ ownerName: `${tag} Owner`, address: 'Synthetic address', pets: [{ petName: `${tag} Pet`, species: 'Cat', sex: 'Female', ageMonths: 0, sterilized: null, vaccine1st: false }] }] });

beforeAll(async () => {
  const server = await startServer(); call = client(server.base); close = server.close;
  [{ id: area }] = await sql()`select id from ekapon.barangays order by id limit 1`;
  for (const role of ['SuperAdmin', 'Admin', 'Paravet', 'User']) {
    const [account] = await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id,password_hash)
      values(${['Admin', 'SuperAdmin'].includes(role) ? `${tag}${role}` : null},${role},${tag},${role},${['Paravet', 'User'].includes(role) ? area : null},extensions.crypt(${password},extensions.gen_salt('bf',4))) returning id,account_key`;
    accounts.push(account.id);
    cookies[role] = (await sessionCookie({ id: account.id, type: role }, 'full')).split(';')[0];
    if (role === 'User') residentKey = account.account_key;
  }
  await sql()`insert into ekapon.account_preferences(account_id,profile_photo,profile_photo_mime) values(${accounts[2]},${photo},'image/png')`;
});
afterAll(async () => {
  if (submissions.length) await sql()`delete from ekapon.census_submissions where id=any(${submissions}::uuid[])`;
  await sql()`delete from ekapon.accounts where id=any(${accounts}::bigint[])`;
  if (close) await close();
  await closeDb();
});

describe('local release readiness contracts', () => {
  it('keeps the selected-record export Super Admin only and declares that it cannot restore a database', async () => {
    expect((await call('GET', '/api/v1/admin/backup')).status).toBe(401);
    for (const role of ['Admin', 'Paravet']) expect((await call('GET', '/api/v1/admin/backup', { cookie: cookies[role] })).status).toBe(403);
    const result = await call('GET', '/api/v1/admin/backup', { cookie: cookies.SuperAdmin });
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ format: 'cityvet-supabase-backup-v1', recovery: { purpose: 'selected-record-export', completeDatabaseBackup: false, applicationRestoreSupported: false } });
    expect(result.json.recovery.excluded.length).toBeGreaterThan(0);
    const text = JSON.stringify(result.json);
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain(photo.toString('hex'));
    expect(text).not.toContain(photo.toString('base64'));
    expect(result.json.data).not.toHaveProperty('accountPreferences');
    expect(result.json.data).not.toHaveProperty('censusAttachments');
    expect((await call('POST', '/api/v1/admin/backup', { cookie: cookies.SuperAdmin, json: result.json })).status).toBe(405);
  });

  it('rejects valid old resident credentials and resident cookies across active staff workflows', async () => {
    const login = await call('POST', '/api/v1/auth/login', { json: { identifier: residentKey, password } });
    expect(login.status).toBe(403);
    expect(login.json.error.code).toBe('USER_ACCESS_REMOVED');
    expect(login.cookie).toBeNull();
    for (const path of ['/auth/me', '/dashboard/overview', '/search?q=Synthetic', '/registry-workspace?kind=owners', '/program-workspace', '/stub-workflow', '/census/submissions', '/admin/backup']) {
      expect((await call('GET', `/api/v1${path}`, { cookie: cookies.User })).status, path).toBe(401);
    }
  });

  it('rejects a future census on the API and accepts a valid past date as a pending submission', async () => {
    const future = await call('POST', '/api/v1/census/submissions', { cookie: cookies.Paravet, json: census(tomorrow) });
    expect(future.status).toBe(400);
    const past = await call('POST', '/api/v1/census/submissions', { cookie: cookies.Paravet, json: census('2026-01-01') });
    expect(past.status).toBe(201);
    submissions.push(past.json.submission.id);
    expect(past.json.submission.censusDate).toBe('2026-01-01');
    expect(createBody.safeParse(census('2026-02-30')).success).toBe(false);
    expect(createBody.safeParse(census('2026-02-29')).success).toBe(false);
  });

  it('rejects future standalone actual service dates before previewing or saving records', async () => {
    const response = await call('POST', '/api/v1/field-records', { cookie: cookies.Admin, json: { action: 'preview', draft: { requestId: randomUUID(), ownerId: 'synthetic-unselected-owner', servedOn: tomorrow, location: 'Synthetic clinic', provider: 'Synthetic staff', note: '', pets: [{ petId: 'synthetic-pet', procedures: [{ process: 'Microchipping', outcome: 'Completed' }] }] } } });
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.json)).toContain('future');
  });

  it('rejects future actual dates in historical service imports without creating a batch', async () => {
    const batchId = randomUUID();
    const response = await call('POST', '/api/v1/records/services/import', { cookie: cookies.Admin, json: { batchId, label: tag, records: [{ id: `${tag}-future-service`, date: tomorrow, clientName: 'Synthetic future owner', service: 'Microchipping', status: 'Completed' }] } });
    expect(response.status).toBe(422);
    expect(response.json.error.code).toBe('SERVICE_DATE_IN_FUTURE');
    expect((await sql()`select count(*)::int as n from ekapon.dashboard_import_batches where batch_id=${batchId}::uuid`)[0].n).toBe(0);
    for (const field of ['date', 'serviceDate', 'service_date', 'servedOn', 'served_on', 'visitDate', 'visit_date']) {
      expect(() => normalizeRecordInputs({ [field]: tomorrow }, 'services')).toThrow('future');
      expect(normalizeRecordInputs({ [field]: '2026-01-01' }, 'services')[field]).toBe('2026-01-01');
    }
  });
});
