import type { RegistryPet } from '../../shared/registry';

/** One row of the Owners sheet: a pet, with its owner's details on the owner's first row only. */
export type OwnerRow = { owner: string; barangayId: string; address: string; contact: string; pet: string; species: 'Dog' | 'Cat'; sex: '' | 'Male' | 'Female'; ageMonths: string; color: string };
export type SheetOwner = { name: string; barangayId: number; address: string; contact: string; pets: Pick<RegistryPet, 'name' | 'species' | 'sex' | 'ageMonths' | 'color'>[]; rows: number[] };

const MAX_PETS = 30;

/** Groups sheet rows into owners: a blank owner continues the owner above, empty rows are skipped, and problems name their row. */
export function groupOwnerRows(rows: OwnerRow[]): { owners: SheetOwner[]; error: string } {
  const owners: SheetOwner[] = [];
  for (const [index, row] of rows.entries()) {
    const n = index + 1, name = row.owner.trim(), pet = row.pet.trim();
    if (!name && !pet && !row.address.trim() && !row.contact.trim() && !row.color.trim() && !row.ageMonths) continue;
    let owner = owners.at(-1);
    if (name) {
      if (!row.barangayId) return { owners, error: `Row ${n}: choose ${name}'s barangay.` };
      owner = { name, barangayId: Number(row.barangayId), address: row.address.trim(), contact: row.contact.trim(), pets: [], rows: [] };
      owners.push(owner);
    } else if (!owner) return { owners, error: `Row ${n}: type the owner's name.` };
    owner.rows.push(index);
    if (!pet) return { owners, error: `Row ${n}: type the pet's name.` };
    const age = row.ageMonths === '' ? null : Number(row.ageMonths);
    if (age !== null && (!Number.isInteger(age) || age < 0 || age > 600)) return { owners, error: `Row ${n}: age is whole months from 0 to 600.` };
    if (owner.pets.length >= MAX_PETS) return { owners, error: `Row ${n}: one save holds up to ${MAX_PETS} pets per owner.` };
    owner.pets.push({ name: pet, species: row.species, sex: row.sex, ageMonths: age, color: row.color.trim() });
  }
  return { owners, error: '' };
}
