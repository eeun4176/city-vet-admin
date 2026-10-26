import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../server/db';

afterAll(async () => { await closeDb(); });

const script = readFileSync('hosting/08-clear-records.sql', 'utf8');
const part1 = script.slice(script.indexOf('BEGIN;') + 'BEGIN;'.length, script.indexOf('COMMIT;'));
// Part 2 is commented out in the file (it is run on purpose, separately): take its lines without the "-- ".
const part2 = script.slice(script.indexOf('-- BEGIN;') + '-- BEGIN;'.length, script.indexOf('-- COMMIT;')).replaceAll(/^-- /gm, '');

// Runs the script inside a transaction that is always rolled back, so the shared test database keeps its rows.
async function dryRun(body: string, check: (q: any) => Promise<Record<string, number>>) {
  const rollback = new Error('rollback');
  let counts: Record<string, number> = {};
  await expect(sql().begin(async (q) => {
    const [area] = await q`select id from ekapon.barangays order by id limit 1`;
    const [paravet] = await q`insert into ekapon.accounts(account_type,first_name,last_name,barangay_id) values('Paravet','Clear','Test',${area.id}) returning id`;
    await q`insert into ekapon.policy_acceptances(account_id,policy_version,language) values(${paravet.id},'test','en')`;
    await q.unsafe(body);
    counts = await check(q);
    throw rollback;
  })).rejects.toBe(rollback);
  return counts;
}

describe('hosting/08-clear-records.sql', () => {
  it('part 1 empties every record source and keeps the accounts and Paravet directory rows', async () => {
    const counts = await dryRun(part1, async (q) => (await q`select (select count(*)::int from ekapon.dashboard_records where dataset<>'paravets') as records,
      (select count(*)::int from ekapon.census_owners) as census, (select count(*)::int from ekapon.program_interest_people) as interest,
      (select count(*)::int from ekapon.program_attendance) as attendance, (select count(*)::int from ekapon.accounts where account_type='Paravet') as paravets`)[0]);
    expect(counts).toMatchObject({ records: 0, census: 0, interest: 0, attendance: 0 });
    expect(counts.paravets).toBeGreaterThan(0);
  });

  it('part 2 then keeps only the Admin accounts', async () => {
    const counts = await dryRun(part1 + part2, async (q) => (await q`select (select count(*)::int from ekapon.accounts where account_type not in ('Admin','SuperAdmin')) as others,
      (select count(*)::int from ekapon.accounts where account_type in ('Admin','SuperAdmin')) as admins, (select count(*)::int from ekapon.dashboard_records) as records`)[0]);
    expect(counts).toMatchObject({ others: 0, records: 0 });
    expect(counts.admins).toBeGreaterThan(0);
  });
});
