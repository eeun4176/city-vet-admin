import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startServer, client } from './harness';
import { closeDb, sql } from '../server/db';
import { sessionCookie } from '../server/auth';
import ExcelJS from 'exceljs';

const tag = `Ops${Math.random().toString(36).slice(2, 8)}`;
let call: ReturnType<typeof client>, close: () => Promise<void>;
let superAdmin: string, admin: string, paravetA: string, paravetB: string, user: string;
let adminId: number, userId: number;
let ids: number[] = [];
let barangayA: number, barangayB: number;
let createdParavetRecordId: string | null = null;
const createdPetRecordIds: string[] = [];
const cookieFor = async (id: number, type: string) => (await sessionCookie({ id, type }, 'full')).split(';')[0];

beforeAll(async () => {
  const server = await startServer();
  call = client(server.base);
  close = server.close;
  const barangays = await sql()`select id from ekapon.barangays order by id limit 2`;
  barangayA = barangays[0].id;
  barangayB = barangays[1].id;
  const accounts = await sql()`
    insert into ekapon.accounts (username, account_type, first_name, last_name)
    values (${`${tag}super`}, 'SuperAdmin', ${tag}, 'Super'), (${`${tag}admin`}, 'Admin', ${tag}, 'Admin')
    returning id, username::text as username`;
  const fieldAccounts = await sql()`
    insert into ekapon.accounts (account_type, first_name, last_name, barangay_id)
    values ('Paravet', ${`${tag}ParaA`}, ${tag}, ${barangayA}),
           ('Paravet', ${`${tag}ParaB`}, ${tag}, ${barangayB}),
           ('User', ${`${tag}User`}, ${tag}, ${barangayA})
    returning id, account_type::text as type, first_name`;
  ids = [...accounts, ...fieldAccounts].map((row) => row.id);
  superAdmin = await cookieFor(accounts.find((row) => row.username === `${tag}super`)!.id, 'SuperAdmin');
  adminId = accounts.find((row) => row.username === `${tag}admin`)!.id;
  admin = await cookieFor(adminId, 'Admin');
  paravetA = await cookieFor(fieldAccounts.find((row) => row.first_name === `${tag}ParaA`)!.id, 'Paravet');
  paravetB = await cookieFor(fieldAccounts.find((row) => row.first_name === `${tag}ParaB`)!.id, 'Paravet');
  userId = fieldAccounts.find((row) => row.type === 'User')!.id;
  user = await cookieFor(userId, 'User');
});

afterAll(async () => {
  if (createdParavetRecordId) {
    await sql()`delete from ekapon.dashboard_records where dataset = 'paravets' and record_id = ${createdParavetRecordId}`;
  }
  if (createdPetRecordIds.length) await sql()`delete from ekapon.dashboard_records where dataset='pets' and record_id=any(${createdPetRecordIds})`;
  await sql()`delete from ekapon.dashboard_records where record_id like ${`${tag}analytics-%`}`;
  await sql()`delete from ekapon.dashboard_records where dataset = 'services' and record_data->>'clientName' like ${`${tag}%`}`;
  await sql()`delete from ekapon.dashboard_import_batches where label like ${`Spay and Neuter Report: ${tag}%`}`;
  await sql()`delete from ekapon.issue_reports where title like ${`${tag}%`}`;
  await sql()`delete from ekapon.prelistings where owner_name like ${`${tag}%`}`;
  if (ids.length) await sql()`delete from ekapon.accounts where id = any(${ids})`;
  await close();
  await closeDb();
});

describe('Paravet account creation from records', () => {
  it('creates the directory record and login account and returns the generated one-time credentials', async () => {
    const [barangay] = await sql()`select name from ekapon.barangays where id = ${barangayA}`;
    const input = {
      id: `${tag}-paravet`,
      firstName: `${tag} Field`,
      middleName: '',
      lastName: 'Worker',
      suffix: '',
      barangay: barangay.name,
      mobile: '0917 234 5678',
    };
    const created = await call('POST', '/api/v1/records/paravets?createAccount=true', { cookie: admin, json: { records: [input] } });
    expect(created.status).toBe(200);
    expect(created.json.accountKey).toMatch(/^PV\d{4}-TMP\d{3,}-30(23|24)$/);
    expect(created.json.temporaryPassword).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    expect(created.json.expiresInMinutes).toBe(15);
    expect(created.json.record).toMatchObject({
      name: `${tag} Field Worker`,
      barangay: barangay.name,
      mobile: '0917-234-5678',
    });
    expect(JSON.stringify(created.json.record)).not.toContain(created.json.temporaryPassword);

    createdParavetRecordId = created.json.record.id;
    ids.push(created.json.record.accountId);
    const [account] = await sql()`
      select account_key, status::text as status, mobile
        from ekapon.accounts where id = ${created.json.record.accountId}
    `;
    expect(account).toMatchObject({
      account_key: created.json.accountKey,
      status: 'Temporary password pending',
      mobile: '0917-234-5678',
    });

    const firstSignin = await call('POST', '/api/v1/auth/first-signin', {
      json: { client: 'salin', accountKey: created.json.accountKey, temporaryPassword: created.json.temporaryPassword },
    });
    expect(firstSignin.status).toBe(200);
    expect(firstSignin.json.mustCreatePassword).toBe(true);

    const duplicate = await call('POST', '/api/v1/records/paravets?createAccount=true', { cookie: admin, json: { records: [input] } });
    expect(duplicate.status).toBe(409);
    expect(duplicate.json.error.code).toBe('DUPLICATE_ACCOUNT');
  });
});

describe('Spay and Neuter report workbook import', () => {
  it('validates, imports searchable live services, feeds analytics, and supports guarded undo', async () => {
    const forbiddenTemplate = await call('GET', '/api/v1/spay-neuter-report?mode=template', { cookie: paravetA });
    expect(forbiddenTemplate.status).toBe(403);
    const downloaded = await call('GET', '/api/v1/spay-neuter-report?mode=template', { cookie: admin });
    expect(downloaded.status).toBe(200);
    expect(downloaded.json.filename).toContain('.xlsx');
    const workbook = new ExcelJS.Workbook();
    const templateBytes = Buffer.from(downloaded.json.data, 'base64');
    const copy = new Uint8Array(templateBytes.byteLength);
    copy.set(templateBytes);
    await workbook.xlsx.load(copy.buffer);
    const sheet = workbook.worksheets[0];
    const [barangay] = await sql()`select name from ekapon.barangays where id = ${barangayA}`;
    sheet.getCell('A9').value = new Date('2026-01-12T00:00:00.000Z');
    sheet.getCell('B9').value = `${tag} Kapon Client`;
    sheet.getCell('C9').value = barangay.name;
    sheet.getCell('D9').value = 2;
    sheet.getCell('G9').value = 1;
    const fileBytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const payload = { filename: `${tag}-report.xlsx`, data: fileBytes.toString('base64') };

    const preview = await call('POST', '/api/v1/spay-neuter-report', { cookie: admin, json: { ...payload, mode: 'preview' } });
    expect(preview.status).toBe(200);
    expect(preview.json).toMatchObject({ valid: true, recordCount: 1, procedures: 3, months: [1] });
    const invalidRolePreview = await call('POST', '/api/v1/spay-neuter-report', { cookie: paravetA, json: { ...payload, mode: 'preview' } });
    expect(invalidRolePreview.status).toBe(403);

    const imported = await call('POST', '/api/v1/spay-neuter-report', { cookie: admin, json: { ...payload, mode: 'import' } });
    expect(imported.status).toBe(200);
    expect(imported.json).toMatchObject({ imported: 1, procedures: 3 });
    const [service] = await sql()`
      select record_id, record_data from ekapon.dashboard_records
       where dataset = 'services' and record_data->>'clientName' = ${`${tag} Kapon Client`}
    `;
    expect(service.record_data).toMatchObject({
      service: 'Kapon (Spay and Neuter)', status: 'Completed', date: '2026-01-12',
      totalProcedures: 3, canineCastrated: 2, felineSpayed: 1, source: 'spay-neuter-monthly-report',
    });
    const searchable = await call('GET', `/api/v1/records/services?page=1&pageSize=10&q=${encodeURIComponent(tag)}`, { cookie: admin });
    expect(searchable.json.data.some((row: Record<string, unknown>) => row.id === service.record_id)).toBe(true);
    const analytics = await call('GET', '/api/v1/analytics?year=2026&source=live', { cookie: admin });
    expect(analytics.status).toBe(200);
    expect(analytics.json.monthly.find((row: { month: number }) => row.month === 1).current.spayNeuterServices).toBeGreaterThanOrEqual(3);
    const exported = await call(
      'GET',
      `/api/v1/spay-neuter-report?mode=export&year=2026&month=1&barangay=${encodeURIComponent(barangay.name)}`,
      { cookie: admin },
    );
    expect(exported.status).toBe(200);
    expect(exported.json).toMatchObject({ recordCount: 1, procedures: 3 });
    const exportWorkbook = new ExcelJS.Workbook();
    const exportBytes = Buffer.from(exported.json.data, 'base64');
    const exportCopy = new Uint8Array(exportBytes.byteLength);
    exportCopy.set(exportBytes);
    await exportWorkbook.xlsx.load(exportCopy.buffer);
    expect(exportWorkbook.worksheets[0].getCell('B9').value).toBe(`${tag} Kapon Client`);
    const duplicate = await call('POST', '/api/v1/spay-neuter-report', { cookie: admin, json: { ...payload, mode: 'import' } });
    expect(duplicate.status).toBe(409);

    const undone = await call('POST', '/api/v1/records/services/undo-import', {
      cookie: admin, json: { batchId: imported.json.batchId },
    });
    expect(undone.status).toBe(200);
    expect((await sql()`
      select count(*)::int as count from ekapon.dashboard_records
       where dataset = 'services' and record_data->>'clientName' = ${`${tag} Kapon Client`}
    `)[0].count).toBe(0);
    const reimported = await call('POST', '/api/v1/spay-neuter-report', { cookie: admin, json: { ...payload, mode: 'import' } });
    expect(reimported.status).toBe(200);
    await call('POST', '/api/v1/records/services/undo-import', { cookie: admin, json: { batchId: reimported.json.batchId } });
  });
});

describe('retired resident intake', () => {
  it('removes photo submission and review routes for every role', async () => {
    for (const cookie of [user, paravetA, admin, superAdmin]) {
      expect((await call('GET', '/api/v1/id-verification', { cookie })).status).toBe(404);
      expect((await call('POST', '/api/v1/id-verification', { cookie, json: { mime: 'image/jpeg', data: 'retired' } })).status).toBe(404);
      expect((await call('GET', '/api/v1/id-verification/1/photo', { cookie })).status).toBe(404);
      expect((await call('POST', '/api/v1/id-verification/1/decision', { cookie, json: { outcome: 'verified' } })).status).toBe(404);
    }
  });

  it('rejects resident sessions and reports retired submissions to staff', async () => {
    const resident = await call('POST', '/api/v1/prelistings', { cookie: user, json: {} });
    expect(resident.status).toBe(401);
    expect(resident.json.error.code).toBe('UNAUTHENTICATED');
    expect((await call('GET', '/api/v1/prelistings', { cookie: user })).status).toBe(401);
    const retired = await call('POST', '/api/v1/prelistings', { cookie: admin, json: {} });
    expect(retired.status).toBe(410);
    expect(retired.json.error.code).toBe('PRELISTING_RETIRED');
  });
});

describe('paginated operational lists', () => {
  it('filters and paginates prelistings and activity on the server', async () => {
    await sql()`insert into ekapon.prelistings (reference, owner_name, mobile, barangay_id, program, pets)
      values (${`${tag}-historical`}, ${`${tag}Prelist`}, '0912-345-6789', ${barangayA}, 'Anti-rabies',
              ${sql().json([{ name: 'Test pet', species: 'Dog', sex: 'Male', age: 2 }])})`;

    const prelistings = await call('GET', `/api/v1/prelistings?page=1&pageSize=1&q=${tag}&sort=owner&dir=asc`, { cookie: admin });
    expect(prelistings.status).toBe(200);
    expect(prelistings.json).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(prelistings.json.data[0].owner).toBe(`${tag}Prelist`);
    const ownHistory = await call('GET', `/api/v1/prelistings?q=${tag}`, { cookie: paravetA });
    expect(ownHistory.json.data).toEqual(expect.arrayContaining([expect.objectContaining({ owner: `${tag}Prelist` })]));
    const outsideHistory = await call('GET', `/api/v1/prelistings?q=${tag}`, { cookie: paravetB });
    expect(outsideHistory.json.data).toEqual([]);

    const createdActivity = await call('POST', '/api/v1/activity', {
      cookie: superAdmin, json: { action: `Pagination ${tag}`, detail: 'Filter and page test' },
    });
    expect(createdActivity.status).toBe(200);
    const activity = await call('GET', `/api/v1/activity?page=1&pageSize=1&q=${tag}&sort=action&dir=asc`, { cookie: superAdmin });
    expect(activity.status).toBe(200);
    expect(activity.json).toMatchObject({ page: 1, pageSize: 1 });
    expect(activity.json.total).toBeGreaterThanOrEqual(1);
    expect(activity.json.data).toHaveLength(1);
    expect(activity.json.data[0].action).toContain(tag);
  });
});

describe('notification inbox lifecycle', () => {
  it('separates unread, read, and archived messages and only changes the recipient’s items', async () => {
    const [own] = await sql()`
      insert into ekapon.notifications (recipient_id, kind, title, body, link)
      values (${adminId}, 'test', ${`${tag}Inbox`}, 'Notification body', '/programs')
      returning id`;
    const [other] = await sql()`
      insert into ekapon.notifications (recipient_id, kind, title, body)
      values (${userId}, 'test', ${`${tag}Private`}, 'Private notification')
      returning id`;
    const unread = await call('GET', '/api/v1/notifications?view=unread', { cookie: admin });
    expect(unread.status).toBe(200);
    expect(unread.json.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: own.id, title: `${tag}Inbox` })]));
    expect(unread.json.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: other.id })]));

    expect((await call('PATCH', '/api/v1/notifications', { cookie: admin, json: { action: 'read', id: own.id } })).json.updated).toBe(1);
    const read = await call('GET', '/api/v1/notifications?view=read', { cookie: admin });
    expect(read.json.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: own.id, read_at: expect.any(String) })]));

    expect((await call('PATCH', '/api/v1/notifications', { cookie: admin, json: { action: 'archive', id: own.id } })).json.updated).toBe(1);
    const archived = await call('GET', '/api/v1/notifications?view=archived', { cookie: admin });
    expect(archived.json.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: own.id, archived_at: expect.any(String) })]));
    expect((await call('PATCH', '/api/v1/notifications', { cookie: user, json: { action: 'restore', id: own.id } })).status).toBe(401);
    expect((await call('PATCH', '/api/v1/notifications', { cookie: paravetB, json: { action: 'restore', id: own.id } })).json.updated).toBe(0);
    expect((await call('PATCH', '/api/v1/notifications', { cookie: admin, json: { action: 'restore', id: own.id } })).json.updated).toBe(1);
    const restored = await call('GET', '/api/v1/notifications?view=read', { cookie: admin });
    expect(restored.json.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: own.id, archived_at: null })]));
  });
});

describe('operational analytics', () => {
  it('separates synthetic samples from live totals and scopes Paravet results by barangay', async () => {
    const [a] = await sql()`select name from ekapon.barangays where id = ${barangayA}`;
    const [b] = await sql()`select name from ekapon.barangays where id = ${barangayB}`;
    const ownerRows = [
      { id: `${tag}analytics-owner-live`, name: `${tag} Live registry owner`, barangay: a.name, petName: `${tag}analytics-live`, species: 'Dog' },
      { id: `${tag}analytics-undated-owner`, name: 'Undated evidence owner', barangay: a.name, petName: `${tag}analytics-sample-a`, species: 'Dog', _sampleData: true, _sampleBatchId: `${tag}-batch` },
      { id: `${tag}analytics-owner-b`, name: `${tag} Other sample owner`, barangay: b.name, petName: `${tag}analytics-sample-b`, species: 'Cat', _sampleData: true, _sampleBatchId: `${tag}-batch` },
    ];
    expect((await call('POST', '/api/v1/records/owners', { cookie: admin, json: { records: ownerRows } })).status).toBe(200);
    const registeredPets = await sql()`select record_id,record_data->>'owner_id' as owner_id from ekapon.dashboard_records
      where dataset='pets' and record_data->>'owner_id'=any(${ownerRows.map((row) => row.id)})`;
    expect(registeredPets).toHaveLength(3);
    createdPetRecordIds.push(...registeredPets.map((row) => row.record_id));
    const [livePetId, samplePetAId, samplePetBId] = ownerRows.map((owner) => registeredPets.find((pet) => pet.owner_id === owner.id)!.record_id as string);
    const petRows = [
      { id: livePetId, name: `${tag}analytics-live`, owner: ownerRows[0].name, species: 'Dog', barangay: a.name, vaccine_1st: true, created_at: '2026-01-02' },
      { id: samplePetAId, name: `${tag}analytics-sample-a`, owner: ownerRows[1].name, species: 'Dog', barangay: a.name, laps: true, _sampleData: true, _sampleBatchId: `${tag}-batch`, created_at: '2026-01-02' },
      { id: samplePetBId, name: `${tag}analytics-sample-b`, owner: ownerRows[2].name, species: 'Cat', barangay: b.name, vaccine_1st: true, _sampleData: true, _sampleBatchId: `${tag}-batch`, created_at: '2026-01-02' },
    ];
    const serviceRows = [
      { id: `${tag}analytics-live-service`, service: 'Anti-rabies', outcome: 'Completed', barangay: a.name, date: '2026-01-02' },
      { id: `${tag}analytics-sample-service`, service: 'Anti-rabies', outcome: 'Completed', barangay: a.name, date: '2026-01-02', _sampleData: true, _sampleBatchId: `${tag}-batch` },
    ];
    for (const [dataset, records] of [['pets', petRows], ['services', serviceRows]] as const) {
      const path=dataset==='services'?'/api/v1/records/services/import':`/api/v1/records/${dataset}`;
      expect((await call('POST',path,{cookie:admin,json:{records,...(dataset==='services'?{batchId:randomUUID(),label:`Spay and Neuter Report: ${tag} synthetic historical services`}:{})}})).status).toBe(200);
    }

    const samples = await call('GET', '/api/v1/analytics?source=sample&year=2026', { cookie: admin });
    expect(samples.status).toBe(200);
    expect(samples.json).toMatchObject({
      source: 'sample',
      evidence: {
        methodologyVersion: 'operational-analytics-v1',
        countsByDataset: { pets: 2, services: 1 },
        dataQuality: { recordsWithValidActivityDate: expect.any(Number), recordsMissingOrInvalidActivityDate: expect.any(Number) },
      },
      totals: { pets: 2, dogs: 1, cats: 1, laps_records: 1, documented_vaccine_flags: 1, vaccine_flag_record_rate: 50, services: 1, pet_population_coverage_rate: null },
      comparison: { antiRabiesServices: { current: 1 } },
      monthly: expect.arrayContaining([expect.objectContaining({ month: 1, current: expect.objectContaining({ antiRabiesServices: 1 }) })]),
      barangayActivity: expect.arrayContaining([expect.objectContaining({ barangay: a.name, month: 1, antiRabies: 1, kapon: 0 })]),
    });
    expect(samples.json.evidence.dataQuality.recordsMissingOrInvalidActivityDate).toBeGreaterThanOrEqual(1);
    expect(samples.json.limitations).toContain('sample-isolation');
    expect(samples.json.recommendations).toHaveLength(2);
    expect(samples.json.recommendations[0]).toMatchObject({ type: 'laps-follow-up', count: 1, barangay: a.name });
    expect(samples.json.recommendations[1]).toMatchObject({ type: 'insufficient-history' });

    const sampleSearch = await call(
      'GET',
      `/api/v1/analytics?mode=records&source=sample&year=2026&dataset=pets&q=${tag}analytics-sample-a`,
      { cookie: admin },
    );
    expect(sampleSearch.status).toBe(200);
    expect(sampleSearch.json).toMatchObject({
      source: 'sample',
      year: 2026,
      dateScope: 'year',
      total: 1,
      records: [expect.objectContaining({ id: samplePetAId, dataset: 'pets' })],
    });
    const undatedInSelectedYearSearch = await call(
      'GET',
      `/api/v1/analytics?mode=records&source=sample&year=2026&dateScope=year&dataset=owners&q=${tag}analytics-undated-owner`,
      { cookie: admin },
    );
    expect(undatedInSelectedYearSearch.json.total).toBe(0);
    const undatedAllDatesSearch = await call(
      'GET',
      `/api/v1/analytics?mode=records&source=sample&year=2026&dateScope=all&dataset=owners&q=${tag}analytics-undated-owner`,
      { cookie: admin },
    );
    expect(undatedAllDatesSearch.json).toMatchObject({
      dateScope: 'all',
      total: 1,
      records: [expect.objectContaining({ id: `${tag}analytics-undated-owner`, dataset: 'owners', date: '' })],
    });

    const live = await call('GET', '/api/v1/analytics?source=live&year=2026', { cookie: admin });
    expect(live.status).toBe(200);
    expect(live.json.totals).toMatchObject({ pets: 1, dogs: 1, cats: 0, laps_records: 0, services: 1 });
    expect((await call('GET', '/api/v1/analytics?source=live&year=2026', { cookie: paravetA })).json.totals.pets).toBe(1);
    expect((await call('GET', '/api/v1/analytics?source=sample&year=2026', { cookie: paravetA })).status).toBe(403);
    expect((await call('GET', '/api/v1/analytics?source=live&year=2026', { cookie: user })).status).toBe(401);
    const paravetSearch = await call(
      'GET',
      `/api/v1/analytics?mode=records&source=live&year=2026&q=${tag}analytics-live`,
      { cookie: paravetA },
    );
    expect(paravetSearch.status).toBe(200);
    expect(paravetSearch.json.records.map((row: { id: string }) => row.id)).toEqual([livePetId]);
    expect((await call('GET', '/api/v1/analytics?mode=records&source=live&dataset=services', { cookie: paravetA })).status).toBe(403);
    const counts = await call('GET', '/api/v1/dashboard/counts', { cookie: admin });
    expect(counts.status).toBe(200);
    expect(counts.json.counts.pets).toBeGreaterThanOrEqual(3);
    expect(counts.json.counts['census-summary']).toBeGreaterThan(1);
    expect((await call('GET', '/api/v1/dashboard/counts', { cookie: paravetA })).json.counts['census-summary']).toBe(1);
    expect((await call('GET', '/api/v1/dashboard/counts', { cookie: user })).status).toBe(401);

    const reportOptions = await call('GET', '/api/v1/reports?mode=options&source=sample', { cookie: admin });
    expect(reportOptions.status).toBe(200);
    expect(reportOptions.json.pets).toEqual(expect.arrayContaining([expect.objectContaining({ id: samplePetAId, name: `${tag}analytics-sample-a` })]));
    const petOptions = await call(
      'GET',
      `/api/v1/reports?mode=options&kind=pet&source=sample&q=${tag}analytics-sample-a`,
      { cookie: admin },
    );
    expect(petOptions.json.options).toEqual([expect.objectContaining({ id: samplePetAId })]);
    const accountOptions = await call(
      'GET',
      `/api/v1/reports?mode=options&kind=account&source=live&q=${tag}`,
      { cookie: admin },
    );
    expect(accountOptions.json.options).toEqual(expect.arrayContaining([expect.objectContaining({ id: String(adminId) })]));
    expect((await call('GET', '/api/v1/reports?mode=options', { cookie: user })).status).toBe(401);

    const profile = await call('GET', `/api/v1/reports?mode=barangay&source=live&barangayId=${barangayA}`, { cookie: admin });
    expect(profile.status).toBe(200);
    expect(profile.json).toMatchObject({
      source: 'live',
      barangay: { id: barangayA, name: a.name },
      paravets: expect.arrayContaining([expect.objectContaining({ status: 'Active' })]),
      dashboardRecords: expect.arrayContaining([expect.objectContaining({ dataset: 'pets', count: 1 })]),
    });

    const customReport = await call(
      'GET',
      `/api/v1/reports?mode=report&source=sample&year=2026&categories=pets,field-operations&petId=${samplePetAId}`,
      { cookie: admin },
    );
    expect(customReport.status).toBe(200);
    expect(customReport.json.header).toMatchObject({ source: 'sample', year: 2026, municipality: 'San Jose del Monte' });
    expect(customReport.json.categories).toHaveLength(1);
    expect(customReport.json.categories[0]).toMatchObject({
      key: 'pets',
      total: 1,
      records: [expect.objectContaining({ id: samplePetAId })],
    });
    expect(customReport.json.header.methodologyVersion).toBe('operational-analytics-v1');

    const searchedReport = await call(
      'GET',
      `/api/v1/reports?mode=report&source=sample&year=2026&categories=pets&q=${tag}analytics-sample-b`,
      { cookie: admin },
    );
    expect(searchedReport.status).toBe(200);
    expect(searchedReport.json.categories).toMatchObject([
      { key: 'pets', total: 1, records: [expect.objectContaining({ id: samplePetBId })] },
    ]);

    const fullReport = await call(
      'GET',
      `/api/v1/reports?mode=report&source=live&year=2026&barangayId=${barangayA}&categories=overview,registry,pets,census,accounts,field-operations,prelistings`,
      { cookie: admin },
    );
    expect(fullReport.status).toBe(200);
    expect(fullReport.json.categories.map((section: { key: string }) => section.key)).toEqual([
      'overview', 'registry', 'pets', 'census', 'accounts', 'field-operations', 'prelistings',
    ]);
  });
});

describe('sample analytics fixture lifecycle', () => {
  it('exports and removes the current versioned sample batch', async () => {
    const [barangay] = await sql()`select name from ekapon.barangays where id=${barangayA}`;
    const pairedOwner = {
      id: `${tag}analytics-backup-owner`, name: `${tag} Sample batch owner`, barangay: barangay.name,
      petName: 'Sample Analytics Record', species: 'Dog', _sampleData: true, _sampleBatchId: 'module-c-mock-simulation-v4',
    };
    expect((await call('POST', '/api/v1/records/owners', { cookie: admin, json: { records: [pairedOwner] } })).status).toBe(200);
    const [registeredPet] = await sql()`select record_id from ekapon.dashboard_records
      where dataset='pets' and record_data->>'owner_id'=${pairedOwner.id}`;
    createdPetRecordIds.push(registeredPet.record_id);
    const record = {
      id: registeredPet.record_id,
      name: 'Sample Analytics Record',
      owner: pairedOwner.name,
      species: 'Dog',
      barangay: barangay.name,
      _sampleData: true,
      _sampleBatchId: 'module-c-mock-simulation-v4',
    };
    expect((await call('POST', '/api/v1/records/pets', { cookie: admin, json: { records: [record] } })).status).toBe(200);
    const backup = await call('GET', '/api/v1/sample-data/backup', { cookie: admin });
    expect(backup.json).toMatchObject({ format: 'module-c-mock-simulation-v4', contains: { sampleRecords: 2 } });
    expect((await call('GET', '/api/v1/sample-data', { cookie: admin })).json.count).toBe(2);
    expect((await call('DELETE', '/api/v1/sample-data', { cookie: admin })).json.deleted).toBe(2);
    expect((await call('GET', '/api/v1/sample-data', { cookie: admin })).json.count).toBe(0);
  });
});

describe('role access boundaries', () => {
  it('rejects staff operations for the wrong roles without leaking list data', async () => {
    expect((await call('GET', '/api/v1/accounts', { cookie: user })).status).toBe(401);
    expect((await call('GET', '/api/v1/accounts', { cookie: paravetA })).status).toBe(403);
    expect((await call('GET', '/api/v1/access/grants', { cookie: admin })).status).toBe(403);
    expect((await call('POST', '/api/v1/issues', {
      cookie: superAdmin, json: { title: 'Invalid reporter', description: 'This role cannot file this issue.', severity: 'normal' },
    })).status).toBe(403);
    expect((await call('POST', '/api/v1/issues', {
      cookie: user, json: { title: 'Invalid reporter', description: 'Users cannot file staff issue reports.', severity: 'normal' },
    })).status).toBe(401);
    const ownIdHistory = await call('GET', '/api/v1/id-verification?status=all', { cookie: user });
    expect(ownIdHistory.status).toBe(404);
  });
});

describe('Paravet temporary-password renewal', () => {
  it('allows Admin and SuperAdmin to issue a fresh one-time password only for a Paravet', async () => {
    const paravetId = ids[3];
    const userId = ids[4];
    const [paravet] = await sql()`select account_key from ekapon.accounts where id = ${paravetId}`;
    const first = await call('POST', `/api/v1/accounts/${paravetId}/renew-temp-password`, { cookie: admin, json: {} });
    expect(first.status).toBe(200);
    expect(first.json.temporaryPassword).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    expect(first.json.expiresInMinutes).toBe(15);

    const renewed = await call('POST', `/api/v1/accounts/${paravetId}/renew-temp-password`, { cookie: superAdmin, json: {} });
    expect(renewed.status).toBe(200);
    expect(renewed.json.temporaryPassword).not.toBe(first.json.temporaryPassword);
    expect((await call('POST', '/api/v1/auth/first-signin', {
      json: { client: 'salin', accountKey: paravet.account_key, temporaryPassword: first.json.temporaryPassword },
    })).status).toBe(401);
    const signIn = await call('POST', '/api/v1/auth/first-signin', {
      json: { client: 'salin', accountKey: paravet.account_key, temporaryPassword: renewed.json.temporaryPassword },
    });
    expect(signIn.status).toBe(200);
    expect(signIn.json.mustCreatePassword).toBe(true);
    expect((await call('POST', `/api/v1/accounts/${userId}/renew-temp-password`, { cookie: admin, json: {} })).status).toBe(403);
  });
});

describe('temporary access and permission requests', () => {
  it('lets Admin request and SuperAdmin decide a grant; only SuperAdmin can manage grants', async () => {
    const created = await call('POST', '/api/v1/access/requests', {
      cookie: admin, json: { permission: 'archive', barangayId: barangayA, reason: `Temporary archive need ${tag}` },
    });
    expect(created.status).toBe(201);
    expect((await call('GET', '/api/v1/access/requests', { cookie: admin })).json.data[0]).toMatchObject({ status: 'pending', permission: 'archive' });
    expect((await call('GET', '/api/v1/access/requests', { cookie: superAdmin })).json.data.some((row: { id: number }) => row.id === created.json.id)).toBe(true);
    expect((await call('POST', '/api/v1/access/grants', { cookie: admin, json: {} })).status).toBe(403);
    const decision = await call('POST', `/api/v1/access/requests/${created.json.id}/decision`, {
      cookie: superAdmin, json: { approve: true, reason: 'Approved for field work', remarks: `Coverage ${tag}`, days: 5 },
    });
    expect(decision.status).toBe(200);
    const grants = await call('GET', '/api/v1/access/grants', { cookie: superAdmin });
    const grant = grants.json.data.find((row: { granteeName: string; permission: string }) => row.permission === 'archive' && row.granteeName.includes(tag));
    expect(grant).toBeTruthy();
    const revoked = await call('DELETE', `/api/v1/access/grants/${grant.id}`, { cookie: superAdmin, json: { reason: `Completed ${tag}` } });
    expect(revoked.status).toBe(200);
  });
});

describe('issue reports', () => {
  it('keeps reports scoped to their reporter and lets only SuperAdmin update status', async () => {
    const submitted = await call('POST', '/api/v1/issues', {
      cookie: admin, json: { title: `${tag} Issue`, description: 'A reproducible test issue report.', severity: 'high' },
    });
    expect(submitted.status).toBe(201);
    expect((await call('GET', '/api/v1/issues', { cookie: admin })).json.data.some((row: { id: number }) => row.id === submitted.json.id)).toBe(true);
    expect((await call('GET', '/api/v1/issues', { cookie: paravetA })).json.data.some((row: { id: number }) => row.id === submitted.json.id)).toBe(false);
    expect((await call('PATCH', `/api/v1/issues/${submitted.json.id}`, { cookie: admin, json: { status: 'resolved', resolution: 'fixed' } })).status).toBe(403);
    const updated = await call('PATCH', `/api/v1/issues/${submitted.json.id}`, { cookie: superAdmin, json: { status: 'resolved', resolution: 'Fixed after review.' } });
    expect(updated.status).toBe(200);
    expect((await call('GET', '/api/v1/issues?status=resolved', { cookie: superAdmin })).json.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: submitted.json.id, status: 'resolved', resolution: 'Fixed after review.' }),
    ]));
    expect((await call('POST', '/api/v1/issues', { cookie: user, json: {} })).status).toBe(401);
  });
});
