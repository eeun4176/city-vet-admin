import { FileInput } from '../../components/FileInput';
import { Sheet } from '../../components/PetSheet';
import { Download,Upload,ImagePlus } from 'lucide-react';
import { useRef,useState,type ChangeEvent } from 'react';
import { Link,useNavigate } from 'react-router-dom';
import { InfoTip, btnGhost,btnPrimary,Field,inputCls,Notice,Loading,Modal,formatDate, Select } from '../../components/ui';
import { CensusSheetEditor,type SheetValues } from '../../components/CensusSheetEditor';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fromDetail,todayManila } from '../../lib/census';
import { readTraditionalCsv,readTraditionalExcel,type AgeUnit,type CensusImportResult } from '../../lib/traditionalCensus';
import { shrinkImage,type ShrunkImage } from '../../lib/image';
const censusFieldLabel=(name:string)=>({petName:'Pet name',species:'Type of pet',sex:'Sex',ageMonths:'Age (months)',breedType:'Breed',color:'Color',sterilized:'Castrated / spayed',confinement:'Classification',vaccine1st:'1st vaccination',vaccine2nd:'2nd vaccination',vaccine3rd:'3rd vaccination',vaccineOther:'Other vaccines',booster:'Booster',laps:'Skipped vaccination',registeredYear:'Registered year',remarks:'Remarks'}[name]??name);

export function CensusImportPage(){
 const {account}=useAuth(),navigate=useNavigate(),input=useRef<HTMLInputElement>(null);
 const [file,setFile]=useState<File|null>(null),[result,setResult]=useState<CensusImportResult|null>(null),[ageUnit,setAgeUnit]=useState<AgeUnit>(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[review,setReview]=useState<SheetValues|null>(null),[saving,setSaving]=useState(false);
 const [photos,setPhotos]=useState<ShrunkImage[]>([]),[photoDate,setPhotoDate]=useState(todayManila());
 const read=async(selected:File,unit=ageUnit)=>{
  setBusy(true);setError('');setResult(null);setReview(null);
  try{
   if(selected.size>8*1024*1024)throw new Error('Use a workbook or CSV smaller than 8 MB.');
   const next=/\.xlsx$/i.test(selected.name)?await readTraditionalExcel(await selected.arrayBuffer(),unit):/\.csv$/i.test(selected.name)?readTraditionalCsv(await selected.text()):null;
   if(!next)throw new Error('Choose an XLSX workbook or CSV file.');
   if(next.barangay&&next.barangay.trim().toLowerCase()!==account?.barangay?.trim().toLowerCase())next.issues.push({line:5,message:'The workbook barangay differs from your assigned barangay. Correct the file before submitting.'});
   if(next.censusDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(next.censusDate)||Number.isNaN(Date.parse(next.censusDate))||new Date(next.censusDate).toISOString().slice(0,10)!==next.censusDate||next.censusDate>todayManila()))next.issues.push({line:5,message:'Enter a real census date, today or earlier.'});
   setResult(next);setRevision(n=>n+1);
  }catch(e){setError(e instanceof Error?e.message:'Unable to read the file.');}finally{setBusy(false);}
 };
 const choose=(e:ChangeEvent<HTMLInputElement>)=>{const selected=e.target.files?.[0];e.target.value='';if(selected){setFile(selected);void read(selected);}};
 const submit=async()=>{
  if(!review)return;setSaving(true);setError('');
  try{await api('POST','/census/submissions',{...review,source:'csv'});navigate('/census/mine',{replace:true,state:{notice:'Census submitted for review. Owners and pets become searchable after approval.'}});}
  catch(e){setError(e instanceof Error?e.message:'Submission failed.');}finally{setSaving(false);}
 };
 const choosePhotos=async(e:ChangeEvent<HTMLInputElement>)=>{const files=[...(e.target.files??[])];e.target.value='';setError('');try{const next:ShrunkImage[]=[];for(const f of files.slice(0,6-photos.length))next.push(await shrinkImage(f));setPhotos(p=>[...p,...next]);}catch(e){setError((e as Error).message);}};
 const attachPhotos=async()=>{setSaving(true);setError('');let id='';try{const r=await api<{submission:{id:string}}>('POST','/census/submissions',{label:`${account?.barangay} ${photoDate}`,censusDate:photoDate,source:'image',owners:[]});id=r.submission.id;for(const p of photos)await api('POST',`/census/submissions/${id}/attachments`,{mime:p.mime,data:p.data});navigate('/census/mine',{replace:true});}catch(e){setError(`${(e as Error).message}${id?' A pending submission was created; check My submissions before retrying.':''}`);}finally{setSaving(false);}};
 return <div className="w-full space-y-5"><header><h1 className="text-2xl font-semibold">Import Door-to-Door Census<InfoTip>Read an Excel form or CSV, check every owner and pet, then submit for Admin review.</InfoTip></h1></header>
  <section className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-night-border"><h2 className="font-semibold">1. Prepare the file</h2><p className="text-sm text-slate-500">The Excel template follows the paper form. Enter values in the blank cells and use X or ✓ for selected boxes. Blank vaccination marks remain Not recorded. CSV uses one pet per row and a separate owner-group ID.</p><div className="flex flex-wrap gap-2"><a className={btnGhost} href="/templates/door-to-door-census.xlsx" download><Download className="h-4 w-4"/>Download Excel form</a><a className={btnGhost} href="/templates/door-to-door-census.csv" download><Download className="h-4 w-4"/>Download CSV</a></div>
   <Field label="Unit for unlabelled ages in this Excel file" hint="You can also write 2 years or 6 months in an Age cell. No extra column is added to the form."><Select className={inputCls} value={ageUnit} disabled={busy||saving} onChange={e=>{const unit=e.target.value as AgeUnit;setAgeUnit(unit);if(file)void read(file,unit);}}><option value="">Require a unit in each populated age cell</option><option value="years">All unlabelled ages are years</option><option value="months">All unlabelled ages are months</option></Select></Field>
   <FileInput ref={input} className="sr-only" aria-label="Choose census Excel or CSV" type="file" accept=".xlsx,.csv" onChange={choose}/><button type="button" className={btnPrimary} disabled={busy||saving} onClick={()=>input.current?.click()}><Upload className="h-4 w-4"/>Choose Excel or CSV</button>{file&&<p className="text-xs text-slate-500">{file.name}</p>}
  </section>
  {error&&<Notice kind="error">{error}</Notice>}
  {result&&result.issues.length>0&&<Notice kind="error"><p className="font-semibold">Correct {result.issues.length} file issue(s), then choose the corrected file.</p><ul className="mt-2 list-disc space-y-1 pl-5">{result.issues.slice(0,30).map((issue,i)=><li key={i}>Row {issue.line}: {issue.message}</li>)}</ul>{result.issues.length>30&&<p>Showing the first 30 issues.</p>}</Notice>}
  {result&&!result.issues.length&&<section className="space-y-4"><h2 className="font-semibold">2. Check the imported details</h2><Notice kind="success">{result.owners.length} owner sections · {result.owners.reduce((n,o)=>n+o.pets.length,0)} pets. Separate owner sections remain separate, including matching names.</Notice><CensusSheetEditor key={revision} barangay={account?.barangay} initial={{label:`${account?.barangay} ${result.censusDate??todayManila()}`,censusDate:result.censusDate??todayManila(),householdsVisited:0,owners:fromDetail(result.owners)}} submitLabel="Review census submission" onSubmit={async values=>{setReview(values);setError('');}}/></section>}
  <details className="rounded-xl border border-slate-200 p-4 dark:border-night-border"><summary className="cursor-pointer text-sm font-medium">Attach photos for manual encoding</summary><div className="mt-3 space-y-3"><p className="text-sm text-slate-500">This option stores photos with a pending submission for manual encoding. It does not extract text. Existing attachments are preserved.</p><Field label="Census date"><input type="date" max={todayManila()} className={inputCls} value={photoDate} onChange={e=>setPhotoDate(e.target.value)}/></Field><label className={`${btnGhost} cursor-pointer`}><ImagePlus className="h-4 w-4"/>Choose photos<FileInput className="sr-only" type="file" accept="image/*" multiple disabled={saving||photos.length>=6} onChange={choosePhotos}/></label><div className="grid grid-cols-3 gap-3">{photos.map((p,i)=><div key={i}><img src={p.preview} alt={p.name} className="h-28 w-full object-contain"/><button type="button" className="text-xs underline" onClick={()=>setPhotos(list=>list.filter((_,j)=>i!==j))}>Remove photo {i+1}</button></div>)}</div><button className={btnPrimary} disabled={saving||!photos.length} onClick={()=>void attachPhotos()}>Submit stored photos for manual encoding</button></div></details>
  <Link className={btnGhost} to="/census/mine">Back to my submissions</Link>
  {busy&&<Modal title="Reading census file" onClose={()=>{}} dismissible={false}><Loading label="Reading owner sections and checking pet details…"/></Modal>}
  {review&&<Modal title="Review census submission" wide onClose={()=>setReview(null)} dismissible={!saving}>{saving?<Loading label="Submitting census for review…"/>:<div className="space-y-4"><Notice>Confirm these details. The submission remains pending until an Admin approves it.</Notice><p>{review.label} · {formatDate(review.censusDate)} · {account?.barangay}</p>{error&&<Notice kind="error">{error}</Notice>}{(()=>{const base=['petName','species','sex','ageMonths'],extra=[...new Set(review.owners.flatMap(o=>o.pets.flatMap(p=>Object.keys(p))))].filter(k=>!base.includes(k)),show=(v:unknown)=>v==null||v===''?'—':typeof v==='boolean'?v?'Yes':'No':String(v);
   // One row per pet, owner details on the owner's first row, as in the Owners sheet.
   return <Sheet minWidth={`${60+extra.length*9}rem`} heads={[['Owner','w-48'],['Address','w-56'],['Contact','w-36'],...[...base,...extra].map((k):[string,string]=>[censusFieldLabel(k),'w-36'])]}>{review.owners.flatMap((o,i)=>o.pets.map((p,j)=><tr key={`${i}-${j}`}>{[j?'':o.ownerName,j?'':o.address,j?'':o.contact||'—',...[...base,...extra].map(k=>show((p as unknown as Record<string,unknown>)[k]))].map((v,c)=><td key={c} title={v} className={`h-10 truncate px-2.5 ${c===0?'font-medium':''}`}>{v}</td>)}</tr>))}</Sheet>;})()}<div className="flex gap-2"><button className={btnGhost} onClick={()=>setReview(null)}>Back to edit</button><button className={btnPrimary} onClick={()=>void submit()}>Submit for Admin review</button></div></div>}</Modal>}
 </div>;
}
