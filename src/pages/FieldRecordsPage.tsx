import { useRecordSelection,SelectionBar,exportSelectedCsv } from '../lib/useRecordSelection';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi, useDebouncedValue } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { InfoTip, btnGhost, btnPrimary, btnDanger, Check, DateInput, Field, inputCls, Loading, Modal, Notice, Pagination, Spinner, tabItem, tabList, Select } from '../components/ui';
import { PROGRAM_PROCESSES } from '../../shared/programs';
import { SERVICE_OUTCOMES, type FieldKind, type FieldPage, type FieldRow, type FieldView, type StandaloneDraft, type StandaloneReview } from '../../shared/fieldRecords';
import type { RegistryRecord } from '../../shared/registry';
import { Sheet, sheetCell } from '../components/PetSheet';

const titles={respondents:'Census Response History',participants:'Participants',services:'Services'};
const primaryLabels={respondents:'Approved census',participants:'Program attendance',services:'Program services'};
const help={respondents:'Approved census responses, with links to their submission and registry owner. Repeat census visits remain separate responses.',participants:'One row per participating pet from submitted program attendance. Owners can return with their pets in later programs.',services:'Completed program procedures come from attendance. Record care outside a program as a reviewed standalone visit.'};
const text=(value:unknown)=>value===null||value===undefined||value===''?'Not recorded':typeof value==='boolean'?value?'Yes':'No':String(value);
const when=(value:unknown)=>value?new Date(String(value)).toLocaleString('en-PH',{timeZone:'Asia/Manila',timeZoneName:'short'}):'Not recorded';
function SourceLinks({row}:{row:FieldRow}){
 return <div className="flex flex-wrap gap-3 text-sm text-brand-700 underline dark:text-brand-300">
  {row.submissionId&&<Link to={`/census/review/approved/${row.submissionId}`}>Open census</Link>}
  {row.programId&&<Link to={`/program-day?program=${row.programId}&tab=attendance`}>Open program</Link>}
  {row.ownerId&&<Link to={`/registry/owners?q=${encodeURIComponent(row.ownerId)}&recordId=${encodeURIComponent(row.ownerId)}`}>Open registry owner</Link>}
 </div>;
}
export function FieldRecordsPage({kind}:{kind:FieldKind}){
 const [params,setParams]=useSearchParams();
 const initial=params.get('view');const [view,setView]=useState<FieldView>(initial==='history'?'history':initial==='standalone'&&kind==='services'?'standalone':'primary');
 const [search,setSearch]=useState(params.get('q')??'');const query=useDebouncedValue(search.trim());
 const [page,setPage]=useState(1),[includeVoided,setIncludeVoided]=useState(false),[selected,setSelected]=useState<string|null>(params.get('recordId')),[create,setCreate]=useState(false),[message,setMessage]=useState('');
 const {can}=useAuth();
 const list=useApi<FieldPage>(`/field-records?kind=${kind}&view=${view}&q=${encodeURIComponent(query)}&page=${page}&includeVoided=${includeVoided}`,{refreshIntervalMs:30000});
 const bulk=useRecordSelection(`${kind}:${view}:${query}:${includeVoided}`);
 const bulkPath=`/field-records?kind=${kind}&view=${view}&q=${encodeURIComponent(query)}&includeVoided=${includeVoided}`;
 const changeView=(next:FieldView)=>{setView(next);setSearch('');setPage(1);setSelected(null);setParams(next==='primary'?{}:{view:next});};
 useEffect(()=>{const value=params.get('view');setView(value==='history'?'history':value==='standalone'&&kind==='services'?'standalone':'primary');setSearch(params.get('q')??'');setSelected(params.get('recordId'));},[params,kind]);
 return <div className="w-full space-y-5">
  <header className="flex flex-wrap items-start gap-3"><div className="mr-auto max-w-2xl"><h1 className="text-2xl font-semibold">{titles[kind]}<InfoTip>{help[kind]}</InfoTip></h1></div>{kind!=='respondents'&&<Link className={btnGhost} to="/program-day">Record program attendance</Link>}{kind==='services'&&can('services.manage')&&<button className={btnPrimary} onClick={()=>setCreate(true)}>Record standalone service</button>}</header>
  <div role="tablist" aria-label={`${titles[kind]} sources`} className={`${tabList} w-full`}>{([['primary',primaryLabels[kind]],...(kind==='services'?[['standalone','Standalone visits']]:[]),['history','Manual / imported history']] as [FieldView,string][]).map(([value,label])=><button key={value} role="tab" aria-selected={view===value} onClick={()=>changeView(value)} className={tabItem(view===value)}>{label}</button>)}</div>
  {view==='history'&&<Notice>These older records are kept as recorded. They are not automatically linked to census responses or counted as confirmed program attendance. Use the source workflow for new entries.</Notice>}
  {view==='standalone'&&<Notice>A visit can contain several pets and procedures. Only completed procedures enter service totals; deferred and ineligible outcomes stay in the visit history.</Notice>}
  {kind==='services'&&view==='primary'&&<p className="text-sm text-slate-500">One row per completed procedure. Program outcomes use the original attendance entries.</p>}
  <div className="flex flex-wrap items-center gap-3"><label className="mr-auto w-full sm:w-80"><span className="sr-only">Search {titles[kind]}</span><input className={inputCls} placeholder="Search name, pet, barangay, or date…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>{view!=='history'&&kind!=='respondents'&&<Check checked={includeVoided} onChange={v=>{setIncludeVoided(v);setPage(1);}}>Include voided entries</Check>}<button className={btnGhost} disabled={list.loading} onClick={list.reload}>{list.loading ? <Spinner label="Refreshing…"/> : 'Refresh'}</button></div>
  <SelectionBar selection={bulk} total={list.data?.total??0} rows={list.data?.data??[]}><button className={btnGhost} disabled={!bulk.count(list.data?.total??0)} onClick={()=>void bulk.resolve<FieldRow>(bulkPath).then(rows=>exportSelectedCsv(rows as unknown as Record<string,unknown>[],`${kind}-selected`)).catch(e=>setMessage(e.message))}>Export selected</button></SelectionBar>
  {message&&<Notice kind="success">{message}</Notice>}
  {list.error&&<Notice kind="error">{list.error.message}</Notice>}
  {list.loading&&!list.data?<Loading label={`Loading ${titles[kind].toLowerCase()}…`}/>:!list.error&&<>
   <div className="data-table overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="p-3">Select</th>{[kind==='respondents'?'Respondent':'Owner','Pet / details','Date','Source / status','Actions'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{list.data?.data.map(row=><tr key={row.id}><td className="p-3"><input type="checkbox" aria-label={`Select ${row.name??row.id}`} checked={bulk.has(row.id)} onChange={()=>bulk.toggle(row.id)}/></td><td className="p-3"><button className="text-left font-medium text-brand-700 underline dark:text-brand-300" onClick={()=>setSelected(row.id)}>{text(row.name)}</button><p className="mt-1 text-xs text-slate-500">{row.barangay}</p></td><td className="max-w-xs p-3"><span>{text(row.petName??(row.petCount!==undefined?`${row.petCount} pet${row.petCount===1?'':'s'}`:row.program??row.address))}</span>{row.process&&<p className="mt-1 text-xs text-slate-500">{String(row.process)}</p>}</td><td className="whitespace-nowrap p-3">{text(row.date)}</td><td className="p-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{row.source}</span><p className="mt-2 text-xs text-slate-500">{row.entryStatus==='Voided'||row.status==='Voided'?'Voided':text(row.status)}{row._archived?' · Archived':''}</p></td><td className="p-3"><button className="text-brand-700 underline dark:text-brand-300" onClick={()=>setSelected(row.id)}>View details</button></td></tr>)}</tbody></table>{!list.data?.data.length&&<div className="p-10 text-center text-sm text-slate-500">No matching records in this source.</div>}</div>
   {list.data&&<Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage}/>}
  </>}
  {list.updatedAt&&<p className="text-xs text-slate-500">Last updated {new Date(list.updatedAt).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila'})} PHT · Refreshes every 30 seconds while visible.</p>}
  {selected&&<FieldDetail kind={kind} view={view} id={selected} onClose={()=>{setSelected(null);if(params.has('recordId'))setParams(p=>{p.delete('recordId');return p;},{replace:true});}} onChanged={()=>{list.reload();setMessage('Visit voided. Its history has been preserved.');}}/>}
  {create&&<StandaloneForm onClose={()=>setCreate(false)} onSaved={()=>{setCreate(false);changeView('standalone');list.reload();setMessage('Standalone visit saved. Owner and pet details were preserved with the visit.');}}/>}
 </div>;
}

function ReadFields({data}:{data:Record<string,unknown>}){
 const hidden=new Set(['workflow','id','ownerId','submissionId','campaignId','programId','attendanceId','visitId','pet_id','owner_id','paravet_id','barangayId','clientName','owner_name','owner']);
 if(data.petName!==undefined)hidden.add('pet_name');
 if(data.provider!==undefined)hidden.add('paravet');
 if(data.service!==undefined){hidden.add('process');hidden.add('procedureType');}
 if(data.ageMonths!==undefined&&data.ageMonths!==null)hidden.add('age');
 if(data.status===data.outcome)hidden.add('outcome');
 return <dl className="grid gap-3 text-sm sm:grid-cols-2">{Object.entries(data).filter(([key,value])=>!key.startsWith('_')&&!hidden.has(key)&&(value===null||['string','number','boolean'].includes(typeof value))).map(([key,value])=><div key={key}><dt className="text-xs capitalize text-slate-500">{key.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ')}</dt><dd className="mt-1 break-words">{text(value)}</dd></div>)}</dl>;
}
function FieldDetail({kind,view,id,onClose,onChanged}:{kind:FieldKind;view:FieldView;id:string;onClose:()=>void;onChanged:()=>void}){
 const detail=useApi<{data?:FieldRow[];record?:FieldRow;owner?:Record<string,unknown>;pets?:Record<string,unknown>[];history?:{action:string;actor:string;at:string;reason?:string}[];duplicateReason?:string}>(`/field-records?kind=${kind}&view=${view}&id=${encodeURIComponent(id)}&includeVoided=true`);
 const row=detail.data?.record??detail.data?.data?.[0];const [voiding,setVoiding]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const voidVisit=async()=>{setBusy(true);setError('');try{await api('POST','/field-records',{action:'void',id,reason});setVoiding(false);detail.reload();onChanged();}catch(e){setError(e instanceof Error?e.message:'Could not void the visit.');}finally{setBusy(false);}};
 return <Modal title="Field record details" wide onClose={onClose} dismissible={!busy}><div className="space-y-5">{detail.loading?<Loading label="Loading source details and history…"/>:detail.error?<Notice kind="error">{detail.error.message}</Notice>:row?<>
  <SourceLinks row={row}/><ReadFields data={row}/>
  {detail.data?.owner&&<section><h2 className="mb-3 font-semibold">Owner at the Time of Recording</h2><ReadFields data={detail.data.owner}/></section>}
  {detail.data?.pets?.map((pet,i)=><section key={i} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="mb-2 font-semibold">{text(pet.petName??pet.pet_name??pet.name)}</h3><ReadFields data={pet}/>{Array.isArray(pet.procedures)&&<ul className="mt-3 space-y-1 text-sm">{(pet.procedures as {process:string;outcome:string}[]).map(p=><li key={p.process}>{p.process} · <strong>{p.outcome}</strong></li>)}</ul>}</section>)}
  {row.processOutcomes&&typeof row.processOutcomes==='object'&&<section><h2 className="mb-2 font-semibold">Procedure Outcomes</h2><ReadFields data={row.processOutcomes as Record<string,unknown>}/></section>}
  {detail.data?.duplicateReason&&<Notice>Repeat-entry explanation: {detail.data.duplicateReason}</Notice>}
  {detail.data?.history&&<section><h2 className="mb-3 font-semibold">History</h2><ol className="space-y-3 text-sm">{detail.data.history.map((h,i)=><li key={i} className="border-l-2 border-slate-200 pl-3"><strong>{h.action}</strong><p>{h.actor} · {when(h.at)}</p>{h.reason&&<p className="mt-1 text-slate-500">{h.reason}</p>}</li>)}</ol></section>}
  {view==='standalone'&&row.status==='Submitted'&&!voiding&&<button className={btnDanger} onClick={()=>setVoiding(true)}>Void incorrect visit</button>}
  {voiding&&<div className="space-y-3 rounded-xl border border-red-200 p-4"><p className="text-sm">Voiding removes completed procedures from active service totals. The original visit and reason remain available in history. Record a new reviewed visit for corrected information.</p><Field label="Reason for voiding"><textarea className={inputCls} minLength={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></Field><div className="flex gap-2"><button className={btnGhost} disabled={busy} onClick={()=>setVoiding(false)}>Cancel</button><button className={btnDanger} disabled={busy||reason.trim().length<3} onClick={()=>void voidVisit()}>{busy?<Spinner label="Voiding…"/>:'Confirm void'}</button></div></div>}
 </>:<Notice>This record is no longer available in this source.</Notice>}{error&&<Notice kind="error">{error}</Notice>}<div className="flex justify-end"><button className={btnGhost} disabled={busy} onClick={onClose}>Close</button></div></div></Modal>;
}

function StandaloneForm({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const {account}=useAuth();const [draft,setDraft]=useState<StandaloneDraft>(()=>({requestId:crypto.randomUUID(),ownerId:'',servedOn:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}),location:'',provider:account?.name??'',note:'',pets:[]}));
 const [search,setSearch]=useState(''),[owner,setOwner]=useState<RegistryRecord|null>(null),[review,setReview]=useState<StandaloneReview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[duplicateReason,setDuplicateReason]=useState(''),[confirmed,setConfirmed]=useState(false);
 const term=useDebouncedValue(search.trim());
 const options=useApi<{data:RegistryRecord[];total:number}>(!owner?`/registry-workspace?kind=owners&q=${encodeURIComponent(term)}`:null);
 const linked=useApi<{record:RegistryRecord;pets:RegistryRecord[]}>(owner?`/registry-workspace?kind=owners&id=${encodeURIComponent(owner.id)}`:null);
 const update=(patch:Partial<StandaloneDraft>)=>{setDraft(d=>({...d,...patch}));setReview(null);setError('');setConfirmed(false);};
 const preview=async()=>{setBusy(true);setError('');try{setReview(await api<StandaloneReview>('POST','/field-records',{action:'preview',draft},{readOnly:true,quiet:true}));setConfirmed(false);setDuplicateReason('');}catch(e){setError(e instanceof Error?e.message:'Review failed.');}finally{setBusy(false);}};
 const save=async()=>{if(!review)return;setBusy(true);setError('');try{await api('POST','/field-records',{action:'save',draft,token:review.token,duplicateReason});onSaved();}catch(e){setError(e instanceof Error?e.message:'Save failed.');}finally{setBusy(false);}};
 const activePets=linked.data?.pets.filter(p=>!p.archived)??[];
 return <Modal key={review?'review':'form'} title={review?'Review standalone visit':'Record service outside a program'} wide onClose={onClose} dismissible={!busy}><div className="space-y-4">
  <p className="text-sm text-slate-500">For an actual program visit, use <Link to="/program-day" className="text-brand-700 underline" onClick={onClose}>Program day attendance</Link>.</p>
  {error&&<Notice kind="error">{error}</Notice>}
  {busy&&<Loading label={review?'Saving reviewed visit…':'Preparing review…'}/>}
  {review?<>
   <ReadFields data={{date:draft.servedOn,location:draft.location,provider:draft.provider,note:draft.note}}/>
   <section className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800"><h2 className="mb-3 font-semibold">Selected Owner</h2><ReadFields data={review.owner}/></section>
   <Sheet minWidth="52rem" heads={[['Pet','w-44'],['Species','w-24'],['Sex','w-28'],['Procedures and results','w-[28rem]']]}>{review.pets.map(p=><tr key={String(p.id)}>{[text(p.petName??p.name),text(p.species),text(p.sex),(p.procedures as {process:string;outcome:string}[]).map(v=>`${v.process}: ${v.outcome}`).join(' · ')].map((v,i)=><td key={i} title={String(v)} className="h-10 truncate px-2.5">{v}</td>)}</tr>)}</Sheet>
   {review.duplicates.length>0&&<div className="space-y-3"><Notice>There are {review.duplicates.length} active visits with an overlapping pet and procedure on this date. Check these before saving a separate visit.</Notice>{review.duplicates.map(d=><p key={d.id} className="text-sm"><Link target="_blank" rel="noopener noreferrer" className="text-brand-700 underline" to={`/services?view=standalone&recordId=${d.id}`}>Open matching visit</Link> · {d.date} · {d.provider}</p>)}<Field label="Why is this a separate actual visit?"><textarea className={inputCls} value={duplicateReason} maxLength={1000} onChange={e=>setDuplicateReason(e.target.value)} disabled={busy}/></Field></div>}
   <Check disabled={busy} checked={confirmed} onChange={setConfirmed}>I checked the owner, pets, actual date, procedures, and outcomes.</Check>
   <div className="flex justify-end gap-2"><button className={btnGhost} disabled={busy} onClick={()=>{setReview(null);setError('');}}>Back to form</button><button className={btnPrimary} disabled={busy||!confirmed||review.duplicates.length>0&&duplicateReason.trim().length<3} onClick={()=>void save()}>{busy?<Spinner label="Saving…"/>:'Save reviewed visit'}</button></div>
  </>:<form onSubmit={e=>{e.preventDefault();void preview();}} className="space-y-4">
   {!owner?<section className="space-y-3"><Field label="Find an existing registry owner" hint="Select the person explicitly; matching names do not confirm identity."><input className={inputCls} value={search} onChange={e=>setSearch(e.target.value)} disabled={busy} placeholder="Name, address, or owner ID…"/></Field>{options.loading?<Loading label="Finding owners…"/>:options.error?<Notice kind="error">{options.error.message}</Notice>:<div className="max-h-56 space-y-2 overflow-auto">{options.data?.data.map(r=><button type="button" key={r.id} className="block w-full rounded-xl border border-slate-200 p-3 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={()=>{setOwner(r);update({ownerId:r.id,pets:[]});}}><strong>{text(r.data.name)}</strong><p>{text(r.data.address)} · {text(r.data.barangay)}</p><p className="text-xs text-slate-500">{r.id}</p></button>)}{!options.data?.data.length&&<p className="text-sm text-slate-500">No matching owners. Create an owner and pets in the registry first.</p>}</div>}<Link className="text-sm text-brand-700 underline" to="/registry/owners" onClick={onClose}>Open owner/pet registry</Link></section>:<section className="space-y-3"><div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">{text(owner.data.name)}</h2><p className="text-sm text-slate-500">{text(owner.data.address)} · {text(owner.data.barangay)}</p></div><button type="button" className={btnGhost} disabled={busy} onClick={()=>{setOwner(null);update({ownerId:'',pets:[]});}}>Change owner</button></div>{linked.loading?<Loading label="Loading linked pets…"/>:linked.error?<Notice kind="error">{linked.error.message}</Notice>:<><Sheet minWidth="62rem" heads={[['Include','w-20 text-center'],['Pet','w-44'],['Species','w-24'],['Sex','w-28'],...PROGRAM_PROCESSES.map((process):[string,string]=>[process,'w-40'])]}>{activePets.map(p=>{
    // One row per linked pet; a procedure with a result is included, "—" leaves it out.
    const selected=draft.pets.find(v=>v.petId===p.id),name=text(p.data.petName??p.data.name);
    const setProcedures=(procedures:StandaloneDraft['pets'][number]['procedures'])=>update({pets:draft.pets.some(v=>v.petId===p.id)?draft.pets.map(v=>v.petId===p.id?{...v,procedures}:v):[...draft.pets,{petId:p.id,procedures}]});
    return <tr key={p.id}><td className="!h-10 !p-0"><label className="flex h-10 cursor-pointer items-center justify-center"><input type="checkbox" disabled={busy} aria-label={`Include ${name}`} checked={Boolean(selected)} onChange={e=>update({pets:e.target.checked?[...draft.pets,{petId:p.id,procedures:[]}]:draft.pets.filter(v=>v.petId!==p.id)})} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"/></label></td><td className="h-10 truncate px-2.5 font-medium">{name}</td><td className="h-10 px-2.5">{text(p.data.species)}</td><td className="h-10 px-2.5">{text(p.data.sex)}</td>{PROGRAM_PROCESSES.map(process=>{const proc=selected?.procedures.find(v=>v.process===process);return <td key={process} className="!h-10 !p-0"><Select aria-label={`${name} ${process} outcome`} disabled={busy} className={sheetCell} value={proc?.outcome??''} onChange={e=>{const others=(selected?.procedures??[]).filter(v=>v.process!==process);setProcedures(e.target.value?[...others,{process,outcome:e.target.value as NonNullable<typeof proc>['outcome']}]:others);}}><option value="">—</option>{SERVICE_OUTCOMES.map(o=><option key={o}>{o}</option>)}</Select></td>;})}</tr>;
   })}</Sheet>{!activePets.length&&<Notice>This owner has no active linked pets. Correct the registry link before recording a visit.</Notice>}</>}</section>}
   <div className="grid gap-4 sm:grid-cols-2"><Field label="Actual service date"><DateInput className={inputCls} required max={new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'})} value={draft.servedOn} onChange={e=>update({servedOn:e.target.value})} disabled={busy}/></Field><Field label="Provider / attending staff"><input className={inputCls} required maxLength={120} value={draft.provider} onChange={e=>update({provider:e.target.value})} disabled={busy}/></Field></div>
   <Field label="Service location"><input className={inputCls} required maxLength={300} value={draft.location} onChange={e=>update({location:e.target.value})} disabled={busy}/></Field><Field label="Notes (optional)"><textarea className={inputCls} maxLength={1000} value={draft.note} onChange={e=>update({note:e.target.value})} disabled={busy}/></Field>
   <div className="flex justify-end gap-2"><button type="button" className={btnGhost} disabled={busy} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy||!draft.ownerId||!draft.pets.length||draft.pets.some(p=>!p.procedures.length)||linked.loading}>Review visit</button></div>
  </form>}
 </div></Modal>;
}
