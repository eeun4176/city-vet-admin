import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Field,inputCls,btnPrimary, Select } from '../components/ui';
import { useApi } from '../lib/useApi';
import { Loading, Notice } from '../components/ui';

type Barangay = { id: number; acronym: string; name: string; district: string; zip: string };

export function BarangaysPage() {
  const { data, error, loading } = useApi<{ data: Barangay[]; total: number }>('/barangays');
  const {account}=useAuth();
  const [breed,setBreed]=useState(''),[species,setSpecies]=useState('Dog'),[notice,setNotice]=useState('');
  const assignments=useApi<{data:{id:number;paravets:{id:number;name:string}[]}[]}>('/barangay-assignments');
  if (loading) return <Loading />;
  if (error) return <Notice kind="error">{error.message}</Notice>;
  return <div className="w-full">
    <h1 className="text-2xl font-semibold">Barangays</h1>
    <p className="mt-1 text-sm text-slate-500">Official reference list used for records, census submissions, and program interest lists.</p>
    {/* Split by district, as in e-Vet Field. */}
    {[1, 2].map((district) => { const rows = data?.data.filter((barangay) => parseInt(String(barangay.district), 10) === district) ?? []; return <section key={district} aria-labelledby={`district-${district}`} className="mt-6">
    <h2 id={`district-${district}`} className="flex items-center gap-2 text-sm font-semibold text-brand-700 after:h-px after:flex-1 after:bg-slate-200 dark:text-brand-300 dark:after:bg-slate-800">District {district === 1 ? 'I' : 'II'}<span className="font-normal text-slate-500">{rows.length}</span></h2>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {rows.map((barangay) => <article key={barangay.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <div><p className="font-medium">{barangay.name}</p><p className="text-xs text-slate-500">{barangay.acronym} · {barangay.district}</p></div>
        <div className="max-w-[55%] text-right text-xs text-slate-500"><p>{barangay.zip}</p>{assignments.data?.data.find(b=>b.id===barangay.id)?.paravets.map(p=><p key={p.id} className="mt-1 text-brand-700 dark:text-brand-200">{p.name}</p>)}{assignments.data&&!assignments.data.data.find(b=>b.id===barangay.id)?.paravets.length&&<p>No active Paravets</p>}</div>
      </article>)}
    </div></section>; })}
    <p className="mt-3 text-xs text-slate-500">{data?.total ?? 0} barangays</p>
    {account?.type!=='Paravet'&&<details className="mt-6 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer font-semibold">Manage breed choices</summary><form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={async e=>{e.preventDefault();try{await api('POST','/pet-references',{species,name:breed});setBreed('');setNotice('Breed added to the selection list.');}catch(e){setNotice(e instanceof Error?e.message:'Unable to save breed.');}}}><Field label="Species"><Select className={inputCls} value={species} onChange={e=>setSpecies(e.target.value)}><option>Dog</option><option>Cat</option></Select></Field><Field label="New standardized breed"><input required maxLength={100} className={inputCls} value={breed} onChange={e=>setBreed(e.target.value)}/></Field><button className={btnPrimary}>Add breed choice</button></form>{notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}</details>}
  </div>;
}
