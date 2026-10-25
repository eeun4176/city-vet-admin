import { useEffect,useState,type ReactNode } from 'react';
import { api } from './api';
import { btnGhost } from '../components/ui';
import { downloadBlob } from './reportExport';
export function useRecordSelection(scope:string){
 const [all,setAll]=useState(false),[ids,setIds]=useState<Set<string>>(new Set());
 useEffect(()=>{setAll(false);setIds(new Set());},[scope]);
 const has=(id:unknown)=>all?!ids.has(String(id)):ids.has(String(id));
 const toggle=(id:unknown)=>setIds(current=>{const next=new Set(current),key=String(id);next.has(key)?next.delete(key):next.add(key);return next;});
 const clear=()=>{setAll(false);setIds(new Set());};
 const selectPage=(rows:{id:unknown}[])=>{const checked=rows.every(r=>has(r.id));setIds(current=>{const next=new Set(current);for(const r of rows){const key=String(r.id);if(all?!checked:checked)next.delete(key);else next.add(key);}return next;});};
 const resolve=async<T extends {id:unknown}>(path:string,limit=10000):Promise<T[]>=>{
  if(!all&&!ids.size)return [];
  const result:T[]=[];const [base,search]=path.split('?'),params=new URLSearchParams(search);params.set('pageSize',params.get('pageSize')??'100');
  let page=1,total=1,seen=0;
  do{params.set('page',String(page));const reply=await api<{data:T[];total:number}>('GET',`${base}?${params}`);total=reply.total;seen+=reply.data.length;
   if(page===1&&(all?total-ids.size:ids.size)>limit)throw new Error(`This action supports ${limit.toLocaleString()} selected records. Narrow your filters or selection.`);
   for(const r of reply.data)if(has(r.id))result.push(r);
   if(result.length>limit)throw new Error(`Selection exceeds ${limit} records.`);
   if(!reply.data.length)break;page++;
  }while(seen<total);
  return result;
 };
 return {all,has,toggle,clear,selectPage,resolve,count:(total:number)=>all?Math.max(0,total-ids.size):ids.size,selectAll:()=>{setAll(true);setIds(new Set());}};
}
export type RecordSelection=ReturnType<typeof useRecordSelection>;
export function SelectionBar({selection,total,rows,children}:{selection:RecordSelection;total:number;rows:{id:unknown}[];children?:ReactNode}){
 return <section className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-surface-bar" aria-label="Record selection"><label className="mr-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={rows.length>0&&rows.every(r=>selection.has(r.id))} onChange={()=>selection.selectPage(rows)}/>Select this page</label><button className={`${btnGhost} text-xs`} disabled={!total} onClick={selection.selectAll}>Select all {total.toLocaleString()} matching records</button><button className={`${btnGhost} text-xs`} disabled={!selection.count(total)} onClick={selection.clear}>Clear selection</button><span aria-live="polite" className="text-xs font-medium">{selection.count(total).toLocaleString()} selected{selection.all?' across pages':''}</span>{children}</section>;
}
export function exportSelectedCsv(rows:Record<string,unknown>[],name:string){
 const fields=[...new Set(rows.flatMap(r=>Object.keys(r).filter(k=>!k.startsWith('_')&&!/(password|secret|token|credential|image|photo|accountkey|username)/i.test(k))))];
 const quote=(v:unknown)=>{let text=typeof v==='object'&&v!==null?JSON.stringify(v):String(v??'');if(/^[=+@\t\r-]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;};
 downloadBlob(new Blob(['\ufeff',[fields.map(quote).join(','),...rows.map(r=>fields.map(f=>quote(r[f])).join(','))].join('\r\n')],{type:'text/csv;charset=utf-8'}),`${name}.csv`);
}
