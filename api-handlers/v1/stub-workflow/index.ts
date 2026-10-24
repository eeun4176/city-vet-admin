import { PET_BREEDS } from '../../../shared/petReferences';
import { readPrivateFile, storePrivateFile } from '../../../server/privateFiles';
import { logOwnerLink } from '../../../server/ownerHistory';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { route,ok,parse } from '../../../server/http';
import { sql,tx,type Tx } from '../../../server/db';
import { requireAuth,type Session } from '../../../server/auth';
import { conflict,forbidden,notFound,unprocessable } from '../../../server/errors';
import { jsonValue } from '../../../server/dashboard';
import { ownerSchema,stubPetSchema,attendancePetSchema,realDateSchema,canonicalOwner,payloadHash,ownerIdentity,
  getProgram,readPrograms,outputProgram,ensureIssuable,ensureAttendanceAllowed,ensureOwnerScope,ensurePetProcesses,
  outputBatch,outputTicket,outputAttendance,overlappingAttendance,normalizedName,petsPerStub } from '../../../server/stubWorkflow';
import type { StubOwner,AttendancePet,StubProgram,StubPet } from '../../../shared/stubs';
const id=z.number().int().positive();
const reason=z.string().trim().min(3).max(1000);
const note=z.string().trim().max(1000).optional();
const actual={requestId:z.string().uuid(),attendedOn:realDateSchema,owner:ownerSchema,confirmDuplicate:z.boolean().default(false),duplicateReason:reason.optional(),lateEntryReason:reason.optional()};
const actions=z.discriminatedUnion('action',[
  z.object({action:z.literal('generate-batches'),campaignId:id,barangayIds:z.array(id).min(1).max(62),quantity:z.number().int().min(1).max(500),note}),
  z.object({action:z.literal('attach-pdf'),batchId:id,filename:z.string().min(1).max(160),data:z.string().max(4200000)}),
  z.object({action:z.literal('request-batch'),campaignId:id,quantity:z.number().int().min(1).max(500),recipientId:id,note}),
  z.object({action:z.literal('review-batch'),batchId:id,decision:z.enum(['approve','reject']),quantity:z.number().int().min(1).max(500).optional(),note}),
  z.object({action:z.literal('confirm-print'),batchId:id}),
  z.object({action:z.literal('handover'),batchId:id}),
  z.object({action:z.literal('send-to-barangay'),batchId:id}),
  z.object({action:z.literal('issue-from-interest'),batchId:id}),
  z.object({action:z.literal('issue'),stubId:id,owner:ownerSchema,pets:z.array(stubPetSchema).min(1).max(3),interestPersonId:id.optional()}),
  z.object({action:z.literal('cancel-stub'),stubId:id,reason}),
  z.object({action:z.literal('confirm-owner'),stubId:id,ownerName:z.string().trim().min(1).max(120)}),
  z.object({action:z.literal('redeem'),stubId:id,...actual,pets:z.array(attendancePetSchema).min(1).max(3)}),
  z.object({action:z.literal('walk-in'),campaignId:id,...actual,pets:z.array(attendancePetSchema).min(1).max(10)}),
  z.object({action:z.literal('void-attendance'),attendanceId:id,reason}),
]);
const list=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20),q:z.string().trim().max(120).default('')});
const parseId=(value:unknown)=>parse(z.coerce.number().int().positive(),value);
const admin=(session:Session)=>{if(session.type==='Paravet') throw forbidden('An Admin must complete this step.');};
async function audit(q:Tx,session:Session,campaignId:number,action:string,batchId:number|null=null,stubId:number|null=null,attendanceId:number|null=null) {
  await q`insert into ekapon.stub_activity(campaign_id,batch_id,stub_id,attendance_id,actor_id,action)
    values(${campaignId},${batchId},${stubId},${attendanceId},${session.id},${action})`;
}
async function batch(q:any,session:Session,batchId:number,lock=false):Promise<any> {
  const [row]=await q`select b.*,bg.name as barangay,
    (select count(*)::int from ekapon.stub_tickets t where t.batch_id=b.id and t.issued_at is not null) as issued_count,
    (select count(*)::int from ekapon.stub_tickets t where t.batch_id=b.id and t.status='Redeemed') as redeemed_count,
    (select count(*)::int from ekapon.stub_tickets t where t.batch_id=b.id and t.status='Available') as available_count,
    (select count(*)::int from ekapon.stub_tickets t where t.batch_id=b.id and t.status='Cancelled') as cancelled_count
    from ekapon.stub_batches b join ekapon.barangays bg on bg.id=b.barangay_id
    where b.id=${batchId} and (${session.type!=='Paravet'} or b.barangay_id=${session.barangayId ?? -1})`;
  if(!row) throw notFound('Stub batch not found.');
  if(lock) {
    await q`select id from ekapon.stub_batches where id=${batchId} for update`;
    return batch(q,session,batchId);
  }
  return row;
}
async function ticket(q:any,session:Session,stubId:number|null,code:string|null=null,lock=false):Promise<any> {
  const [row]=await q`select t.*,b.campaign_id,b.recipient_id,b.barangay_id as batch_barangay_id,b.status as batch_status
    from ekapon.stub_tickets t join ekapon.stub_batches b on b.id=t.batch_id
    join ekapon.program_interest_campaigns c on c.id=b.campaign_id
    where (${stubId}::bigint is null or t.id=${stubId}) and (${code}::text is null or t.code=${code})
      and (${session.type!=='Paravet'} or (
        (c.host_barangay_id=${session.barangayId ?? -1} or exists(select 1 from ekapon.program_interest_allowed_barangays a where a.campaign_id=c.id and a.barangay_id=${session.barangayId ?? -1}))
        and ((t.owner_barangay_id=${session.barangayId ?? -1}) or (t.owner_barangay_id is null and b.barangay_id=${session.barangayId ?? -1}))))`;
  if(!row) throw notFound('Stub not found in your assigned area.');
  if(lock) {
    await q`select id from ekapon.stub_tickets where id=${row.id} for update`;
    return ticket(q,session,row.id);
  }
  return row;
}
async function recipient(q:any,program:StubProgram,recipientId:number,session:Session) {
  if(session.type==='Paravet' && recipientId!==session.id) throw forbidden('Request batches for yourself only.');
  const [person]=await q`select id,full_name,barangay_id from ekapon.accounts where id=${recipientId}
    and account_type='Paravet' and status='Active' and archived_at is null for share`;
  if(!person) throw unprocessable('INVALID_RECIPIENT','Choose an active Paravet assigned to a participating barangay.');
  if(person.barangay_id!==program.hostBarangayId && !program.allowedBarangays.some((b)=>b.id===person.barangay_id)) throw unprocessable('RECIPIENT_BARANGAY_NOT_ELIGIBLE','This Paravet is not assigned to a participating barangay.');
  if(session.type==='Paravet' && person.barangay_id!==session.barangayId) throw forbidden();
  return person;
}
async function mirrorAttendance(q:Tx,attendanceId:number,program:StubProgram,source:string,attendedOn:string,owner:StubOwner,pets:AttendancePet[],session:Session) {
  const [barangay]=await q`select name from ekapon.barangays where id=${owner.barangayId}`;
  for(const [index,pet] of pets.entries()) {
    const recordId=`QRATT-${attendanceId}-${index+1}`;
    const effectiveOutcomes=pet.processes.map((process)=>pet.processOutcomes?.[process] ?? pet.outcome);
    const participantOutcome=new Set(effectiveOutcomes).size>1
      ? (effectiveOutcomes.includes('Completed') ? 'Partially completed' : 'Mixed outcomes') : effectiveOutcomes[0];
    const base={id:recordId,workflow:'qr-stubs-v1',attendanceId,campaignId:program.id,source,date:attendedOn,program:program.title,programDate:program.date,
      owner:owner.name,owner_name:owner.name,clientName:owner.name,mobile:owner.mobile,address:owner.address,barangay:barangay.name,barangayId:owner.barangayId,
      petName:pet.name,pet_name:pet.name,species:pet.species,sex:pet.sex ?? '',age:pet.ageMonths===undefined ? '' : pet.ageMonths/12,ageMonths:pet.ageMonths ?? null,
      processes:pet.processes,process:pet.processes.join(', '),processOutcomes:pet.processOutcomes ?? {},status:participantOutcome,outcome:participantOutcome,paravet:session.name,paravet_id:String(session.id),provider:session.name};
    await q`insert into ekapon.dashboard_records(dataset,record_id,record_data,archived) values('participants',${recordId},${q.json(jsonValue(base))},false)`;
    for(const [processIndex,process] of pet.processes.entries()) {
      if((pet.processOutcomes?.[process] ?? pet.outcome)!=='Completed') continue;
      const serviceId=`${recordId}-${processIndex+1}`;
      await q`insert into ekapon.dashboard_records(dataset,record_id,record_data,archived)
        values('services',${serviceId},${q.json(jsonValue({...base,id:serviceId,service:process,procedureType:process,process,status:'Completed',outcome:'Completed'}))},false)`;
    }
  }
}
export default route({
  GET:async(c)=>{
    const session=await requireAuth(c.req,{roles:['SuperAdmin','Admin','Paravet']});
    const f=parse(list,c.query),offset=(f.page-1)*f.pageSize;
    if(c.query.mode==='batch' || c.query.mode==='print' || c.query.mode==='pdf') {
      const b=await batch(sql(),session,parseId(c.query.batchId));
      const {program,row}=await getProgram(sql(),b.campaign_id,session);
      if(c.query.mode==='pdf'){if(!b.external_pdf && !b.external_pdf_file_id)throw notFound('No uploaded PDF is available. Use Print / save PDF.');const file=b.external_pdf_file_id?await readPrivateFile(b.external_pdf_file_id):null;return ok({filename:b.external_pdf_name,data:file?.data ?? Buffer.from(b.external_pdf).toString('base64')});}
    if(c.query.mode==='print') {
        ensureIssuable(program,row);
        if(!['Approved','Printed','Handed over'].includes(b.status)) throw conflict('BATCH_NOT_APPROVED','Approve this batch before printing.');
        // The slip shows the requested services, never pet names; the owner writes their name on it.
        const stubs=await sql()`select id,code,owner_snapshot->>'name' as "ownerName",status,owner_confirmed_at as "ownerConfirmedAt",
          coalesce((select jsonb_agg(distinct process) from jsonb_array_elements(coalesce(pets_snapshot,'[]'::jsonb)) pet cross join lateral jsonb_array_elements_text(pet->'processes') process),'[]'::jsonb) as services
          from ekapon.stub_tickets where batch_id=${b.id} and status in ('Available','Issued') order by id`;
        return ok({batch:{...outputBatch(b),note:null,reviewNote:null},program,stubs});
      }
      const [stubs,[count]]=await Promise.all([
        sql()`select t.*,${b.campaign_id}::bigint as campaign_id,${b.barangay_id}::int as batch_barangay_id from ekapon.stub_tickets t where batch_id=${b.id} order by id limit ${f.pageSize} offset ${offset}`,
        sql()`select count(*)::int as total from ekapon.stub_tickets where batch_id=${b.id}`,
      ]);
      return ok({batch:outputBatch(b),program,stubs:stubs.map(outputTicket),page:f.page,pageSize:f.pageSize,total:count.total});
    }
    if(c.query.mode==='lookup') {
      const code=parse(z.string().regex(/^CVS1\.[A-Za-z0-9_-]{22}$/),c.query.code);
      const t=await ticket(sql(),session,null,code);
      const {program}=await getProgram(sql(),t.campaign_id,session);
      return ok({stub:outputTicket(t),program});
    }
    if(c.query.mode==='day-pack') {
      // Every stub of the program the user may scan, so program day works with no signal.
      const campaignId=parseId(c.query.campaignId),{program}=await getProgram(sql(),campaignId,session);
      const rows=await sql()`select t.id,t.code,t.status,t.owner_snapshot,t.pets_snapshot,t.redeemed_at,b.barangay_id as batch_barangay_id
        from ekapon.stub_tickets t join ekapon.stub_batches b on b.id=t.batch_id
        where b.campaign_id=${campaignId} and b.status in ('Approved','Printed','Handed over') and t.status in ('Available','Issued','Redeemed')
          and (${session.type!=='Paravet'} or t.owner_barangay_id=${session.barangayId ?? -1} or (t.owner_barangay_id is null and b.barangay_id=${session.barangayId ?? -1}))
        order by t.id`;
      return ok({program,generatedAt:new Date().toISOString(),stubs:rows.map((r)=>({id:r.id,code:r.code,status:r.status,owner:r.owner_snapshot,pets:r.pets_snapshot,redeemedAt:r.redeemed_at,barangayId:r.batch_barangay_id}))});
    }
    if(c.query.mode==='issued') {
      const campaignId=parseId(c.query.campaignId),{program}=await getProgram(sql(),campaignId,session);
      const rows=await sql()`select t.*,b.campaign_id,b.barangay_id as batch_barangay_id from ekapon.stub_tickets t join ekapon.stub_batches b on b.id=t.batch_id
        where b.campaign_id=${campaignId} and t.status='Issued' and (${session.type!=='Paravet'} or t.owner_barangay_id=${session.barangayId ?? -1})
          and (${f.q}='' or t.owner_snapshot->>'name' ilike ${`%${f.q}%`}) order by t.issued_at desc,t.id desc limit 50`;
      return ok({program,stubs:rows.map(outputTicket)});
    }
    if(c.query.mode==='attendance') {
      const campaignId=parseId(c.query.campaignId),{program}=await getProgram(sql(),campaignId,session);
      const [rows,[count],[summary]]=await Promise.all([
        sql()`select * from ekapon.program_attendance where campaign_id=${campaignId} and (${session.type!=='Paravet'} or (owner_barangay_id=${session.barangayId ?? -1} or encoded_by=${session.id}))
          and (${f.q}='' or owner_snapshot->>'name' ilike ${`%${f.q}%`}) order by created_at desc,id desc limit ${f.pageSize} offset ${offset}`,
        sql()`select count(*)::int as total from ekapon.program_attendance where campaign_id=${campaignId} and (${session.type!=='Paravet'} or (owner_barangay_id=${session.barangayId ?? -1} or encoded_by=${session.id})) and (${f.q}='' or owner_snapshot->>'name' ilike ${`%${f.q}%`})`,
        sql()`select count(*)::int as owners,coalesce(sum(jsonb_array_length(pets_snapshot)),0)::int as pets,
          coalesce(sum((select count(*) from jsonb_array_elements(pets_snapshot) p
            cross join lateral jsonb_array_elements_text(p->'processes') process(value)
            where coalesce(p->'processOutcomes'->>process.value,p->>'outcome')='Completed')),0)::int as "completedServices"
          from ekapon.program_attendance where campaign_id=${campaignId} and status='Submitted' and (${session.type!=='Paravet'} or (owner_barangay_id=${session.barangayId ?? -1} or encoded_by=${session.id}))`,
      ]);
      return ok({program,data:rows.map(outputAttendance),page:f.page,pageSize:f.pageSize,total:count.total,summary});
    }
    if(c.query.mode) throw unprocessable('INVALID_MODE','Choose a valid stub workflow view.');
    const campaignId=c.query.campaignId === undefined ? null : parseId(c.query.campaignId);
    if(campaignId!==null) await getProgram(sql(),campaignId,session);
    const [programRows,paravets,batches,[count]]=await Promise.all([
      readPrograms(sql(),session,campaignId),
      sql()`select a.id,a.full_name as name,a.barangay_id as "barangayId",b.name as barangay from ekapon.accounts a join ekapon.barangays b on b.id=a.barangay_id
        where a.account_type='Paravet' and a.status='Active' and a.archived_at is null and (${session.type!=='Paravet'} or a.id=${session.id})
          and (${campaignId}::bigint is null or exists(select 1 from ekapon.program_interest_campaigns c where c.id=${campaignId} and (c.host_barangay_id=b.id or exists(select 1 from ekapon.program_interest_allowed_barangays ab where ab.campaign_id=c.id and ab.barangay_id=b.id)))) order by b.name,a.full_name`,
      sql()`select b.*,bg.name as barangay,(select count(*)::int from ekapon.stub_tickets t where t.batch_id=b.id and t.issued_at is not null) as issued_count,
        (select count(*)::int from ekapon.stub_tickets t where t.batch_id=b.id and t.status='Redeemed') as redeemed_count,
        (select count(*)::int from ekapon.stub_tickets t where t.batch_id=b.id and t.status='Available') as available_count,
        (select count(*)::int from ekapon.stub_tickets t where t.batch_id=b.id and t.status='Cancelled') as cancelled_count
        from ekapon.stub_batches b join ekapon.barangays bg on bg.id=b.barangay_id
        where (${session.type!=='Paravet'} or b.barangay_id=${session.barangayId ?? -1})
          and (${campaignId}::bigint is null or b.campaign_id=${campaignId})
          and (${f.q}='' or b.reference ilike ${`%${f.q}%`} or b.recipient_name ilike ${`%${f.q}%`} or b.program_snapshot->>'title' ilike ${`%${f.q}%`})
        order by b.created_at desc,b.id desc limit ${f.pageSize} offset ${offset}`,
      sql()`select count(*)::int as total from ekapon.stub_batches b where (${session.type!=='Paravet'} or b.barangay_id=${session.barangayId ?? -1})
        and (${campaignId}::bigint is null or b.campaign_id=${campaignId})
        and (${f.q}='' or b.reference ilike ${`%${f.q}%`} or b.recipient_name ilike ${`%${f.q}%`} or b.program_snapshot->>'title' ilike ${`%${f.q}%`})`,
    ]);
    return ok({role:session.type,assignedBarangayId:session.barangayId,programs:programRows.map(outputProgram),paravets,batches:batches.map(outputBatch),page:f.page,pageSize:f.pageSize,total:count.total});
  },
  POST:async(c)=>{
    const session=await requireAuth(c.req,{roles:['SuperAdmin','Admin','Paravet']});
    const input=parse(actions,c.body);
    if(['generate-batches','attach-pdf','review-batch','handover','cancel-stub','void-attendance','send-to-barangay','issue-from-interest'].includes(input.action)) admin(session);
    if(input.action==='attach-pdf'){
      await batch(sql(),session,input.batchId);
      const bytes=Buffer.from(input.data,'base64');
      if(!/\.pdf$/i.test(input.filename)||bytes.length>3*1024*1024||bytes.toString('base64')!==input.data||bytes.subarray(0,5).toString()!=='%PDF-')throw unprocessable('PDF_REQUIRED','Choose a valid PDF up to 3 MB.');
      const fileId=await storePrivateFile(bytes,'application/pdf','stubs');
      await tx(session.id,async(q)=>{
        const b=await batch(q,session,input.batchId,true);
        await q`update ekapon.stub_batches set external_pdf=${fileId?null:bytes},external_pdf_file_id=${fileId}::uuid,external_pdf_name=${input.filename} where id=${b.id}`;
        await q`select ekapon.workflow_notice(${b.campaign_id}::bigint,${b.barangay_id}::int,'Stub PDF available','An Admin provided a PDF for your barangay batch.',${`/stubs?campaignId=${b.campaign_id}&batchId=${b.id}`})`;
      });
      return ok({saved:true});
    }
    return ok(await tx(session.id,async(q)=>{
      if('pets' in input)for(const pet of input.pets){
        if(pet.breed&&!PET_BREEDS[pet.species].includes(pet.breed as never)){const [ref]=await q`select name from ekapon.pet_breed_references where species=${pet.species} and name=${pet.breed} and active`;if(!ref)throw unprocessable('BREED_REQUIRED','Select a standardized breed.');}
        if(pet.vaccinationDate&&(!realDateSchema.safeParse(pet.vaccinationDate).success||pet.vaccinationDate>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'})))throw unprocessable('INVALID_VACCINATION_DATE','Use a real vaccination date, today or earlier.');
      }
      if(input.action==='generate-batches'){
        const {program,row}=await getProgram(q,input.campaignId,session,true);ensureIssuable(program,row);
        const batchIds:number[]=[];
        for(const area of [...new Set(input.barangayIds)]){
          if(area!==program.hostBarangayId&&!program.allowedBarangays.some(b=>b.id===area))throw unprocessable('BARANGAY_NOT_ELIGIBLE','Select participating barangays only.');
          const [person]=await q`select id,full_name from ekapon.accounts where account_type='Paravet' and status='Active' and archived_at is null and barangay_id=${area} order by id limit 1`;
          if(!person)throw unprocessable('PARAVET_REQUIRED','Assign an active Paravet to each selected barangay first.');
          const reference=`SB-${new Date().getFullYear()}-${randomBytes(6).toString('hex').toUpperCase()}`;
          const [b]=await q`insert into ekapon.stub_batches(reference,campaign_id,recipient_id,recipient_name,barangay_id,requested_quantity,approved_quantity,status,note,program_snapshot,requested_by,reviewed_by,reviewed_at) values(${reference},${program.id},${person.id},${person.full_name},${area},${input.quantity},${input.quantity},'Approved',${input.note||null},${q.json(jsonValue(program))},${session.id},${session.id},now()) returning id`;
          const tokens=Array.from({length:input.quantity},()=>({batch_id:b.id,code:`CVS1.${randomBytes(16).toString('base64url')}`}));
          await q`insert into ekapon.stub_tickets ${q(tokens,'batch_id','code')}`;
          await audit(q,session,program.id,'batch-approved',b.id);
          await q`select ekapon.workflow_notice(${program.id}::bigint,${area}::int,'Stubs ready',${`${program.title}: your barangay batch is available. Open to assign owners, print or save PDF.`},${`/stubs?campaignId=${program.id}&batchId=${b.id}`})`;
          batchIds.push(b.id);
        }
        return {saved:true,batchIds};
      }
      if(input.action==='request-batch') {
        const {program,row}=await getProgram(q,input.campaignId,session,true);ensureIssuable(program,row);
        const person=await recipient(q,program,input.recipientId,session);
        const reference=`SB-${new Date().getFullYear()}-${randomBytes(6).toString('hex').toUpperCase()}`;
        const [b]=await q`insert into ekapon.stub_batches(reference,campaign_id,recipient_id,recipient_name,barangay_id,requested_quantity,note,program_snapshot,requested_by)
          values(${reference},${program.id},${person.id},${person.full_name},${person.barangay_id},${input.quantity},${input.note || null},${q.json(jsonValue(program))},${session.id}) returning id`;
        await audit(q,session,program.id,'batch-requested',b.id);return {batchId:b.id,reference};
      }
      if(input.action==='review-batch' || input.action==='confirm-print' || input.action==='handover') {
        const before=await batch(q,session,input.batchId);
        const {program,row}=await getProgram(q,before.campaign_id,session,true);
        const b=await batch(q,session,input.batchId,true);
        if(input.action!=='review-batch' || input.decision!=='reject') {
          ensureIssuable(program,row);
          const assigned=input.action==='review-batch'?await recipient(q,program,b.recipient_id,session):{barangay_id:b.barangay_id};
          if(assigned.barangay_id!==b.barangay_id) throw conflict('RECIPIENT_ASSIGNMENT_CHANGED','This Paravet has changed barangay assignments. Request a new batch for the current assignment.');
        }
        if(input.action==='review-batch') {
          if(b.status!=='Requested') throw conflict('BATCH_ALREADY_REVIEWED','This request has already been reviewed.');
          if(input.decision==='reject') {
            if(!input.note || input.note.trim().length<3) throw unprocessable('REVIEW_REASON_REQUIRED','Explain why this request was rejected.');
            await q`update ekapon.stub_batches set status='Rejected',review_note=${input.note},reviewed_by=${session.id},reviewed_at=now() where id=${b.id} and status='Requested'`;
            await audit(q,session,program.id,'batch-rejected',b.id);
          } else {
            const quantity=input.quantity ?? b.requested_quantity;
            await q`update ekapon.stub_batches set status='Approved',approved_quantity=${quantity},review_note=${input.note || null},reviewed_by=${session.id},reviewed_at=now() where id=${b.id} and status='Requested'`;
            const tokens=Array.from({length:quantity},()=>({batch_id:b.id,code:`CVS1.${randomBytes(16).toString('base64url')}`}));
            await q`insert into ekapon.stub_tickets ${q(tokens,'batch_id','code')}`;
            await audit(q,session,program.id,'batch-approved',b.id);
            await q`select ekapon.workflow_notice(${program.id}::bigint,${b.barangay_id}::int,'Stubs ready',${`${program.title}: approved stubs are ready to assign, print or save PDF.`},${`/stubs?campaignId=${program.id}&batchId=${b.id}`})`;
          }
        } else if(input.action==='confirm-print') {
          if(!['Approved','Printed','Handed over'].includes(b.status)) throw conflict('BATCH_NOT_APPROVED','Approve this batch before confirming printing.');
          if(b.status==='Approved') await q`update ekapon.stub_batches set status='Printed',printed_by=${session.id},printed_at=now() where id=${b.id} and status='Approved'`;
          await audit(q,session,program.id,b.status==='Approved'?'batch-printed':'batch-reprinted',b.id);
        } else {
          if(b.status!=='Printed') throw conflict('BATCH_NOT_PRINTED','Confirm printing before handing this batch to the Paravet.');
          await q`update ekapon.stub_batches set status='Handed over',handed_over_by=${session.id},handed_over_at=now() where id=${b.id} and status='Printed'`;
          await audit(q,session,program.id,'batch-handed-over',b.id);
        }
        return {saved:true,batchId:b.id,reference:b.reference};
      }
      if(input.action==='send-to-barangay' || input.action==='issue-from-interest') {
        const before=await batch(q,session,input.batchId);
        const {program,row}=await getProgram(q,before.campaign_id,session,true);
        const b=await batch(q,session,input.batchId,true);
        ensureIssuable(program,row);
        if(!['Approved','Printed','Handed over'].includes(b.status)) throw conflict('BATCH_NOT_APPROVED','Approve this batch first.');
        if(input.action==='send-to-barangay') {
          await q`update ekapon.stub_batches set sent_by=${session.id},sent_at=now() where id=${b.id}`;
          await audit(q,session,program.id,'batch-sent',b.id);
          await q`select ekapon.workflow_notice(${program.id}::bigint,${b.barangay_id}::int,'Stubs to print',${`${program.title}: City Vet sent your barangay's stubs. Print them in Salin.`},${`/stubs?campaignId=${program.id}&batchId=${b.id}`})`;
          return {saved:true,batchId:b.id};
        }
        // Named stubs for the barangay's interested owners without one yet; an owner is issued only when every one of their stubs fits.
        const people=await q`select p.id,p.owner_name,p.mobile,p.residence_barangay_id,p.pets,p.registry_owner_id from ekapon.program_interest_people p
          where p.campaign_id=${program.id} and p.status='interested' and p.residence_barangay_id=${b.barangay_id}
            and not exists(select 1 from ekapon.stub_tickets t where t.interest_person_id=p.id and t.status in ('Issued','Redeemed'))
          order by p.created_at,p.id`;
        const free=[...await q`select id from ekapon.stub_tickets where batch_id=${b.id} and status='Available' order by id for update`];
        let issued=0,withoutPets=0,waiting=0;
        for(const person of people) {
          const pets=(person.pets as StubPet[]).map((pet)=>({...pet,processes:pet.processes.filter((process)=>program.processes.includes(process))})).filter((pet)=>pet.processes.length);
          if(!pets.length){withoutPets++;continue;}
          const chunks=petsPerStub(pets);
          if(free.length<chunks.length){waiting++;continue;}
          const owner=canonicalOwner({registryOwnerId:person.registry_owner_id ?? undefined,name:person.owner_name,mobile:person.mobile ?? '',address:'',barangayId:person.residence_barangay_id});
          for(const chunk of chunks) {
            const t=free.shift()!;
            await q`update ekapon.stub_tickets set status='Issued',owner_snapshot=${q.json(jsonValue(owner))},pets_snapshot=${q.json(jsonValue(chunk))},owner_barangay_id=${owner.barangayId},
              interest_person_id=${person.id},issued_by=${session.id},issued_at=now() where id=${t.id} and status='Available'`;
            await audit(q,session,program.id,'stub-issued',b.id,t.id);
            issued++;
          }
        }
        if(issued) await q`select ekapon.workflow_notice(${program.id}::bigint,${b.barangay_id}::int,'Stubs issued',${`${program.title}: ${issued} named stubs were issued from your barangay's request.`},${`/stubs?campaignId=${program.id}&batchId=${b.id}`})`;
        return {issued,ownersWithoutPets:withoutPets,ownersNeedingMoreStubs:waiting};
      }
      if(input.action==='confirm-owner') {
        // The paravet encodes the name the owner wrote on the printed stub; resending the same name is harmless.
        const previous=await ticket(q,session,input.stubId),{program}=await getProgram(q,previous.campaign_id,session,true);
        const t=await ticket(q,session,input.stubId,null,true);
        if(t.status!=='Issued') throw conflict('STUB_NOT_ISSUED','Only an issued, unused stub can have its owner name confirmed.');
        const name=input.ownerName.replace(/\s+/g,' ');
        await q`update ekapon.stub_tickets set owner_snapshot=owner_snapshot || ${q.json({name})},owner_confirmed_at=now() where id=${t.id}`;
        await audit(q,session,program.id,'owner-confirmed',t.batch_id,t.id);
        return {saved:true,stubId:t.id};
      }
      if(input.action==='issue' || input.action==='cancel-stub') {
        const previous=await ticket(q,session,input.stubId),{program,row}=await getProgram(q,previous.campaign_id,session,true);
        const t=await ticket(q,session,input.stubId,null,true);
        if(input.action==='cancel-stub') {
          if(!['Available','Issued'].includes(t.status)) throw conflict('STUB_NOT_CANCELLABLE','A redeemed or cancelled stub cannot be cancelled.');
          await q`update ekapon.stub_tickets set status='Cancelled',cancelled_by=${session.id},cancelled_at=now(),cancel_reason=${input.reason} where id=${t.id} and status in ('Available','Issued')`;
          await audit(q,session,program.id,'stub-cancelled',t.batch_id,t.id);
        } else {
          ensureIssuable(program,row);
          if(session.type==='Paravet' && t.batch_barangay_id!==session.barangayId) throw forbidden('Issue stubs only from a batch handed to you.');
          if(!['Approved','Printed','Handed over'].includes(t.batch_status)) throw conflict('BATCH_NOT_APPROVED','An Admin must approve this batch before issuance.');
          if(t.status!=='Available') throw conflict('STUB_ALREADY_ISSUED','This stub has already been issued, redeemed, or cancelled.');
          const owner=canonicalOwner(input.owner);ensureOwnerScope(program,session,owner);ensurePetProcesses(program,input.pets);
          if(owner.barangayId!==t.batch_barangay_id) throw unprocessable('STUB_BATCH_BARANGAY_MISMATCH','Use a stub allocated to the owner’s residence barangay.');
          if(input.interestPersonId) {
            const [person]=await q`select id,owner_name from ekapon.program_interest_people where id=${input.interestPersonId} and campaign_id=${program.id} and residence_barangay_id=${owner.barangayId} and status='interested'`;
            if(!person || normalizedName(person.owner_name)!==normalizedName(owner.name)) throw unprocessable('INVALID_INTEREST_PERSON','Choose the same interested owner from this program and residence barangay.');
          }
          await q`update ekapon.stub_tickets set status='Issued',owner_snapshot=${q.json(jsonValue(owner))},pets_snapshot=${q.json(jsonValue(input.pets))},owner_barangay_id=${owner.barangayId},
            interest_person_id=${input.interestPersonId ?? null},issued_by=${session.id},issued_at=now() where id=${t.id} and status='Available'`;
          await logOwnerLink(q,session,owner.registryOwnerId,'stub-linked',`Stub ${t.id} · program ${program.id}`,{name:owner.name,barangayId:owner.barangayId});
          await q`select ekapon.workflow_notice(${program.id}::bigint,${t.batch_barangay_id}::int,'Stub issued',${`${owner.name} has been assigned a stub for ${program.title}. Printing now includes the owner name.`},${`/stubs?campaignId=${program.id}&batchId=${t.batch_id}`})`;
          await audit(q,session,program.id,'stub-issued',t.batch_id,t.id);
        }
        return {saved:true,stubId:t.id};
      }
      if(input.action==='void-attendance') {
        const [prior]=await q`select campaign_id from ekapon.program_attendance where id=${input.attendanceId}`;
        if(!prior) throw notFound('Attendance record not found.');
        await getProgram(q,prior.campaign_id,session,true);
        const [a]=await q`select * from ekapon.program_attendance where id=${input.attendanceId} for update`;
        if(a.status==='Voided') throw conflict('ATTENDANCE_ALREADY_VOIDED','This attendance has already been voided.');
        await q`update ekapon.program_attendance set status='Voided',voided_by=${session.id},voided_at=now(),void_reason=${input.reason} where id=${a.id} and status='Submitted'`;
        await q`update ekapon.dashboard_records set archived=true,updated_at=now() where record_data->>'workflow'='qr-stubs-v1' and record_data->>'attendanceId'=${String(a.id)}`;
        await audit(q,session,a.campaign_id,'attendance-voided',null,a.stub_id,a.id);
        return {saved:true,attendanceId:a.id};
      }
      // A request lock serializes retries even when they race before the first row exists.
      await q`select pg_advisory_xact_lock(hashtext(${`stub-attendance:${input.requestId}`}))`;
      const owner=canonicalOwner(input.owner);
      const hash=payloadHash({action:input.action,...(input.action==='redeem'?{stubId:input.stubId}:{campaignId:input.campaignId}),attendedOn:input.attendedOn,owner,pets:input.pets});
      const [existing]=await q`select id,encoded_by,payload_hash,campaign_id,owner_barangay_id from ekapon.program_attendance where request_id=${input.requestId}::uuid`;
      if(existing) {
        await getProgram(q,existing.campaign_id,session);
        if(existing.encoded_by!==session.id || existing.payload_hash!==hash || false) throw conflict('REQUEST_ID_REUSED','This request reference already belongs to another submission.');
        return {attendanceId:existing.id,reference:`ATT-${existing.id}`,replayed:true};
      }
      const prior=input.action==='redeem'?await ticket(q,session,input.stubId):null;
      const campaignId=input.action==='walk-in'?input.campaignId:prior!.campaign_id;
      const {program,row}=await getProgram(q,campaignId,session,true);
      ensureAttendanceAllowed(program,row,session,input.attendedOn,input.lateEntryReason);
      if(input.action!=='walk-in')ensureOwnerScope(program,session,owner);
      else{const [area]=await q`select id from ekapon.barangays where id=${owner.barangayId}`;if(!area)throw unprocessable('BARANGAY_REQUIRED','Choose an official residence barangay.');}
      ensurePetProcesses(program,input.pets);
      const t=prior?await ticket(q,session,input.action==='redeem'?input.stubId:null,null,true):null;
      if(t && !['Issued','Available'].includes(t.status)) throw conflict('STUB_NOT_REDEEMABLE','This stub has already been redeemed or cancelled and cannot be reused.');
      if(t&&!['Approved','Printed','Handed over'].includes(t.batch_status)) throw conflict('BATCH_NOT_APPROVED','An Admin must approve this batch before recording use.');
      if(t?.status==='Available' && owner.barangayId!==t.batch_barangay_id) throw unprocessable('STUB_BATCH_BARANGAY_MISMATCH','Use a stub allocated to the owner’s residence barangay.');
      if(t?.status==='Issued') {
        if(t.owner_barangay_id!==owner.barangayId || normalizedName(t.owner_snapshot.name)!==normalizedName(owner.name)) {
          throw unprocessable('STUB_OWNER_MISMATCH','Use the owner recorded when this stub was issued. Ask an Admin to cancel and replace an incorrectly issued stub.');
        }
        const issuedPets=t.pets_snapshot as AttendancePet[];
        if(input.pets.some((pet)=>!issuedPets.some((issued)=>normalizedName(issued.name)===normalizedName(pet.name) && issued.species===pet.species
          && (!issued.sex || !pet.sex || issued.sex===pet.sex)))) {
          throw unprocessable('STUB_PET_MISMATCH','Use the pets recorded for this issued stub. Ask an Admin to cancel and replace a stub with incorrect pet details.');
        }
      }
      const candidates=await q`select a.id,a.owner_snapshot,a.pets_snapshot,a.attended_on,a.source,b.name as barangay
        from ekapon.program_attendance a join ekapon.barangays b on b.id=a.owner_barangay_id
        where a.campaign_id=${campaignId} and a.status='Submitted' and a.owner_barangay_id=${owner.barangayId}
          and (a.owner_identity=${ownerIdentity(owner)} or (${owner.mobile}<>'' and a.owner_snapshot->>'mobile'=${owner.mobile}))`;
      const duplicates=candidates.filter((candidate)=>overlappingAttendance(owner,input.pets,candidate));
      if(duplicates.length && !input.confirmDuplicate) throw conflict('DUPLICATE_ATTENDANCE','Possible repeat owner and pet processes were recorded in this program. Review the matches before saving.',{
        candidates:duplicates.map((a)=>({attendanceId:a.id,ownerName:a.owner_snapshot.name,attendedOn:a.attended_on,source:a.source,barangay:a.barangay,petNames:(a.pets_snapshot as AttendancePet[]).map((pet)=>pet.name)}))});
      if(duplicates.length && (!input.duplicateReason || input.duplicateReason.trim().length<3)) throw unprocessable('DUPLICATE_REASON_REQUIRED','Explain why this separate attendance should be kept.');
      const source=t?'Stub':'Walk-in';
      const [a]=await q`insert into ekapon.program_attendance(request_id,payload_hash,campaign_id,source,stub_id,owner_snapshot,owner_identity,owner_barangay_id,pets_snapshot,program_snapshot,
        attended_on,duplicate_confirmed,duplicate_reason,late_entry_reason,encoded_by,encoded_by_name)
        values(${input.requestId}::uuid,${hash},${campaignId},${source},${t?.id ?? null},${q.json(jsonValue(owner))},${ownerIdentity(owner)},${owner.barangayId},${q.json(jsonValue(input.pets))},${q.json(jsonValue(program))},
          ${input.attendedOn}::date,${duplicates.length>0 && input.confirmDuplicate},${duplicates.length?input.duplicateReason ?? null:null},${input.lateEntryReason ?? null},${session.id},${session.name}) returning id`;
      if(t) {
        if(t.status==='Available') {
          const assessedPets=input.pets.map(({outcome:_outcome,processOutcomes:_processOutcomes,...pet})=>pet);
          await q`update ekapon.stub_tickets set status='Issued',owner_snapshot=${q.json(jsonValue(owner))},pets_snapshot=${q.json(jsonValue(assessedPets))},owner_barangay_id=${owner.barangayId},
            issued_by=${session.id},issued_at=now() where id=${t.id} and status='Available'`;
          await audit(q,session,campaignId,'manual-issue-recorded',t.batch_id,t.id);
        }
        const changed=await q`update ekapon.stub_tickets set status='Redeemed',redeemed_by=${session.id},redeemed_at=now() where id=${t.id} and status='Issued' returning id`;
        if(!changed.length) throw conflict('STUB_NOT_REDEEMABLE','This stub has already been redeemed.');
      }
      await logOwnerLink(q,session,owner.registryOwnerId,'attendance-linked',`Attendance ${a.id} · program ${program.id}`,{name:owner.name,barangayId:owner.barangayId});
      await mirrorAttendance(q,a.id,program,source,input.attendedOn,owner,input.pets,session);
      await audit(q,session,campaignId,t?'stub-redeemed':'walk-in-submitted',t?.batch_id ?? null,t?.id ?? null,a.id);
      return {attendanceId:a.id,reference:`ATT-${a.id}`,saved:true};
    }));
  },
}, {maxBody:4400000});
