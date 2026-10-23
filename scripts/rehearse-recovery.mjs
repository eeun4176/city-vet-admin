import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { applyLocalSchema } from './local-schema.mjs';

// Always create a new in-memory database. Never load environment files, a user
// supplied archive, or an existing data directory. Output contains synthetic data.
const startedAt = new Date().toISOString();
const checks = [];
const source = new PGlite({ extensions: { pgcrypto } });
let restored, socket, apiServer, closeDb;
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const hash = value => createHash('sha256').update(value).digest('hex');
const identifier = value => { assert.match(value, /^[a-z_][a-z0-9_]*$/); return `"${value}"`; };
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
async function fingerprint(db) {
  const tables = (await db.query("select tablename from pg_tables where schemaname='ekapon' order by tablename")).rows;
  const result = [];
  for (const { tablename } of tables) {
    const rows = (await db.query(`select to_jsonb(t)::text as value from ekapon.${identifier(tablename)} t order by to_jsonb(t)::text`)).rows;
    result.push({ table: tablename, rows: rows.length, sha256: hash(rows.map(r => r.value).join('\n')) });
  }
  const indexes = (await db.query("select indexname,indexdef from pg_indexes where schemaname='ekapon' order by indexname")).rows;
  const constraints = (await db.query("select c.conrelid::regclass::text as relation,c.conname,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='ekapon' order by 1,2")).rows;
  const routines = (await db.query("select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ekapon' and p.prokind='f' order by 1")).rows;
  return { tables: result, schemaSha256: hash(JSON.stringify([indexes, constraints, routines])), indexes: indexes.length, constraints: constraints.length, routines: routines.length };
}
await mkdir('output/release', { recursive: true });
await writeFile('output/release/recovery-results.json', JSON.stringify({ status: 'running', startedAt, environment: 'disposable-local-PGlite-only' }, null, 2));
try {
  await source.waitReady;
  await applyLocalSchema(source);
  const dbPort = await freePort();
  Object.assign(process.env, { LOCAL_TEST_MODE: '1', NODE_ENV: 'test', DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${dbPort}/postgres`, JWT_SECRET: `synthetic-recovery-only-${randomUUID()}`, ALLOWED_ORIGINS: '' });
  socket = new PGLiteSocketServer({ db: source, host: '127.0.0.1', port: dbPort, maxConnections: 4 });
  await socket.start();
  const { dispatchApi } = await import('../server/api-dispatch.ts');
  const { sessionCookie } = await import('../server/auth.ts');
  ({ closeDb } = await import('../server/db.ts'));
  apiServer = http.createServer((req, res) => { void dispatchApi(req, res); });
  await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${apiServer.address().port}`;
  const host = (await source.query('select id,name from ekapon.barangays order by id limit 1')).rows[0];
  const staff = (await source.query("insert into ekapon.accounts(username,account_type,first_name,last_name,password_hash) values('recoverysuper','SuperAdmin','Synthetic','Recovery Super',extensions.crypt('RecoveryOnly!2026',extensions.gen_salt('bf',4))) returning id")).rows[0];
  const field = (await source.query("insert into ekapon.accounts(account_type,first_name,last_name,barangay_id,password_hash) values('Paravet','Synthetic','Recovery Paravet',$1,extensions.crypt('RecoveryOnly!2026',extensions.gen_salt('bf',4))) returning id,account_key", [host.id])).rows[0];
  const resident = (await source.query("insert into ekapon.accounts(account_type,first_name,last_name,barangay_id) values('User','Synthetic','Historical Resident',$1) returning id", [host.id])).rows[0];
  const cookies = {
    super: (await sessionCookie({ id: staff.id, type: 'SuperAdmin' }, 'full')).split(';')[0],
    field: (await sessionCookie({ id: field.id, type: 'Paravet' }, 'full')).split(';')[0],
  };
  async function call(role, path, body, method = body ? 'POST' : 'GET', expected = [200, 201]) {
    const response = await fetch(`${base}/api/v1${path}`, { method, headers: { Origin: base, Cookie: cookies[role], 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    assert.ok(expected.includes(response.status), `${path}: ${response.status} ${JSON.stringify(value)}`);
    return value;
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const program = await call('super', '/program-workspace', { action: 'create', schedule: { title: 'Synthetic recovery program', date: today, location: 'Synthetic court', hostBarangayId: host.id, startTime: '08:00', endTime: '16:00', slots: 2, processes: ['Microchipping'], status: 'Open' } });
  const post = body => call('super', '/stub-workflow', body);
  const batch = await call('field', '/stub-workflow', { action: 'request-batch', campaignId: program.campaignId, recipientId: field.id, quantity: 2 });
  await post({ action: 'review-batch', batchId: batch.batchId, decision: 'approve', quantity: 2 });
  await post({ action: 'confirm-print', batchId: batch.batchId });
  await post({ action: 'handover', batchId: batch.batchId });
  const stock = await call('field', `/stub-workflow?mode=batch&batchId=${batch.batchId}`);
  const ticket = stock.stubs[0];
  const owner = { name: 'Synthetic Recovery Owner', address: 'Synthetic street', mobile: '', barangayId: host.id };
  const pets = [{ name: 'Synthetic Recovery Pet', species: 'Dog', sex: 'Male', ageMonths: 0, processes: ['Microchipping'] }];
  await call('field', '/stub-workflow', { action: 'issue', stubId: ticket.id, owner, pets });
  const redemption = { action: 'redeem', stubId: ticket.id, requestId: randomUUID(), attendedOn: today, owner, pets: pets.map(p => ({ ...p, outcome: 'Completed' })) };
  await call('field', '/stub-workflow', redemption);
  const made = await call('field', '/census/submissions', { label: 'Synthetic recovery census', censusDate: today, source: 'csv', owners: [{ ownerName: 'Synthetic Census Recovery Owner', address: 'Synthetic census street', pets: [{ petName: 'Synthetic Census Recovery Pet', species: 'Cat', sex: 'Female', ageMonths: 0, sterilized: null, vaccine1st: false }] }] });
  const submissionId = made.submission.id;
  const detail = await call('super', `/census/submissions/${submissionId}`);
  await call('super', `/census/submissions/${submissionId}/decisions`, { decisions: detail.owners.map(o => ({ ownerId: o.id, decision: 'new' })) }, 'PUT');
  const plan = await call('super', `/census/submissions/${submissionId}/decisions`);
  await call('super', `/census/submissions/${submissionId}/review`, { decision: 'approve', reviewToken: plan.token });
  const approved = await call('field', `/census/submissions/${submissionId}`);
  const ownerId = approved.owners[0].registryOwnerId;
  const registry = await call('field', `/registry-workspace?kind=owners&id=${ownerId}`);
  const draft = { requestId: randomUUID(), ownerId, servedOn: today, location: 'Synthetic clinic', provider: 'Synthetic provider', note: '', pets: [{ petId: registry.pets[0].id, procedures: [{ process: 'Microchipping', outcome: 'Completed' }] }] };
  const preview = await call('super', '/field-records', { action: 'preview', draft });
  await call('super', '/field-records', { action: 'save', draft, token: preview.token });
  const photo = await (await import('qrcode')).toBuffer('Synthetic census recovery photo only', { width: 64 });
  const attachment = (await source.query("insert into ekapon.census_attachments(submission_id,mime,image,uploaded_by) values($1,'image/png',$2,$3) returning id", [submissionId, photo, field.id])).rows[0];
  await source.query("insert into ekapon.account_preferences(account_id,profile_photo,profile_photo_mime) values($1,$2,'image/png') on conflict(account_id) do update set profile_photo=excluded.profile_photo,profile_photo_mime=excluded.profile_photo_mime", [field.id, photo]);
  await source.query("insert into ekapon.access_grants(grantee_id,permission,reason,granted_by,granted_by_name,expires_at) values($1,'archive','Synthetic recovery scope',$2,'Synthetic Super',now()+interval '1 day')", [field.id, staff.id]);
  const verification = (await source.query("insert into ekapon.id_verifications(user_id,barangay_id,mime,image,status,reviewer_id,reviewer_name,reviewed_at) values($1,$2,'image/png',$3,'verified',$4,'Synthetic reviewer',now()) returning id", [resident.id, host.id, Buffer.from('SYNTHETIC-RETIRED-ID-ONLY'), staff.id])).rows[0];
  await source.query("insert into ekapon.id_verification_log(verification_id,user_id,user_name,reviewer_id,reviewer_name,outcome) values($1,$2,'Synthetic Historical Resident',$3,'Synthetic reviewer','verified')", [verification.id, resident.id, staff.id]);
  await source.exec(await readFile('db/011_program_interest.sql', 'utf8'));
  assert.equal((await source.query('select image is null and purged_at is not null as purged from ekapon.id_verifications where id=$1', [verification.id])).rows[0].purged, true);
  assert.equal((await source.query('select count(*)::int as n from ekapon.id_verification_log where verification_id=$1', [verification.id])).rows[0].n, 1);
  pass('Migration 011 purges synthetic ID bytes and preserves verification decisions/history');
  const exported = await call('super', '/admin/backup');
  assert.equal(exported.recovery.completeDatabaseBackup, false);
  assert.equal(exported.recovery.applicationRestoreSupported, false);
  assert.ok(exported.data.programAttendance.some(a => Number(a.stub_id) === ticket.id));
  pass('Selected-record export identifies its recovery limits and includes canonical workflow records');
  await closeDb(); await socket.stop(); socket = undefined;
  const before = await fingerprint(source);
  const archive = await source.dumpDataDir('gzip');
  const bytes = Buffer.from(await archive.arrayBuffer());
  await mkdir('output/release', { recursive: true });
  await writeFile('output/release/recovery-synthetic.tgz', bytes);
  await source.close();
  restored = new PGlite({ extensions: { pgcrypto }, loadDataDir: new Blob([await readFile('output/release/recovery-synthetic.tgz')]) });
  await restored.waitReady;
  const after = await fingerprint(restored);
  assert.deepEqual(after, before);
  pass('Native file restored into a new database: all ekapon table rows, indexes, constraints, and routines match');
  assert.deepEqual(Buffer.from((await restored.query('select image from ekapon.census_attachments where submission_id=$1', [submissionId])).rows[0].image), photo);
  assert.equal((await restored.query('select image is null as purged from ekapon.id_verifications where id=$1', [verification.id])).rows[0].purged, true);
  const credential = (await restored.query("select o_ok from ekapon.verify_password($1,'RecoveryOnly!2026',null)", [field.account_key])).rows[0];
  assert.equal(credential.o_ok, true);
  pass('Restored credentials and manual census photos work; retired ID bytes remain absent');
  socket = new PGLiteSocketServer({ db: restored, host: '127.0.0.1', port: dbPort, maxConnections: 4 });
  await socket.start();
  const attendance = await call('field', `/stub-workflow?mode=attendance&campaignId=${program.campaignId}`);
  assert.deepEqual(attendance.summary, { owners: 1, pets: 1, completedServices: 1 });
  assert.equal((await call('field', `/stub-workflow?mode=lookup&code=${encodeURIComponent(ticket.code)}`)).stub.status, 'Redeemed');
  await call('field', '/stub-workflow', { ...redemption, requestId: randomUUID() }, 'POST', [409]);
  const found = await call('field', `/search?q=${encodeURIComponent('Synthetic Census Recovery Owner')}`);
  assert.ok(found.data.some(row => row.id === ownerId));
  assert.equal((await call('field', `/registry-workspace?kind=owners&id=${ownerId}`)).pets[0].data.age_months, 0);
  const restoredPhoto = await call('field', `/census/submissions/${submissionId}/attachments/${attachment.id}`);
  assert.equal(restoredPhoto.mime, 'image/png');
  assert.deepEqual(Buffer.from(restoredPhoto.data, 'base64'), photo);
  const restoredAccount = await call('field', '/auth/me');
  assert.ok(restoredAccount.account.grants.includes('archive'));
  assert.ok(restoredAccount.account.profilePhoto.startsWith('data:image/png;base64,'));
  assert.deepEqual(Buffer.from(restoredAccount.account.profilePhoto.slice('data:image/png;base64,'.length), 'base64'), photo);
  pass('Restored API reads preserve attendance totals, owner links, search, zero ages, and consumed QR protection');
  await closeDb(); await socket.stop(); socket = undefined;
  await restored.exec('set role ekapon_api');
  try {
    const privilege = (await restored.query("select current_user,has_column_privilege(current_user,'ekapon.id_verifications','image','SELECT') as can_read_id_image")).rows[0];
    assert.equal(privilege.current_user, 'ekapon_api'); assert.equal(privilege.can_read_id_image, false);
    for (const table of ['program_interest_campaigns', 'program_attendance', 'stub_tickets', 'standalone_services', 'registry_source_links']) await restored.query(`select count(*) from ekapon.${identifier(table)}`);
    let denied = false;
    try { await restored.query('select image from ekapon.id_verifications'); } catch (error) { denied = error.code === '42501'; }
    assert.equal(denied, true);
  } finally { await restored.exec('reset role'); }
  const previousMax = (await restored.query('select max(id)::int as id from ekapon.accounts')).rows[0].id;
  const next = (await restored.query("insert into ekapon.accounts(username,account_type,first_name,last_name) values('recoveryafterrestore','Admin','Synthetic','Next ID') returning id")).rows[0].id;
  assert.ok(Number(next) > previousMax);
  pass('Restored restricted-role access, ID-image denial, and identity sequence continue correctly');
  const result = { status: 'passed', startedAt, finishedAt: new Date().toISOString(), environment: 'disposable-local-PGlite-only', productionRestoreVerified: false, userPracticeDatabaseTouched: false, archiveBytes: bytes.length, archiveSha256: hash(bytes), checks, fingerprint: before };
  await writeFile('output/release/recovery-results.json', JSON.stringify(result, null, 2));
  console.log(`Recovery rehearsal passed (${checks.length} groups, ${before.tables.length} tables). This does not verify a Supabase backup/restore.`);
} catch (error) {
  await writeFile('output/release/recovery-results.json', JSON.stringify({ status: 'failed', startedAt, finishedAt: new Date().toISOString(), environment: 'disposable-local-PGlite-only', completedChecks: checks, failure: 'The rehearsal did not complete; see the local rehearsal log.' }, null, 2));
  throw error;
} finally {
  if (apiServer) await new Promise(resolve => apiServer.close(resolve));
  if (closeDb) await closeDb();
  if (socket) await socket.stop();
  if (restored && !restored.closed) await restored.close();
  if (!source.closed) await source.close();
}
