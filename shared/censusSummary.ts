/**
 * Dog & Cat Summary of Census, laid out like the City Veterinary Office workbook that Salin fills:
 * per owner, Dog/Cat totals, D/C pairs for sex, castrated, spayed and classification, one count per
 * vaccination year, and Others/Remarks words for what has no column. The same rules as Salin's
 * official workbook, so a sheet a paravet sends shows the same numbers here.
 */

export type SummaryPet = {
  species: string; sex: string | null; sterilized: boolean | null; confinement?: string | null;
  vaccine1st: boolean | null; vaccine2nd: boolean | null; vaccine3rd: boolean | null; vaccineOther?: string | null;
  booster: boolean | null; laps: boolean | null; breedType?: string | null; registeredYear?: string | number | null;
};

export type CensusSummaryRow = { owner: string; dogs: number; cats: number; pairs: [number, number][]; vaccines: [number, number, number]; remarks: string };

/** Column headings of the D/C pairs, in sheet order. */
export const SUMMARY_PAIRS = ['M', 'F', 'Castrate', 'Spayed', 'Confined', 'Semi-Con', 'FreeRoam'] as const;
/** census_summary_v column prefixes of the same pairs (`${key}_dogs`, `${key}_cats`). */
export const SUMMARY_PAIR_KEYS = ['male', 'female', 'castrated', 'spayed', 'confined', 'semi_confined', 'free_roaming'] as const;
export const SUMMARY_ROWS_PER_SHEET = 20;

const PAIR_TESTS: ((pet: SummaryPet) => boolean)[] = [
  (pet) => pet.sex === 'Male',
  (pet) => pet.sex === 'Female',
  (pet) => pet.sex === 'Male' && pet.sterilized === true,
  (pet) => pet.sex === 'Female' && pet.sterilized === true,
  (pet) => pet.confinement === 'Confined',
  (pet) => pet.confinement === 'Semi-confined',
  (pet) => pet.confinement === 'Free-roaming',
];

/** Booster, other vaccines, mix breed, laps and registration as words, each once, in pet order. */
export function censusRemarks(pets: SummaryPet[]): string {
  return [...new Set(pets.flatMap((pet) => [
    pet.booster === true && 'Booster',
    pet.vaccineOther?.trim() && `Other vaccines: ${pet.vaccineOther.trim()}`,
    pet.breedType === 'Mix' && 'Mix breed',
    pet.laps === true && 'Laps',
    pet.registeredYear && `Registered ${pet.registeredYear}`,
  ].filter((word): word is string => Boolean(word))))].join('; ');
}

export function censusSummaryRow(owner: string, pets: SummaryPet[]): CensusSummaryRow {
  const dogs = pets.filter((pet) => pet.species === 'Dog'), cats = pets.filter((pet) => pet.species === 'Cat');
  return {
    owner, dogs: dogs.length, cats: cats.length,
    pairs: PAIR_TESTS.map((test) => [dogs.filter(test).length, cats.filter(test).length]),
    vaccines: [pets.filter((pet) => pet.vaccine1st === true).length, pets.filter((pet) => pet.vaccine2nd === true).length, pets.filter((pet) => pet.vaccine3rd === true).length],
    remarks: censusRemarks(pets),
  };
}

/** TOTAL row: every count summed (remarks are not totalled). */
export function censusSummaryTotal(rows: CensusSummaryRow[]): Omit<CensusSummaryRow, 'owner' | 'remarks'> {
  return {
    dogs: rows.reduce((sum, row) => sum + row.dogs, 0), cats: rows.reduce((sum, row) => sum + row.cats, 0),
    pairs: SUMMARY_PAIRS.map((_, index) => [rows.reduce((sum, row) => sum + row.pairs[index][0], 0), rows.reduce((sum, row) => sum + row.pairs[index][1], 0)]),
    vaccines: [0, 1, 2].map((index) => rows.reduce((sum, row) => sum + row.vaccines[index], 0)) as [number, number, number],
  };
}

/** 'YYYY-MM-DD' → 'MM/DD/YYYY', as printed on the paper form. */
export const censusDateLabel = (iso: string) => { const [year, month, day] = iso.slice(0, 10).split('-'); return `${month}/${day}/${year}`; };
