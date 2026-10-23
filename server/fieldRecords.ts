import type { FieldKind, FieldView } from '../shared/fieldRecords';

/** Read-only census response projection. Repeated surveys remain separate visits. */
export const censusRespondentsSql = `select 'CENSUSRESP-'||o.id::text as record_id,
 jsonb_build_object('id','CENSUSRESP-'||o.id::text,'name',o.owner_name,'address',o.address,'contact',o.contact,
 'date',s.census_date::text,'barangay',b.name,'status','Approved','source','Approved census',
 'decision',o.decision,'submissionId',s.id::text,'census',s.label,
 'ownerId',case when o.decision='keep' then kl.record_id else coalesce(l.record_id,kl.record_id) end,
 'petCount',(select count(*)::int from ekapon.census_pets p where p.owner_id=o.id)) as record_data,
 false as archived,s.updated_at as updated_at
 from ekapon.census_owners o join ekapon.census_submissions s on s.id=o.submission_id
 join ekapon.barangays b on b.id=s.barangay_id
 left join ekapon.registry_source_links l on l.dataset='owners' and l.source_id=o.applied_owner_id
 left join ekapon.registry_source_links kl on kl.dataset='owners' and kl.source_id=o.matched_owner_id
 where s.status='approved' and o.decision in ('new','merge','replace','keep')`;

export function fieldSourceSql(kind: FieldKind, view: FieldView, includeVoided = false) {
 if(view==='history')return `select record_id,record_data||jsonb_build_object('id',record_id,'name',coalesce(record_data->>'name',record_data->>'owner',record_data->>'clientName',record_data->>'petName',record_id),'source',case when record_data ? 'sourceFile' or record_data ? 'importBatchId' or record_data->>'recordOrigin'='Historical CSV import' then 'Imported history' else 'Manual / imported history' end) as record_data,archived,updated_at from ekapon.dashboard_records where dataset='${kind}' and coalesce(record_data->>'workflow','') not in ('qr-stubs-v1','standalone-services-v1') and record_id not like 'QRATT-%' and record_id not like 'STANDALONE-%'`;
 if(kind==='respondents')return censusRespondentsSql;
 if(view==='standalone')return `select s.id::text as record_id,jsonb_build_object('id',s.id::text,'name',s.owner_snapshot->>'name','date',s.served_on::text,'barangay',s.owner_snapshot->>'barangay','status',s.status,'source','Standalone visit','ownerId',s.owner_record_id,'provider',s.provider,'location',s.location,'petCount',jsonb_array_length(s.pets_snapshot)) as record_data,s.status='Voided' as archived,s.created_at as updated_at from ekapon.standalone_services s ${includeVoided?'':"where s.status='Submitted'"}`;
 return `select d.record_id,d.record_data||jsonb_build_object('name',coalesce(d.record_data->>'owner',d.record_data->>'clientName',d.record_data->>'petName'),'source',case when a.source='Stub' then 'Program · Stub' else 'Program · Walk-in' end,'entryStatus',a.status,'encodedBy',a.encoded_by_name,'programId',c.program_record_id) as record_data,d.archived,d.updated_at
 from ekapon.dashboard_records d join ekapon.program_attendance a on a.id::text=d.record_data->>'attendanceId'
 join ekapon.program_interest_campaigns c on c.id=a.campaign_id
 where d.dataset='${kind}' and d.record_data->>'workflow'='qr-stubs-v1' ${includeVoided?'':"and a.status='Submitted' and not d.archived"}`;
}
