import type { BasketRecord } from './reportBasket';
import { fieldLabel } from '../../shared/reportBasket';
const escape=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function exportReport(format:'excel'|'word',title:string,level:string,notes:string,rows:BasketRecord[]){
 if(format==='excel'){
  const {default:ExcelJS}=await import('exceljs');const workbook=new ExcelJS.Workbook();workbook.creator='City Veterinary Office';
  const sheet=workbook.addWorksheet('Report');sheet.columns=[{width:28},{width:45},{width:90}];sheet.addRow(['City Veterinary Office',title]);sheet.addRow(['Decision level',level]);sheet.addRow(['Verified at',new Date().toISOString()]);if(notes)sheet.addRow(['Staff analysis',notes]);sheet.addRow([]);sheet.addRow(['Section / record','Field','Value']);
  for(const row of rows)for(const field of row.selectedFields){if(field==='chartData'){try{for(const point of JSON.parse(String(row.values.chartData)))sheet.addRow([row.label,point.label,point.value]);}catch{/* invalid chart is not exported */}}else sheet.addRow([row.label,fieldLabel(field),row.values[field]]);}
  sheet.getRow(1).font={bold:true,size:16};sheet.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};});sheet.views=[{state:'frozen',ySplit:6}];
  const buffer=await workbook.xlsx.writeBuffer();downloadBlob(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${title.slice(0,80).replace(/[^a-z0-9 -]/gi,'')||'report'}.xlsx`);return;
 }
 const sections=rows.map(row=>`<h2>${escape(row.label)}</h2><table>${row.selectedFields.map(field=>{if(field==='chartData'){try{return JSON.parse(String(row.values.chartData)).map((p:{label:string;value:number})=>`<tr><th>${escape(p.label)}</th><td>${escape(p.value)}</td></tr>`).join('');}catch{return '';}}return `<tr><th>${escape(fieldLabel(field))}</th><td>${escape(row.values[field])}</td></tr>`;}).join('')}</table>`).join('');
 const html=`<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>body{font-family:Arial;font-size:11pt;color:#172e31}table{border-collapse:collapse;width:100%;margin-bottom:20pt}th,td{border:1px solid #aab8b9;padding:7pt;text-align:left;vertical-align:top}th{width:30%}h1{font-size:20pt}h2{font-size:14pt}p{white-space:pre-wrap}</style></head><body><p>City Veterinary Office · City of San Jose del Monte</p><h1>${escape(title)}</h1><p>${escape(level)} · Verified ${escape(new Date().toISOString())}</p>${notes?`<h2>Staff analysis</h2><p>${escape(notes)}</p>`:''}${sections}</body></html>`;
 downloadBlob(new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}),`${title.slice(0,80).replace(/[^a-z0-9 -]/gi,'')||'report'}.doc`);
}
