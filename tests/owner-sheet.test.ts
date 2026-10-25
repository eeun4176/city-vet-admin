import { describe, expect, it } from 'vitest';
import { groupOwnerRows, type OwnerRow } from '../src/pages/ownerSheetRows';

const row = (over: Partial<OwnerRow>): OwnerRow => ({ owner: '', barangayId: '', address: '', contact: '', pet: '', species: 'Dog', sex: '', ageMonths: '', color: '', ...over });

describe('owner sheet rows', () => {
  it('groups pets under the owner above and skips empty rows', () => {
    const { owners, error } = groupOwnerRows([row({ owner: 'Ana Cruz', barangayId: '4', pet: 'Bantay' }), row({ pet: 'Mingming', species: 'Cat', ageMonths: '6' }), row({}), row({ owner: 'Ben Reyes', barangayId: '7', pet: 'Choco' })]);
    expect(error).toBe('');
    expect(owners.map((o) => [o.name, o.barangayId, o.pets.map((p) => p.name), o.rows])).toEqual([['Ana Cruz', 4, ['Bantay', 'Mingming'], [0, 1]], ['Ben Reyes', 7, ['Choco'], [3]]]);
    expect(owners[0].pets[1]).toMatchObject({ species: 'Cat', ageMonths: 6 });
  });

  it('names the row that needs fixing', () => {
    expect(groupOwnerRows([row({ pet: 'Bantay' })]).error).toBe("Row 1: type the owner's name.");
    expect(groupOwnerRows([row({ owner: 'Ana', pet: 'Bantay' })]).error).toBe("Row 1: choose Ana's barangay.");
    expect(groupOwnerRows([row({ owner: 'Ana', barangayId: '1' })]).error).toBe("Row 1: type the pet's name.");
    expect(groupOwnerRows([row({ owner: 'Ana', barangayId: '1', pet: 'B', ageMonths: '2.5' })]).error).toBe('Row 1: age is whole months from 0 to 600.');
  });
});
