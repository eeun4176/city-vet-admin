import { useId,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { Search,X } from 'lucide-react';
import { useT } from '../i18n';
import { Spinner } from './ui';
export interface SearchResult {key:string;kind:string;dataset:string;id:string;label:string;detail:string;to:string;source?:string;history?:boolean;status?:string}
export function UniversalSearch({value,onChange,results,loading,error,includeHistory,onHistory,hasMore,onRetry}:{value:string;onChange:(value:string)=>void;results:SearchResult[];loading:boolean;error:string;includeHistory:boolean;onHistory:(value:boolean)=>void;hasMore:boolean;onRetry:()=>void}){
 const {t}=useT(),id=useId(),root=useRef<HTMLDivElement>(null);const [expanded,setExpanded]=useState(false);
 const open=expanded&&value.trim().length>=2;
 return <div ref={root} role="search" className="relative min-w-0 flex-1" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setExpanded(false);}} onKeyDown={e=>{if(e.key==='Escape'){root.current?.querySelector('input')?.focus();setExpanded(false);e.stopPropagation();}}}>
  <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
  <input type="search" value={value} onFocus={()=>setExpanded(true)} onClick={()=>setExpanded(true)} onChange={e=>{setExpanded(true);onChange(e.target.value);}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setExpanded(true);root.current?.querySelector<HTMLAnchorElement>('a[data-search-result]')?.focus();}}} placeholder={t('search.placeholder')} aria-label={t('search.label')} aria-controls={open?id:undefined} autoComplete="off" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/15 dark:border-slate-700 dark:bg-surface-dark dark:text-white"/>
  {open&&<section id={id} aria-label={t('search.results')} className="menu-pop absolute left-0 right-0 top-full z-30 mt-1 max-h-[min(72vh,34rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-surface-dark">
   <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-surface-dark"><label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" checked={includeHistory} onChange={e=>onHistory(e.target.checked)}/>{t('search.history')}</label><button type="button" aria-label={t('common.close')} onClick={()=>setExpanded(false)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"><X aria-hidden className="h-4 w-4"/></button></div>
   {loading?<div className="px-4 py-4 text-sm text-slate-500"><Spinner label={t('search.loading')}/></div>:error?<div className="space-y-2 px-4 py-3 text-sm"><p role="alert" className="text-red-700 dark:text-red-300">{error}</p><button className="text-brand-700 underline dark:text-brand-300" onClick={onRetry}>{t('search.retry')}</button></div>:<>
    {!results.length&&<p className="px-4 py-4 text-sm text-slate-500">{t('search.empty')}</p>}
    {results.map(item=><Link key={item.key} data-search-result to={item.to} onClick={()=>{onChange('');setExpanded(false);}} onKeyDown={e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;const links=Array.from(root.current?.querySelectorAll<HTMLAnchorElement>('a[data-search-result]')??[]),index=links.indexOf(e.currentTarget);e.preventDefault();if(e.key==='ArrowUp'&&index===0)root.current?.querySelector('input')?.focus();else links[index+(e.key==='ArrowDown'?1:-1)]?.focus();}} className="block border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50 focus-visible:bg-brand-50 focus-visible:outline-none dark:border-slate-800 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800">
     <span className="block break-words text-sm font-medium">{item.label}</span><span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs"><span className="text-brand-700 dark:text-brand-300">{item.kind==='page'?t('search.page'):item.source??item.dataset}</span>{item.history&&<span className="rounded bg-amber-50 px-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200">{t('search.historyLabel')}</span>}{item.status&&<span className="text-slate-500">{item.status}</span>}</span><span className="mt-1 block break-words text-xs text-slate-500">{item.detail}</span>
    </Link>)}
    {hasMore&&<p className="px-4 py-3 text-xs text-slate-500">{t('search.refine')}</p>}
   </>}
  </section>}
 </div>;
}
