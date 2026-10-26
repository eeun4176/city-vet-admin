import { useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { useApi,useDebouncedValue } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { DataFreshness } from '../components/DataFreshness';
import { InfoTip, Loading,Modal,Notice,Pagination,Spinner,inputCls,btnGhost,btnPrimary, Select } from '../components/ui';

type Issue='duplicate-owners'|'duplicate-pets'|'missing-contact'|'missing-age'|'unlinked-pets';
const issues:[Issue,string,string][]=[['duplicate-owners','Owner matches','duplicateOwners'],['duplicate-pets','Pet matches','duplicatePets'],['missing-contact','Missing contact','missingContact'],['missing-age','Missing pet age','missingAge'],['unlinked-pets','Unverified owner links','unlinkedPets']];
const decisions=['Needs review','Distinct records','Duplicate confirmed','More information needed'] as const;
type RecordView={id:number;recordId:string;dataset:string;details:Record<string,string|number|null>;linkedPets?:RecordView[];moreLinkedPets?:boolean};
type Comparison={pair:{left:number;right:number;fingerprint:string;version:number;status:string};records:RecordView[];history:{id:number;actor:string;action:string;status:string;reason:string;createdAt:string}[];historyTruncated:boolean};
type Results={counts:Record<string,number>;rows:{id:number;otherId?:number;recordId:string;otherRecordId?:string;dataset:string;label:string;otherLabel?:string;barangay:string;status?:string}[];total:number};
const recordLink=(r:{dataset:string;recordId:string})=>`/registry/${r.dataset}?recordId=${encodeURIComponent(r.recordId)}&q=${encodeURIComponent(r.recordId)}`;
/** The two records side by side, one row per field; rows whose values differ are marked (in words, not only colour). */
function CompareTable({records}:{records:{id:number|string;dataset:string;recordId:string;details:Record<string,unknown>}[]}){
  const shown=(v:unknown)=>v===null||v===undefined||v===''?'Not recorded':String(v);
  const keys=[...new Set(records.flatMap(r=>Object.keys(r.details)))];
  return <div className="data-table overflow-x-auto"><table className="w-full table-fixed text-left text-sm"><thead><tr className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><th className="w-40 p-3">Field</th>{records.map(r=><th key={r.id} className="p-3">{r.dataset==='owners'?'Owner':'Pet'} · <span className="font-mono normal-case">{r.recordId}</span></th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{keys.map(k=>{const values=records.map(r=>shown(r.details[k]));const differs=new Set(values.map(v=>v.trim().toLowerCase())).size>1;return <tr key={k} className={differs?'bg-amber-50/70 dark:bg-amber-500/10':''}><th scope="row" className="p-3 align-top font-normal capitalize text-slate-500">{k.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ')}{differs&&<span className="mt-0.5 block text-[11px] font-semibold normal-case text-amber-700 dark:text-amber-300">Differs</span>}</th>{values.map((v,i)=><td key={i} className={`break-words p-3 align-top ${v==='Not recorded'?'text-slate-400':'font-medium'}`}>{v}</td>)}</tr>;})}</tbody></table></div>;
}
function ComparisonDialog({left,right,onClose,onSaved}:{left:number;right:number;onClose:()=>void;onSaved:()=>void}){
  const {account}=useAuth();const reviewer=account?.type==='Admin'||account?.type==='SuperAdmin';
  const {data,loading,error,reload}=useApi<Comparison>(`/data-quality?mode=pair&left=${left}&right=${right}`);
  const [reason,setReason]=useState(''),[status,setStatus]=useState<string>('More information needed'),[busy,setBusy]=useState(false),[failure,setFailure]=useState('');
  const save=async(action:'flag'|'review')=>{
    if(!data)return;setBusy(true);setFailure('');
    try{await api('POST','/data-quality',{...data.pair,reason,action,status});onSaved();onClose();}
    catch(e){setFailure(e instanceof Error?e.message:'Unable to save the review.');reload();}finally{setBusy(false);}
  };
  return <Modal title="Compare possible matches" wide dismissible={!busy} onClose={onClose}>
    {loading&&!data?<Loading label="Loading records, linked pets, and review history…"/>:error&&!data?<Notice kind="error">{error.message}<button onClick={reload} className={btnGhost}>Retry</button></Notice>:data&&<div className="space-y-5">
      <Notice>Matching fields are clues. Verify with the owner or paper records before recording a decision. Records remain separate.</Notice>
      <p className="text-sm">Current review: <strong>{data.pair.status}</strong></p>
      <CompareTable records={data.records}/>
      <div className="grid gap-4 sm:grid-cols-2">{data.records.map(r=><section key={r.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-semibold">{r.dataset==='owners'?'Owner':'Pet'} · {r.recordId}</h3>
        {r.dataset==='owners'&&<div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700"><h4 className="text-sm font-semibold">Pets linked by owner ID</h4>{r.linkedPets?.length?<ul className="mt-2 space-y-2 text-sm">{r.linkedPets.map(p=><li key={p.id}><Link className="text-brand-700 underline dark:text-brand-300" to={recordLink(p)}>{String(p.details.petName??p.details.pet_name??p.details.name??p.recordId)}</Link> · {p.details.species} · {p.details.sex}</li>)}</ul>:<p className="mt-2 text-sm text-slate-500">No confirmed ID links. Name-only associations need verification.</p>}{r.moreLinkedPets&&<p className="text-xs text-slate-500">Showing 50 pets. Open the registry for more.</p>}</div>}
        <Link to={recordLink(r)} className={`${btnGhost} mt-3`}>Open registry record</Link></section>)}</div>
      {failure&&<Notice kind="error">{failure}</Notice>}
      <form onSubmit={e=>{e.preventDefault();void save(reviewer?'review':'flag');}} className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
        {reviewer&&<label className="block text-sm">Review decision<Select disabled={busy} value={status} onChange={e=>setStatus(e.target.value)} className={`${inputCls} mt-1`}>{decisions.map(d=><option key={d}>{d}</option>)}</Select></label>}
        <label className="block text-sm">{reviewer?'Reason and evidence checked':'Reason for flagging'}<textarea required minLength={3} maxLength={1000} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} className={`${inputCls} mt-1`} placeholder="Describe the matching details and what was verified. Avoid ID numbers or images."/></label>
        <p className="text-xs text-slate-500">Saving a review does not merge owners, move pets, or remove history.</p><div className="flex flex-wrap gap-2"><button disabled={busy||loading||reason.trim().length<3} className={btnPrimary}>{busy?<Spinner label="Saving review…"/>:reviewer?'Save review decision':'Flag for Admin review'}</button>{reviewer&&<button type="button" disabled={busy||loading||reason.trim().length<3} onClick={()=>void save('flag')} className={btnGhost}>Flag / reopen</button>}</div>
      </form>
      <section><h3 className="font-semibold">Review history</h3>{!data.history.length?<p className="mt-2 text-sm text-slate-500">No review decisions yet.</p>:<ol className="mt-2 space-y-3">{data.history.map(h=><li key={h.id} className="border-l-2 border-brand-300 pl-3 text-sm"><p className="font-medium">{h.status} · {h.actor}</p><p className="mt-1 whitespace-pre-wrap">{h.reason}</p><p className="mt-1 text-xs text-slate-500">{h.action} · {new Date(h.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p></li>)}</ol>}{data.historyTruncated&&<p className="mt-2 text-xs">Showing the most recent 100 actions; all actions remain in protected backups.</p>}</section>
    </div>}
  </Modal>;
}

export function DataQualityPage(){
  const {account}=useAuth();const [params]=useSearchParams();const [issue,setIssue]=useState<Issue>(()=>issues.find(([id])=>id===params.get('issue'))?.[0]??'duplicate-owners'),[status,setStatus]=useState('Needs review'),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pair,setPair]=useState<[number,number]|null>(null),[message,setMessage]=useState('');
  const query=useDebouncedValue(search.trim()),duplicate=issue.startsWith('duplicate');
  const {data,error,loading,updatedAt,reload}=useApi<Results>(`/data-quality?issue=${issue}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}&page=${page}&pageSize=12`);
  return <div className="w-full space-y-5"><header><h1 className="text-2xl font-semibold">Data Quality<InfoTip>Review possible matches and missing details across all accessible active owners and pets. {account?.type==='Paravet'?`Your area: ${account.barangay??'No barangay assigned'}. Flag matches for Admin review.`:'Admin records review decisions.'}</InfoTip></h1></header>
    <DataFreshness updatedAt={updatedAt} loading={loading} onRefresh={reload}/>{message&&<Notice kind="success">{message}</Notice>}{error&&<Notice kind="error">{error.message}</Notice>}
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{issues.map(([id,label,key])=><button key={id} onClick={()=>{setIssue(id);setPage(1);}} aria-pressed={issue===id} className={`rounded-xl border p-4 text-left ${issue===id?'border-brand-400 bg-brand-50 dark:bg-brand-950':'border-slate-200 dark:border-slate-700'}`}><span className="block text-sm">{label}</span><strong className="mt-2 block text-2xl">{data?.counts[key]??'—'}</strong></button>)}</div>
    <p className="text-xs text-slate-500">{data?.counts.checkedRecords??'—'} active records checked. Match counts are pairs needing review, not confirmed duplicate people. Missing contact or age is a review cue, not a reason to refuse service.</p>
    <div className="flex flex-wrap items-end gap-3"><label className="flex-1 text-sm">Search names or record IDs<input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} className={`${inputCls} mt-1`}/></label>{duplicate&&<label className="text-sm">Review status<Select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}} className={`${inputCls} mt-1`}><option value="all">All reviews</option>{decisions.map(d=><option key={d}>{d}</option>)}</Select></label>}</div>
    {duplicate&&<p className="text-xs text-slate-500">Owner cues: same normalized name and barangay. Pet cues: same linked owner ID, name, species, and sex. Shared names alone do not establish identity.</p>}
    {loading&&!data?<Loading label="Checking accessible records…"/>:<section aria-label="Quality review results" className="space-y-3">{data?.rows.map(r=><article key={`${r.id}:${r.otherId??''}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div><h2 className="font-medium">{r.label||'Unnamed record'}{r.otherLabel?` ↔ ${r.otherLabel}`:''}</h2><p className="mt-1 text-xs text-slate-500">{r.recordId}{r.otherRecordId?` · ${r.otherRecordId}`:''} · {r.barangay||'Barangay not recorded'}</p>{r.status&&<p className="mt-1 text-sm">{r.status}</p>}</div>{r.otherId?<button className={btnPrimary} onClick={()=>setPair([r.id,r.otherId!])}>Compare records</button>:<Link to={recordLink(r)} className={btnGhost}>Open record</Link>}</article>)}{data&&!data.rows.length&&<p className="rounded-xl border border-slate-200 p-6 text-sm text-slate-500 dark:border-slate-700">No records match these checks and filters.</p>}<Pagination page={page} pageSize={12} total={data?.total??0} onPage={setPage}/></section>}
    {pair&&<ComparisonDialog left={pair[0]} right={pair[1]} onClose={()=>setPair(null)} onSaved={()=>{setMessage('Review saved. Registry records remain unchanged.');reload();}}/>}
  </div>;
}
