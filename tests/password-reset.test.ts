import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, client } from './harness';
import { sql, closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
import { devOutbox } from '../server/emailCodes';

const tag = `Reset${randomUUID().slice(0, 8)}`;
const email = `${tag.toLowerCase()}@example.com`;
let call: ReturnType<typeof client>, close: () => Promise<void>;
let p1: string, p2: string, key: string;
const accounts: number[] = [];
const lastCode = (to: string) => {
  const mail = [...devOutbox].reverse().find((m) => m.to === to);
  return mail?.text.match(/\b(\d{6})\b/)?.[1];
};
const forgot = (json: Record<string, unknown>) => call('POST', '/api/v1/auth/forgot-password', { json });

beforeAll(async () => {
  const server = await startServer(); call = client(server.base); close = server.close;
  const [area] = await sql()`select id from ekapon.barangays order by id limit 1`;
  const rows = await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id)
    values(null,'Paravet',${tag},'One',${area.id}),(null,'Paravet',${tag},'Two',${area.id}) returning id, account_key`;
  accounts.push(...rows.map((r) => r.id));
  key = rows[0].account_key;
  [p1, p2] = await Promise.all(rows.map(async (r) => (await sessionCookie({ id: r.id, type: 'Paravet' }, 'full')).split(';')[0]));
});
afterAll(async () => {
  await sql()`delete from ekapon.accounts where id = any(${accounts}::bigint[])`;
  if (close) await close(); await closeDb();
});

describe('paravet password reset by email', () => {
  it('saves an email only after the paravet confirms the code sent to it', async () => {
    const sent = await call('POST', '/api/v1/auth/email', { cookie: p1, json: { action: 'send', email: email.toUpperCase() } });
    expect(sent.status).toBe(200);
    expect((await call('GET', '/api/v1/auth/me', { cookie: p1 })).json.account.email).toBeNull();
    const wrong = await call('POST', '/api/v1/auth/email', { cookie: p1, json: { action: 'verify', code: lastCode(email) === '000000' ? '111111' : '000000' } });
    expect(wrong.json.error).toMatchObject({ code: 'INVALID_CODE', details: { attemptsLeft: 4 } });
    expect((await call('POST', '/api/v1/auth/email', { cookie: p1, json: { action: 'verify', code: lastCode(email) } })).json.email).toBe(email);
    expect((await call('GET', '/api/v1/auth/me', { cookie: p1 })).json.account.email).toBe(email);
    // Another account can't take the same address.
    expect((await call('POST', '/api/v1/auth/email', { cookie: p2, json: { action: 'send', email } })).json.error.code).toBe('EMAIL_IN_USE');
  });

  it('answers the same whether or not the account exists, and mails only confirmed paravets', async () => {
    const before = devOutbox.length;
    const unknown = await forgot({ action: 'send', identifier: `PV-NOPE-${tag}` });
    expect(devOutbox.length).toBe(before);
    const known = await forgot({ action: 'send', identifier: key.toLowerCase() });
    expect(known.json).toEqual(unknown.json);
    expect(devOutbox.length).toBe(before + 1);
    expect(lastCode(email)).toMatch(/^\d{6}$/);
  });

  it('resets the password with the code, ends older sessions, and never takes a code twice', async () => {
    const code = lastCode(email)!;
    expect((await forgot({ action: 'reset', identifier: key, code: code === '000000' ? '111111' : '000000', newPassword: 'NewPass123' })).json.error.code).toBe('INVALID_CODE');
    expect((await forgot({ action: 'reset', identifier: key, code, newPassword: 'short' })).status).toBe(400);
    await new Promise((resolve) => setTimeout(resolve, 1100)); // older session: issued at least a second before the reset
    expect((await forgot({ action: 'reset', identifier: key, code, newPassword: 'NewPass123' })).json).toEqual({ reset: true });
    expect((await call('GET', '/api/v1/auth/me', { cookie: p1 })).status).toBe(401);
    const login = await call('POST', '/api/v1/auth/login', { json: { identifier: key, password: 'NewPass123', client: 'salin' } });
    expect(login.status).toBe(200); expect(login.json.token).toBeTruthy();
    expect((await forgot({ action: 'reset', identifier: key, code, newPassword: 'Another123' })).status).toBeGreaterThanOrEqual(400);
  });

  it('sends at most three codes in 30 minutes, still with the same answer', async () => {
    for (let i = 0; i < 3; i++) await forgot({ action: 'send', identifier: key });
    const count = devOutbox.length;
    expect((await forgot({ action: 'send', identifier: key })).status).toBe(200);
    expect(devOutbox.length).toBe(count);
  });
});
