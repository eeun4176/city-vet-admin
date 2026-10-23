import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, client } from './harness';

let close: () => Promise<void>, call: ReturnType<typeof client>;
beforeAll(async () => {
  // Read lazily by config() on the first request of this test file.
  process.env.ALLOWED_ORIGINS = 'https://salin.test';
  const s = await startServer(); close = s.close; call = client(s.base);
});
afterAll(async () => { await close(); delete process.env.ALLOWED_ORIGINS; });

describe('Salin (another origin) reading API replies', () => {
  it('gets the CORS headers on error replies too, so it can show why sign-in failed', async () => {
    const r = await call('POST', '/api/v1/auth/login', { origin: 'https://salin.test', json: { identifier: 'nobody-here', password: 'not-a-real-pass', client: 'salin' } });
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe('INVALID_CREDENTIALS');
    expect(r.headers.get('access-control-allow-origin')).toBe('https://salin.test');
  });
  it('gives no CORS headers to origins that are not allowed', async () => {
    const r = await call('GET', '/api/v1/auth/me', { origin: 'https://evil.example' });
    expect(r.status).toBe(401);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
});
