import type { OwnerPayload, PetPayload } from './census';

export const CSV_HEADERS = ['owner_name', 'address', 'contact', 'pet_name', 'species', 'sex', 'age_months', 'breed_type', 'color', 'sterilized',
  'confinement', 'vaccine_1st', 'vaccine_2nd', 'vaccine_3rd', 'vaccine_other', 'booster', 'laps', 'registered_year', 'remarks'] as const;

export const CSV_TEMPLATE = `${CSV_HEADERS.join(',')}\r\nJuan Dela Cruz,Purok 1,0917-123-4567,Bantay,Dog,Male,24,Mongrel,Brown,yes,Confined,yes,no,no,,yes,no,2026,\r\n`;

/** RFC 4180 style parser: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(input: string, delimiter=',' ): string[][] | null {
  const text = input.replace(/^\ufeff/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) return null;
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const YES = new Set(['yes', 'y', 'true', '1', 'oo']);
const NO = new Set(['no', 'n', 'false', '0', 'hindi', '']);
const SPECIES: Record<string, 'Dog' | 'Cat'> = { dog: 'Dog', aso: 'Dog', cat: 'Cat', pusa: 'Cat' };
const SEX: Record<string, 'Male' | 'Female'> = { male: 'Male', m: 'Male', lalaki: 'Male', female: 'Female', f: 'Female', babae: 'Female' };
const CONFINEMENT: Record<string, string> = { confined: 'Confined', 'semi-confined': 'Semi-confined', semi: 'Semi-confined', 'semi-con': 'Semi-confined', 'free-roaming': 'Free-roaming', free: 'Free-roaming', freeroam: 'Free-roaming' };

export interface CsvIssue { line: number; message: string }

export function csvToOwners(rows: string[][]): { owners: OwnerPayload[]; issues: CsvIssue[] } {
  const issues: CsvIssue[] = [];
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = CSV_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) return { owners: [], issues: [{ line: 1, message: `Missing columns: ${missing.join(', ')}` }] };
  const at = (row: string[], name: string) => (row[header.indexOf(name)] ?? '').trim();
  const owners = new Map<string, OwnerPayload>();

  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const fail = (message: string) => issues.push({ line, message });
    const bool = (name: string): boolean|null => {
      const value = at(row, name).toLowerCase();
      if(!value)return null;
      if (YES.has(value)) return true;
      if (NO.has(value)) return false;
      fail(`${name} must be yes or no`);
      return false;
    };
    const ownerName = at(row, 'owner_name'), address = at(row, 'address'), contact = at(row, 'contact');
    if (!ownerName) fail('owner_name is required');
    if (!address) fail('address is required');
    if (contact && !/^09\d{2}[-\s]?\d{3}[-\s]?\d{4}$/.test(contact)) fail('contact must look like 0917-123-4567');
    const petName = at(row, 'pet_name');
    if (!petName) fail('pet_name is required');
    const species = SPECIES[at(row, 'species').toLowerCase()];
    if (!species) fail('species must be Dog or Cat');
    const sex = SEX[at(row, 'sex').toLowerCase()];
    if (!sex) fail('sex must be Male or Female');
    const age = at(row, 'age_months');
    if (age && !/^\d+$/.test(age)) fail('age_months must be a whole number');
    const breed = at(row, 'breed_type').toLowerCase();
    if (breed && breed !== 'mongrel' && breed !== 'pure' && breed !== 'mix') fail('breed_type must be Mongrel, Mix or Pure');
    const confinementRaw = at(row, 'confinement').toLowerCase();
    if (confinementRaw && !CONFINEMENT[confinementRaw]) fail('confinement must be Confined, Semi-confined or Free-roaming');
    const year = at(row, 'registered_year');
    if (year && !/^20\d{2}$/.test(year)) fail('registered_year must be a year like 2026');
    const pet: PetPayload = {
      petName, species: species ?? 'Dog', sex: sex ?? 'Male', ageMonths: age ? Number(age) : undefined,
      breedType: breed ? (breed === 'pure' ? 'Pure' : breed === 'mix' ? 'Mix' : 'Mongrel') : undefined, color: at(row, 'color') || undefined,
      sterilized: bool('sterilized'), confinement: confinementRaw ? CONFINEMENT[confinementRaw] : undefined,
      vaccine1st: bool('vaccine_1st'), vaccine2nd: bool('vaccine_2nd'), vaccine3rd: bool('vaccine_3rd'),
      vaccineOther: at(row, 'vaccine_other') || undefined, booster: bool('booster'), laps: bool('laps'),
      registeredYear: year ? Number(year) : undefined, remarks: at(row, 'remarks') || undefined,
    };
    const id = [ownerName, address, contact].join('|').toLowerCase();
    const owner = owners.get(id) ?? { ownerName, address, contact: contact || undefined, pets: [] };
    owner.pets.push(pet);
    owners.set(id, owner);
  });
  if (!owners.size && !issues.length) issues.push({ line: 2, message: 'The file has no pet rows.' });
  return { owners: [...owners.values()], issues };
}
