import { useRef, useState } from 'react';
import { CensusSummarySheet, Letterhead, PrintButton, Signature, SheetFooter } from '../../components/PrintSheet';
import { btnGhost, tabItem, tabList } from '../../components/ui';
import type { SubmissionDetail } from '../../lib/census';
import { censusReviewValue } from '../../../shared/censusReview';
import { censusSummaryRow } from '../../../shared/censusSummary';

type Owner = SubmissionDetail['owners'][number];
const th = 'border border-slate-400 px-1 py-1 text-center font-semibold';
const td = 'border border-slate-300 px-1 py-0.5 text-center tabular-nums';

function SummaryForm({ owners, barangay, censusDate, preparedBy }: { owners: Owner[]; barangay: string; censusDate: string; preparedBy: string }) {
  return <div className="overflow-x-auto rounded-2xl bg-white p-5 text-black shadow-panel ring-1 ring-slate-200 sm:p-8 dark:ring-white/10 print:rounded-none print:p-0 print:shadow-none print:ring-0 print:overflow-visible">
    <CensusSummarySheet barangay={barangay} censusDate={censusDate} preparedBy={preparedBy} rows={owners.map((owner) => censusSummaryRow(owner.ownerName, owner.pets))} />
    {!owners.length && <p className="mt-3 text-sm text-slate-500">No owner or pet records are attached to this submission.</p>}
  </div>;
}

function DoorToDoorForm({ owners, barangay, censusDate, householdsVisited, preparedBy }: {
  owners: Owner[]; barangay: string; censusDate: string; householdsVisited: number; preparedBy: string;
}) {
  return <div className="rounded-2xl bg-white p-5 text-black shadow-panel ring-1 ring-slate-200 sm:p-8 dark:ring-white/10 print:rounded-none print:p-0 print:shadow-none print:ring-0">
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
        <div className="overflow-x-auto print:overflow-visible">
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
    <div className="mt-10 flex justify-between"><Signature label="Prepared By:" caption="Paravet" name={preparedBy} /><Signature label="Noted By:" caption="Barangay Chairman" /></div>
    <SheetFooter />
  </div>;
}

export function SubmissionForms({ detail }: { detail: SubmissionDetail }) {
  const [active, setActive] = useState<'summary' | 'door-to-door'>('summary');
  const sheet = useRef<HTMLDivElement>(null);
  const options: { id: 'summary' | 'door-to-door'; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'door-to-door', label: 'Door-to-door' },
  ];
  return <section className="mt-6">
    <div role="tablist" aria-label="Census form layout" className={`${tabList} mb-4 w-fit print:hidden`}>
      {options.map((option) => <button key={option.id} type="button" role="tab" aria-selected={active === option.id}
        onClick={() => setActive(option.id)} className={tabItem(active === option.id)}>
        {option.label}
      </button>)}
      <div className="ml-auto"><PrintButton target={sheet} /></div>
    </div>
    <div role="tabpanel" ref={sheet}>
      <style media="print">{'@page { size: A4 landscape; margin: 10mm; }'}</style>
      {active === 'summary'
        ? <SummaryForm owners={detail.owners} barangay={detail.submission.barangay} censusDate={detail.submission.censusDate} preparedBy={detail.submission.submitter} />
        : <DoorToDoorForm owners={detail.owners} barangay={detail.submission.barangay}
          censusDate={detail.submission.censusDate} householdsVisited={detail.submission.householdsVisited} preparedBy={detail.submission.submitter} />}
    </div>
  </section>;
}
