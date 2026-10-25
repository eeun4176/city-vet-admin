import { useMemo, useRef, useState } from 'react';
import { CensusSummarySheet, Letterhead, PrintButton, Signature } from '../../components/PrintSheet';
import { SUMMARY_PAIR_KEYS, type CensusSummaryRow } from '../../../shared/censusSummary';
import { Field, inputCls, Loading, Notice, Select, districtOptions } from '../../components/ui';
import { useT } from '../../i18n';
import { useApi } from '../../lib/useApi';

type Barangay = { id: number; name: string; district?: number };

function BarangaySelect({ value, onChange, allowAll }: { value: string; onChange: (id: string, valid: boolean) => void; allowAll?: boolean }) {
  const { t } = useT();
  const { data } = useApi<{ data: Barangay[] }>('/barangays');
  // Searchable menu split by district, as in e-Vet Field; "Whole city" is the empty choice where allowed.
  return (
    <Field label={t('census.meta.barangay')}>
      <Select value={value} onChange={(event) => onChange(event.target.value, event.target.value !== '' || allowAll === true)} className={inputCls}>
        <option value="">{allowAll ? t('census.cityWide') : t('census.pickBarangay')}</option>
        {districtOptions(data?.data)}
      </Select>
    </Field>
  );
}

type Row = Record<string, number | string>;
/** Dog & Cat summary of census, one row per approved owner, with the paper form's columns and totals. */
export function CensusSummaryPage() {
  const { t } = useT();
  const [barangayId, setBarangayId] = useState('');
  const [barangayValid, setBarangayValid] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'owner_name' | 'dogs' | 'cats'>('owner_name');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const { data, loading, error } = useApi<{ barangay: Barangay | null; data: Row[] }>(barangayId && barangayValid ? `/census/summary?barangayId=${barangayId}` : null);
  const rows = useMemo(() => (data?.data ?? [])
    .filter((row) => String(row.owner_name ?? '').toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const comparison = sort === 'owner_name'
        ? String(a.owner_name ?? '').localeCompare(String(b.owner_name ?? ''))
        : Number(a[sort] ?? 0) - Number(b[sort] ?? 0);
      return direction === 'asc' ? comparison : -comparison;
    }), [data, direction, search, sort]);
  const sheetRows: CensusSummaryRow[] = rows.map((row) => ({
    owner: String(row.owner_name ?? ''), dogs: Number(row.dogs ?? 0), cats: Number(row.cats ?? 0),
    pairs: SUMMARY_PAIR_KEYS.map((key) => [Number(row[`${key}_dogs`] ?? 0), Number(row[`${key}_cats`] ?? 0)] as [number, number]),
    vaccines: ['first', 'second', 'third'].map((year) => Number(row[`${year}_year_dogs`] ?? 0) + Number(row[`${year}_year_cats`] ?? 0)) as [number, number, number],
    remarks: String(row.remarks ?? ''),
  }));
  const sheet = useRef<HTMLDivElement>(null);
  return (
    <div className="w-full">
      <style media="print">{'@page { size: A4 landscape; margin: 10mm; }'}</style>
      <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <h1 className="w-full text-2xl font-semibold tracking-tight">{t('census.summary.title')}</h1>
        <div className="w-full sm:w-72"><BarangaySelect value={barangayId} onChange={(id, valid) => { setBarangayId(id); setBarangayValid(valid); }} /></div>
        {data && <><Field label="Search owner"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Owner name" className={inputCls} /></Field><Field label="Sort by"><Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={inputCls}><option value="owner_name">Owner</option><option value="dogs">Most dogs</option><option value="cats">Most cats</option></Select></Field><Field label="Direction"><Select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} className={inputCls}><option value="asc">Ascending</option><option value="desc">Descending</option></Select></Field></>}
        {rows.length > 0 && <PrintButton target={sheet} />}
      </div>
      {loading && <Loading />}
      {error && <Notice kind="error">{error.message}</Notice>}
      {!barangayValid && !loading && !error && <p className="flex min-h-64 items-center justify-center px-4 text-center text-base font-medium text-slate-500">select or search for a barangay first</p>}
      {data && !rows.length && <p className="py-10 text-center text-sm text-slate-500">{t('census.summary.empty')}</p>}
      {data && rows.length > 0 && rows.length !== data.data.length && <p className="mb-2 text-xs text-slate-500">Showing {rows.length} of {data.data.length} owners; totals reflect the filtered rows.</p>}
      {rows.length > 0 && (
        <div ref={sheet} className="overflow-x-auto rounded-2xl bg-white p-5 text-black shadow-panel ring-1 ring-slate-200 sm:p-8 dark:ring-white/10 print:rounded-none print:p-0 print:shadow-none print:ring-0 print:overflow-visible"><CensusSummarySheet barangay={data?.barangay?.name ?? ''} rows={sheetRows} /></div>
      )}
    </div>
  );
}

type Totals = Record<string, number>;

/** Census front page: final totals for one barangay (or the whole city) for a chosen year. */
export function CensusFrontPage() {
  const { t } = useT();
  const [barangayId, setBarangayId] = useState('');
  const [barangayValid, setBarangayValid] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const path = `/census/front-page?year=${encodeURIComponent(year)}${barangayId ? `&barangayId=${barangayId}` : ''}`;
  const { data, loading, error } = useApi<{ barangay: Barangay | null; year: number; totals: Totals }>(/^\d{4}$/.test(year) && barangayValid ? path : null);
  const n = data?.totals;
  const cell = 'border border-black px-1.5 py-0.5 align-top';
  const sheet = useRef<HTMLDivElement>(null);
  const pair = (dogs: number, cats: number) => (<><td className={cell}>D= {dogs}</td><td className={cell}>C= {cats}</td></>);
  return (
    <div className="max-w-3xl">
      <style media="print">{'@page { size: portrait; margin: 15mm; }'}</style>
      <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <h1 className="w-full text-2xl font-semibold tracking-tight">{t('census.frontpage.title')}</h1>
        <div className="w-full sm:w-72"><BarangaySelect value={barangayId} onChange={(id, valid) => { setBarangayId(id); setBarangayValid(valid); }} allowAll /></div>
        <div className="w-28"><Field label={t('census.year')}><input inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} /></Field></div>
        {n && <PrintButton target={sheet} />}
      </div>
      {loading && <Loading />}
      {error && <Notice kind="error">{error.message}</Notice>}
      {n && data && (
        <div ref={sheet} className="mx-auto w-full max-w-[180mm] [font-family:Arial,sans-serif] rounded-2xl bg-white p-5 text-black shadow-panel ring-1 ring-slate-200 sm:p-8 dark:ring-white/10 print:rounded-none print:p-0 print:shadow-none print:ring-0">
          <Letterhead seals title="Census Front Page" />
          <p className="mt-6 text-sm">BARANGAY: <span className="inline-block min-w-48 border-b border-black px-1 font-semibold">{data.barangay?.name ?? t('census.cityWide')}</span></p>
          <table className="mt-4 w-full border-collapse text-[13px] leading-tight tabular-nums">
            <tbody>
              <tr><td className={`${cell} w-[58%]`}>Total Number of Household</td><td className={cell} colSpan={2}>{n.households}</td></tr>
              <tr><td className={cell}>Total Number of Pets Owners</td><td className={cell} colSpan={2}>{n.pet_owners}</td></tr>
              <tr><td className={cell}>Total Number of Dogs / Cats</td>
                <td className={cell}>D= {n.dogs}<br />Male= {n.dogs_male}<br />Female= {n.dogs_female}</td>
                <td className={cell}>C= {n.cats}<br />Male= {n.cats_male}<br />Female= {n.cats_female}</td></tr>
              <tr><td className={cell}>Total Number of Spayed / Female Dog</td><td className={cell} colSpan={2}>{n.spayed_female_dogs}</td></tr>
              <tr><td className={cell}>Total Number of Castrate / Male Dog</td><td className={cell} colSpan={2}>{n.castrated_male_dogs}</td></tr>
              <tr><td className={cell}>Total Number of Spayed / Female Cat</td><td className={cell} colSpan={2}>{n.spayed_female_cats}</td></tr>
              <tr><td className={cell}>Total Number of Castrate / Male Cat</td><td className={cell} colSpan={2}>{n.castrated_male_cats}</td></tr>
              <tr><td className={cell}>Total Number of Registered Dogs Year {data.year}</td><td className={cell} colSpan={2}>{n.registered_dogs}</td></tr>
              <tr><td className={cell}>Total Number of Confined Dogs/Cats</td>{pair(n.confined_dogs, n.confined_cats)}</tr>
              <tr><td className={cell}>Total Number of Semi Confined</td>{pair(n.semi_confined_dogs, n.semi_confined_cats)}</tr>
              <tr><td className={cell}>Total Number of Free Roaming</td>{pair(n.free_roaming_dogs, n.free_roaming_cats)}</tr>
              <tr><td className={cell}>Total Number of Dogs and Cats with Booster</td>{pair(n.booster_dogs, n.booster_cats)}</tr>
              <tr><td className={cell}>Total Number of Dogs and Cats with Laps Vaccine</td>{pair(n.laps_dogs, n.laps_cats)}</tr>
            </tbody>
          </table>
          <div className="mt-14"><Signature label="" caption="Signature over Printed Name of Paravet" /></div>
          <div className="mt-8"><Signature label="Reviewed by:" caption="Immediate Supervisor" /></div>
        </div>
      )}
    </div>
  );
}
