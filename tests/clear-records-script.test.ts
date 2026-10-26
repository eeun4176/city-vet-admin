import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../server/db';

afterAll(async () => { await closeDb(); });

// Runs hosting/08-clear-records.sql inside a transaction that is always rolled back, so the shared test database keeps its rows.
describe('hosting/08-clear-records.sql', () => {
  it('empties every record source in one go and keeps accounts and Paravet directory rows', async () => {
    const script = readFileSync('hosting/08-clear-records.sql', 'utf8');
    const body = script.slice(script.indexOf('BEGIN;') + 'BEGIN;'.length, script.indexOf('COMMIT;'));
    const rollback = new Error('rollback');
    let counts: Record<string, number> = {};
    await expect(sql().begin(async (q) => {
      const [before] = await q`select count(*)::int as n from ekapon.accounts`;
      await q.unsafe(body);
      const [after] = await q`select (select count(*)::int from ekapon.accounts) as accounts,
        (select count(*)::int from ekapon.dashboard_records where dataset<>'paravets') as records,
        (select count(*)::int from ekapon.census_owners) as census, (select count(*)::int from ekapon.program_interest_people) as interest,
        (select count(*)::int from ekapon.program_attendance) as attendance`;
      counts = { ...after, accountsBefore: before.n };
      throw rollback;
    })).rejects.toBe(rollback);
    expect(counts).toMatchObject({ records: 0, census: 0, interest: 0, attendance: 0 });
    expect(counts.accounts).toBe(counts.accountsBefore);
  });
});
