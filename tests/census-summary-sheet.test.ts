import { describe, expect, it } from 'vitest';
import { censusDateLabel, censusRemarks, censusSummaryRow, censusSummaryTotal, type SummaryPet } from '../shared/censusSummary';

const pet = (extra: Partial<SummaryPet> = {}): SummaryPet => ({ species: 'Dog', sex: 'Male', sterilized: false, confinement: null, vaccine1st: false, vaccine2nd: false, vaccine3rd: false, vaccineOther: null, booster: false, laps: false, breedType: null, registeredYear: null, ...extra });

describe('Dog & Cat Summary of Census (same rules as the Salin workbook)', () => {
  it('counts dogs and cats per pair, one count per vaccination year, and words the rest', () => {
    const row = censusSummaryRow('Ezekiel Manalo', [
      pet({ sterilized: true, confinement: 'Confined', vaccine1st: true, booster: true, registeredYear: 2026 }),
      pet({ species: 'Cat', sex: 'Female', sterilized: true, confinement: 'Free-roaming', vaccine2nd: true, vaccineOther: ' 5-in-1 ', breedType: 'Mix', laps: true }),
      pet({ registeredYear: 2026, booster: true }),
    ]);
    expect(row).toMatchObject({ owner: 'Ezekiel Manalo', dogs: 2, cats: 1, vaccines: [1, 1, 0] });
    // M, F, Castrate, Spayed, Confined, Semi-Con, FreeRoam as [dogs, cats]
    expect(row.pairs).toEqual([[2, 0], [0, 1], [1, 0], [0, 1], [1, 0], [0, 0], [0, 1]]);
    expect(row.remarks).toBe('Booster; Registered 2026; Other vaccines: 5-in-1; Mix breed; Laps');
  });

  it('leaves unknown values out of every count and totals every owner', () => {
    const rows = [censusSummaryRow('A', [pet({ sex: null, sterilized: null, vaccine1st: null })]), censusSummaryRow('B', [pet({ species: 'Cat', sex: 'Female' })])];
    expect(rows[0].pairs[0]).toEqual([0, 0]);
    expect(censusSummaryTotal(rows)).toEqual({ dogs: 1, cats: 1, pairs: [[0, 0], [0, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], vaccines: [0, 0, 0] });
    expect(censusRemarks([])).toBe('');
  });

  it('prints the census date as on the paper form', () => {
    expect(censusDateLabel('2026-10-22')).toBe('10/22/2026');
  });
});
