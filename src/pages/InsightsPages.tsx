import { useRef, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi, useDebouncedValue } from '../lib/useApi';
import { ComparisonBars, SaveChartImage, inputCls, Loading, Modal, Notice, Pagination, btnGhost, btnPrimary, Select, districtOptions } from '../components/ui';
import { Letterhead } from '../components/PrintSheet';
import { useAuth } from '../lib/auth';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { DataFreshness } from '../components/DataFreshness';

type List = { data: Record<string, unknown>[]; total: number };
type Activity = { data: { id: string; time: string; user: string; action: string; detail: string }[]; total: number };
type Analytics = {
  syntheticRecords?:number;
  source: 'live' | 'sample';
  year: number;
  previousYear: number;
  comparisonMonths: number;
  totals: {
    owners: number; pets: number; households: number; animals: number; programs: number;
    services: number; stubs: number; dogs: number; cats: number; other_species: number;
    documented_vaccine_flags: number; laps_records: number; sterilized: number;
    vaccine_flag_record_rate: number | null; pet_population_coverage_rate: null;
  };
  comparison: {
    antiRabiesServices: { current: number; previous: number; percentChange: number | null };
    spayNeuterServices: { current: number; previous: number; percentChange: number | null };
  };
  forecast: {
    antiRabiesServices: number | null;
    spayNeuterServices: number | null;
    sampleSize: number;
    observedMonths: number;
    available: boolean;
    reason: 'sample-source' | 'insufficient-months' | 'insufficient-records' | null;
    months: number[];
    method: string;
  };
  monthly: {
    month: number;
    currentObserved: boolean;
    previousObserved: boolean;
    current: { petRegistrations: number; antiRabiesServices: number; spayNeuterServices: number; microchipServices: number; programs: number; households: number; animals: number };
    previous: { petRegistrations: number; antiRabiesServices: number; spayNeuterServices: number; microchipServices: number; programs: number; households: number; animals: number };
  }[];
  barangays: { barangay: string; pets: number; documented_vaccine_flags: number; laps_records: number; without_vaccine_flags: number; sterilized: number }[];
  serviceBreakdown: { service: string; total: number; completed: number }[];
  barangayActivity: { barangay: string; month: number; antiRabies: number; kapon: number; totalActivity: number }[];
  censusCoverage?: { barangay: string; approved: number; pending: number; rejected: number; owners: number; pets: number; lastCensus: string | null }[];
  programTurnout?: { id: number; title: string; barangay: string; date: string; interested: number; named: number; namedAttended: number; attended: number; walkIns: number }[];
  evidence: {
    countsByDataset: Record<'owners' | 'pets' | 'households' | 'animals' | 'programs' | 'services' | 'stubs', number>;
  };
};

const chartColors = { rabies: '#0f766e', kapon: '#d97706', microchip: '#4f46e5' };
type AnalyticsDataset = keyof Analytics['evidence']['countsByDataset'];
type AnalyticsRecord = {
  dataset: AnalyticsDataset;
  id: string;
  label: string;
  status: string;
  date: string;
  barangay: string;
  detail: string;
};

const datasetLabels: Record<AnalyticsDataset, string> = {
  owners: 'Owners',
  pets: 'Pets',
  households: 'Households',
  animals: 'Animals',
  programs: 'Programs',
  services: 'Services',
  stubs: 'Stubs',
};

const datasetRoutes: Record<AnalyticsDataset, string> = {
  owners: '/registry/owners',
  pets: '/registry/pets',
  households: '/registry/households',
  animals: '/registry/animals',
  programs: '/programs',
  services: '/services',
  stubs: '/stubs',
};

export function EvidenceRecordSearch({ source, year }: { source: 'live' | 'sample'; year: number }) {
  const navigate = useNavigate();
  const { account } = useAuth();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim());
  const [dataset, setDataset] = useState<'all' | AnalyticsDataset>('all');
  const [dateScope, setDateScope] = useState<'year' | 'all'>('year');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const availableDatasets: AnalyticsDataset[] = account?.type === 'Paravet'
    ? ['owners', 'pets', 'households', 'animals']
    : ['owners', 'pets', 'households', 'animals', 'programs', 'services', 'stubs'];
  const params = new URLSearchParams({
    mode: 'records',
    source,
    year: String(year),
    dateScope,
    dataset,
    page: String(page),
    pageSize: String(pageSize),
    q: debouncedSearch,
  });
  const { data, error, loading } = useApi<{
    source: string; year: number; dateScope: string; dataset: string; query: string;
    page: number; pageSize: number; total: number; records: AnalyticsRecord[];
  }>(`/analytics?${params.toString()}`);

  const openRecord = (record: AnalyticsRecord) => {
    const query = new URLSearchParams({ q: record.id, recordId: record.id });
    navigate(`${datasetRoutes[record.dataset]}?${query.toString()}`);
  };

  return <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <div>
      <h2 className="text-lg font-semibold">Search Evidence Records</h2>
      <p className="mt-1 text-sm text-slate-500">Search records included in the selected source, date scope, and your existing access scope. Results are paginated; selecting a record opens its usual record page.</p>
    </div>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="min-w-64 flex-1 text-xs text-slate-500">Search all fields
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search names, IDs, status, service…" className={`${inputCls} mt-1`} />
      </label>
      <label className="text-xs text-slate-500">Record type
        <Select value={dataset} onChange={(event) => { setDataset(event.target.value as 'all' | AnalyticsDataset); setPage(1); }} className={`${inputCls} mt-1`}>
          <option value="all">All accessible types</option>
          {availableDatasets.map((value) => <option key={value} value={value}>{datasetLabels[value]}</option>)}
        </Select>
      </label>
      <label className="text-xs text-slate-500">Date scope
        <Select value={dateScope} onChange={(event) => { setDateScope(event.target.value as 'year' | 'all'); setPage(1); }} className={`${inputCls} mt-1`}>
          <option value="year">{year} records</option>
          <option value="all">All dates, including undated</option>
        </Select>
      </label>
      <button type="button" onClick={() => { setSearch(''); setDataset('all'); setDateScope('year'); setPage(1); }} className={btnGhost}>Clear</button>
    </div>
    {error && <div className="mt-3"><Notice kind="error">{error.message}</Notice></div>}
    {loading && <p role="status" className="mt-3 text-xs text-slate-500">Searching records…</p>}
    {data && !loading && !error && <>
      <p aria-live="polite" className="mt-3 text-xs text-slate-500">Showing {data.records.length} of {data.total} matching {data.source} records {data.dateScope === 'all' ? 'across all dates, including undated records' : `for ${data.year}`}.</p>
      <div className="mt-2 data-table overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr>
            <th className="p-2">Record</th><th className="p-2">Type</th><th className="p-2">Date</th><th className="p-2">Barangay</th><th className="p-2">Details</th><th className="p-2"><span className="sr-only">Open</span></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.records.map((record) => <tr key={`${record.dataset}:${record.id}`}>
              <td className="p-2">{record.label}<span className="block text-xs text-slate-400">{record.id}</span></td>
              <td className="p-2">{datasetLabels[record.dataset]}</td><td className="p-2">{record.date || '—'}</td>
              <td className="p-2">{record.barangay || '—'}</td><td className="p-2">{[record.status, record.detail].filter(Boolean).join(' · ') || '—'}</td>
              <td className="p-2"><button type="button" onClick={() => openRecord(record)} className="font-medium text-teal-800 underline underline-offset-2 dark:text-teal-300">Open</button></td>
            </tr>)}
            {!data.records.length && <tr><td colSpan={6} className="p-4 text-slate-500">No records match this source and date scope.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} />
    </>}
  </section>;
}

function MonthlyServicesChart({ data, monthLabel, labels }: {
  data: Analytics['monthly'];
  monthLabel: (month: number) => string;
  labels: { rabies: string; kapon: string; microchip: string; chart: string; notObserved: string };
}) {
  const plot = { left: 44, right: 704, top: 20, bottom: 180 };
  const maximum = Math.max(1, ...data.flatMap((row) => [row.current.antiRabiesServices, row.current.spayNeuterServices, row.current.microchipServices]));
  const step = Math.max(1, Math.ceil(maximum / 4));
  const ceiling = step * 4;
  const y = (value: number) => plot.bottom - (value / ceiling) * (plot.bottom - plot.top);
  const band = (plot.right - plot.left) / 12;
  const values = (row: Analytics['monthly'][number]) => [
    { key: 'rabies', value: row.current.antiRabiesServices, color: chartColors.rabies },
    { key: 'kapon', value: row.current.spayNeuterServices, color: chartColors.kapon },
    { key: 'microchip', value: row.current.microchipServices, color: chartColors.microchip },
  ];
  return <div data-chart className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{labels.chart}</h3><SaveChartImage name={labels.chart} /></div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
      {([
        ['rabies', labels.rabies, chartColors.rabies],
        ['kapon', labels.kapon, chartColors.kapon],
        ['microchip', labels.microchip, chartColors.microchip],
      ] as const).map(([key, label, color]) => <span key={key} className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />{label}</span>)}
    </div>
    <div className="mt-2 overflow-x-auto">
      <svg role="img" aria-label={labels.chart} viewBox="0 0 720 220" className="h-auto min-w-[640px] w-full">
        {Array.from({ length: 5 }, (_, index) => {
          const value = ceiling - index * step;
          const lineY = y(value);
          return <g key={value}>
            <line x1={plot.left} y1={lineY} x2={plot.right} y2={lineY} stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeDasharray={value === 0 ? undefined : '3 4'} />
            <text x={plot.left - 8} y={lineY + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{value}</text>
          </g>;
        })}
        {data.map((row, index) => {
          const center = plot.left + band * index + band / 2;
          const group = values(row);
          return <g key={row.month}>
            {row.currentObserved ? group.map((item, position) => {
              const height = plot.bottom - y(item.value);
              const x = center - 16 + position * 11;
              return <rect key={item.key} x={x} y={y(item.value)} width="8" height={Math.max(0, height)} rx="2" fill={item.color}>
                <title>{`${monthLabel(row.month)} · ${item.key}: ${item.value}`}</title>
              </rect>;
            }) : <text x={center} y={plot.bottom - 5} textAnchor="middle" className="fill-slate-400 text-xs"><title>{labels.notObserved}</title>—</text>}
            <text x={center} y="201" textAnchor="middle" className="fill-slate-500 text-[10px]">{monthLabel(row.month)}</text>
          </g>;
        })}
      </svg>
    </div>
  </div>;
}

function PetRegistrationChart({ data, monthLabel, labels }: {
  data: Analytics['monthly'];
  monthLabel: (month: number) => string;
  labels: { current: string; previous: string; chart: string; notObserved: string };
}) {
  const plot = { left: 44, right: 704, top: 20, bottom: 180 };
  const maximum = Math.max(1, ...data.flatMap((row) => [row.current.petRegistrations, row.previous.petRegistrations]));
  const step = Math.max(1, Math.ceil(maximum / 4));
  const ceiling = step * 4;
  const x = (index: number) => plot.left + (index / 11) * (plot.right - plot.left);
  const y = (value: number) => plot.bottom - (value / ceiling) * (plot.bottom - plot.top);
  const linePath = (series: 'current' | 'previous') => data.map((row, index) => {
    const observed = series === 'current' ? row.currentObserved : row.previousObserved;
    if (!observed) return '';
    const previousRow = data[index - 1];
    const previousObserved = previousRow && (series === 'current' ? previousRow.currentObserved : previousRow.previousObserved);
    return `${previousObserved ? 'L' : 'M'}${x(index)},${y(row[series].petRegistrations)}`;
  }).filter(Boolean).join(' ');
  return <div data-chart className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{labels.chart}</h3><SaveChartImage name={labels.chart} /></div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
      <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-teal-700" />{labels.current}</span>
      <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-indigo-500" />{labels.previous}</span>
    </div>
    <div className="mt-2 overflow-x-auto">
      <svg role="img" aria-label={labels.chart} viewBox="0 0 720 220" className="h-auto min-w-[640px] w-full">
        {Array.from({ length: 5 }, (_, index) => {
          const value = ceiling - index * step;
          const lineY = y(value);
          return <g key={value}>
            <line x1={plot.left} y1={lineY} x2={plot.right} y2={lineY} stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeDasharray={value === 0 ? undefined : '3 4'} />
            <text x={plot.left - 8} y={lineY + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{value}</text>
          </g>;
        })}
        <path d={linePath('previous')} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <path d={linePath('current')} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((row, index) => <g key={row.month}>
          {row.previousObserved
            ? <circle cx={x(index)} cy={y(row.previous.petRegistrations)} r="3.5" fill="#6366f1"><title>{`${monthLabel(row.month)} · ${labels.previous}: ${row.previous.petRegistrations}`}</title></circle>
            : <title>{`${monthLabel(row.month)} · ${labels.previous}: ${labels.notObserved}`}</title>}
          {row.currentObserved
            ? <circle cx={x(index)} cy={y(row.current.petRegistrations)} r="3.5" fill="#0f766e"><title>{`${monthLabel(row.month)} · ${labels.current}: ${row.current.petRegistrations}`}</title></circle>
            : <title>{`${monthLabel(row.month)} · ${labels.current}: ${labels.notObserved}`}</title>}
          <text x={x(index)} y="201" textAnchor="middle" className="fill-slate-500 text-[10px]">{monthLabel(row.month)}</text>
        </g>)}
      </svg>
    </div>
  </div>;
}

function BarangayServiceHeatmap({ data, monthLabel, labels, onSelectBarangay }: {
  data: Analytics['barangayActivity'];
  monthLabel: (month: number) => string;
  labels: { title: string; help: string; empty: string; barangay: string; fewer: string; more: string };
  onSelectBarangay: (name: string) => void;
}) {
  const barangays = [...new Set(data.map((row) => row.barangay))].slice(0, 12);
  const counts = new Map(data.map((row) => [`${row.barangay}:${row.month}`, row]));
  const maximum = Math.max(0, ...data.map((row) => row.antiRabies + row.kapon));
  const cellClass = (value: number) => {
    if (!value) return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
    if (value / maximum >= 0.75) return 'bg-teal-800 text-white dark:bg-teal-700';
    if (value / maximum >= 0.5) return 'bg-teal-600 text-white dark:bg-teal-600';
    if (value / maximum >= 0.25) return 'bg-teal-400 text-teal-950 dark:bg-teal-500 dark:text-white';
    return 'bg-teal-200 text-teal-950 dark:bg-teal-900 dark:text-teal-100';
  };
  return <section data-chart>
    <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">{labels.title}</h2>{barangays.length > 0 && <SaveChartImage name={labels.title} />}</div>
    <p className="mt-1 text-sm text-slate-500">{labels.help}</p>
    {!barangays.length ? <p className="mt-3 rounded-xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700">{labels.empty}</p> : <>
      <div className="mt-3 data-table overflow-x-auto">
        <table className="w-full min-w-[920px] text-center text-xs">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900"><tr>
            <th className="sticky left-0 min-w-40 bg-slate-50 p-3 text-left dark:bg-slate-900">{labels.barangay}</th>
            {Array.from({ length: 12 }, (_, index) => <th key={index + 1} className="min-w-12 p-2">{monthLabel(index + 1)}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{barangays.map((barangay) => <tr key={barangay}>
            <th scope="row" className="sticky left-0 bg-white p-3 text-left font-medium dark:bg-slate-950">
              <button type="button" onClick={() => onSelectBarangay(barangay)} className="text-teal-800 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-teal-300">{barangay}</button>
            </th>
            {Array.from({ length: 12 }, (_, index) => {
              const month = index + 1;
              const row = counts.get(`${barangay}:${month}`);
              const value = (row?.antiRabies ?? 0) + (row?.kapon ?? 0);
              return <td key={month} className="p-1">
                <span
                  aria-label={`${barangay}, ${monthLabel(month)}: ${value} service completions`}
                  title={`${barangay} · ${monthLabel(month)} · ${value} completions (anti-rabies ${row?.antiRabies ?? 0}, Kapon ${row?.kapon ?? 0})`}
                  className={`inline-flex h-8 min-w-9 items-center justify-center rounded-md px-1 font-medium ${cellClass(value)}`}
                >{value}</span>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{labels.fewer}</span>
        {['bg-slate-100 dark:bg-slate-800', 'bg-teal-200 dark:bg-teal-900', 'bg-teal-400 dark:bg-teal-500', 'bg-teal-600', 'bg-teal-800 dark:bg-teal-700'].map((color) => <span key={color} className={`h-4 w-5 rounded ${color}`} />)}
        <span>{labels.more}</span>
      </div>
    </>}
  </section>;
}

type ReportOptions = {
  barangays: { id: number; code: string; name: string; district: string; zip: string }[];
  accounts: { id: number; name: string; type: string; status: string; barangayId: number | null; owner_id: number | null; barangay: string | null }[];
  pets: { id: string; name: string; species: string; owner: string; barangay: string }[];
};
type ReportSection = {
  key: string; title: string; total: number;
  records: { id: string; label: string; status: string; date: string; barangay: string; detail: string }[];
};
type CustomReport = {
  header: { office: string; municipality: string; title: string; year: number; source: string; methodologyVersion: string; generatedAt: string; preparedBy: string };
  filters: { barangay: { id: number; code: string; name: string; district: string; zip: string } | null; account: { id: number; name: string; type: string } | null; pet: ReportOptions['pets'][number] | null; paravet: { id: number; name: string; code: string } | null };
  categories: ReportSection[];
};
type BarangayProfile = {
  barangay: { id: number; code: string; name: string; district: string; districtLabel: string; zip: string };
  source: string;
  paravets: { id: number; name: string; code: string; status: string }[];
  census: { status: string; submissions: number; households_visited: number; census_owners: number; census_pets: number }[];
  registry: { owners: number; pets: number; dogs: number; cats: number; laps: number; sterilized: number };
  dashboardRecords: { dataset: string; count: number }[];
  prelistings: { count: number; recent: number };
  idVerifications: { status: string; count: number }[];
};
const reportCategories = [
  ['overview', 'Overview'], ['registry', 'Owners and registry'], ['pets', 'Pets'],
  ['census', 'Census'], ['accounts', 'Accounts and Paravets'],
  ['field-operations', 'Field operations'], ['program-interest', 'Program interest'], ['prelistings', 'Archived resident pre-listings'],
] as const;

type ReportOptionKind = 'barangay' | 'account' | 'pet' | 'paravet';
type SearchOption = { id: string; label: string };

function ReportOptionSearch({ source, kind, label, placeholder, onSelect }: {
  source: 'live' | 'sample';
  kind: ReportOptionKind;
  label: string;
  placeholder: string;
  onSelect: (id: string) => void;
}) {
  const [text, setText] = useState('');
  const query = useDebouncedValue(text.trim());
  const params = new URLSearchParams({ mode: 'options', source, kind, q: query });
  const path = query.length >= 2 ? `/reports?${params.toString()}` : null;
  const { data, error, loading } = useApi<{ options: SearchOption[] }>(path);
  const currentOptions = query === text.trim() && !loading && !error ? data?.options ?? [] : [];
  const listId = `report-option-${kind}`;
  return <label className="text-xs text-slate-500">{label}
    <input
      list={listId}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const match = currentOptions.find((option) => option.label === next);
        onSelect(match?.id ?? '');
      }}
      autoComplete="off"
      placeholder={placeholder}
      className={`${inputCls} mt-1`}
    />
    <datalist id={listId}>{currentOptions.map((option) => <option key={option.id} value={option.label} />)}</datalist>
    {loading && <span role="status" className="mt-1 block">Searching…</span>}
    {error && <span role="alert" className="mt-1 block text-red-600">{error.message}</span>}
    {query.length < 2 && <span className="mt-1 block">Type at least 2 characters to search.</span>}
    {!loading && !error && query.length >= 2 && currentOptions.length === 0 && <span className="mt-1 block">No matching options.</span>}
  </label>;
}

function BarangayProfilePanel({ profile, loading, error, onClose }: {
  profile: BarangayProfile | null; loading: boolean; error: Error | null; onClose: () => void;
}) {
  if (!profile && !loading && !error) return null;
  return <section className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-900 dark:bg-teal-950/20" aria-live="polite">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        {profile && <><h2 className="text-lg font-semibold">{profile.barangay.name} profile</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Barangay ID {profile.barangay.id} · Code {profile.barangay.code} · {profile.barangay.districtLabel} · ZIP {profile.barangay.zip} · {profile.source === 'sample' ? 'Sample data only' : 'Live records only'}</p></>}
      </div>
      <button type="button" className={btnGhost} onClick={onClose}>Close</button>
    </div>
    {loading && <p role="status" className="mt-3 text-sm text-slate-500">Loading barangay details…</p>}
    {error && <div className="mt-3"><Notice kind="error">{error.message}</Notice></div>}
    {profile && <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Registry owners', profile.registry.owners], ['Registered pets', profile.registry.pets],
          ['Dogs / Cats', `${profile.registry.dogs} / ${profile.registry.cats}`], ['LAPS records', profile.registry.laps],
          ['Sterilized pets', profile.registry.sterilized], ['Active Paravets', profile.paravets.length],
          ['Archived resident pre-listings', profile.source === 'sample' ? 'Live-only; not included' : profile.prelistings.count],
          ['Archived pre-listings submitted (90d)', profile.source === 'sample' ? 'Live-only; not included' : profile.prelistings.recent],
        ].map(([label, value]) => <article key={String(label)} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></article>)}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div><h3 className="text-sm font-semibold">Active Paravets</h3>
          {profile.paravets.length ? <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">{profile.paravets.map((paravet) => <li key={paravet.id} className="flex justify-between gap-3 p-2 text-sm"><span>{paravet.name}</span><span className="text-slate-500">{paravet.code}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No active Paravets assigned.</p>}
        </div>
        <div><h3 className="text-sm font-semibold">Census submissions</h3>
          {profile.census.length ? <ul className="mt-2 space-y-1 text-sm">{profile.census.map((row) => <li key={row.status} className="flex justify-between gap-3"><span className="capitalize">{row.status}</span><span>{row.submissions} submissions · {row.households_visited} households · {row.census_owners} owners · {row.census_pets} pets</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No census submissions for this source.</p>}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div><h3 className="text-sm font-semibold">Dashboard records by dataset</h3>
          {profile.dashboardRecords.length ? <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">{profile.dashboardRecords.map((row) => <li key={row.dataset} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"><span className="capitalize">{row.dataset}</span><strong className="float-right">{row.count}</strong></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No dashboard records for this source.</p>}
        </div>
        <div><h3 className="text-sm font-semibold">Archived ID verification decisions</h3>
          {profile.source === 'sample' ? <p className="mt-2 text-sm text-slate-500">Live-only; not included in sample reports.</p> : profile.idVerifications.length ? <ul className="mt-2 space-y-1 text-sm">{profile.idVerifications.map((row) => <li key={row.status} className="flex justify-between capitalize"><span>{row.status}</span><strong>{row.count}</strong></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No ID verification records.</p>}
        </div>
      </div>
    </>}
  </section>;
}

export function ReportBuilder({ source, year }: { source: 'live' | 'sample'; year: number }) {
  const [title, setTitle] = useState('');
  const [barangayId, setBarangayId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [petId, setPetId] = useState('');
  const [paravetId, setParavetId] = useState('');
  const [recordSearch, setRecordSearch] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [categories, setCategories] = useState<string[]>(reportCategories.map(([key]) => key));
  const [requestPath, setRequestPath] = useState<string | null>(null);
  const { data, error, loading } = useApi<CustomReport>(requestPath);
  const generate = () => {
    const params = new URLSearchParams({ mode: 'report', source, year: String(year), categories: categories.join(','), title, q: recordSearch.trim() });
    if (barangayId) params.set('barangayId', barangayId);
    if (accountId) params.set('accountId', accountId);
    if (petId) params.set('petId', petId);
    if (paravetId) params.set('paravetId', paravetId);
    setRequestPath(`/reports?${params.toString()}`);
  };
  const clear = () => { setTitle(''); setBarangayId(''); setAccountId(''); setPetId(''); setParavetId(''); setRecordSearch(''); setResetKey((value) => value + 1); setCategories(reportCategories.map(([key]) => key)); setRequestPath(null); };
  return <section className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <div><h2 className="text-lg font-semibold">Build a Consolidated Report</h2><p className="mt-1 text-sm text-slate-500">Select categories and records to assemble one printable report with a Census-sheet-inspired office header. Report data is source-isolated; only supported database records are included.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs text-slate-500">Report title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Municipal veterinary operations report" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
      <ReportOptionSearch key={`${resetKey}-barangay`} source={source} kind="barangay" label="Barangay" placeholder="Search barangays…" onSelect={setBarangayId} />
      <ReportOptionSearch key={`${resetKey}-account`} source={source} kind="account" label="Account" placeholder="Search accounts…" onSelect={setAccountId} />
      <ReportOptionSearch key={`${resetKey}-pet`} source={source} kind="pet" label="Pet" placeholder="Search pets…" onSelect={setPetId} />
      <ReportOptionSearch key={`${resetKey}-paravet`} source={source} kind="paravet" label="Paravet" placeholder="Search Paravets…" onSelect={setParavetId} />
      <label className="text-xs text-slate-500">Search records in included sections
        <input value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} maxLength={120} placeholder="Name, ID, status, barangay…" className={`${inputCls} mt-1`} />
      </label>
      <div className="flex items-end gap-2"><button type="button" onClick={generate} disabled={categories.length === 0} className={btnPrimary}>Generate report</button><button type="button" onClick={clear} className={btnGhost}>Clear</button></div>
    </div>
    <fieldset><legend className="text-sm font-semibold">Include sections</legend><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{reportCategories.map(([key, label]) => <label key={key} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={categories.includes(key)} onChange={(event) => setCategories((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))} />{label}</label>)}</div></fieldset>
    {loading && <p role="status" className="text-sm text-slate-500">Generating report…</p>}
    {error && <Notice kind="error">{error.message}</Notice>}
    {data && !loading && !error && <>
      <div className="report-cover rounded-xl border border-slate-300 bg-white p-5 text-center text-slate-900 print:border-slate-300 print:bg-white print:text-black dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        <Letterhead title={data.header.title} />
        <p className="mt-2 text-xs text-slate-500">Reporting year {data.header.year} · {data.header.source === 'sample' ? 'SAMPLE DATA' : 'LIVE RECORDS'} · Prepared by {data.header.preparedBy} · Generated {new Date(data.header.generatedAt).toLocaleString()}</p>
        <p className="mt-1 text-xs text-slate-500">{data.filters.barangay ? `${data.filters.barangay.name} · Code ${data.filters.barangay.code} · ID ${data.filters.barangay.id}` : 'All barangays'}{data.filters.account ? ` · Account: ${data.filters.account.name} (${data.filters.account.type})` : ''}{data.filters.pet ? ` · Pet: ${data.filters.pet.name} (${data.filters.pet.species})` : ''}{data.filters.paravet ? ` · Paravet: ${data.filters.paravet.name} (${data.filters.paravet.code})` : ''}</p>
      </div>
      <div className="flex justify-end print:hidden"><button type="button" onClick={() => window.print()} className={btnGhost}>Print report</button></div>
      <div className="space-y-5">{data.categories.map((section) => {
        return <section key={section.key} className="report-section rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-semibold">{section.title}</h3><span className="text-sm text-slate-500">{section.key==='overview'?`${section.total} records across ${section.records.length} categories`:section.records.length < section.total ? `Showing ${section.records.length} of ${section.total} records (limit 300)` : `${section.total} records`}</span></div>
          {section.records.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2">Record</th><th className="p-2">Status / Type</th><th className="p-2">Date / Year</th><th className="p-2">Barangay</th><th className="p-2">Details</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{section.records.map((record) => <tr key={`${section.key}:${record.id}`}><td className="p-2">{record.label}<span className="block text-xs text-slate-400">{record.id}</span></td><td className="p-2">{record.status || '—'}</td><td className="p-2">{record.date || '—'}</td><td className="p-2">{record.barangay || '—'}</td><td className="p-2">{record.detail || '—'}</td></tr>)}</tbody></table>
            {section.records.some((record) => /^\d+$/.test(record.detail)) && <ComparisonBars className="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900" title={`${section.title} visual summary`} rows={section.records.filter((record) => /^\d+$/.test(record.detail)).map((record) => ({ label: record.label, value: Number(record.detail) }))} />}
          </div> : <p className="mt-3 text-sm text-slate-500">No records match the selected filters.</p>}
        </section>;
      })}</div>
    </>}
  </section>;
}

export function ReportsPage() {
  const { account } = useAuth();
  const { t, locale } = useT();
  const [source, setSource] = useState<'live' | 'sample'>('live');
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedBarangayId, setSelectedBarangayId] = useState<number | null>(null);
  const isAdmin = account?.type === 'Admin' || account?.type === 'SuperAdmin';
  const { data, error, loading, updatedAt, reload } = useApi<Analytics>(`/analytics?source=${source}&year=${year}`);
  const referenceData = useApi<ReportOptions>(`/reports?mode=options&compact=1&source=${source}`);
  const barangayProfile = useApi<BarangayProfile>(selectedBarangayId ? `/reports?mode=barangay&source=${source}&barangayId=${selectedBarangayId}` : null);
  const currentData = data?.source === source && data.year === year;
  if (loading && !currentData) return <Loading />;
  if (error && !currentData) return <div className="w-full"><Notice kind="error">{error.message}</Notice></div>;
  if (!data || !currentData) return null;
  const countChange = (change: number | null) => change === null ? t('reports.noBaseline') : t('reports.changeVs', { change: `${change > 0 ? '+' : ''}${change}`, year: data.previousYear });
  const monthLabel = (month: number) => new Date(data.year, month - 1, 1).toLocaleString(locale === 'fil' ? 'fil-PH' : 'en', { month: 'short' });
  const monthlyValue = (row: Analytics['monthly'][number], series: 'current' | 'previous', metric: keyof Analytics['monthly'][number]['current']) => {
    const observed = series === 'current' ? row.currentObserved : row.previousObserved;
    return observed ? row[series][metric] : t('reports.notObserved');
  };
  const monthOverMonth = (month: number, metric: 'petRegistrations' | 'antiRabiesServices') => {
    const currentRow = data.monthly[month - 1];
    const previousRow = month === 1 ? data.monthly[11] : data.monthly[month - 2];
    const current = currentRow.current[metric];
    const previous = month === 1 ? previousRow.previous[metric] : previousRow.current[metric];
    const hasCurrent = currentRow.currentObserved;
    const hasPrevious = month === 1 ? previousRow.previousObserved : previousRow.currentObserved;
    return !hasCurrent || !hasPrevious || previous === 0 ? t('reports.momNoBaseline') : t('reports.momChange', {
      change: `${Math.round(((current - previous) / previous) * 100) > 0 ? '+' : ''}${Math.round(((current - previous) / previous) * 100)}`,
    });
  };
  const download = () => {
    const rows = [
      [
        t('reports.month'),
        t('reports.metricYear', { metric: t('reports.petCount'), year: data.year }),
        t('reports.metricYear', { metric: t('reports.petCount'), year: data.previousYear }),
        t('reports.momPets'),
        t('reports.metricYear', { metric: t('reports.antiRabiesCompletions'), year: data.year }),
        t('reports.metricYear', { metric: t('reports.antiRabiesCompletions'), year: data.previousYear }),
        t('reports.momRabies'),
        t('reports.metricYear', { metric: t('reports.kaponCompletions'), year: data.year }),
        t('reports.metricYear', { metric: t('reports.kaponCompletions'), year: data.previousYear }),
        t('reports.metricYear', { metric: t('reports.microchipCompletions'), year: data.year }),
        t('reports.metricYear', { metric: t('reports.microchipCompletions'), year: data.previousYear }),
        t('reports.metricYear', { metric: t('reports.programs'), year: data.year }),
        t('reports.metricYear', { metric: t('reports.programs'), year: data.previousYear }),
        t('reports.metricYear', { metric: t('reports.households'), year: data.year }),
        t('reports.metricYear', { metric: t('reports.households'), year: data.previousYear }),
        t('reports.metricYear', { metric: t('reports.censusAnimals'), year: data.year }),
        t('reports.metricYear', { metric: t('reports.censusAnimals'), year: data.previousYear }),
      ],
      ...data.monthly.map((row) => [
        new Date(data.year, row.month - 1, 1).toLocaleString(locale === 'fil' ? 'fil-PH' : 'en', { month: 'long' }),
        monthlyValue(row, 'current', 'petRegistrations'), monthlyValue(row, 'previous', 'petRegistrations'),
        monthOverMonth(row.month, 'petRegistrations'), monthlyValue(row, 'current', 'antiRabiesServices'), monthlyValue(row, 'previous', 'antiRabiesServices'),
        monthOverMonth(row.month, 'antiRabiesServices'), monthlyValue(row, 'current', 'spayNeuterServices'), monthlyValue(row, 'previous', 'spayNeuterServices'),
        monthlyValue(row, 'current', 'microchipServices'), monthlyValue(row, 'previous', 'microchipServices'),
        monthlyValue(row, 'current', 'programs'), monthlyValue(row, 'previous', 'programs'),
        monthlyValue(row, 'current', 'households'), monthlyValue(row, 'previous', 'households'),
        monthlyValue(row, 'current', 'animals'), monthlyValue(row, 'previous', 'animals'),
      ]),
    ];
    const text = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    link.download = `cityvet-${source}-analytics-${year}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  const percentOf = (part: number, whole: number) => whole ? `${Math.round((part / whole) * 100)}%` : '—';
  // A summary cached before these sections existed has neither list.
  const censusCoverage = data.censusCoverage ?? [], programTurnout = data.programTurnout ?? [];
  const censusCovered = censusCoverage.filter((row) => row.approved > 0).length;
  const censusPending = censusCoverage.reduce((total, row) => total + row.pending, 0);
  const cards = [
    ['reports.activePetRecords', data.totals.pets],
    ['reports.owners', data.totals.owners],
    ['reports.lapsRecords', data.totals.laps_records],
    ['reports.vaccineFlags', `${data.totals.documented_vaccine_flags} / ${data.totals.pets} (${data.totals.vaccine_flag_record_rate === null ? 'no denominator' : `${data.totals.vaccine_flag_record_rate}%`})`],
    ['reports.serviceRecords', data.totals.services],
    ['reports.programRecords', data.totals.programs],
  ] as const;

  return <div className="w-full space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Registry Statistics</h2><p className="mt-1 text-sm text-slate-500">{t('reports.description')}</p></div>
      <button type="button" onClick={download} className={btnGhost}>{t('reports.export')}</button>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs text-slate-500">{t('reports.source')}<Select value={source} onChange={(event) => setSource(event.target.value as typeof source)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
        <option value="live">{t('reports.liveOnly')}</option>
      </Select></label>
      <label className="text-xs text-slate-500">{t('reports.year')}<Select value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
        {Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - index).map((value) => <option key={value} value={value}>{value}</option>)}
      </Select></label>
      {!!data?.syntheticRecords&&<Notice>Includes synthetic reference records. These illustrate trends and never qualify as predictive evidence.</Notice>}
      <p className="text-xs text-slate-500">{t(source === 'sample' ? 'reports.sampleBadge' : 'reports.liveBadge')}</p>
    </div>
    {error && <Notice kind="error">{error.message}</Notice>}
    <DataFreshness updatedAt={updatedAt} loading={loading} onRefresh={reload} maxAgeMs={60000} />
    {referenceData.error && <Notice kind="error">{referenceData.error.message}</Notice>}

    <section aria-label={t('reports.title')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(([label, value]) => <article key={label} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <p className="text-sm text-slate-500">{t(label)}</p><p className="mt-2 text-3xl font-semibold">{value}</p>
      </article>)}
    </section>


    <section>
      <h2 className="text-lg font-semibold">{t('reports.petSection')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('reports.petHelp')}</p>
      <div className="mt-3 data-table overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr>{(['reports.barangay', 'reports.petCount', 'reports.withVaccineFlag', 'reports.sterilizedCol', 'reports.laps', 'reports.noVaccineFlag'] as const).map((label) => <th key={label} className="p-3">{t(label)}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.barangays.map((row) => <tr key={row.barangay}>
          <td className="p-3 font-medium"><button type="button" onClick={() => {
            const reference = referenceData.data?.barangays.find((item) => item.name.toLowerCase() === row.barangay.toLowerCase());
            if (reference) setSelectedBarangayId(reference.id);
          }} className="text-left text-teal-800 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-teal-300">{row.barangay}</button></td><td className="p-3">{row.pets}</td><td className="p-3">{row.documented_vaccine_flags} ({percentOf(row.documented_vaccine_flags, row.pets)})</td><td className="p-3">{row.sterilized} ({percentOf(row.sterilized, row.pets)})</td><td className="p-3">{row.laps_records}</td><td className="p-3">{row.without_vaccine_flags}</td>
        </tr>)}
        {!data.barangays.length && <tr><td colSpan={6} className="p-5 text-slate-500">{t('reports.noPets')}</td></tr>}</tbody>
      </table></div>
      <p className="mt-2 text-xs text-slate-500">{t('reports.speciesSummary', { dogs: data.totals.dogs, cats: data.totals.cats, other: data.totals.other_species, sterilized: data.totals.sterilized })}</p>
    </section>

    {source === 'live' && <section>
      <h2 className="text-lg font-semibold">{t('reports.censusSection')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('reports.censusHelp')}</p>
      <p className="mt-2 text-sm font-medium">{t('reports.censusSummary', { covered: censusCovered, total: censusCoverage.length, year: data.year, pending: censusPending })}</p>
      <details className="mt-2"><summary className="cursor-pointer text-sm text-teal-800 dark:text-teal-300">{t('reports.barangay')} · {t('reports.approved')} / {t('reports.pending')}</summary>
        <div className="mt-2 data-table overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr>{(['reports.barangay', 'reports.approved', 'reports.pending', 'reports.rejected', 'reports.owners', 'reports.petCount', 'reports.lastCensus'] as const).map((label) => <th key={label} className="p-3">{t(label)}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{censusCoverage.map((row) => <tr key={row.barangay}>
            <td className="p-3 font-medium">{row.barangay}</td><td className="p-3">{row.approved}</td><td className="p-3">{row.pending}</td><td className="p-3">{row.rejected}</td>
            <td className="p-3">{row.owners}</td><td className="p-3">{row.pets}</td><td className="p-3">{row.lastCensus ?? t('reports.noCensus')}</td>
          </tr>)}</tbody>
        </table></div>
      </details>
    </section>}

    <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer font-semibold">Trends and barangay activity</summary><div className="mt-5 space-y-5">
    <section className="grid gap-4 lg:grid-cols-2" aria-label={t('reports.trendSection')}>
      <PetRegistrationChart
        data={data.monthly}
        monthLabel={monthLabel}
        labels={{
          current: t('reports.metricYear', { metric: t('reports.petCount'), year: data.year }),
          previous: t('reports.metricYear', { metric: t('reports.petCount'), year: data.previousYear }),
          chart: t('reports.petChart'),
          notObserved: t('reports.notObserved'),
        }}
      />
      <MonthlyServicesChart
        data={data.monthly}
        monthLabel={monthLabel}
        labels={{
          rabies: t('reports.antiRabiesCompletions'),
          kapon: t('reports.kaponCompletions'),
          microchip: t('reports.microchipCompletions'),
          chart: t('reports.serviceChart'),
          notObserved: t('reports.notObserved'),
        }}
      />
    </section>

    <BarangayServiceHeatmap
      data={data.barangayActivity}
      monthLabel={monthLabel}
      labels={{
        title: t('reports.heatmap'),
        help: t('reports.heatmapHelp'),
        empty: t('reports.noHeatmap'),
        barangay: t('reports.barangay'),
        fewer: t('reports.fewerCompletions'),
        more: t('reports.moreCompletions'),
      }}
      onSelectBarangay={(name) => {
        const reference = referenceData.data?.barangays.find((item) => item.name.toLowerCase() === name.toLowerCase());
        if (reference) setSelectedBarangayId(reference.id);
      }}
    />
    <label className="block max-w-md text-xs text-slate-500">Open any barangay profile
      <Select value={selectedBarangayId ?? ''} onChange={(event) => setSelectedBarangayId(event.target.value ? Number(event.target.value) : null)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
        <option value="">Choose a barangay…</option>
        {districtOptions(referenceData.data?.barangays, (row) => row.id, (row) => `${row.name} · ${row.code} · ID ${row.id}`)}
      </Select>
    </label>
    <BarangayProfilePanel
      profile={barangayProfile.data}
      loading={barangayProfile.loading}
      error={barangayProfile.error}
      onClose={() => setSelectedBarangayId(null)}
    />
    </div></details>

    <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer font-semibold">Service records and planning</summary><div className="mt-5">
    <section>
      <h2 className="text-lg font-semibold">{t('reports.serviceSection')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('reports.serviceHelp')}</p>
      <div className="mt-3 data-table overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="p-3">{t('reports.serviceType')}</th><th className="p-3">{t('reports.records')}</th><th className="p-3">{t('reports.completed')}</th></tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.serviceBreakdown.map((row) => <tr key={row.service}><td className="p-3 font-medium">{row.service}</td><td className="p-3">{row.total}</td><td className="p-3">{row.completed}</td></tr>)}
        {!data.serviceBreakdown.length && <tr><td colSpan={3} className="p-5 text-slate-500">{t('reports.noServices')}</td></tr>}</tbody>
      </table></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-sm text-slate-500">{t('reports.antiRabies', { month: data.comparisonMonths ? monthLabel(data.comparisonMonths) : t('reports.noActivity') })}</p><p className="mt-2 text-2xl font-semibold">{data.comparison.antiRabiesServices.current}</p><p className="text-xs text-slate-500">{countChange(data.comparison.antiRabiesServices.percentChange)}</p></article>
        <article className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-sm text-slate-500">{t('reports.kapon', { month: data.comparisonMonths ? monthLabel(data.comparisonMonths) : t('reports.noActivity') })}</p><p className="mt-2 text-2xl font-semibold">{data.comparison.spayNeuterServices.current}</p><p className="text-xs text-slate-500">{countChange(data.comparison.spayNeuterServices.percentChange)}</p></article>
      </div>
      <article className="mt-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <h3 className="text-sm font-semibold">{t('reports.planningBaseline')}</h3>
        <p className="mt-1 text-xs text-slate-500">{t('reports.planningEvidence', {
          records: data.forecast.sampleSize,
          months: data.forecast.observedMonths,
        })}</p>
        {data.forecast.available
          ? <p className="mt-2 text-sm">{t('reports.planningValues', {
            months: data.forecast.months.map(monthLabel).join(', '),
            rabies: data.forecast.antiRabiesServices ?? 0,
            kapon: data.forecast.spayNeuterServices ?? 0,
          })}</p>
          : <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">{t(data.forecast.reason === 'sample-source'
            ? 'reports.planningSampleOnly'
            : data.forecast.reason === 'insufficient-months'
              ? 'reports.planningNeedMonths'
              : 'reports.planningNeedRecords')}</p>}
        <p className="mt-1 text-xs text-slate-500">{t('reports.planningInterpretation')}</p>
      </article>
      <p className="mt-2 text-xs text-slate-500">{t('reports.yearHelp', { year: data.year, previous: data.previousYear })}</p>
    </section>

    {source === 'live' && <section className="mt-6">
      <h2 className="text-lg font-semibold">{t('reports.turnoutSection')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('reports.turnoutHelp')}</p>
      <div className="mt-3 data-table overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr>{(['reports.program', 'reports.barangay', 'reports.date', 'reports.interested', 'reports.namedStubs', 'reports.namedCame', 'reports.showUp', 'reports.otherServed'] as const).map((label) => <th key={label} className="p-3">{t(label)}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{programTurnout.map((row) => <tr key={row.id}>
          <td className="p-3 font-medium">{row.title}</td><td className="p-3">{row.barangay}</td><td className="p-3">{row.date}</td><td className="p-3">{row.interested}</td>
          <td className="p-3">{row.named}</td><td className="p-3">{row.namedAttended}</td><td className="p-3">{percentOf(row.namedAttended, row.named)}</td><td className="p-3">{row.attended - row.namedAttended}</td>
        </tr>)}
        {!programTurnout.length && <tr><td colSpan={8} className="p-5 text-slate-500">{t('reports.noTurnout')}</td></tr>}</tbody>
      </table></div>
    </section>}

    </div></details>
    <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer font-semibold">Monthly comparison table</summary><div className="mt-5">
    <section>
      <h2 className="text-lg font-semibold">{t('reports.trendSection')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('reports.trendHelp')}</p>
      <div className="mt-3 data-table overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr>{[
          t('reports.month'),
          t('reports.metricPair', { metric: t('reports.petCount'), year: data.year, previous: data.previousYear }),
          t('reports.momPets'),
          t('reports.metricPair', { metric: t('reports.antiRabiesCompletions'), year: data.year, previous: data.previousYear }),
          t('reports.momRabies'),
          t('reports.metricPair', { metric: t('reports.kaponCompletions'), year: data.year, previous: data.previousYear }),
          t('reports.metricPair', { metric: t('reports.microchipCompletions'), year: data.year, previous: data.previousYear }),
          t('reports.metricPair', { metric: t('reports.programs'), year: data.year, previous: data.previousYear }),
          t('reports.metricPair', { metric: t('reports.households'), year: data.year, previous: data.previousYear }),
          t('reports.metricPair', { metric: t('reports.censusAnimals'), year: data.year, previous: data.previousYear }),
        ].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.monthly.map((row) => <tr key={row.month}>
          <td className="p-3 font-medium">{monthLabel(row.month)}</td>
          <td className="p-3">{monthlyValue(row, 'current', 'petRegistrations')} / {monthlyValue(row, 'previous', 'petRegistrations')}</td>
          <td className="p-3">{monthOverMonth(row.month, 'petRegistrations')}</td>
          <td className="p-3">{monthlyValue(row, 'current', 'antiRabiesServices')} / {monthlyValue(row, 'previous', 'antiRabiesServices')}</td>
          <td className="p-3">{monthOverMonth(row.month, 'antiRabiesServices')}</td>
          <td className="p-3">{monthlyValue(row, 'current', 'spayNeuterServices')} / {monthlyValue(row, 'previous', 'spayNeuterServices')}</td>
          <td className="p-3">{monthlyValue(row, 'current', 'microchipServices')} / {monthlyValue(row, 'previous', 'microchipServices')}</td>
          <td className="p-3">{monthlyValue(row, 'current', 'programs')} / {monthlyValue(row, 'previous', 'programs')}</td>
          <td className="p-3">{monthlyValue(row, 'current', 'households')} / {monthlyValue(row, 'previous', 'households')}</td>
          <td className="p-3">{monthlyValue(row, 'current', 'animals')} / {monthlyValue(row, 'previous', 'animals')}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    </div></details>
  </div>;
}

/** Drop zone for the monthly workbook, styled like Import and Export: drag the .xlsx in or browse; the chosen file shows in place. */
function WorkbookDrop({ file, disabled, onFile }: { file: File | null; disabled: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const take = (next?: File) => { if (!next) return; if (!/\.xlsx$/i.test(next.name)) { setError('Choose an Excel workbook (.xlsx).'); return; } setError(''); onFile(next); };
  return <div onDragOver={(event) => { event.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false); }} onDrop={(event) => { event.preventDefault(); setOver(false); if (!disabled) take(event.dataTransfer.files[0]); }}
    className={`flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-5 py-5 text-center transition-colors sm:flex-row sm:text-left ${over ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-white/[0.02]'}`}>
    <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-[0_8px_20px_-10px_rgb(1_168_90/0.5)] ring-1 ring-slate-200 dark:bg-surface-bar dark:text-brand-300 dark:ring-slate-700"><FileSpreadsheet className="h-6 w-6" /></span>
    <div className="min-w-0 flex-1">
      <p className="truncate font-semibold">{file ? file.name : 'Select completed monthly workbook'}</p>
      <p className="mt-0.5 text-sm text-slate-500">{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · ready to validate` : 'Drag the .xlsx here or browse. Up to 3 MB.'}</p>
      {error && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>
    <button type="button" disabled={disabled} onClick={() => input.current?.click()} className={`${btnGhost} shrink-0`}>{file ? 'Choose another' : 'Browse'}</button>
    <input ref={input} type="file" tabIndex={-1} aria-label="Select completed monthly workbook" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={disabled} className="sr-only" onChange={(event) => { take(event.target.files?.[0]); event.target.value = ''; }} />
  </div>;
}

export function WorkbookTools() {
  const reportBarangays = useApi<{ data: { id: number; name: string }[] }>('/barangays');
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [reportPreview, setReportPreview] = useState<{
    valid: boolean; alreadyImported: boolean; errors: string[]; recordCount: number; months: number[]; procedures: number;
    records: { date: string; clientName: string; barangay: string; totalProcedures: number; worksheet: string; rowNumber: number }[];
  } | null>(null);
  const [reportImport, setReportImport] = useState<{ batchId: string; imported: number; procedures: number } | null>(null);
  const [reportMessage, setReportMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [exportYear, setExportYear] = useState(String(new Date().getFullYear()));
  const [exportMonth, setExportMonth] = useState('');
  const [exportBarangay, setExportBarangay] = useState('');
  const fileBase64 = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    return btoa(binary);
  };
  const downloadReportTemplate = async () => {
    setReportBusy(true); setReportMessage(null);
    try {
      const template = await api<{ filename: string; data: string }>('GET', '/spay-neuter-report?mode=template');
      const binary = atob(template.data);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a'); link.href = url; link.download = template.filename; link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setReportMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to download the report template.' });
    } finally { setReportBusy(false); }
  };
  const exportReport = async () => {
    setReportBusy(true); setReportMessage(null);
    try {
      const params = new URLSearchParams({ mode: 'export', year: exportYear });
      if (exportMonth) params.set('month', exportMonth);
      if (exportBarangay) params.set('barangay', exportBarangay);
      const result = await api<{ filename: string; data: string; recordCount: number; procedures: number }>('GET', `/spay-neuter-report?${params}`);
      const binary = atob(result.data);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a'); link.href = url; link.download = result.filename; link.click();
      URL.revokeObjectURL(url);
      setReportMessage({ kind: 'success', text: `Exported ${result.recordCount} records with ${result.procedures} total procedures.` });
    } catch (error) {
      setReportMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to export these service records.' });
    } finally { setReportBusy(false); }
  };
  const previewReportFile = async () => {
    if (!reportFile) return;
    setReportBusy(true); setReportMessage(null); setReportPreview(null); setReportImport(null);
    try {
      if (reportFile.size > 3_145_728) throw new Error('Choose an .xlsx workbook no larger than 3 MB.');
      const data = await fileBase64(reportFile);
      const preview = await api<NonNullable<typeof reportPreview>>('POST', '/spay-neuter-report', { mode: 'preview', filename: reportFile.name, data });
      setReportPreview(preview);
    } catch (error) {
      setReportMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to validate this report.' });
    } finally { setReportBusy(false); }
  };
  const importReportFile = async () => {
    if (!reportFile || !reportPreview?.valid) return;
    setReportBusy(true); setReportMessage(null);
    try {
      const data = await fileBase64(reportFile);
      const result = await api<{ batchId: string; imported: number; procedures: number }>('POST', '/spay-neuter-report', { mode: 'import', filename: reportFile.name, data });
      setReportImport(result);
      setReportMessage({ kind: 'success', text: `${result.imported} service records and ${result.procedures} procedures were added to live data.` });
    } catch (error) {
      setReportMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to import this report.' });
    } finally { setReportBusy(false); }
  };
  const undoReportImport = async () => {
    if (!reportImport) return;
    setReportBusy(true); setReportMessage(null);
    try {
      await api('POST', '/records/services/undo-import', { batchId: reportImport.batchId });
      setReportImport(null); setReportPreview(null);
      setReportMessage({ kind: 'success', text: 'The service records from this report were safely removed.' });
    } catch (error) {
      setReportMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to undo this report import.' });
    } finally { setReportBusy(false); }
  };
  return <div className="w-full">

    {reportBusy&&<Modal title="Loading workbook" onClose={()=>{}} dismissible={false}><Loading label="Processing workbook information…"/></Modal>}
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
      <h2 className="text-lg font-semibold">Spay and Neuter Monthly Report (.xlsx)</h2>
      <p className="mt-1 text-sm text-slate-500">Download a blank standard workbook, fill it in, preview validation, and import live searchable records. You can also export previously imported report records in the same workbook format.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <button type="button" disabled={reportBusy} onClick={() => void downloadReportTemplate()} className={btnGhost}>Download Excel template</button>
        <label className="text-xs text-slate-500">Export year
          <input type="number" min={1} max={9999} value={exportYear} onChange={(event) => setExportYear(event.target.value)} className={`${inputCls} mt-1 w-28`} />
        </label>
        <label className="text-xs text-slate-500">Month
          <Select value={exportMonth} onChange={(event) => setExportMonth(event.target.value)} className={`${inputCls} mt-1 w-40`}>
            <option value="">All months</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2000, index).toLocaleString('en', { month: 'long' })}</option>)}
          </Select>
        </label>
        <label className="text-xs text-slate-500">Barangay
          <Select value={exportBarangay} onChange={(event) => setExportBarangay(event.target.value)} className={`${inputCls} mt-1 min-w-48`}>
            <option value="">All barangays</option>{districtOptions(reportBarangays.data?.data, (item) => item.name)}
          </Select>
        </label>
        <button type="button" disabled={reportBusy || !/^\d{4}$/.test(exportYear)} onClick={() => void exportReport()} className={btnPrimary}>Export live workbook</button>
      </div>
      <div className="mt-5 grid items-center gap-3 sm:grid-cols-[1fr_auto]">
        <WorkbookDrop file={reportFile} disabled={reportBusy || Boolean(reportImport)} onFile={(file) => { setReportFile(file); setReportPreview(null); setReportMessage(null); }} />
        <button type="button" disabled={!reportFile || reportBusy || Boolean(reportImport)} onClick={() => void previewReportFile()} className={`${btnPrimary} h-11 px-5`}>
          {reportBusy ? 'Working…' : 'Validate workbook'}
        </button>
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
        <h3 className="font-semibold">Accepted format and data rules</h3>
        <p className="mt-1 text-slate-600 dark:text-slate-300">Keep the exact eight column headers in row 7: Date, Name of Client, Barangay, No. Castrated Canine (Male), No. Spayed Canine (Female), No. Castrated Feline (Male), No. Spayed Feline (Female), Remarks.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
          <li>Put each record beneath its month heading. Use a real Excel date or YYYY-MM-DD and ensure the date matches that month.</li>
          <li>Client and barangay are required; barangay must match a name in the system. Use whole, non-negative numbers for the four procedure counts, with at least one procedure per record.</li>
          <li>Leave unused count cells blank or enter 0. Remarks are optional (up to 500 characters). Keep formula totals below the data rows; formula rows are never imported.</li>
          <li>One dated row becomes one completed service record. Its four counts are retained and summed for service-volume analytics; duplicate workbook files are blocked until the original import is undone.</li>
        </ul>
      </div>
      {reportMessage && <div className="mt-3"><Notice kind={reportMessage.kind}>{reportMessage.text}</Notice></div>}
      {reportPreview && <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{reportPreview.recordCount} service rows · {reportPreview.procedures} procedures · {reportPreview.months.length} months</p>
          {reportPreview.alreadyImported && <p className="text-xs text-amber-700 dark:text-amber-300">This exact file was already imported. Undo the previous import before retrying.</p>}
          {reportPreview.valid && !reportPreview.alreadyImported && !reportImport && <button type="button" disabled={reportBusy} onClick={() => void importReportFile()} className={btnPrimary}>Import live records</button>}
          {reportImport && <button type="button" disabled={reportBusy} onClick={() => void undoReportImport()} className={btnGhost}>Undo this import</button>}
        </div>
        {reportPreview.errors.length > 0 && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-semibold">Fix these workbook issues before importing:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{reportPreview.errors.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul>
          {reportPreview.errors.length === 100 && <p className="mt-2 text-xs">Only the first 100 validation errors are displayed.</p>}
        </div>}
        {reportPreview.records.length > 0 && <div className="mt-3 data-table overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr>{['Date','Client','Barangay','Procedures','Sheet / row'].map((item) => <th key={item} className="p-2">{item}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{reportPreview.records.map((record) => <tr key={`${record.worksheet}:${record.rowNumber}`}>
              <td className="p-2">{record.date}</td><td className="p-2">{record.clientName}</td><td className="p-2">{record.barangay}</td>
              <td className="p-2">{record.totalProcedures}</td><td className="p-2">{record.worksheet} · {record.rowNumber}</td>
            </tr>)}</tbody></table>
          {reportPreview.recordCount > reportPreview.records.length && <p className="p-2 text-xs text-slate-500">Previewing first 100 rows; all validated rows will be imported.</p>}
        </div>}
      </div>}
    </section>
  </div>;
}

export function AuditPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim());
  const [sort, setSort] = useState<'time' | 'user' | 'action'>('time');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort, dir: direction });
  if (debouncedSearch) params.set('q', debouncedSearch);
  if (year) params.set('year', year);
  if (month) params.set('month', month);
  const { data,error,loading } = useApi<Activity>(`/activity?${params}`);
  const rows = data?.data ?? [];
  return <div className="w-full"><h1 className="text-2xl font-semibold">Activity Log</h1><p className="mt-1 text-sm text-slate-500">Recent recorded administrative actions.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-xs text-slate-500">Search<input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="User, action, details" className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
      <label className="text-xs text-slate-500">Sort by<Select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="time">Time</option><option value="user">User</option><option value="action">Action</option></Select></label>
      <label className="text-xs text-slate-500">Direction<Select value={direction} onChange={(e) => { setDirection(e.target.value as typeof direction); setPage(1); }} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="asc">Ascending</option><option value="desc">Descending</option></Select></label>
      <label className="text-xs text-slate-500">Year<input type="number" min={2000} max={2100} value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }} className="mt-1 block w-24 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
      <label className="text-xs text-slate-500">Month<Select value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">All</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('en', { month: 'long' })}</option>)}</Select></label>
      <button type="button" onClick={() => { setSearch(''); setSort('time'); setDirection('desc'); setYear(''); setMonth(''); setPage(1); }} className={btnGhost}>Clear filters</button>
    </div>
    {loading && !data ? <Loading /> : error && !data ? <Notice kind="error">{error.message}</Notice> : <>
      {error && <div className="mt-3"><Notice kind="error">{error.message}</Notice></div>}
      {loading && <p role="status" className="mt-3 text-xs text-slate-500">Updating results…</p>}
      <div className="mt-5 data-table overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr>{['Time','User','Action','Details'].map((x)=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map((x)=><tr key={x.id}><td className="whitespace-nowrap p-3">{x.time}</td><td className="p-3">{x.user}</td><td className="p-3 font-medium">{x.action}</td><td className="p-3 text-slate-500">{x.detail}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5 text-sm text-slate-500">No matching activity.</p>}</div><Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} />
    </>}</div>;
}
