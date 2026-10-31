import { useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Download, Printer } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { downloadBlob } from '../lib/reportExport';
import { printOnly } from '../lib/printOnly';
import { ColumnChart, ComparisonBars, InfoTip, Loading, Notice, SaveChartImage, Select, btnGhost, districtOptions, inputCls, tabItem, tabList } from '../components/ui';
import { DataFreshness } from '../components/DataFreshness';
import type { ProgramKpis } from '../../server/programKpis';

type Data = ProgramKpis & { filters: { year: number; barangayId: number | null; programId: number | null }; generatedAt: string; generatedBy: string; programOptions: { id: number; title: string; date: string }[] };
const tabs = [['overview', 'Overview & KPIs'], ['operations', 'Program operations & live view'], ['barangays', 'Barangay performance']] as const;
type Tab = (typeof tabs)[number][0];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const thisYear = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 4));
const num = (value: number | null) => (value === null ? '—' : value.toLocaleString('en-PH'));
const rate = (value: number | null) => (value === null ? '—' : `${value}%`);

/** A KPI: the number first, what it means and its formula behind the (i). */
function Kpi({ label, value, formula, note }: { label: string; value: string; formula: string; note?: string }) {
  return <article className="rounded-2xl border border-slate-200 p-4 dark:border-night-border"><p className="flex items-center text-sm text-slate-500">{label}<InfoTip>{formula}</InfoTip></p><p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>{note && <p className="mt-1 text-xs text-slate-500">{note}</p>}</article>;
}
/** A chart card; `chip` is the headline figure in a green pill next to the title, as on the motion-library bar card. */
function ChartCard({ title, chip, children, className = '' }: { title: string; chip?: string; children: ReactNode; className?: string }) {
  return <section data-chart className={`rounded-2xl border border-slate-200 p-4 dark:border-night-border ${className}`}><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3><div className="flex items-center gap-2">{chip && <b className="whitespace-nowrap rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300">{chip}</b>}<SaveChartImage name={title} /></div></div>{children}</section>;
}
/** Progress bar for a utilization rate; over 100% is shown as full with the true figure in words. */
function Progress({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  return <div><div className="flex justify-between gap-2 text-sm"><span>{label}</span><span className="font-semibold tabular-nums">{rate(value)}</span></div><div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-night-tile" role="progressbar" aria-label={label} aria-valuenow={value ?? 0} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${value !== null && value > 100 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, value ?? 0)}%` }} /></div><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}
/** One bar split into parts, with a legend that names each part and its count (not colour alone). */
function Stacked({ parts }: { parts: [string, number, string][] }) {
  const total = parts.reduce((sum, [, value]) => sum + value, 0);
  return <div><div className="flex h-4 overflow-hidden rounded-full bg-slate-100 dark:bg-night-tile">{total > 0 && parts.map(([label, value, color]) => <div key={label} className={color} style={{ width: `${(value / total) * 100}%` }} title={`${label}: ${value}`} />)}</div><ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">{parts.map(([label, value, color]) => <li key={label} className="flex items-center gap-2"><span aria-hidden className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}<span className="ml-auto tabular-nums font-medium">{num(value)}{total ? <span className="ml-1 text-xs text-slate-500">({Math.round((value / total) * 100)}%)</span> : null}</span></li>)}</ul></div>;
}

// Spreadsheet cells that start like a formula are written as text so Excel never runs them.
const safe = (value: unknown) => { const text = value === null || value === undefined ? '' : String(value); return /^[=+\-@]/.test(text) ? `'${text}` : text; };
function reportTables(data: Data, area: string, program: string) {
  const o = data.overview;
  const header = [['City Veterinary Office · Program Analytics Report'], ['Year', String(data.filters.year)], ['Barangay', area], ['Program', program], ['Generated', new Date(data.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })], ['Prepared by', data.generatedBy], []];
  const kpis = [['Measure', 'Value', 'Formula'], ['Programs', o.programs, ''], ['Planned capacity (pets)', o.capacity, ''], ['Interested pets', o.interested, ''], ['Registered pets', o.registered, ''], ['Attended pets', o.attended, ''], ['Completed pets', o.completed, ''], ['No-shows', o.noShows, 'Registered, program over, not scanned'], ['Unused capacity', o.unusedCapacity, 'Capacity − Attended, per program, never below 0'], ['Above capacity (pets)', o.overCapacity, 'Attended − Capacity, per program, when more pets came than planned'], ['Capacity utilization %', o.capacityUtilization, 'Attended ÷ Capacity × 100'], ['Registration utilization %', o.registrationUtilization, 'Registered ÷ Capacity × 100'], ['Attendance rate %', o.attendanceRate, 'Attended with stub ÷ Registered × 100'], ['Completion rate %', o.completionRate, 'Completed ÷ Attended × 100'], ['Interest conversion %', o.interestConversion, 'Registered ÷ Interested × 100'], ['Overall conversion %', o.overallConversion, 'Completed ÷ Interested × 100'], ['Vaccination coverage %', o.vaccinationCoverage, 'Vaccinated recorded pets ÷ Recorded pets × 100']];
  const programs = [['Program', 'Date', 'Host barangay', 'Status', 'Capacity', 'Registered', 'Attended', 'Completed', 'No-shows', 'Capacity utilization %', 'Attendance rate %'], ...data.programs.map((p) => [p.title, p.date, p.barangay, p.status, p.capacity, p.registered, p.attended, p.completed, p.noShows, p.capacityUtilization, p.attendanceRate])];
  const barangays = [['Barangay', 'Interested', 'Registered', 'Attended', 'Completed', 'No-shows', 'Attendance rate %', 'Completion rate %', 'Kapon', 'Anti-rabies', 'Microchip', 'Notes'], ...data.barangays.map((b) => [b.name, b.interested, b.registered, b.attended, b.completed, b.noShows, b.attendanceRate, b.completionRate, b.kapon, b.antiRabies, b.microchip, b.flags.join('; ')])];
  const checks = [['Check', 'Result', 'Detail'], ...data.checks.map((c) => [c.label, c.ok ? 'OK' : 'Needs review', c.detail])];
  return { header, kpis, programs, barangays, checks };
}

export function AnalyticsDashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [year, setYear] = useState(thisYear), [barangay, setBarangay] = useState(''), [programId, setProgramId] = useState('');
  const areas = useApi<{ data: { id: number; name: string }[] }>('/barangays');
  const { data, error, loading, updatedAt, reload } = useApi<Data>(`/program-kpis?year=${year}${barangay ? `&barangayId=${barangay}` : ''}${programId ? `&programId=${programId}` : ''}`, { refreshIntervalMs: 60000 });
  const report = useRef<HTMLDivElement>(null);
  const areaName = areas.data?.data.find((b) => String(b.id) === barangay)?.name ?? 'All barangays';
  const programName = data?.programOptions.find((p) => String(p.id) === programId)?.title ?? 'All programs';
  const fileName = `program-analytics-${year}`;

  const exportCsv = () => {
    if (!data) return;
    const t = reportTables(data, areaName, programName);
    const rows = [...t.header, ...t.kpis, [], ...t.programs, [], ...t.barangays, [], ...t.checks];
    downloadBlob(new Blob([`﻿${rows.map((r) => r.map((v) => `"${safe(v).replaceAll('"', '""')}"`).join(',')).join('\r\n')}`], { type: 'text/csv' }), `${fileName}.csv`);
  };
  const exportExcel = async () => {
    if (!data) return;
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook(), t = reportTables(data, areaName, programName);
    for (const [name, rows] of [['Summary', [...t.header, ...t.kpis]], ['Programs', t.programs], ['Barangays', t.barangays], ['Checks', t.checks]] as const) {
      const sheet = book.addWorksheet(name);
      rows.forEach((row) => sheet.addRow(row.map((v) => (typeof v === 'number' ? v : safe(v)))));
      sheet.columns.forEach((column) => { column.width = 22; });
      sheet.getRow(1).font = { bold: true };
    }
    downloadBlob(new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileName}.xlsx`);
  };

  const o = data?.overview;
  const live = data?.programs.filter((p) => p.live) ?? [];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <label className="text-sm">Year<Select value={year} onChange={(e) => { setYear(Number(e.target.value)); setProgramId(''); }} className={`${inputCls} mt-1`}>{Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}</Select></label>
      <label className="text-sm">Barangay<Select value={barangay} onChange={(e) => { setBarangay(e.target.value); setProgramId(''); }} className={`${inputCls} mt-1`}><option value="">All barangays</option>{districtOptions(areas.data?.data)}</Select></label>
      <label className="text-sm">Program<Select value={programId} onChange={(e) => setProgramId(e.target.value)} className={`${inputCls} mt-1`}><option value="">All programs</option>{data?.programOptions.map((p) => <option key={p.id} value={p.id}>{p.title} · {p.date}</option>)}</Select></label>
      <div className="ml-auto flex flex-wrap gap-2"><button type="button" className={btnGhost} disabled={!data} onClick={() => report.current && printOnly(report.current)}><Printer aria-hidden className="h-4 w-4" />Print / PDF</button><button type="button" className={btnGhost} disabled={!data} onClick={exportCsv}><Download aria-hidden className="h-4 w-4" />CSV</button><button type="button" className={btnGhost} disabled={!data} onClick={() => void exportExcel()}><Download aria-hidden className="h-4 w-4" />Excel</button></div>
    </div>
    <div role="tablist" aria-label="Analytics views" className={`${tabList} w-full print:hidden`}>{tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tabItem(tab === id)} onClick={() => setTab(id)}>{label}</button>)}</div>
    <DataFreshness updatedAt={updatedAt} loading={loading} onRefresh={reload} maxAgeMs={60000} />
    {error && <Notice kind="error">{error.message}</Notice>}
    {loading && !data ? <Loading label="Calculating analytics…" /> : data && o && <div ref={report} className="space-y-5">
      <header className="hidden print:block"><h2 className="text-lg font-semibold">City Veterinary Office · Program Analytics Report — {tabs.find(([id]) => id === tab)![1]}</h2><p className="text-sm">Year {data.filters.year} · {areaName} · {programName} · Generated {new Date(data.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} · Prepared by {data.generatedBy}</p></header>

      {tab === 'overview' && <>
        <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Capacity utilization" value={rate(o.capacityUtilization)} formula="Attended ÷ Capacity × 100, for programs with a planned capacity. Capacity is planned pet slots, not a limit: walk-ins past it are still served, so this can pass 100%." note={`${num(o.capacityAttended)} ${o.capacityAttended === 1 ? 'pet' : 'pets'} for ${num(o.capacity)} slots · ${o.overCapacity ? `${num(o.overCapacity)} above capacity` : `${num(o.unusedCapacity)} unused`}`} />
          <Kpi label="Attendance rate" value={rate(o.attendanceRate)} formula="Attended ÷ Registered × 100, counting pets that came with their encoded stub. Walk-ins are counted separately." note={`${num(o.noShows)} no-shows · ${num(o.walkIns)} walk-ins`} />
          <Kpi label="Completion rate" value={rate(o.completionRate)} formula="Completed ÷ Attended × 100. A pet is completed when every selected service was completed." note={`${num(o.completed)} completed · ${num(o.deferred)} deferred`} />
          <Kpi label="Interest conversion" value={rate(o.interestConversion)} formula="Registered ÷ Interested × 100. Interested pets are the pets on program requests this year." note={`Overall conversion ${rate(o.overallConversion)} (Completed ÷ Interested)`} />
          <Kpi label="Programs" value={num(o.programs)} formula="Scheduled program days in the year that match the filters." note={`${num(o.participatingBarangays)} barangay(s) took part`} />
          <Kpi label="Registered pets" value={num(o.registered)} formula="Pets on encoded stubs (issued or used)." note={`Registration utilization ${rate(o.registrationUtilization)} (Registered ÷ Capacity)`} />
          <Kpi label="Recorded pets" value={num(o.census)} formula="Active pets in the registry (census and program records)." note={`Census interest rate ${rate(o.censusInterestRate)} (Interested ÷ Recorded)`} />
          <Kpi label="Vaccination coverage" value={rate(o.vaccinationCoverage)} formula="Vaccinated recorded pets ÷ Recorded pets × 100 (as recorded, not an exact field count)." note={`${num(o.vaccinated)} recorded as vaccinated`} />
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Participation funnel" chip={o.overallConversion === null ? undefined : `${o.overallConversion}% completed`}><ColumnChart bars={([['Interested', o.interested], ['Registered', o.registered], ['Attended', o.attended], ['Completed', o.completed]] as const).map(([label, value], i, all) => ({ label, value, note: i && all[i - 1][1] ? `${Math.round((value / all[i - 1][1]) * 100)}% of previous` : undefined }))} /></ChartCard>
          <ChartCard title="Capacity use" chip={o.capacityUtilization === null ? undefined : `${o.capacityUtilization}% used`}><ColumnChart bars={[{ label: 'Planned slots', value: o.capacity }, { label: 'Registered', value: o.capacityRegistered, note: o.registrationUtilization === null ? undefined : `${o.registrationUtilization}% of slots` }, { label: 'Attended', value: o.capacityAttended, note: o.capacityUtilization === null ? undefined : `${o.capacityUtilization}% of slots` }, { label: 'Unused', value: o.unusedCapacity }, ...(o.overCapacity ? [{ label: 'Above capacity', value: o.overCapacity }] : [])]} /></ChartCard>
          <ChartCard title="Attended pets by outcome" chip={o.completionRate === null ? undefined : `${o.completionRate}% completed`}><ColumnChart bars={[{ label: 'Completed', value: o.completed }, { label: 'Deferred', value: o.deferred }, { label: 'Incomplete', value: o.incomplete }, { label: 'Not eligible', value: o.notEligible }]} /></ChartCard>
          <ChartCard title="Recorded pets by species"><ColumnChart bars={[{ label: 'Dogs', value: o.dogs }, { label: 'Cats', value: o.cats }]} /></ChartCard>
          <ChartCard title="Attended and completed pets per month" className="lg:col-span-2"><ColumnChart legend={['Attended', 'Completed']} bars={data.monthly.map((m) => ({ label: MONTHS[m.month - 1], value: m.attended, second: m.completed }))} /></ChartCard>
          <ChartCard title="Completed services"><ColumnChart bars={data.services.map((s) => ({ label: s.process, value: s.completed }))} /></ChartCard>
          <section className="rounded-2xl border border-slate-200 p-4 dark:border-night-border"><h3 className="text-sm font-semibold">Insights</h3>{data.insights.length ? <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">{data.insights.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No program activity for these filters yet.</p>}<p className="mt-3 text-xs text-slate-500">Calculated from the records with fixed formulas; decisions stay with City Vet staff.</p></section>
        </div>
        <Checks checks={data.checks} />
      </>}

      {tab === 'operations' && <>
        <section aria-label="Program day figures" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Programs today" value={num(live.length)} formula="Programs whose date is today (Philippine time)." />
          <Kpi label="Arrived today" value={num(live.reduce((n, p) => n + p.attended, 0))} formula="Pets recorded in attendance for today's programs (stubs and walk-ins)." />
          <Kpi label="Not yet arrived" value={num(live.reduce((n, p) => n + p.notYetScanned, 0))} formula="Registered pets of today's programs whose stub has not been scanned yet: the remaining workload." />
          <Kpi label="No-shows (past programs)" value={num(o.noShows)} formula="Registered pets of programs that are over whose stub was never scanned." />
        </section>
        {live.length > 0 && <div className="grid gap-4 lg:grid-cols-2">{live.map((p) => <ChartCard key={p.id} title={`Live · ${p.title}`}><div className="space-y-4"><Progress label="Arrived of registered" value={p.registered ? Math.round(((p.registered - p.notYetScanned) / p.registered) * 100) : null} detail={`${num(p.registered - p.notYetScanned)} of ${num(p.registered)} registered pets arrived · ${num(p.walkIns)} walk-ins`} /><Progress label="Capacity used" value={p.capacityUtilization} detail={`${num(p.attended)} ${p.attended === 1 ? 'pet' : 'pets'} for ${num(p.capacity)} slots${p.overCapacity ? ` · ${num(p.overCapacity)} above capacity` : ''}`} /><Stacked parts={[['Completed', p.completed, 'bg-brand-500'], ['Deferred', p.deferred, 'bg-amber-500'], ['Incomplete / not eligible', p.incomplete, 'bg-sky-500'], ['Not yet arrived', p.notYetScanned, 'bg-slate-300']]} /></div></ChartCard>)}</div>}
        <ChartCard title="Capacity utilization by program"><ComparisonBars rows={data.programs.filter((p) => p.capacity).slice(0, 12).map((p) => ({ label: `${p.title} · ${p.date}`, value: p.capacityUtilization ?? 0 }))} /></ChartCard>
        <Table caption="Programs" heads={['Program', 'Date', 'Capacity', 'Registered', 'Attended', 'Completed', 'No-shows', 'Utilization', 'Attendance']} rows={data.programs.map((p) => [<span key="t" className="font-medium">{p.title}{p.live && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700 dark:bg-brand-900 dark:text-brand-300">Live</span>}{p.aboveCapacity && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">Above capacity</span>}</span>, p.date, num(p.capacity), num(p.registered), num(p.attended), num(p.completed), num(p.noShows), rate(p.capacityUtilization), rate(p.attendanceRate)])} />
      </>}

      {tab === 'barangays' && <>
        <section aria-label="Barangay figures" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Participating barangays" value={num(o.participatingBarangays)} formula="Barangays with at least one attended pet (owner's residence)." />
          <Kpi label="Lower participation" value={num(data.barangays.filter((b) => b.flags.includes('Lower participation')).length)} formula="Barangays with 5 or more registered pets and an attendance rate under 50%." />
          <Kpi label="High no-shows" value={num(data.barangays.filter((b) => b.flags.includes('High no-shows')).length)} formula="Barangays where 5 or more registered pets (30% or more) did not come." />
          <Kpi label="Demand not yet served" value={num(data.barangays.filter((b) => b.flags.includes('Demand not yet served')).length)} formula="Barangays with 10 or more interested pets and no registered pets yet." />
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Attended pets by barangay"><ComparisonBars rows={data.barangays.slice(0, 12).map((b) => ({ label: b.name, value: b.attended }))} /></ChartCard>
          <ChartCard title="Attendance rate by barangay (%)"><ComparisonBars rows={data.barangays.filter((b) => b.attendanceRate !== null).slice(0, 12).map((b) => ({ label: b.name, value: b.attendanceRate ?? 0 }))} /></ChartCard>
        </div>
        <Table caption="Barangays" heads={['Barangay', 'Interested', 'Registered', 'Attended', 'Completed', 'No-shows', 'Attendance', 'Completion', 'Kapon', 'Anti-rabies', 'Microchip', 'Notes']} rows={data.barangays.map((b) => [<span key="n" className="font-medium">{b.name}</span>, num(b.interested), num(b.registered), num(b.attended), num(b.completed), num(b.noShows), rate(b.attendanceRate), rate(b.completionRate), num(b.kapon), num(b.antiRabies), num(b.microchip), b.flags.join(', ') || '—'])} />
      </>}
      <p className="hidden text-xs print:block">Counts are pets. Formulas: Capacity utilization = Attended ÷ Capacity × 100; Attendance rate = Attended ÷ Registered × 100; Completion rate = Completed ÷ Attended × 100.</p>
    </div>}
  </div>;
}

function Checks({ checks }: { checks: ProgramKpis['checks'] }) {
  return <section className="rounded-2xl border border-slate-200 p-4 dark:border-night-border"><h3 className="flex items-center text-sm font-semibold">Reconciliation checks<InfoTip>Each total must add up from its parts. A check that does not hold points to records to review before a report is shared.</InfoTip></h3><ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-night-border">{checks.map((c) => <li key={c.label} className="flex flex-wrap items-center gap-2 py-2">{c.ok ? <CircleCheck aria-hidden className="h-4 w-4 text-brand-600 dark:text-brand-500" /> : <CircleAlert aria-hidden className="h-4 w-4 text-amber-600" />}<span className="font-medium">{c.label}</span><span className="text-slate-500">{c.ok ? 'OK' : 'Needs review'} · {c.detail}</span></li>)}</ul></section>;
}

function Table({ caption, heads, rows }: { caption: string; heads: string[]; rows: ReactNode[][] }) {
  return <div className="data-table overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{caption}</caption><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-night-surface"><tr>{heads.map((h) => <th key={h} className="whitespace-nowrap p-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-night-border">{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="whitespace-nowrap p-3 tabular-nums">{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="p-6 text-center text-sm text-slate-500">No records for these filters.</p>}</div>;
}
