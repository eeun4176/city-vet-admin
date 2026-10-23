import type { OwnerPayload,PetPayload } from './census';
import { csvToOwners,parseCsv,type CsvIssue } from './csv';
export type AgeUnit=''|'years'|'months';
export type CensusImportResult={owners:OwnerPayload[];issues:CsvIssue[];barangay?:string;censusDate?:string};
export const TRADITIONAL_CSV='owner_group_id,owner_name,address,contact,pet_name,species,sex,age,age_unit,breed_type,color,sterilized,confinement,vaccine_1st,vaccine_2nd,vaccine_3rd,vaccine_other,remarks\r\n';
const key=(v:string)=>v.trim().toLowerCase();
export function censusMark(value:unknown):boolean|null{
 if(value===null||value===undefined||String(value).trim()==='')return null;
 const v=key(String(value));if(['x','✓','✔','/','\\','／','yes','y','true','1','oo'].includes(v))return true;
 if(['no','n','false','0','hindi'].includes(v))return false;
 throw new Error('Use X/✓/Yes, No, or leave blank for not recorded.');
}
export function censusAge(value:unknown,defaultUnit:AgeUnit=''):number|undefined{
 if(value===null||value===undefined||String(value).trim()==='')return undefined;
 const m=String(value).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(y|yr|yrs|year|years|m|mo|mos|month|months)?$/);
 if(!m)throw new Error('Age must be a number with years/months, for example 2 years or 6 months.');
 const unit=m[2]?(m[2].startsWith('y')?'years':'months'):defaultUnit;
 if(!unit)throw new Error('Choose the unit for unlabelled ages, or write years/months in each age cell.');
 const months=Number(m[1])*(unit==='years'?12:1);
 if(!Number.isInteger(months)||months<0||months>600)throw new Error('Age must resolve to a whole number of months between 0 and 600.');
 return months;
}
function validOwner(o:OwnerPayload,fail:(s:string)=>void){
 if(!o.ownerName.trim()||o.ownerName.length>120)fail('Owner name is required and must be 120 characters or fewer.');
 if(!o.address.trim()||o.address.length>240)fail('Address is required and must be 240 characters or fewer.');
 if(o.contact&&!/^09\d{2}[- ]?\d{3}[- ]?\d{4}$/.test(o.contact))fail('Contact must look like 0917-123-4567. Keep phone cells as text.');
}
function limits(result:CensusImportResult){
 if(!result.owners.length&&!result.issues.length)result.issues.push({line:1,message:'The file contains no participating pet rows.'});
 if(result.owners.length>200||result.owners.reduce((n,o)=>n+o.pets.length,0)>1000)result.issues.push({line:1,message:'Split the file into submissions of at most 200 owners and 1,000 pets.'});
 for(const o of result.owners)if(o.pets.length>30)result.issues.push({line:1,message:`${o.ownerName}: split entries with more than 30 pets for review.`});
 return result;
}
export function readTraditionalCsv(text:string):CensusImportResult{
 const rows=parseCsv(text);if(!rows)return {owners:[],issues:[{line:1,message:'A quotation mark is never closed.'}]};
 const headers=(rows[0]??[]).map(key);
 if(!headers.includes('owner_group_id'))return limits(csvToOwners(rows));
 const required=TRADITIONAL_CSV.trim().split(',');const missing=required.filter(h=>!headers.includes(h));
 if(missing.length)return {owners:[],issues:[{line:1,message:`Missing columns: ${missing.join(', ')}`}]};
 const result:CensusImportResult={owners:[],issues:[]},groups=new Map<string,OwnerPayload>();
 rows.slice(1).forEach((row,i)=>{
  const fail=(message:string)=>result.issues.push({line:i+2,message}),at=(h:string)=>(row[headers.indexOf(h)]??'').trim();
  const id=at('owner_group_id');if(!id){fail('owner_group_id is required. Names alone do not group owners.');return;}
  const proposed:OwnerPayload={ownerName:at('owner_name'),address:at('address'),contact:at('contact')||undefined,pets:[]};validOwner(proposed,fail);
  const previous=groups.get(id);if(previous&&(previous.ownerName!==proposed.ownerName||previous.address!==proposed.address||(previous.contact??'')!==(proposed.contact??'')))fail('This owner-group ID has conflicting owner details. Use a different group ID or correct the details.');
  const owner=previous??proposed;if(!previous){groups.set(id,owner);result.owners.push(owner);}
  const unit=key(at('age_unit'));if(unit&&!['years','months'].includes(unit))fail('age_unit must be years or months.');
  const species=key(at('species')),sex=key(at('sex')),breed=key(at('breed_type')),confinement=key(at('confinement'));
  if(!['dog','cat'].includes(species))fail('Choose Dog or Cat.');if(!['male','female'].includes(sex))fail('Choose Male or Female.');
  if(!at('pet_name')||at('pet_name').length>80)fail('Pet name is required and must be 80 characters or fewer.');
  if(breed&&!['mongrel','mongrel mix','mix','pure'].includes(breed))fail('Breed must be Mongrel, Mix or Pure.');
  const confinementMap:Record<string,string>={'confined':'Confined','semi-con':'Semi-confined','semi-confined':'Semi-confined','freeroam':'Free-roaming','free-roaming':'Free-roaming'};
  if(confinement&&!confinementMap[confinement])fail('Choose Confined, Semi-confined, or Free-roaming.');
  const flag=(h:string)=>{try{return censusMark(at(h));}catch(e){fail(`${h}: ${(e as Error).message}`);return null;}};
  let ageMonths:number|undefined;try{ageMonths=censusAge(at('age'),unit as AgeUnit);}catch(e){fail((e as Error).message);}
  owner.pets.push({petName:at('pet_name'),species:species==='cat'?'Cat':'Dog',sex:sex==='female'?'Female':'Male',ageMonths,breedType:breed?(breed==='pure'?'Pure':breed==='mix'?'Mix':'Mongrel'):undefined,color:at('color')||undefined,sterilized:flag('sterilized'),confinement:confinementMap[confinement],vaccine1st:flag('vaccine_1st'),vaccine2nd:flag('vaccine_2nd'),vaccine3rd:flag('vaccine_3rd'),vaccineOther:at('vaccine_other')||undefined,booster:headers.includes('booster')?flag('booster'):null,laps:headers.includes('laps')?flag('laps'):null,remarks:at('remarks')||undefined});
 });return limits(result);
}
export async function readTraditionalExcel(buffer:ArrayBuffer,unit:AgeUnit=''):Promise<CensusImportResult>{
 const ExcelJS=await import('exceljs'),book=new ExcelJS.Workbook();await book.xlsx.load(buffer as any);
 const result:CensusImportResult={owners:[],issues:[]};
 if(book.worksheets.length>20)throw new Error('Import at most 20 census sheets at a time.');
 for(const sheet of book.worksheets){
  if(sheet.rowCount>5000||sheet.columnCount>60)throw new Error('This workbook is too large. Use the supplied census template.');
  const value=(r:number,c:number):unknown=>{const cell=sheet.getCell(r,c);if(cell.type===ExcelJS.ValueType.Formula)throw new Error(`${sheet.name}, row ${r}: replace formulas with confirmed values before importing.`);const v=cell.value;if(v&&typeof v==='object'&&'richText'in v)return v.richText.map(t=>t.text).join('');if(v instanceof Date)return v;if(v!==null&&typeof v==='object')throw new Error(`${sheet.name}, row ${r}: this cell is not a plain value.`);return v;};
  const text=(r:number,c:number)=>String(value(r,c)??'').trim();
  if(!text(3,1).includes('DOG & CAT CENSUS')){result.issues.push({line:3,message:`${sheet.name}: use the downloadable door-to-door census template.`});continue;}
  const area=text(5,3),rawDate=value(5,18);let date:string|undefined;
  if(rawDate instanceof Date)date=rawDate.toISOString().slice(0,10);else if(rawDate)date=String(rawDate).trim();
  if(area&&result.barangay&&key(area)!==key(result.barangay))result.issues.push({line:5,message:'All sheets in a submission must use the same barangay.'});
  if(date&&result.censusDate&&date!==result.censusDate)result.issues.push({line:5,message:'All sheets in a submission must use the same census date.'});
  if(area)result.barangay=area;if(date)result.censusDate=date;
  for(let label=6;label<=sheet.rowCount;label++){
   if(!text(label,1).startsWith('NAME OF OWNER'))continue;
   const ownerRow=label+1,firstPet=label+4;
   const fail=(line:number,message:string)=>result.issues.push({line,message:`${sheet.name}: ${message}`});
   const owner:OwnerPayload={ownerName:text(ownerRow,1),address:text(ownerRow,5),contact:text(ownerRow,18)||undefined,pets:[]};
   for(let r=firstPet;r<firstPet+5;r++){
    const cells=Array.from({length:19},(_,c)=>value(r,c+2));if(cells.every(v=>v===null||v===undefined||String(v).trim()===''))continue;
    const mark=(c:number)=>{try{return censusMark(value(r,c));}catch(e){fail(r,(e as Error).message);return null;}};
    const one=(cols:number[],labels:string[],required=false)=>{const checked=cols.flatMap((c,i)=>mark(c)===true?[labels[i]]:[]);if(checked.length>1||required&&checked.length!==1)fail(r,`Select ${required?'exactly':'at most'} one of ${labels.join(', ')}.`);return checked[0];};
    const species=one([3,4],['Dog','Cat'],true),sex=one([9,10],['Male','Female'],true),breedType=one([6,7],['Mongrel','Pure']),confinement=one([13,14,15],['Confined','Semi-confined','Free-roaming']);
    if(!text(r,2))fail(r,'Pet name is required.');
    if(mark(11)===true&&sex!=='Male'||mark(12)===true&&sex!=='Female')fail(r,'Castrated/spayed marks conflict with the selected sex.');
    let ageMonths:number|undefined;try{ageMonths=censusAge(value(r,5),unit);}catch(e){fail(r,(e as Error).message);}
    owner.pets.push({petName:text(r,2),species:(species??'Dog') as PetPayload['species'],sex:(sex??'Male') as PetPayload['sex'],ageMonths,breedType,color:text(r,8)||undefined,sterilized:mark(sex==='Female'?12:11),confinement,vaccine1st:mark(16),vaccine2nd:mark(17),vaccine3rd:mark(18),vaccineOther:text(r,19)||undefined,booster:null,laps:null,remarks:text(r,20)||undefined});
   }
   if(!owner.pets.length){if(owner.ownerName||owner.address||owner.contact)fail(ownerRow,'This owner section has no pets.');continue;}
   validOwner(owner,message=>fail(ownerRow,message));result.owners.push(owner);
  }
 }
 return limits(result);
}
