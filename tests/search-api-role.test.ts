import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../server/db';
import { searchRecords } from '../server/search';
import type { Session } from '../server/auth';
afterAll(async () => { await closeDb(); });
// Hosted, the API connects as ekapon_admin with column-level grants (e.g. accounts.updated_at is not readable); tests connect as the owner.
describe('Recently Added and search as the hosted API role', () => {
  it.each(['SuperAdmin', 'Admin'] as const)('reads only columns the API role may read (%s)', async (type) => {
    const session = { id: 1, type, scope: 'full', key: null, username: 'admin', name: 'Admin', barangayId: null, barangay: null, locale: 'en', grants: [], client: 'web' } as unknown as Session;
    const result = await sql().begin(async (q) => {
      await q`set transaction isolation level repeatable read, read only`;
      await q.unsafe('set local role ekapon_admin');
      return searchRecords(q, session, '', true, 10);
    });
    expect(result).toHaveProperty('data');
  });
});
