import { useEffect, useMemo, useRef, useState } from 'react';
import { Letterhead, PrintButton, Signature, SheetFooter } from '../../components/PrintSheet';
import { Field, inputCls, Loading, Notice } from '../../components/ui';
import { useT } from '../../i18n';
import { useApi } from '../../lib/useApi';

type Barangay = { id: number; name: string };

function BarangaySelect({ value, onChange, allowAll }: { value: string; onChange: (id: string, valid: boolean) => void; allowAll?: boolean }) {
  const { t } = useT();
  const { data } = useApi<{ data: Barangay[] }>('/barangays');
  const [text, setText] = useState('');
  const suppressSync = useRef(false);
  useEffect(() => {
    if (suppressSync.current) {
      suppressSync.current = false;
      return;
    }
    const selectedName = data?.data.find((barangay) => String(barangay.id) === value)?.name;
    if (selectedName) setText(selectedName);
  }, [data, value]);
  return (
    <Field label={t('census.meta.barangay')}>
      <input
        list="census-barangay-options"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const match = data?.data.find((barangay) => barangay.name.toLocaleLowerCase() === next.trim().toLocaleLowerCase());
          if (match) onChange(String(match.id), true);
          else {
            suppressSync.current = Boolean(value);
            onChange('', allowAll === true && next.trim() === '');
          }
        }}
        placeholder={allowAll ? `${t('census.cityWide')} · ${t('census.pickBarangay')}` : t('census.pickBarangay')}
        autoComplete="off"
        className={inputCls}
        aria-label={t('census.meta.barangay')}
      />
      <datalist id="census-barangay-options">{data?.data.map((barangay) => <option key={barangay.id} value={barangay.name} />)}</datalist>
    </Field>
  );
}

type Row = Record<string, number | string>;
const SEX_GROUPS: [string, string][] = [['M', 'male'], ['F', 'female'], ['Castrate', 'castrated'], ['Spayed', 'spayed']];
const CLASS_GROUPS: [string, string][] = [['Confined', 'confined'], ['Semi-Con', 'semi_confined'], ['FreeRoam', 'free_roaming']];
const VACC_GROUPS: [string, string][] = [['1st yr', 'first_year'], ['2nd yr', 'second_year'], ['3rd yr', 'third_year'], ['Others', 'other']];
const COUNT_COLUMNS = [
  ...SEX_GROUPS, ...CLASS_GROUPS, ...VACC_GROUPS,
].flatMap(([, key]) => [`${key}_dogs`, `${key}_cats`]);

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
  const total = (key: string) => rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
  const th = 'border border-slate-400 px-1 py-1 text-center font-semibold';
  const td = 'border border-slate-300 px-1 py-0.5 text-center tabular-nums';
  return (
    <div className="mx-auto max-w-[110rem]">
      <style media="print">{'@page { size: A4 landscape; margin: 10mm; }'}</style>
      <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <h1 className="mr-auto text-2xl font-semibold tracking-tight">{t('census.summary.title')}</h1>
        <div className="w-64"><BarangaySelect value={barangayId} onChange={(id, valid) => { setBarangayId(id); setBarangayValid(valid); }} /></div>
        {data && <><Field label="Search owner"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Owner name" className={inputCls} /></Field><Field label="Sort by"><select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={inputCls}><option value="owner_name">Owner</option><option value="dogs">Most dogs</option><option value="cats">Most cats</option></select></Field><Field label="Direction"><select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} className={inputCls}><option value="asc">Ascending</option><option value="desc">Descending</option></select></Field></>}
        {rows.length > 0 && <PrintButton />}
      </div>
      {loading && <Loading />}
      {error && <Notice kind="error">{error.message}</Notice>}
      {!barangayValid && !loading && !error && <p className="flex min-h-64 items-center justify-center px-4 text-center text-base font-medium text-slate-500">select or search for a barangay first</p>}
      {data && !rows.length && <p className="py-10 text-center text-sm text-slate-500">{t('census.summary.empty')}</p>}
      {data && rows.length > 0 && rows.length !== data.data.length && <p className="mb-2 text-xs text-slate-500">Showing {rows.length} of {data.data.length} owners; totals reflect the filtered rows.</p>}
      {rows.length > 0 && (
        <div className="bg-white text-slate-900 print:text-black">
          <Letterhead title="Dog & Cat Summary of Census Form" />
          <p className="mt-3 text-sm font-semibold">BARANGAY: {data?.barangay?.name}</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr><th rowSpan={3} className={th}>No</th><th rowSpan={3} className={`${th} min-w-40`}>Pet Owner</th>
                  <th colSpan={2} className={th}>Type of Pet</th><th colSpan={8} className={th}>Sex</th><th colSpan={6} className={th}>Classification</th><th colSpan={8} className={th}>Vaccination Status</th></tr>
                <tr><th rowSpan={2} className={th}>Dog</th><th rowSpan={2} className={th}>Cat</th>
                  {[...SEX_GROUPS, ...CLASS_GROUPS, ...VACC_GROUPS].map(([label]) => <th key={label} colSpan={2} className={th}>{label}</th>)}</tr>
                <tr>{COUNT_COLUMNS.map((column) => <th key={column} className={th}>{column.endsWith('dogs') ? 'D' : 'C'}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={String(row.owner_id)}>
                    <td className={td}>{index + 1}</td><td className={`${td} text-left`}>{row.owner_name}</td>
                    <td className={td}>{row.dogs}</td><td className={td}>{row.cats}</td>
                    {COUNT_COLUMNS.map((column) => <td key={column} className={td}>{Number(row[column] ?? 0) || ''}</td>)}
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className={td} colSpan={2}>TOTAL</td><td className={td}>{total('dogs')}</td><td className={td}>{total('cats')}</td>
                  {COUNT_COLUMNS.map((column) => <td key={column} className={td}>{total(column)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-10 flex justify-between"><Signature label="Prepared By:" caption="Paravet" /><Signature label="Noted By:" caption="Barangay Chairman" /></div>
          <SheetFooter />
        </div>
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
  const cell = 'border border-slate-500 px-3 py-1.5';
  const pair = (dogs: number, cats: number) => (<><td className={cell}>D= {dogs}</td><td className={cell}>C= {cats}</td></>);
  return (
    <div className="mx-auto max-w-3xl">
      <style media="print">{'@page { size: A4 portrait; margin: 15mm; }'}</style>
      <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <h1 className="mr-auto text-2xl font-semibold tracking-tight">{t('census.frontpage.title')}</h1>
        <div className="w-56"><BarangaySelect value={barangayId} onChange={(id, valid) => { setBarangayId(id); setBarangayValid(valid); }} allowAll /></div>
        <div className="w-28"><Field label={t('census.year')}><input inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} /></Field></div>
        {n && <PrintButton />}
      </div>
      {loading && <Loading />}
      {error && <Notice kind="error">{error.message}</Notice>}
      {n && data && (
        <div className="bg-white text-slate-900 print:text-black">
          <Letterhead title="Census Front Page" />
          <p className="mt-4 text-sm">BARANGAY: <span className="font-semibold">{data.barangay?.name ?? t('census.cityWide')}</span></p>
          <table className="mt-2 w-full border-collapse text-sm tabular-nums">
            <tbody>
              <tr><td className={cell}>Total Number of Household</td><td className={cell} colSpan={2}>{n.households}</td></tr>
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
          <SheetFooter />
        </div>
      )}
    </div>
  );
}
