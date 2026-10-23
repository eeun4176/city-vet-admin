import { PET_BREEDS } from './petReferences';
export function parsePetDetails(value:string){
 return value.split(/\s*\|\s*/).filter(Boolean).map(entry=>{
  const match=/^Pet\s*\d*\s*:\s*(.+?)\s*\((Dog|Cat),\s*(Male|Female),\s*([^,]+),\s*(.+)\)$/i.exec(entry.trim());
  if(!match)throw new Error(`Pet details need review: ${entry.slice(0,100)}`);
  const species=match[2].toLowerCase()==='cat'?'Cat':'Dog',description=match[5];
  const breedClass=/\/\s*Pure/i.test(description)?'Pure':/Mongrel/i.test(description)?'Mongrel':'Mix';
  const raw=description.split('/')[0].trim(),breed=PET_BREEDS[species].find(b=>b.toLowerCase()===raw.toLowerCase())??'Unknown';
  return {petName:match[1].trim(),species,sex:match[3][0].toUpperCase()+match[3].slice(1).toLowerCase(),color:match[4].trim(),breed,breedClass,vaccinationStatus:'Unknown',sterilizationStatus:'Unknown',sourceBreed:description};
 });
}
export const IMPORT_FIELDS:Record<string,string[]>={
 owners:['pets','ownerGroup','id','name','contact','address','barangay','petDetails','petName','species','sex','breed','breedClass','color','age_months','vaccinationStatus','sterilizationStatus','vaccineType','vaccinationDate'],
 pets:['id','petName','owner_id','species','sex','barangay','breed','breedClass','color','age_months','vaccinationStatus','sterilizationStatus','vaccineType','vaccinationDate'],
 services:['id','name','owner','barangay','date','service','status','remarks'],
 programs:['id','title','barangay','date','location','startTime','endTime','status','slots','processes'],
 paravets:['id','name','firstName','middleName','lastName','barangay','mobile'],
 households:['id','name','address','barangay','householdSize'],animals:['id','name','species','owner','barangay'],stubs:['id','name','barangay','date','status','program'],
};
const clean=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,'');
export function suggestMapping(headers:string[],dataset:string){
 const aliases:Record<string,string[]>={name:['ownername','fullname','nameofclient','name'],contact:['contactnumber','mobile','phone','contact'],ownerGroup:['no','ownergroup','ownergroupid'],owner_id:['ownerid','ownerrecordid'],petName:['petname'],petDetails:['petdetails'],breedClass:['breedclassification','breedtype'],vaccinationStatus:['vaccinated','vaccinationstatus'],sterilizationStatus:['spayed','castrated','sterilized','sterilizationstatus']};
 const result=Object.fromEntries(headers.map(h=>[h,(IMPORT_FIELDS[dataset]??[]).find(f=>(aliases[f]??[f]).some(a=>clean(a)===clean(h)))??'']));
 for(const field of IMPORT_FIELDS[dataset]??[]){const matching=headers.filter(h=>result[h]===field);const preferred=matching.find(h=>clean(h)===clean(field))??matching[0];for(const h of matching)if(h!==preferred)result[h]='';}
 return result;
}
