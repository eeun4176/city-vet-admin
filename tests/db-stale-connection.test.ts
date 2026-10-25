import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { closeDb, sql } from '../server/db';
afterEach(() => { vi.useRealTimers(); });
afterAll(async () => { await closeDb(); });
describe('database client after an idle gap', () => {
  it('reuses the client between close calls and starts a new one after 10 idle seconds (a frozen serverless instance)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(1_000_000);
    const first = sql();
    vi.setSystemTime(1_009_000); expect(sql()).toBe(first);
    vi.setSystemTime(1_020_000); const fresh = sql();
    expect(fresh).not.toBe(first);
    vi.useRealTimers();
    expect((await fresh`select 1 as one`)[0].one).toBe(1);
  });
});
