import { Printer } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { useT } from '../i18n';
import { printOnly } from '../lib/printOnly';
import { btnPrimary } from './ui';
import { censusDateLabel, censusSummaryTotal, SUMMARY_PAIRS, SUMMARY_ROWS_PER_SHEET, type CensusSummaryRow } from '../../shared/censusSummary';

/** Letterhead of the official City Veterinary Office forms (printed wording stays in English like the paper forms). */
export function Letterhead({ title, seals = false }: { title: string; seals?: boolean }) {
  // seals: the census forms' letterhead, city seal and Bagong Pilipinas on either side of the office name, ruled off.
  if (seals) return (
    <header className="[font-family:Arial,sans-serif]">
      <div className="flex items-center justify-center gap-8 border-b border-black pb-2">
        <img src="/city-seal.png" alt="" className="h-16 w-16 object-contain" />
        <div className="text-center leading-tight"><p className="text-xs">Republic of the Philippines<br />Province of Bulacan<br />City of San Jose del Monte</p><p className="text-sm font-bold">CITY VETERINARY OFFICE</p><p className="text-[10px]">Productivity Complex, Brgy. Sapang Palay Proper</p></div>
        <img src="/bagong-pilipinas.png" alt="" className="h-16 w-16 object-contain" />
      </div>
      <h2 className="mt-6 text-center text-base font-bold uppercase">{title}</h2>
    </header>
  );
  return (
    <header className="text-center">
      <img src="/images.jpg" alt="" className="mx-auto h-16 w-16 object-contain print:h-14 print:w-14" />
      <p className="mt-2 text-xs leading-snug">Republic of the Philippines<br />Province of Bulacan<br />City of San Jose del Monte</p>
      <p className="text-base font-bold tracking-wide">CITY VETERINARY OFFICE</p>
      <p className="text-xs">Productivity Complex, Brgy. Sapang Palay Proper</p>
      <h2 className="mt-4 text-lg font-bold uppercase">{title}</h2>
    </header>
  );
}

export function SheetFooter() {
  return (
    <footer className="mt-10 border-t border-slate-300 pt-2 text-xs text-slate-600 print:mt-6">
      <p>Address: Productivity Complex, Brgy. Sapang Palay Proper, City of San Jose del Monte, Bulacan</p>
      <p>Contact: 044-306-5341 / 0966-3181892 · Email: cityvet20@yahoo.com</p>
    </footer>
  );
}

export function Signature({ label, caption }: { label: string; caption: string }) {
  return (
    <div className="w-64 text-center text-sm">
      <p className="text-left text-xs italic">{label}</p>
      <div className="mt-10 border-t border-slate-800" />
      <p className="mt-1">{caption}</p>
    </div>
  );
}

/** Prints just the document in `target` (not the filters, tabs or review controls around it). */
export function PrintButton({ target, children }: { target: RefObject<HTMLElement | null>; children?: ReactNode }) {
  const { t } = useT();
  return <button type="button" onClick={() => target.current ? printOnly(target.current) : window.print()} className={btnPrimary}><Printer aria-hidden className="h-4 w-4" />{children ?? t('census.print')}</button>;
}

const sheetTh = 'border border-black px-0.5 py-0.5 text-center font-normal';
const sheetTd = 'h-[18px] border border-black px-0.5 text-center tabular-nums';

/** Dog & Cat Summary of Census in the office workbook's layout (as Salin exports it): 20 owners a sheet, TOTAL on the last sheet counts everyone. */
export function CensusSummarySheet({ barangay, censusDate, rows }: { barangay: string; censusDate?: string; rows: CensusSummaryRow[] }) {
  const pages = Array.from({ length: Math.max(1, Math.ceil(rows.length / SUMMARY_ROWS_PER_SHEET)) }, (_, page) => rows.slice(page * SUMMARY_ROWS_PER_SHEET, (page + 1) * SUMMARY_ROWS_PER_SHEET));
  const total = censusSummaryTotal(rows);
  return <>{pages.map((pageRows, page) => <section key={page} className="text-black [font-family:Arial,sans-serif] [&:not(:last-child)]:mb-10 [&:not(:last-child)]:break-after-page">
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
      <img src="/city-seal.png" alt="" className="h-16 w-16 justify-self-end object-contain" />
      <div className="text-center leading-tight"><p className="text-sm">City of San Jose del Monte</p><p className="text-sm font-bold">CITY VETERINARY OFFICE</p><p className="text-sm font-bold">DOG &amp; CAT SUMMARY OF CENSUS FORM</p></div>
      <div className="flex items-center gap-4"><img src="/images.jpg" alt="" className="h-14 w-14 object-contain" /><img src="/bagong-pilipinas.png" alt="" className="h-16 w-16 object-contain" /></div>
    </header>
    <div className="mt-2 flex justify-between text-xs font-bold"><p>BARANGAY: {barangay.toUpperCase()}</p><p>DATE OF CENSUS: {censusDate ? censusDateLabel(censusDate) : '____________'}</p></div>
    <table className="mt-1 w-full table-fixed border-collapse text-[10px]">
      <colgroup><col className="w-[3%]" /><col className="w-[20%]" /><col className="w-[4%]" /><col className="w-[4%]" />{Array.from({ length: SUMMARY_PAIRS.length * 2 }, (_, index) => <col key={index} className="w-[3.3%]" />)}<col className="w-[4.5%]" /><col className="w-[4.5%]" /><col className="w-[4.5%]" /><col /></colgroup>
      <thead>
        <tr><th rowSpan={3} className={sheetTh}>No</th><th rowSpan={3} className={sheetTh}>Pet<br />Owner</th><th colSpan={2} className={`${sheetTh} text-xs`}>Type of Pet</th><th colSpan={8} className={`${sheetTh} text-xs`}>Sex</th><th colSpan={6} className={`${sheetTh} text-xs`}>Classification</th><th colSpan={4} className={`${sheetTh} text-xs`}>Vaccination Status</th></tr>
        <tr><th rowSpan={2} className={`${sheetTh} font-bold`}>Dog</th><th rowSpan={2} className={`${sheetTh} font-bold`}>Cat</th>{SUMMARY_PAIRS.map((label) => <th key={label} colSpan={2} className={sheetTh}>{label}</th>)}{['1st yr', '2nd yr', '3rd yr', 'Others/Remarks'].map((label) => <th key={label} rowSpan={2} className={sheetTh}>{label}</th>)}</tr>
        <tr>{SUMMARY_PAIRS.flatMap((label) => [<th key={`${label}-d`} className={`${sheetTh} font-bold`}>D</th>, <th key={`${label}-c`} className={`${sheetTh} font-bold`}>C</th>])}</tr>
      </thead>
      <tbody>
        {Array.from({ length: SUMMARY_ROWS_PER_SHEET }, (_, index) => { const row = pageRows[index]; return <tr key={index}>
          <td className={`${sheetTd} text-left`}>{page * SUMMARY_ROWS_PER_SHEET + index + 1}</td><td className={`${sheetTd} text-left`}>{row?.owner}</td><td className={sheetTd}>{row?.dogs}</td><td className={sheetTd}>{row?.cats}</td>
          {row ? row.pairs.flatMap(([dogs, cats], pair) => [<td key={`${pair}-d`} className={sheetTd}>{dogs}</td>, <td key={`${pair}-c`} className={sheetTd}>{cats}</td>]) : SUMMARY_PAIRS.flatMap((label) => [<td key={`${label}-d`} className={sheetTd} />, <td key={`${label}-c`} className={sheetTd} />])}
          {[0, 1, 2].map((year) => <td key={year} className={sheetTd}>{row?.vaccines[year]}</td>)}<td className={`${sheetTd} text-left text-[8px]`}>{row?.remarks}</td>
        </tr>; })}
        {page === pages.length - 1 && <tr className="font-bold"><td colSpan={2} className={`${sheetTd} h-8 text-left text-sm`}>TOTAL</td><td className={sheetTd}>{total.dogs}</td><td className={sheetTd}>{total.cats}</td>
          {total.pairs.flatMap(([dogs, cats], pair) => [<td key={`${pair}-d`} className={sheetTd}>{dogs}</td>, <td key={`${pair}-c`} className={sheetTd}>{cats}</td>])}{total.vaccines.map((count, year) => <td key={year} className={sheetTd}>{count}</td>)}<td className={sheetTd} /></tr>}
      </tbody>
    </table>
    <div className="mt-6 flex justify-between"><Signature label="Prepared By:" caption="Paravet" /><Signature label="Noted By:" caption="Barangay Chairman" /></div>
  </section>)}</>;
}
