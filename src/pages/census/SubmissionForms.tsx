import { useState } from 'react';
import { Letterhead, PrintButton, Signature, SheetFooter } from '../../components/PrintSheet';
import { btnGhost } from '../../components/ui';
import type { SubmissionDetail } from '../../lib/census';
import { censusReviewValue } from '../../../shared/censusReview';

type Owner = SubmissionDetail['owners'][number];
type Pet = Owner['pets'][number];
type CountKey =
  | 'male_dogs' | 'male_cats' | 'female_dogs' | 'female_cats'
  | 'castrated_dogs' | 'castrated_cats' | 'spayed_dogs' | 'spayed_cats'
  | 'confined_dogs' | 'confined_cats' | 'semi_confined_dogs' | 'semi_confined_cats'
  | 'free_roaming_dogs' | 'free_roaming_cats'
  | 'first_year_dogs' | 'first_year_cats' | 'second_year_dogs' | 'second_year_cats'
  | 'third_year_dogs' | 'third_year_cats' | 'other_dogs' | 'other_cats';

const countColumns: CountKey[] = [
  'male_dogs', 'male_cats', 'female_dogs', 'female_cats', 'castrated_dogs', 'castrated_cats',
  'spayed_dogs', 'spayed_cats', 'confined_dogs', 'confined_cats', 'semi_confined_dogs',
  'semi_confined_cats', 'free_roaming_dogs', 'free_roaming_cats', 'first_year_dogs', 'first_year_cats',
  'second_year_dogs', 'second_year_cats', 'third_year_dogs', 'third_year_cats', 'other_dogs', 'other_cats',
];

function countPet(pet: Pet, group: string): boolean {
  const species = pet.species.toLowerCase() === 'dog' ? 'dogs' : 'cats';
  switch (group) {
    case 'male': return pet.sex === 'Male';
    case 'female': return pet.sex === 'Female';
    case 'castrated': return pet.sex === 'Male' && pet.sterilized===true;
    case 'spayed': return pet.sex === 'Female' && pet.sterilized===true;
    case 'confined': return pet.confinement === 'Confined';
    case 'semi_confined': return pet.confinement === 'Semi-confined';
    case 'free_roaming': return pet.confinement === 'Free-roaming';
    case 'first_year': return pet.vaccine1st===true;
    case 'second_year': return pet.vaccine2nd===true;
    case 'third_year': return pet.vaccine3rd===true;
    case 'other': return Boolean(pet.vaccineOther);
    default: return false;
  }
}

function ownerCounts(owner: Owner): Record<CountKey, number> {
  const counts = Object.fromEntries(countColumns.map((column) => [column, 0])) as Record<CountKey, number>;
  for (const pet of owner.pets) {
    const species = pet.species.toLowerCase() === 'dog' ? 'dogs' : 'cats';
    const groups = ['male', 'female', 'castrated', 'spayed', 'confined', 'semi_confined', 'free_roaming', 'first_year', 'second_year', 'third_year', 'other'];
    for (const group of groups) {
      if (countPet(pet, group)) counts[`${group}_${species}` as CountKey] += 1;
    }
  }
  return counts;
}

const th = 'border border-slate-400 px-1 py-1 text-center font-semibold';
const td = 'border border-slate-300 px-1 py-0.5 text-center tabular-nums';
const countGroups: [string, string[]][] = [
  ['Sex', ['male', 'female', 'castrated', 'spayed']],
  ['Classification', ['confined', 'semi_confined', 'free_roaming']],
  ['Vaccination Status', ['first_year', 'second_year', 'third_year', 'other']],
];

function SummaryForm({ owners, barangay }: { owners: Owner[]; barangay: string }) {
  const rows = owners.map((owner) => ({ owner, counts: ownerCounts(owner) }));
  const total = (key: CountKey) => rows.reduce((sum, row) => sum + row.counts[key], 0);
  return <div className="bg-white text-slate-900 print:text-black">
    <Letterhead title="Dog & Cat Summary of Census Form" />
    <p className="mt-3 text-sm font-semibold">BARANGAY: {barangay}</p>
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[1200px] border-collapse text-[11px]">
        <thead>
          <tr><th rowSpan={3} className={th}>No</th><th rowSpan={3} className={`${th} min-w-40`}>Pet Owner</th>
            <th colSpan={2} className={th}>Type of Pet</th>{countGroups.map(([label, groups]) =>
              <th key={label} colSpan={groups.length * 2} className={th}>{label}</th>)}</tr>
          <tr><th rowSpan={2} className={th}>Dog</th><th rowSpan={2} className={th}>Cat</th>
            {countGroups.flatMap(([, groups]) => groups).map((group) =>
              <th key={group} colSpan={2} className={th}>{group.replaceAll('_', ' ')}</th>)}</tr>
          <tr>{countColumns.map((column) => <th key={column} className={th}>{column.endsWith('dogs') ? 'D' : 'C'}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(({ owner, counts }, index) => (
            <tr key={owner.id}>
              <td className={td}>{index + 1}</td><td className={`${td} text-left`}>{owner.ownerName}</td>
              <td className={td}>{owner.pets.filter((pet) => pet.species === 'Dog').length || ''}</td>
              <td className={td}>{owner.pets.filter((pet) => pet.species === 'Cat').length || ''}</td>
              {countColumns.map((column) => <td key={column} className={td}>{counts[column] || ''}</td>)}
            </tr>
          ))}
          {rows.length > 0 && <tr className="font-bold"><td className={td} colSpan={2}>TOTAL</td>
            <td className={td}>{owners.reduce((sum, owner) => sum + owner.pets.filter((pet) => pet.species === 'Dog').length, 0)}</td>
            <td className={td}>{owners.reduce((sum, owner) => sum + owner.pets.filter((pet) => pet.species === 'Cat').length, 0)}</td>
            {countColumns.map((column) => <td key={column} className={td}>{total(column)}</td>)}
          </tr>}
          {!rows.length && <tr><td className={`${td} py-5 text-slate-500`} colSpan={4 + countColumns.length}>No owner or pet records are attached to this submission.</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="mt-10 flex justify-between"><Signature label="Prepared By:" caption="Paravet" /><Signature label="Noted By:" caption="Barangay Chairman" /></div>
    <p className="mt-3 text-xs text-slate-500">Totals count recorded values only. Missing details are not recorded No values.</p>
    <SheetFooter />
  </div>;
}

function DoorToDoorForm({ owners, barangay, censusDate, householdsVisited }: {
  owners: Owner[]; barangay: string; censusDate: string; householdsVisited: number;
}) {
  return <div className="bg-white text-slate-900 print:text-black">
    <Letterhead title="Door-to-Door Census Form" />
    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
      <p><strong>BARANGAY:</strong> {barangay}</p><p><strong>DATE:</strong> {censusDate}</p>
      <p><strong>HOUSEHOLDS VISITED:</strong> {householdsVisited}</p>
    </div>
    <div className="mt-4 space-y-4">
      {owners.map((owner, ownerIndex) => <section key={owner.id} className="break-inside-avoid border border-slate-400">
        <div className="grid gap-2 border-b border-slate-400 bg-slate-50 p-2 text-xs sm:grid-cols-3">
          <p><strong>OWNER {ownerIndex + 1}:</strong> {owner.ownerName}</p>
          <p><strong>ADDRESS:</strong> {owner.address}</p><p><strong>CONTACT:</strong> {owner.contact || '—'}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-[10px]">
            <thead><tr>{['Pet Name', 'Species', 'Sex', 'Age (months)', 'Breed', 'Color', 'Spayed / Castrated', 'Classification', 'Vaccination', 'Booster / LAPS', 'Registered', 'Remarks'].map((label) =>
              <th key={label} className={th}>{label}</th>)}</tr></thead>
            <tbody>
              {owner.pets.map((pet) => <tr key={pet.id}>
                <td className={td}>{pet.petName}</td><td className={td}>{pet.species}</td><td className={td}>{censusReviewValue(pet.sex)}</td>
                <td className={td}>{pet.ageMonths ?? '—'}</td><td className={td}>{pet.breedType ?? '—'}</td><td className={td}>{pet.color ?? '—'}</td>
                <td className={td}>{censusReviewValue(pet.sterilized)}</td><td className={td}>{pet.confinement ?? 'Not recorded'}</td>
                <td className={td}>{`1st: ${censusReviewValue(pet.vaccine1st)}; 2nd: ${censusReviewValue(pet.vaccine2nd)}; 3rd: ${censusReviewValue(pet.vaccine3rd)}; Other: ${censusReviewValue(pet.vaccineOther)}`}</td>
                <td className={td}>{`Booster: ${censusReviewValue(pet.booster)}; LAPS: ${censusReviewValue(pet.laps)}`}</td>
                <td className={td}>{pet.registeredYear ?? '—'}</td><td className={td}>{pet.remarks ?? '—'}</td>
              </tr>)}
              {!owner.pets.length && <tr><td colSpan={12} className={`${td} py-3 text-slate-500`}>No pets listed for this owner.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>)}
      {!owners.length && <p className="border border-slate-300 p-5 text-center text-sm text-slate-500">No owner or pet records are attached to this submission.</p>}
    </div>
    <div className="mt-10 flex justify-between"><Signature label="Prepared By:" caption="Paravet" /><Signature label="Noted By:" caption="Barangay Chairman" /></div>
    <SheetFooter />
  </div>;
}

export function SubmissionForms({ detail }: { detail: SubmissionDetail }) {
  const [active, setActive] = useState<'summary' | 'door-to-door'>('summary');
  const options: { id: 'summary' | 'door-to-door'; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'door-to-door', label: 'Door-to-door' },
  ];
  return <section className="mt-6">
    <div role="tablist" aria-label="Census form layout" className="mb-4 flex gap-2 print:hidden">
      {options.map((option) => <button key={option.id} type="button" role="tab" aria-selected={active === option.id}
        onClick={() => setActive(option.id)} className={active === option.id ? 'rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white' : btnGhost}>
        {option.label}
      </button>)}
      <div className="ml-auto"><PrintButton /></div>
    </div>
    <div role="tabpanel">
      {active === 'summary'
        ? <SummaryForm owners={detail.owners} barangay={detail.submission.barangay} />
        : <DoorToDoorForm owners={detail.owners} barangay={detail.submission.barangay}
          censusDate={detail.submission.censusDate} householdsVisited={detail.submission.householdsVisited} />}
    </div>
  </section>;
}
