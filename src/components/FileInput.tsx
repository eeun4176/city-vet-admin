import { forwardRef,useRef,useState,type InputHTMLAttributes } from 'react';
/** Keeps the existing browse control and adds a native drop target everywhere. */
export const FileInput=forwardRef<HTMLInputElement,InputHTMLAttributes<HTMLInputElement>>(function FileInput(props,ref){
 const input=useRef<HTMLInputElement|null>(null),[over,setOver]=useState(false),[error,setError]=useState('');
 const accepts=(file:File)=>!props.accept||props.accept.split(',').some(raw=>{const v=raw.trim().toLowerCase();return v.startsWith('.')?file.name.toLowerCase().endsWith(v):v.endsWith('/*')?file.type.startsWith(v.slice(0,-1)):file.type===v;});
 return <span className={`inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-dashed p-2 text-xs ${over?'border-brand-500 bg-brand-50':'border-slate-300 dark:border-night-border-strong'}`} onDragOver={e=>{e.preventDefault();if(!props.disabled)setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{
  e.preventDefault();e.stopPropagation();setOver(false);if(props.disabled||!input.current)return;
  const files=Array.from(e.dataTransfer.files);if(files.some(f=>!accepts(f))){setError('Choose a supported file type.');return;}
  if(!props.multiple&&files.length>1){setError('Choose one file at a time.');return;}
  setError('');const transfer=new DataTransfer();files.forEach(f=>transfer.items.add(f));input.current.files=transfer.files;input.current.dispatchEvent(new Event('change',{bubbles:true}));
 }}><input {...props} type="file" ref={el=>{input.current=el;if(typeof ref==='function')ref(el);else if(ref)ref.current=el;}}/><span aria-hidden>Drop files here</span>{error&&<span role="alert" className="text-red-700">{error}</span>}</span>;
});
