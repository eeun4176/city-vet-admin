import { randomUUID } from 'node:crypto';
import type { Session } from './auth';
import { conflict,notFound } from './errors';
import { normalizeIdentity,publicRegistryData } from './registry';
/** A link is explicit and verified by ID. Names never create a registry link. */
export async function logOwnerLink(q:any,session:Session,id:string|undefined,action:'interest-linked'|'stub-linked'|'attendance-linked'|'pets-linked'|'pets-unlinked',reference:string,expected:{name:string;barangayId:number}){
 if(!id)return;
 const [owner]=await q`select d.*,b.id as barangay_id from ekapon.dashboard_records d join ekapon.barangays b on lower(b.name)=lower(btrim(d.record_data->>'barangay')) where d.dataset='owners' and d.record_id=${id} and not d.archived for share of d`;
 if(!owner||owner.record_data._sampleData===true)throw notFound('Selected owner is not available.');
 if(owner.barangay_id!==expected.barangayId||normalizeIdentity(owner.record_data.name)!==normalizeIdentity(expected.name))throw conflict('OWNER_LINK_CHANGED','The selected owner changed. Select the owner again before saving.');
 const request=randomUUID(),snapshot=publicRegistryData(owner.record_data);
 await q`insert into ekapon.registry_requests(request_id,actor_id,payload_hash,result) values(${request}::uuid,${session.id},${reference},${q.json({action,reference,ownerId:id})})`;
 await q`insert into ekapon.registry_activity(request_id,record_id,actor_id,action,reason,before_data,after_data) values(${request}::uuid,${owner.id},${session.id},${action},${reference},${q.json(snapshot)},${q.json({...snapshot,linkedEvent:reference,linkedBarangayId:expected.barangayId})})`;
}
