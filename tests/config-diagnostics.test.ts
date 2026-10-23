import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@invalid.example/postgres');
  vi.stubEnv('JWT_SECRET', 'fixture-jwt-secret-at-least-32-characters');
  vi.stubEnv('FILE_STORAGE_DRIVER', 'supabase');
  vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_fixture_not_a_real_key_12345678');
  vi.stubEnv('SUPABASE_STORAGE_BUCKET', 'ekapon-private');
  vi.stubEnv('SESSION_HOURS', '8');
  vi.stubEnv('LOGIN_IP_MAX_FAILURES', '20');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('private configuration diagnostics', () => {
  it.each([
    ['DATABASE_URL', ''],
    ['JWT_SECRET', 'short'],
    ['FILE_STORAGE_DRIVER', 'database'],
    ['SUPABASE_URL', 'https://supabase.com/dashboard/project/fixture'],
    ['SUPABASE_SECRET_KEY', 'short'],
    ['SUPABASE_STORAGE_BUCKET', 'INVALID_BUCKET'],
    ['SESSION_HOURS', ''],
    ['LOGIN_IP_MAX_FAILURES', ''],
  ])('identifies rejected %s by name', async (field, value) => {
    vi.stubEnv(field, value);
    const { config } = await import('../server/config');
    const { ConfigurationError } = await import('../server/configError');
    let failure: unknown;
    try { config(); } catch (e) { failure = e; }
    expect(failure).toBeInstanceOf(ConfigurationError);
    expect((failure as InstanceType<typeof ConfigurationError>).configurationFields).toEqual([field]);
  });

  it('logs names without values and keeps the HTTP response generic', async () => {
    const privateValue = 'private-invalid-driver-DO-NOT-LOG';
    vi.stubEnv('FILE_STORAGE_DRIVER', privateValue);
    vi.stubEnv('JWT_SECRET', 'private-short-jwt');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { route, ok } = await import('../server/http');
    const reachedHandler = vi.fn(async () => ok({ ok: true }));
    const server = createServer(route({ GET: reachedHandler }));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const response = await fetch(base + '/api/v1/health', { headers: { Origin: base } });
      const body = await response.json();
      expect(response.status).toBe(500);
      expect(body.error).toMatchObject({ code: 'INTERNAL', message: 'Something went wrong on the server.' });
      expect(reachedHandler).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledOnce();
      const entry = JSON.parse(log.mock.calls[0][0]);
      expect(entry).toMatchObject({
        requestId: body.error.requestId,
        configurationFields: ['FILE_STORAGE_DRIVER', 'JWT_SECRET'],
      });
      const exposed = JSON.stringify({ log: log.mock.calls, body });
      for (const value of [privateValue, 'private-short-jwt', process.env.DATABASE_URL, process.env.SUPABASE_SECRET_KEY]) {
        expect(exposed).not.toContain(value);
      }
      expect(body.error).not.toHaveProperty('configurationFields');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
