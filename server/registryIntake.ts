import { notFound,conflict } from './errors';
import { emptyRegistryPet } from '../shared/registry';
import { healthStatus } from '../shared/petReferences';
export type RegistryIntake={source:'interest'|'stub'|'attendance';id:number};
export async function registryIntake(q:any,input:RegistryIntake){
 let owner:any,pets:any[],barangayId:number,linked:string|undefined;
 if(input.source==='interest'){
  const [row]=await q`select * from ekapon.program_interest_people where id=${input.id} and status='interested'`;
  if(!row)throw notFound('Active interest entry not found.');
  owner={name:row.owner_name,address:'',mobile:row.mobile??''};pets=row.pets;barangayId=row.residence_barangay_id;linked=row.registry_owner_id??undefined;
 }else if(input.source==='stub'){
  const [row]=await q`select * from ekapon.stub_tickets where id=${input.id} and owner_snapshot is not null and status in ('Issued','Redeemed')`;
  if(!row)throw notFound('Assigned stub not found.');owner=row.owner_snapshot;pets=row.pets_snapshot;barangayId=row.owner_barangay_id;linked=owner.registryOwnerId;
 }else{
  const [row]=await q`select * from ekapon.program_attendance where id=${input.id} and status='Submitted'`;
  if(!row)throw notFound('Submitted attendance not found.');owner=row.owner_snapshot;pets=row.pets_snapshot;barangayId=row.owner_barangay_id;linked=owner.registryOwnerId;
 }
 const [prior]=await q`select owner_record_id from ekapon.registry_intake_links where source=${input.source} and source_id=${input.id}`;
 if(prior)linked=prior.owner_record_id;
 return {reference:`${input.source}:${input.id}`,linkedOwnerId:linked??null,owner:{name:String(owner.name),address:String(owner.address??''),contact:String(owner.mobile??''),barangayId},pets:pets.length?pets.map(p=>({...emptyRegistryPet(),name:p.name??p.petName??'',species:p.species==='Cat'?'Cat' as const:'Dog' as const,sex:p.sex==='Male'?'Male' as const:p.sex==='Female'?'Female' as const:'' as const,ageMonths:p.ageMonths??null,breed:p.breed??'Unknown',breedClass:p.breedClass??'Unknown',vaccinationStatus:healthStatus(p.vaccinationStatus),sterilizationStatus:healthStatus(p.sterilizationStatus),vaccineType:p.vaccineType??'',vaccinationDate:p.vaccinationDate??'',color:p.color??''})): [emptyRegistryPet()]};
}
