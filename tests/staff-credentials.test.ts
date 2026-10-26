import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, client } from './harness';
import { sql, closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';

const tag = `cred${randomUUID().slice(0, 8)}`;
let call: ReturnType<typeof client>, close: () => Promise<void>;
let admin: string, paravet: string;
const accounts: number[] = [];
const change = (cookie: string, json: Record<string, unknown>) => call('PATCH', '/api/v1/auth/credentials', { cookie, json });
const login = (identifier: string, password: string) => call('POST', '/api/v1/auth/login', { json: { identifier, password } });

beforeAll(async () => {
  const server = await startServer(); call = client(server.base); close = server.close;
  const [area] = await sql()`select id from ekapon.barangays order by id limit 1`;
  const rows = await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,status)
    values(${tag},'SuperAdmin','Cred','Admin','Active'),(${`${tag}-taken`},'SuperAdmin','Cred','Other','Active') returning id`;
  const [pv] = await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(null,'Paravet','Cred','Paravet',${area.id}) returning id`;
  accounts.push(...rows.map((r) => r.id), pv.id);
  await sql()`select ekapon.set_permanent_password(${rows[0].id}::bigint, 'OldPass123')`;
  admin = (await sessionCookie({ id: rows[0].id, type: 'SuperAdmin' }, 'full')).split(';')[0];
  paravet = (await sessionCookie({ id: pv.id, type: 'Paravet' }, 'full')).split(';')[0];
});
afterAll(async () => {
  await sql()`delete from ekapon.accounts where id = any(${accounts}::bigint[])`;
  if (close) await close(); await closeDb();
});

describe('an Admin changes their own username and password', () => {
  it('lets the hosted API role update usernames (migration 032)', async () => {
    const [row] = await sql()`select has_column_privilege('ekapon_admin', 'ekapon.accounts', 'username', 'UPDATE') as ok`;
    expect(row.ok).toBe(true);
  });

  it('needs the current password and refuses a taken username or a Paravet', async () => {
    expect((await change(admin, { currentPassword: 'Wrong123', username: `${tag}-new` })).json.error.code).toBe('WRONG_PASSWORD');
    expect((await change(admin, { currentPassword: 'OldPass123', username: `${tag}-taken` })).json.error.code).toBe('USERNAME_TAKEN');
    expect((await change(paravet, { currentPassword: 'OldPass123', newPassword: 'NewPass123', confirmPassword: 'NewPass123' })).status).toBe(403);
  });

  it('changes the username, keeping this session', async () => {
    expect((await change(admin, { currentPassword: 'OldPass123', username: `${tag}-new` })).json).toEqual({ changed: true });
    expect((await login(`${tag}-new`, 'OldPass123')).status).toBe(200);
    expect((await login(tag, 'OldPass123')).status).toBe(401);
    expect((await call('GET', '/api/v1/auth/me', { cookie: admin })).status).toBe(200);
  });

  it('changes the password: this browser gets a new session, older sessions end', async () => {
    expect((await change(admin, { currentPassword: 'OldPass123', newPassword: 'NewPass123', confirmPassword: 'Mismatch123' })).status).toBe(400);
    await new Promise((resolve) => setTimeout(resolve, 1100)); // the old session: issued at least a second before the change
    const changed = await change(admin, { currentPassword: 'OldPass123', newPassword: 'NewPass123', confirmPassword: 'NewPass123' });
    expect(changed.json).toEqual({ changed: true });
    expect(changed.setCookie).toBeTruthy();
    expect((await call('GET', '/api/v1/auth/me', { cookie: admin })).status).toBe(401);
    expect((await call('GET', '/api/v1/auth/me', { cookie: changed.setCookie!.split(';')[0] })).status).toBe(200);
    expect((await login(`${tag}-new`, 'NewPass123')).status).toBe(200);
  });
});
