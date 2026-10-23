import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { csvToOwners, parseCsv } from '../src/lib/csv';
import { fromDb } from '../server/errors';

describe('mock simulation fixtures', () => {
  it('provides a valid multi-owner census import CSV', () => {
    const text = readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'census-mock-import.csv'), 'utf8');
    const rows = parseCsv(text);
    expect(rows).not.toBeNull();
    const result = csvToOwners(rows!);
    expect(result.issues).toEqual([]);
    expect(result.owners).toHaveLength(10);
    expect(result.owners.reduce((count, owner) => count + owner.pets.length, 0)).toBe(20);
    expect(result.owners[0].pets[0]).toMatchObject({ species: 'Dog', sex: 'Male', vaccine1st: true, sterilized: true });
  });

  it('names the invalid database field and accepted mobile format', () => {
    const error = fromDb({ code: '23514', constraint_name: 'accounts_mobile_check' });
    expect(error).toMatchObject({
      status: 422,
      code: 'RULE_VIOLATION',
      message: 'Mobile number is incorrect. Use a Philippine mobile number like 0917-123-4567.',
      details: { field: 'mobile', expected: '0917-123-4567' },
    });
  });
});
