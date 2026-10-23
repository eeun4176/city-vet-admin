import type { RegistryPet } from '../../shared/registry';
import { BREED_CLASSES,HEALTH_STATUSES,PET_BREEDS } from '../../shared/petReferences';
import { useApi } from '../lib/useApi';
import { Field,inputCls } from './ui';
export function PetHealthFields({pet,onChange}:{pet:RegistryPet;onChange:(pet:RegistryPet)=>void}){
 const {data}=useApi<{Dog:string[];Cat:string[]}>('/pet-references');
 const breeds=data?.[pet.species]??PET_BREEDS[pet.species];
 const legacy=pet.breed&&!breeds.includes(pet.breed as never);
 return <div className="grid gap-3 sm:grid-cols-2">
  <Field label="Breed classification"><select required className={inputCls} value={pet.breedClass??'Unknown'} onChange={e=>onChange({...pet,breedClass:e.target.value as RegistryPet['breedClass']})}>{BREED_CLASSES.map(v=><option key={v}>{v}</option>)}</select></Field>
  <Field label="Breed" hint={legacy?`Previous value: ${pet.breed}. Select a standardized breed.`:undefined}><select required className={inputCls} value={legacy?'':pet.breed||'Unknown'} onChange={e=>onChange({...pet,breed:e.target.value})}>{legacy&&<option value="">Choose breed</option>}{breeds.map(v=><option key={v}>{v}</option>)}</select></Field>
  <Field label="Vaccinated? (required)"><select required className={inputCls} value={pet.vaccinationStatus??'Unknown'} onChange={e=>onChange({...pet,vaccinationStatus:e.target.value as RegistryPet['vaccinationStatus']})}>{HEALTH_STATUSES.map(v=><option key={v}>{v}</option>)}</select></Field>
  <Field label="Castrated / spayed? (required)"><select required className={inputCls} value={pet.sterilizationStatus??'Unknown'} onChange={e=>onChange({...pet,sterilizationStatus:e.target.value as RegistryPet['sterilizationStatus']})}>{HEALTH_STATUSES.map(v=><option key={v}>{v}</option>)}</select></Field>
  <Field label="Vaccine type (optional)"><input maxLength={100} className={inputCls} value={pet.vaccineType??''} onChange={e=>onChange({...pet,vaccineType:e.target.value})}/></Field>
  <Field label="Vaccination date (optional)"><input type="date" max={new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'})} className={inputCls} value={pet.vaccinationDate??''} onChange={e=>onChange({...pet,vaccinationDate:e.target.value})}/></Field>
 </div>;
}
