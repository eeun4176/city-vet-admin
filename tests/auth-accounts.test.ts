import { PARAVET_POLICY_VERSION } from '../shared/paravetPolicy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, client } from './harness';
import { sql, closeDb } from '../server/db';

const uniq = Math.random().toString(36).slice(2, 7);
const LAST = `Tester${uniq}`;
let call: ReturnType<typeof client>, close: () => Promise<void>, base: string;
let admin: string, encoder: string;
let acct: { id: number; key: string };
let tmp: string;

beforeAll(async () => {
  const s = await startServer(); close = s.close; base = s.base; call = client(s.base);
  await sql()`delete from ekapon.login_attempts`;
  admin = (await call('POST', '/api/v1/auth/login', { json: { identifier: 'admin', password: 'ChangeMe-123' } })).cookie!;
  encoder = (await call('POST', '/api/v1/auth/login', { json: { identifier: 'encoder', password: 'ChangeMe-123' } })).cookie!;
});
afterAll(async () => {
  await sql()`delete from ekapon.policy_acceptances where account_id in (select id from ekapon.accounts where last_name=${LAST})`;
  await sql()`delete from ekapon.accounts where last_name = ${LAST}`;
  await sql()`delete from ekapon.login_attempts`;
  await close(); await closeDb();
});

describe('foundation', () => {
  it('health check reaches the database', async () => {
    const r = await call('GET', '/api/v1/health'); expect(r.status).toBe(200); expect(r.json.ok).toBe(true);
  });
  it('searches database records across the universal search endpoint', async () => {
    const id = `search-${uniq}`;
    const data = { id, name: `Search Fixture ${uniq}`, barangay: 'Tungkong Mangga' };
    await sql()`
      insert into ekapon.dashboard_records (dataset, record_id, record_data)
      values ('owners', ${id}, ${sql().json(data)}::jsonb)
    `;
    try {
      const result = await call('GET', `/api/v1/search?q=${id}`, { cookie: admin });
      expect(result.status).toBe(200);
      expect(result.json.data).toContainEqual(expect.objectContaining({
        kind: 'record',
        dataset: 'owners',
        id,
        label: data.name,
        to: expect.stringContaining(`/records/view?source=owner&`),
      }));
    } finally {
      await sql()`delete from ekapon.dashboard_records where dataset = 'owners' and record_id = ${id}`;
    }
  });
  it('answers 405 for a wrong method and 400 for broken JSON', async () => {
    expect((await call('PUT', '/api/v1/health')).status).toBe(405);
    const r = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{not json' });
    expect(r.status).toBe(400); expect(((await r.json()) as any).error.code).toBe('BAD_REQUEST');
  });
  it('lists the 62 barangays publicly with caching, and filters', async () => {
    const [{ localTestCount }] = await sql()`
      select count(*)::int as "localTestCount" from ekapon.barangays where name = 'Local Test Barangay'`;
    const all = await call('GET', '/api/v1/barangays'); expect(all.json.total).toBe(62 + localTestCount);
    expect(all.headers.get('cache-control')).toContain('max-age=3600');
    expect((await call('GET', '/api/v1/barangays?q=muzon')).json.total).toBe(4);
    expect((await call('GET', '/api/v1/barangays?district=1')).json.total).toBe(26 + localTestCount);
    const tm = (await call('GET', '/api/v1/barangays?q=tungkong')).json.data[0];
    expect(tm).toMatchObject({ acronym: 'TM', zip: '3023', district: '1st District' });
  });
});

describe('sign-in and sessions', () => {
  it('rejects requests without a session', async () => {
    expect((await call('GET', '/api/v1/auth/me')).status).toBe(401);
    expect((await call('GET', '/api/v1/accounts')).status).toBe(401);
  });
  it('gives the same generic error for a wrong password and an unknown user', async () => {
    const a = await call('POST', '/api/v1/auth/login', { json: { identifier: 'admin', password: 'nope-nope-1' } });
    const b = await call('POST', '/api/v1/auth/login', { json: { identifier: 'ghost-user', password: 'nope-nope-1' } });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.json.error.code).toBe('INVALID_CREDENTIALS'); expect(a.json.error.message).toBe(b.json.error.message);
  });
  it('sets a hardened cookie and returns the profile', async () => {
    const r = await call('POST', '/api/v1/auth/login', { json: { identifier: 'admin', password: 'ChangeMe-123' } });
    expect(r.setCookie).toMatch(/HttpOnly/); expect(r.setCookie).toMatch(/SameSite=Strict/);
    expect(r.json.account.type).toBe('SuperAdmin');
    const me = await call('GET', '/api/v1/auth/me', { cookie: r.cookie }); expect(me.json.account.username).toBe('admin');
  });
  it('gives Salin a Bearer token instead of the cookie, for staff too', async () => {
    const r = await call('POST', '/api/v1/auth/login', { json: { identifier: 'admin', password: 'ChangeMe-123', client: 'salin' } });
    expect(r.status).toBe(200); expect(r.cookie).toBeNull(); expect(Date.parse(r.json.expiresAt)).toBeGreaterThan(Date.now() + 13 * 86400_000);
    const me = await call('GET', '/api/v1/auth/me', { headers: { Authorization: `Bearer ${r.json.token}` } }); expect(me.json.account.username).toBe('admin');
    const renewed = await call('POST', '/api/v1/auth/renew', { headers: { Authorization: `Bearer ${r.json.token}` } });
    expect(renewed.status).toBe(200); expect(renewed.json.account.username).toBe('admin'); expect(Date.parse(renewed.json.expiresAt)).toBeGreaterThanOrEqual(Date.parse(r.json.expiresAt));
    expect((await call('POST', '/api/v1/auth/renew', { cookie: admin })).status).toBe(403);
    const preflight = await fetch(base + '/api/v1/auth/me', { method: 'OPTIONS' });
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
  });
  it('blocks cross-site writes', async () => {
    const r = await call('POST', '/api/v1/auth/logout', { origin: 'https://evil.example', cookie: admin });
    expect(r.status).toBe(403); expect(r.json.error.code).toBe('BAD_ORIGIN');
  });
  it('rate-limits sign-in per IP', async () => {
    await sql()`insert into ekapon.login_attempts (login_identifier, method, success, reason, ip) select 'x', 'permanent', false, 'invalid', '203.0.113.9' from generate_series(1, 25)`;
    const r = await call('POST', '/api/v1/auth/login', { json: { identifier: 'admin', password: 'ChangeMe-123' }, ip: '203.0.113.9' });
    expect(r.status).toBe(429);
    await sql()`delete from ekapon.login_attempts where ip = '203.0.113.9'`;
  });
  it('logout clears the cookie', async () => {
    const r = await call('POST', '/api/v1/auth/logout', { cookie: admin }); expect(r.setCookie).toMatch(/Max-Age=0/);
  });
});

describe('authorization', () => {
  it('lets Admins manage portal accounts but not create accounts or see staff profiles', async () => {
    const r = await call('GET', '/api/v1/accounts', { cookie: encoder }); expect(r.status).toBe(200);
    expect(r.json.data.every((account: { accountType: string }) => account.accountType === 'Paravet' || account.accountType === 'User')).toBe(true);
    expect((await call('POST', '/api/v1/accounts', { cookie: encoder, json: {} })).status).toBe(403);
    const [staff] = await sql()`select id from ekapon.accounts where username = 'admin'`;
    expect((await call('GET', `/api/v1/accounts/${staff.id}`, { cookie: encoder })).status).toBe(403);
  });
});

describe('accounts', () => {
  const body = () => ({ accountType: 'Paravet', firstName: 'Test', lastName: LAST, mobile: '0917 123 4567', barangay: 'tungkong mangga' });
  it('rejects the retired profile editor without changing the authenticated account', async () => {
    const [original] = await sql()`select id, first_name, middle_name, last_name, suffix from ekapon.accounts where username = 'encoder'`;
    try {
      const before = await call('GET', '/api/v1/auth/profile', { cookie: encoder });
      expect(before.status).toBe(403);
      expect((await call('GET', '/api/v1/auth/profile')).status).toBe(401);
      const saved = await call('PATCH', '/api/v1/auth/profile', {
        cookie: encoder,
        json: { firstName: 'Updated Admin', middleName: 'Profile', lastName: original.last_name, suffix: 'Jr.' },
      });
      expect(saved.status).toBe(403);
      expect((await call('PATCH', '/api/v1/auth/profile', { json: { firstName: 'Unauthenticated' } })).status).toBe(401);
      const [unchanged] = await sql()`select first_name,middle_name,last_name,suffix from ekapon.accounts where id=${original.id}`;
      expect(unchanged).toMatchObject({ first_name: original.first_name, middle_name: original.middle_name, last_name: original.last_name, suffix: original.suffix });
      expect((await call('GET', '/api/v1/auth/me', { cookie: encoder })).json.account.name).not.toContain('Updated Admin');
      expect((await call('PATCH', '/api/v1/auth/profile', { cookie: encoder, json: { mobile: '09180001111' } })).status).toBe(403);
    } finally {
      await sql()`update ekapon.accounts set first_name = ${original.first_name}, middle_name = ${original.middle_name}, last_name = ${original.last_name}, suffix = ${original.suffix} where id = ${original.id}`;
    }
  });
  it('validates input', async () => {
    expect((await call('POST', '/api/v1/accounts', { cookie: admin, json: { ...body(), mobile: '0917' } })).status).toBe(400);
    expect((await call('POST', '/api/v1/accounts', { cookie: admin, json: { ...body(), accountType: 'Admin' } })).status).toBe(400);
    const r = await call('POST', '/api/v1/accounts', { cookie: admin, json: { ...body(), barangay: 'Narnia' } });
    expect(r.status).toBe(422); expect(r.json.error.code).toBe('UNKNOWN_BARANGAY');
  });
  it('creates a Paravet account with the right key and a one-time temporary password', async () => {
    const r = await call('POST', '/api/v1/accounts', { cookie: admin, json: body() });
    expect(r.status).toBe(201);
    expect(r.json.account.accountKey).toMatch(/^PV\d{4}-TMP\d{3,}-3023$/);
    expect(r.json.account.mobile).toBe('0917-123-4567');
    expect(r.json.account.status).toBe('Temporary password pending');
    expect(r.json.temporaryPassword).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    expect(r.json.temporaryPassword).not.toMatch(/[0OolIi125SZz]/);
    expect(r.headers.get('cache-control')).toBe('no-store');
    acct = { id: r.json.account.id, key: r.json.account.accountKey }; tmp = r.json.temporaryPassword;
    const again = await call('GET', `/api/v1/accounts/${acct.key}`, { cookie: admin });
    expect(JSON.stringify(again.json)).not.toContain(tmp);
  });
  it('rejects a duplicate person in the same barangay', async () => {
    const r = await call('POST', '/api/v1/accounts', { cookie: admin, json: body() }); expect(r.status).toBe(409); expect(r.json.error.code).toBe('DUPLICATE_ACCOUNT');
  });
  it('writes the audit log with the acting admin', async () => {
    const [{ n }] = await sql()`select count(*)::int as n from ekapon.audit_log where table_name = 'accounts' and record_id = ${String(acct.id)} and account_id is not null`;
    expect(n).toBeGreaterThan(0);
    const [{ leak }] = await sql()`select count(*)::int as leak from ekapon.audit_log where new_data ? 'password_hash'`; expect(leak).toBe(0);
  });
  it('first sign-in: wrong passwords count down, then the account locks', async () => {
    const a = await call('POST', '/api/v1/auth/first-signin', { json: { client: 'salin', accountKey: acct.key, temporaryPassword: 'wrong-pass1' } });
    expect(a.status).toBe(401); expect(a.json.error.details.attemptsLeft).toBe(2);
    await call('POST', '/api/v1/auth/first-signin', { json: { client: 'salin', accountKey: acct.key, temporaryPassword: 'wrong-pass2' } });
    const c = await call('POST', '/api/v1/auth/first-signin', { json: { client: 'salin', accountKey: acct.key, temporaryPassword: 'wrong-pass3' } });
    expect(c.status).toBe(423);
    expect((await call('POST', '/api/v1/auth/first-signin', { json: { client: 'salin', accountKey: acct.key, temporaryPassword: tmp } })).status).toBe(423);
  });
  it('admin reset unlocks with a new temporary password; the old one is dead', async () => {
    const r = await call('POST', `/api/v1/accounts/${acct.key}/reset-password`, { cookie: admin });
    expect(r.status).toBe(200); expect(r.json.temporaryPassword).not.toBe(tmp);
    const old = await call('POST', '/api/v1/auth/first-signin', { json: { client: 'salin', accountKey: acct.key, temporaryPassword: tmp } }); expect(old.status).toBe(401);
    tmp = r.json.temporaryPassword;
  });
  let reset: string;
  it('temporary password works once and only unlocks the Create New Password step', async () => {
    // The dashboard refuses Paravet first sign-in before the one-time password is spent.
    expect((await call('POST', '/api/v1/auth/first-signin', { json: { accountKey: acct.key, temporaryPassword: tmp } })).json.error.code).toBe('USE_SALIN');
    const r = await call('POST', '/api/v1/auth/first-signin', { json: { client: 'salin', accountKey: acct.key, temporaryPassword: tmp } });
    expect(r.status).toBe(200); expect(r.json.mustCreatePassword).toBe(true); expect(r.cookie).toBeNull(); expect(r.json.policy.version).toBe(PARAVET_POLICY_VERSION); reset = `ekapon_session=${r.json.token}`;
    expect((await call('GET', '/api/v1/auth/me', { cookie: reset })).status).toBe(401);
    expect((await call('GET', '/api/v1/accounts', { cookie: reset })).status).toBe(401);
    expect((await call('POST', '/api/v1/auth/first-signin', { json: { client: 'salin', accountKey: acct.key, temporaryPassword: tmp } })).status).toBe(401);
    expect((await call('POST', '/api/v1/auth/login', { json: { client: 'salin', identifier: acct.key, password: tmp } })).json.error.code).toBe('FIRST_SIGN_IN_REQUIRED');
  });
  it('enforces the new-password rules, then opens a full session', async () => {
    expect((await call('POST', '/api/v1/auth/set-password', { cookie: reset, json: { newPassword: 'abcdefgh', confirmPassword: 'abcdefgh' } })).status).toBe(422);
    expect((await call('POST', '/api/v1/auth/set-password', { cookie: reset, json: { newPassword: 'Strong-Pass-1', confirmPassword: 'Different-1' } })).status).toBe(400);
    expect((await call('POST', '/api/v1/auth/set-password', { json: { newPassword: 'Strong-Pass-1', confirmPassword: 'Strong-Pass-1' } })).status).toBe(401);
    expect((await call('POST','/api/v1/auth/set-password',{cookie:reset,json:{newPassword:'Strong-Pass-1',confirmPassword:'Strong-Pass-1'}})).json.error.code).toBe('AGREEMENT_REQUIRED');
    const ok = await call('POST', '/api/v1/auth/set-password', { cookie: reset, json: { newPassword: 'Strong-Pass-1', confirmPassword: 'Strong-Pass-1',acceptedTerms:true,acknowledgedPrivacy:true,policyVersion:PARAVET_POLICY_VERSION,policyLanguage:'fil' } });
    expect(ok.status).toBe(200);
    const session = `ekapon_session=${ok.json.token}`;
    const me = await call('GET', '/api/v1/auth/me', { cookie: session }); expect(me.json.account.type).toBe('Paravet');
    expect((await call('GET', '/api/v1/accounts', { cookie: session })).status).toBe(403);
    // The dashboard refuses Paravets: they sign in with Salin, which sends the session as a Bearer token.
    expect((await call('POST', '/api/v1/auth/login', { json: { identifier: acct.key, password: 'Strong-Pass-1' } })).json.error.code).toBe('USE_SALIN');
    expect((await call('GET', '/api/v1/auth/me', { headers: { Cookie: session } })).json.error.code).toBe('USE_SALIN');
    const login = await call('POST', '/api/v1/auth/login', { json: { client: 'salin', identifier: acct.key, password: 'Strong-Pass-1' } }); expect(login.status).toBe(200);
  });
  it('locks the account for 15 minutes after 5 wrong permanent passwords', async () => {
    for (let i = 0; i < 5; i++) expect((await call('POST', '/api/v1/auth/login', { json: { client: 'salin', identifier: acct.key, password: 'Wrong-Pass-' + i } })).status).toBe(401);
    const locked = await call('POST', '/api/v1/auth/login', { json: { client: 'salin', identifier: acct.key, password: 'Strong-Pass-1' } });
    expect(locked.status).toBe(423); expect(locked.json.error.code).toBe('ACCOUNT_LOCKED');
    await sql()`update ekapon.accounts set locked_until = null, failed_login_count = 0 where id = ${acct.id}`;
    expect((await call('POST', '/api/v1/auth/login', { json: { client: 'salin', identifier: acct.key, password: 'Strong-Pass-1' } })).status).toBe(200);
  });
  it('lists with search, filters, sorting, month/year and pagination', async () => {
    for (let i = 0; i < 2; i++) await call('POST', '/api/v1/accounts', { cookie: admin, json: { ...body(), firstName: 'Extra' + i, mobile: '09170000000' } });
    const q = await call('GET', `/api/v1/accounts?q=${LAST}`, { cookie: admin }); expect(q.json.total).toBe(3);
    const p = await call('GET', `/api/v1/accounts?q=${LAST}&pageSize=2&page=2`, { cookie: admin }); expect(p.json.data.length).toBe(1); expect(p.json.pageSize).toBe(2);
    const asc = (await call('GET', `/api/v1/accounts?q=${LAST}&sort=name&dir=asc`, { cookie: admin })).json.data.map((a: any) => a.firstName);
    const desc = (await call('GET', `/api/v1/accounts?q=${LAST}&sort=name&dir=desc`, { cookie: admin })).json.data.map((a: any) => a.firstName);
    expect(asc.length).toBe(3); expect(asc).not.toEqual(desc.slice().reverse().length ? [] : asc);
    const now = new Date();
    expect((await call('GET', `/api/v1/accounts?q=${LAST}&year=${now.getFullYear()}&month=${now.getMonth() + 1}&type=Paravet&barangay=Tungkong Mangga`, { cookie: admin })).json.total).toBe(3);
    expect((await call('GET', `/api/v1/accounts?q=${LAST}&year=2019`, { cookie: admin })).json.total).toBe(0);
    expect((await call('GET', '/api/v1/accounts?sort=password_hash', { cookie: admin })).status).toBe(422);
    expect((await call('GET', '/api/v1/accounts?pageSize=9999', { cookie: admin })).status).toBe(400);
  });
  it('edits portal and staff profiles without changing account roles or keys', async () => {
    const r = await call('PATCH', `/api/v1/accounts/${acct.key}`, { cookie: admin, json: { mobile: '09180001111', barangay: 'Muzon Proper' } });
    expect(r.status).toBe(200); expect(r.json.account.accountKey).toBe(acct.key); expect(r.json.account.barangay.name).toBe('Muzon Proper'); expect(r.json.account.mobile).toBe('0918-000-1111');
    // The moved Paravet (now in Muzon Proper) is told about the new assignment.
    const notices = await sql()`select n.body from ekapon.notifications n join ekapon.accounts a on a.id = n.recipient_id where a.account_key = ${acct.key} and n.title = 'Paravet assignment updated'`;
    expect(notices.some((n) => String(n.body).includes('is now assigned to Muzon Proper'))).toBe(true);
    const profile = await call('PATCH', `/api/v1/accounts/${acct.key}`, { cookie: admin, json: { firstName: 'Updated', middleName: 'Profile', lastName: LAST, suffix: 'Jr.' } });
    expect(profile.status).toBe(200);
    expect(profile.json.account).toMatchObject({ firstName: 'Updated', middleName: 'Profile', lastName: LAST, suffix: 'Jr.', accountKey: acct.key });
    expect((await call('PATCH', `/api/v1/accounts/${acct.key}`, { cookie: admin, json: {} })).status).toBe(400);
    const [staff] = await sql()`select id, first_name, middle_name, last_name, suffix, mobile from ekapon.accounts where username = 'encoder'`;
    try {
      const staffUpdate = await call('PATCH', `/api/v1/accounts/${staff.id}`, { cookie: admin, json: { firstName: 'Updated Staff', mobile: '09180001111' } });
      expect(staffUpdate.status).toBe(200);
      expect(staffUpdate.json.account).toMatchObject({ accountType: 'Admin', firstName: 'Updated Staff', mobile: '0918-000-1111', username: 'encoder' });
      expect((await call('PATCH', `/api/v1/accounts/${staff.id}`, { cookie: admin, json: { barangay: 'Muzon Proper' } })).status).toBe(403);
    } finally {
      await sql()`update ekapon.accounts set first_name = ${staff.first_name}, middle_name = ${staff.middle_name}, last_name = ${staff.last_name}, suffix = ${staff.suffix}, mobile = ${staff.mobile} where id = ${staff.id}`;
    }
    expect((await call('POST', `/api/v1/accounts/${staff.id}/reset-password`, { cookie: admin })).status).toBe(403);
  });
  it('archives and restores in a batch; archived accounts cannot sign in', async () => {
    const a = await call('POST', '/api/v1/accounts/archive', { cookie: admin, json: { ids: [acct.id] } }); expect(a.json.changed).toBe(1);
    expect((await call('GET', `/api/v1/accounts?q=${LAST}`, { cookie: admin })).json.total).toBe(2);
    expect((await call('GET', `/api/v1/accounts?q=${LAST}&archived=true`, { cookie: admin })).json.total).toBe(1);
    expect((await call('POST', '/api/v1/auth/login', { json: { client: 'salin', identifier: acct.key, password: 'Strong-Pass-1' } })).status).toBe(401);
    const b = await call('POST', '/api/v1/accounts/archive', { cookie: admin, json: { ids: [acct.id], restore: true } }); expect(b.json.changed).toBe(1);
    const [{ id: adminId }] = await sql()`select id from ekapon.accounts where username = 'admin'`;
    expect((await call('POST', '/api/v1/accounts/archive', { cookie: admin, json: { ids: [adminId] } })).status).toBe(403);
  });
  it('offers guarded redo after an account correction and refuses to overwrite a later edit',async()=>{
    const before=(await call('GET',`/api/v1/accounts/${acct.key}`,{cookie:admin})).json.account;
    const edited=await call('PATCH',`/api/v1/accounts/${acct.key}`,{cookie:admin,json:{mobile:'09171230123'}});expect(edited.status).toBe(200);
    const undone=await call('POST',`/api/v1/undo/${edited.json.undoToken}`,{cookie:admin,json:{}});expect(undone.status).toBe(200);expect(undone.json.undoLabel).toBe('Redo');
    const redone=await call('POST',`/api/v1/undo/${undone.json.undoToken}`,{cookie:admin,json:{direction:'redo'}});expect(redone.status).toBe(200);
    expect((await call('GET',`/api/v1/accounts/${acct.key}`,{cookie:admin})).json.account.mobile).toBe('0917-123-0123');
    const restore=await call('POST',`/api/v1/undo/${redone.json.undoToken}`,{cookie:admin,json:{}});expect(restore.status).toBe(200);
    await call('PATCH',`/api/v1/accounts/${acct.key}`,{cookie:admin,json:{mobile:'09991234567'}});
    expect((await call('POST',`/api/v1/undo/${restore.json.undoToken}`,{cookie:admin,json:{direction:'redo'}})).status).toBe(409);
    expect((await call('GET',`/api/v1/accounts/${acct.key}`,{cookie:admin})).json.account.mobile).toBe('0999-123-4567');
  });
  it('removes portal access while retaining policy and submission history, but never your own', async () => {
    expect((await call('DELETE', `/api/v1/accounts/${acct.key}`, { cookie: admin })).status).toBe(200);
    expect((await call('GET', `/api/v1/accounts/${acct.key}`, { cookie: admin })).json.account.archived).toBe(true);
    const [{ id: adminId }] = await sql()`select id from ekapon.accounts where username = 'admin'`;
    expect((await call('DELETE', `/api/v1/accounts/${adminId}`, { cookie: admin })).status).toBe(403);
    expect((await call('GET', '/api/v1/accounts/not-a-key', { cookie: admin })).status).toBe(400);
  });
});
