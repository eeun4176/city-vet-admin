import { Link,useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { btnGhost,btnPrimary,Loading,Notice,statusLabel } from '../components/ui';
import type { RecordPreview } from '../../shared/search';
import { fieldLabel } from '../../shared/reportBasket';
import { blockedPage } from './StatusPages';
const value=(v:unknown)=>v===null||v===undefined||v===''?'Not recorded':typeof v==='boolean'?v?'Yes':'No':String(v);
function Fields({data}:{data:Record<string,unknown>}){
 const hidden=(key:string)=>key.startsWith('_')||key==='workflow'||key==='id'||key.endsWith('_id')||key.endsWith('Id')&&key!=='systemStubId';
 return <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">{Object.entries(data).filter(([key,v])=>!hidden(key)&&(v===null||['string','number','boolean'].includes(typeof v))).map(([key,v])=><div key={key}><dt className="text-xs text-slate-500">{fieldLabel(key)}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value(v)}</dd></div>)}</dl>;
}
export function RecordPreviewPage(){
 const [params]=useSearchParams(),source=params.get('source')??'',id=params.get('id')??'';
 const detail=useApi<RecordPreview>(`/record-preview?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`);
 const record=detail.data;
 return <div className="w-full space-y-5">
  {detail.loading&&!record?<Loading label="Loading the source record and checking access…"/>:detail.error?blockedPage(detail.error)??<div className="space-y-4"><Notice kind="error">{detail.error.message}</Notice><p className="text-sm text-slate-500">Its status, your assignment, or access may have changed since it appeared in search.</p><button className={btnGhost} onClick={detail.reload}>Try again</button><Link className={`${btnGhost} ml-2`} to="/dashboard">Dashboard</Link></div>:record&&<>
   <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-500">{record.item.source}</p><h1 className="mt-2 text-2xl font-semibold">{record.item.label}</h1><p className="mt-2 text-sm text-slate-500">{record.item.detail}</p><p className="mt-2 text-sm">{statusLabel(record.item.status)}{record.item.history&&<span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">History</span>}</p></div>{record.workspace&&<Link className={btnPrimary} to={record.workspace.to}>{record.workspace.label}</Link>}</header>
   {record.item.history&&<Notice>This is a historical record. Its source and recorded details are preserved; opening it does not restore or merge records.</Notice>}
   <section className="rounded-xl border border-slate-200 p-4 dark:border-night-border"><h2 className="mb-4 font-semibold">Record details</h2><Fields data={record.fields}/></section>
   {record.groups.map((group,i)=><section key={i} className="space-y-3"><h2 className="font-semibold">{group.title}</h2>{group.records.map((r,index)=><div key={index} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-night-border"><Fields data={r}/>{Array.isArray(r.procedures)&&<ul className="space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-night-border">{(r.procedures as {process:string;outcome:string}[]).map(p=><li key={p.process}>{p.process} · <strong>{p.outcome}</strong></li>)}</ul>}</div>)}{!group.records.length&&<p className="text-sm text-slate-500">No recorded details in this group.</p>}</section>)}
   <section><h2 className="mb-3 font-semibold">Source History (latest 20)</h2>{record.history.length?<ol className="space-y-3">{record.history.map((h,i)=><li key={i} className="border-l-2 border-brand-200 pl-3 text-sm"><strong>{fieldLabel(h.action.replaceAll('-',' '))}</strong><p className="mt-1 text-xs text-slate-500">{[h.actor,h.at?new Date(h.at).toLocaleString('en-PH',{timeZone:'Asia/Manila',timeZoneName:'short'}):null].filter(Boolean).join(' · ')}</p>{h.reason&&<p className="mt-1 whitespace-pre-wrap">{h.reason}</p>}</li>)}</ol>:<p className="text-sm text-slate-500">No separate source history was recorded.</p>}</section>
   <p className="text-xs text-slate-500">Record reference: {record.item.id}. This preview reflects current access; use its source workspace for permitted actions.</p>
   <Link className={btnGhost} to="/dashboard">Dashboard</Link>
  </>}
 </div>;
}
