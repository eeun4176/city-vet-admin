import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { DataFreshness } from '../components/DataFreshness';
import { Loading,Notice,Pagination,inputCls,btnGhost,tabItem,tabList, Select, districtOptions } from '../components/ui';
import { EvidenceRecordSearch,ReportBuilder,ReportsPage as RegistryReports,WorkbookTools } from './InsightsPages';

type Outcomes={totals:{ownerVisits:number;petVisits:number;completedProcedures:number;stubVisits:number;walkInVisits:number;programsWithAttendance:number};
  breakdown:{process:string;requested:number;completed:number;deferred:number;notEligible:number}[];
  programs:{id:number;recordId:string;title:string;date:string;barangay:string;status:string;archived:boolean;ownerVisits:number;petVisits:number;completedProcedures:number}[];total:number};
const sections=[['outcomes','Program outcomes'],['registry','Registry statistics'],['evidence','Find records'],['builder','Create report'],['workbook','Monthly workbook']] as const;

function ProgramOutcomes(){
  const [year,setYear]=useState(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}).slice(0,4));
  const [barangay,setBarangay]=useState(''),[page,setPage]=useState(1);
  const areas=useApi<{data:{id:number;name:string}[]}>('/barangays');
  const {data,error,loading,updatedAt,reload}=useApi<Outcomes>(`/program-outcomes?year=${year}&page=${page}&pageSize=12${barangay?`&barangayId=${barangay}`:''}`,{refreshIntervalMs:60000});
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Attendance year<Select value={year} onChange={e=>{setYear(e.target.value);setPage(1);}} className={`${inputCls} mt-1`}>{Array.from({length:Math.max(6,new Date().getFullYear()-2020)},(_,i)=>Number(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}).slice(0,4))-i).map(y=><option key={y}>{y}</option>)}</Select></label>
      <label className="text-sm">Owner residence<Select value={barangay} onChange={e=>{setBarangay(e.target.value);setPage(1);}} className={`${inputCls} mt-1`}><option value="">All barangays</option>{districtOptions(areas.data?.data)}</Select></label>
    </div>
    <DataFreshness updatedAt={updatedAt} loading={loading} onRefresh={reload} maxAgeMs={60000}/>
    {areas.error&&<Notice kind="error">{areas.error.message}</Notice>}{error&&<Notice kind="error">{error.message}</Notice>}
    {loading&&!data?<Loading label="Loading program outcomes…"/>:data&&<>
      <section aria-label="Program outcomes totals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
        ['Owner visits',data.totals.ownerVisits],['Participating pet visits',data.totals.petVisits],['Completed procedures',data.totals.completedProcedures],
        ['Stub visits',data.totals.stubVisits],['Walk-in visits',data.totals.walkInVisits],['Programs with attendance',data.totals.programsWithAttendance],
      ].map(([label,value])=><article key={String(label)} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></article>)}</section>
      <p className="text-sm text-slate-500">Visits include repeat participation. One pet may receive multiple procedures. Totals use submitted program attendance; voided entries and sample data are excluded. Imported monthly workbooks remain under Registry statistics and Monthly workbook.</p>
      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h2 className="font-semibold">Procedure Outcomes</h2><div className="mt-3 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Process','Selected','Completed','Deferred','Not eligible'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{data.breakdown.map(p=><tr key={p.process} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2">{p.process}</td><td className="p-2">{p.requested}</td><td className="p-2">{p.completed}</td><td className="p-2">{p.deferred}</td><td className="p-2">{p.notEligible}</td></tr>)}</tbody></table>{!data.breakdown.length&&<p className="py-5 text-sm text-slate-500">No attendance procedures recorded for these filters.</p>}</div></section>
      <section><h2 className="font-semibold">Programs</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{data.programs.map(p=><article key={p.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-xs text-slate-500">{p.date} · {p.barangay} · {p.archived?'Archived':p.status}</p><h3 className="mt-1 font-semibold">{p.title}</h3><p className="mt-2 text-sm">{p.ownerVisits} owner visits · {p.petVisits} pet visits · {p.completedProcedures} completed procedures</p><Link to={`/program-day?program=${p.id}`} className={`${btnGhost} mt-3`}>Open program</Link></article>)}</div>{!data.programs.length&&<p className="py-5 text-sm text-slate-500">No programs match these filters.</p>}<Pagination page={page} pageSize={12} total={data.total} onPage={setPage}/></section>
    </>}
  </div>;
}

function ReportTask({task}:{task:'evidence'|'builder'}){
  const [source,setSource]=useState<'live'|'sample'>('live');
  const [year,setYear]=useState(Number(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}).slice(0,4)));
  return <div className="space-y-5"><div className="flex flex-wrap gap-3"><label className="text-sm">Data source<Select value={source} onChange={e=>setSource(e.target.value as typeof source)} className={`${inputCls} mt-1`}><option value="live">Current records</option></Select></label><label className="text-sm">Year<Select value={year} onChange={e=>setYear(Number(e.target.value))} className={`${inputCls} mt-1`}>{Array.from({length:Math.max(6,new Date().getFullYear()-2020)},(_,i)=>new Date().getFullYear()-i).map(y=><option key={y}>{y}</option>)}</Select></label></div>{task==='evidence'?<EvidenceRecordSearch key={`evidence:${source}:${year}`} source={source} year={year}/>:<ReportBuilder key={`builder:${source}:${year}`} source={source} year={year}/>}</div>;
}

export function ReportsPage(){
  const [section,setSection]=useState<(typeof sections)[number][0]>('outcomes');
  return <div className="w-full space-y-6"><header><h1 className="text-2xl font-semibold">Reports</h1><p className="mt-1 text-sm text-slate-500">Review program results, find evidence, or prepare a report.</p></header>
    <div role="tablist" aria-label="Reporting tasks" className={`${tabList} w-full`}>{sections.map(([id,label],index)=><button key={id} id={`report-tab-${id}`} role="tab" tabIndex={section===id?0:-1} aria-selected={section===id} aria-controls="report-content" onClick={()=>setSection(id)} onKeyDown={e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
      const next=e.key==='Home'?0:e.key==='End'?sections.length-1:(index+(e.key==='ArrowRight'?1:-1)+sections.length)%sections.length;
      setSection(sections[next][0]);document.getElementById(`report-tab-${sections[next][0]}`)?.focus();
    }} className={tabItem(section===id)}>{label}</button>)}</div>
    <div key={section} className="page-transition" id="report-content" role="tabpanel" aria-labelledby={`report-tab-${section}`}>
      {section==='outcomes'?<ProgramOutcomes/>:section==='registry'?<RegistryReports/>:section==='workbook'?<WorkbookTools/>:<ReportTask key={section} task={section}/>}
    </div>
  </div>;
}
