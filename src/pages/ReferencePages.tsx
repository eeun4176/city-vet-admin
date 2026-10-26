import { useApi } from '../lib/useApi';
import { InfoTip, Loading, Notice } from '../components/ui';

type Barangay = { id: number; acronym: string; name: string; district: string; zip: string };

export function BarangaysPage() {
  const { data, error, loading } = useApi<{ data: Barangay[]; total: number }>('/barangays');
  const assignments=useApi<{data:{id:number;paravets:{id:number;name:string}[]}[]}>('/barangay-assignments');
  if (loading) return <Loading />;
  if (error) return <Notice kind="error">{error.message}</Notice>;
  return <div className="w-full">
    <h1 className="text-2xl font-semibold">Barangays<InfoTip>Official reference list used for records, census submissions, and program interest lists.</InfoTip></h1>
    {/* Split by district, as in e-Vet Field. */}
    {[1, 2].map((district) => { const rows = data?.data.filter((barangay) => parseInt(String(barangay.district), 10) === district) ?? []; return <section key={district} aria-labelledby={`district-${district}`} className="mt-6">
    <h2 id={`district-${district}`} className="flex items-center gap-2 text-sm font-semibold text-brand-700 after:h-px after:flex-1 after:bg-slate-200 dark:text-brand-300 dark:after:bg-slate-800">District {district === 1 ? 'I' : 'II'}<span className="font-normal text-slate-500">{rows.length}</span></h2>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {rows.map((barangay) => <article key={barangay.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <div><p className="font-medium">{barangay.name}</p><p className="text-xs text-slate-500">{barangay.acronym} · {barangay.district}</p></div>
        <div className="max-w-[55%] text-right text-xs text-slate-500"><p>{barangay.zip}</p>{(()=>{const team=assignments.data?.data.find(b=>b.id===barangay.id)?.paravets??[];return assignments.data&&<><p className="mt-1 font-medium">{team.length?`${team.length} active Paravet${team.length===1?'':'s'}`:'No active Paravets'}</p>{team.map(p=><p key={p.id} className="mt-1 text-brand-700 dark:text-brand-200">{p.name}</p>)}</>;})()}</div>
      </article>)}
    </div></section>; })}
    <p className="mt-3 text-xs text-slate-500">{data?.total ?? 0} barangays</p>
  </div>;
}
