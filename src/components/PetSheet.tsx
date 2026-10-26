import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { emptyRegistryPet, type RegistryPet } from '../../shared/registry';
import { BREED_CLASSES, HEALTH_STATUSES, PET_BREEDS } from '../../shared/petReferences';
import { useApi } from '../lib/useApi';
import { Select } from './ui';

export const sheetCell = 'h-10 w-full min-w-0 bg-transparent px-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:bg-brand-50/60 focus:ring-2 focus:ring-inset focus:ring-brand-500 dark:text-white dark:focus:bg-brand-900/20';
export const sheetHead = 'h-9 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:border-slate-800 dark:bg-surface-bar';
export const sheetAdd = 'inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-brand-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-brand-300 dark:hover:bg-slate-800';
const td = '!h-10 !p-0';

/** A spreadsheet table: the house style shared by the Owners sheet, pet sheets and review tables. */
export function Sheet({ heads, minWidth, children }: { heads: [string, string][]; minWidth: string; children: ReactNode }) {
  return <div className="data-table overflow-x-auto"><table className="w-full table-fixed text-sm" style={{ minWidth }}><thead><tr>{heads.map(([label, width], i) => <th key={i} className={`${sheetHead} ${width}`}>{label || <span className="sr-only">Remove</span>}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

const HEADS: [string, string][] = [['#', 'w-10 text-center'], ['Pet name', 'w-40'], ['Species', 'w-24'], ['Sex', 'w-32'], ['Age (mo)', 'w-24'], ['Color', 'w-28'], ['Breed class', 'w-32'], ['Breed', 'w-44'], ['Vaccinated', 'w-28'], ['Spayed / neutered', 'w-36'], ['Vaccine type', 'w-36'], ['Vaccination date', 'w-40'], ['Remarks', 'w-56']];
const shown = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value);

/**
 * Pets typed into a sheet, one row per pet. `fixed` keeps the rows as given (editing one pet); `readOnly` shows them for review.
 * Names are required, so the surrounding form's validation stops a save with an unnamed row.
 */
export function PetSheet({ pets, onChange, fixed = false, readOnly = false, allowEmpty = false, max = 30 }: { pets: RegistryPet[]; onChange?: (pets: RegistryPet[]) => void; fixed?: boolean; readOnly?: boolean; allowEmpty?: boolean; max?: number }) {
  const { data } = useApi<{ Dog: string[]; Cat: string[] }>(readOnly ? null : '/pet-references');
  const set = (index: number, next: Partial<RegistryPet>) => onChange?.(pets.map((pet, i) => i === index ? { ...pet, ...next } : pet));
  const heads = readOnly || fixed ? HEADS : [...HEADS, ['', 'w-11'] as [string, string]];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  return <div className="space-y-2">
    {pets.length > 0 && <Sheet heads={heads} minWidth={readOnly || fixed ? '96rem' : '99rem'}>{pets.map((pet, index) => {
      const n = index + 1;
      if (readOnly) return <tr key={index}>{[n, pet.name, pet.species, pet.sex || 'Not recorded', pet.ageMonths, pet.color, pet.breedClass, pet.breed, pet.vaccinationStatus, pet.sterilizationStatus, pet.vaccineType, pet.vaccinationDate, pet.remarks].map((value, i) => <td key={i} className={`h-10 truncate px-2.5 ${i === 0 ? 'text-center text-xs text-slate-400' : ''}`} title={shown(value)}>{shown(value)}</td>)}</tr>;
      const breeds = data?.[pet.species] ?? PET_BREEDS[pet.species];
      const legacy = pet.breed && !breeds.includes(pet.breed as never);
      return <tr key={index}>
        <td className={`${td} text-center text-xs tabular-nums text-slate-400`}>{n}</td>
        <td className={td}><input required aria-label={`Row ${n} pet name`} maxLength={80} placeholder="Pet name" value={pet.name} onChange={(e) => set(index, { name: e.target.value })} className={sheetCell} /></td>
        <td className={td}><Select aria-label={`Row ${n} species`} value={pet.species} onChange={(e) => set(index, { species: e.target.value as RegistryPet['species'], breed: 'Unknown', breedClass: 'Unknown' })} className={sheetCell}><option>Dog</option><option>Cat</option></Select></td>
        <td className={td}><Select aria-label={`Row ${n} sex`} value={pet.sex} onChange={(e) => set(index, { sex: e.target.value as RegistryPet['sex'] })} className={sheetCell}><option value="">Not recorded</option><option>Male</option><option>Female</option></Select></td>
        <td className={td}><input aria-label={`Row ${n} age in months`} type="number" min={0} max={600} value={pet.ageMonths ?? ''} onChange={(e) => set(index, { ageMonths: e.target.value === '' ? null : Number(e.target.value) })} className={sheetCell} /></td>
        <td className={td}><input aria-label={`Row ${n} color`} maxLength={100} value={pet.color} onChange={(e) => set(index, { color: e.target.value })} className={sheetCell} /></td>
        <td className={td}><Select aria-label={`Row ${n} breed class`} value={pet.breedClass ?? 'Unknown'} onChange={(e) => set(index, { breedClass: e.target.value as RegistryPet['breedClass'] })} className={sheetCell}>{BREED_CLASSES.map((v) => <option key={v}>{v}</option>)}</Select></td>
        <td className={td}><Select required aria-label={`Row ${n} breed`} title={legacy ? `Previous value: ${pet.breed}. Choose a standardized breed.` : undefined} value={legacy ? '' : pet.breed || 'Unknown'} onChange={(e) => set(index, { breed: e.target.value })} className={sheetCell}>{legacy && <option value="">Was: {pet.breed}</option>}{breeds.map((v) => <option key={v}>{v}</option>)}</Select></td>
        <td className={td}><Select aria-label={`Row ${n} vaccinated`} value={pet.vaccinationStatus ?? 'Unknown'} onChange={(e) => set(index, { vaccinationStatus: e.target.value as RegistryPet['vaccinationStatus'] })} className={sheetCell}>{HEALTH_STATUSES.map((v) => <option key={v}>{v}</option>)}</Select></td>
        <td className={td}><Select aria-label={`Row ${n} spayed or neutered`} value={pet.sterilizationStatus ?? 'Unknown'} onChange={(e) => set(index, { sterilizationStatus: e.target.value as RegistryPet['sterilizationStatus'] })} className={sheetCell}>{HEALTH_STATUSES.map((v) => <option key={v}>{v}</option>)}</Select></td>
        <td className={td}><input aria-label={`Row ${n} vaccine type`} maxLength={100} value={pet.vaccineType ?? ''} onChange={(e) => set(index, { vaccineType: e.target.value })} className={sheetCell} /></td>
        <td className={td}><input aria-label={`Row ${n} vaccination date`} type="date" max={today} value={pet.vaccinationDate ?? ''} onChange={(e) => set(index, { vaccinationDate: e.target.value })} className={sheetCell} /></td>
        <td className={td}><input aria-label={`Row ${n} remarks`} maxLength={300} value={pet.remarks} onChange={(e) => set(index, { remarks: e.target.value })} className={sheetCell} /></td>
        {!fixed && <td className={td}><button type="button" aria-label={`Remove row ${n}`} disabled={pets.length === 1 && !allowEmpty} onClick={() => onChange?.(pets.filter((_, i) => i !== index))} className="grid h-10 w-11 place-items-center text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-white"><Trash2 aria-hidden className="h-4 w-4" /></button></td>}
      </tr>;
    })}</Sheet>}
    {!readOnly && !fixed && <button type="button" disabled={pets.length >= max} onClick={() => onChange?.([...pets, emptyRegistryPet()])} className={sheetAdd}><Plus aria-hidden className="h-4 w-4" />Add pet row</button>}
  </div>;
}
