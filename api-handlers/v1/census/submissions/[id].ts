import { z } from 'zod';
import { route, ok, parse } from '../../../../server/http';
import { sql, tx } from '../../../../server/db';
import { requireAuth } from '../../../../server/auth';
import { can } from '../../../../shared/permissions';
import { conflict, forbidden } from '../../../../server/errors';
import { registryLock } from '../../../../server/registry';
import { accessSubmission, fetchSubmission, idParam, petOut, submissionOut, updateBody, writeContent } from '../../../../server/census';

const deleteQuery = z.object({ permanent: z.enum(['true', 'false']).default('false') });

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const id = parse(idParam, c.query.id);
    await accessSubmission(sql(), id, session);
    const submission = await fetchSubmission(sql(), id);
    const owners = await sql()`
      select id, line_no, owner_name, address, contact, decision, matched_owner_id,decision_reason,applied_owner_id,match_fingerprint
        from ekapon.census_owners where submission_id = ${id}::uuid order by line_no`;
    const pets = await sql()`
      select p.* from ekapon.census_pets p join ekapon.census_owners o on o.id = p.owner_id
       where o.submission_id = ${id}::uuid order by p.owner_id, p.line_no`;
    const candidates = session.type === 'Paravet' ? [] : await sql()`select * from ekapon.census_owner_candidates(${id}::uuid)
      union select o.id,r.id,r.owner_name,r.address,(select count(*) from ekapon.registry_pets p where p.owner_id=r.id and p.archived_at is null)
      from ekapon.census_owners o join ekapon.registry_owners r on r.id=o.matched_owner_id
      where o.submission_id=${id}::uuid and r.barangay_id=${submission.barangay_id} and r.archived_at is null`;
    const attachments = await sql()`
      select a.id, a.mime, coalesce(octet_length(a.image),f.bytes)::int as bytes, a.created_at
        from ekapon.census_attachments a left join ekapon.private_files f on f.id=a.file_id
        where a.submission_id = ${id}::uuid order by a.id`;
    const results = submission.status === 'approved' ? await sql()`select o.id,l.record_id
      from ekapon.census_owners o join ekapon.registry_owners r on r.id=case when o.decision='keep' then o.matched_owner_id when o.decision in ('new','merge','replace') then o.applied_owner_id end
      join ekapon.registry_source_links l on l.dataset='owners' and l.source_id=r.id
      where o.submission_id=${id}::uuid and r.archived_at is null
        and (${session.type !== 'Paravet'} or r.barangay_id=${session.barangayId ?? null})` : [];
    const decisionHistory = session.type === 'Paravet' ? [] : await sql()`select id,actor_name as actor,before_data as before,after_data as after,created_at as "createdAt"
      from ekapon.census_decision_activity where submission_id=${id}::uuid order by id desc limit 100`;
    return ok({
      submission: submissionOut(submission),
      owners: owners.map((owner) => ({
        id: owner.id, lineNo: owner.line_no, ownerName: owner.owner_name, address: owner.address, contact: owner.contact,
        decision: owner.decision, matchedOwnerId: owner.matched_owner_id,
        decisionReason: owner.decision_reason, matchReviewed: !!owner.match_fingerprint,
        registryOwnerId: results.find((r) => r.id === owner.id)?.record_id ?? null,
        pets: pets.filter((pet) => pet.owner_id === owner.id).map(petOut),
        candidates: candidates.filter((candidate) => candidate.census_owner_id === owner.id).map((candidate) => ({
          registryOwnerId: candidate.registry_owner_id, ownerName: candidate.owner_name, address: candidate.address, petCount: candidate.pet_count,
        })),
      })),
      attachments: attachments.map((a) => ({ id: a.id, mime: a.mime, bytes: a.bytes, createdAt: a.created_at })),
      decisionHistory,
    });
  },

  /** Paravets fix their own pending submission; staff can encode owners from the photos of an image submission. */
  PATCH: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const id = parse(idParam, c.query.id);
    const body = parse(updateBody, c.body);
    await tx(session.id, async (q) => {
      await registryLock(q);
      await q`select id from ekapon.census_submissions where id=${id}::uuid for update`;
      await accessSubmission(q, id, session, true);
      await q`
        update ekapon.census_submissions
           set label = coalesce(${body.label ?? null}, label),
               census_date = coalesce(${body.censusDate ?? null}::date, census_date),
               households_visited = coalesce(${body.householdsVisited ?? null}::int, households_visited)
         where id = ${id}::uuid`;
      if (body.owners) await writeContent(q, id, body.owners);
    });
    return ok({ submission: submissionOut(await fetchSubmission(sql(), id)) });
  },

  /** Paravet: withdraw your own pending submission. With the delete permission: `?permanent=true` removes any unapproved one. */
  DELETE: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const id = parse(idParam, c.query.id);
    const { permanent } = parse(deleteQuery, c.query);
    if (permanent === 'true') {
      if (!can({ role: session.type, grants: session.grants }, 'census.delete')) {
        throw forbidden('Deleting a census submission needs special access from SuperAdmin.');
      }
      await tx(session.id, async (q) => {
        await registryLock(q);
        await q`select id from ekapon.census_submissions where id=${id}::uuid for update`;
        const row = await accessSubmission(q, id, session);
        if (row.status === 'approved') throw conflict('SUBMISSION_APPROVED', 'An approved submission cannot be deleted.');
        await q`delete from ekapon.census_submissions where id = ${id}::uuid`;
      });
      return ok({ deleted: true });
    }
    if (session.type !== 'Paravet') throw forbidden('Only the Paravet who submitted this census can withdraw it.');
    await tx(session.id, async (q) => {
      await registryLock(q);
      await q`select id from ekapon.census_submissions where id=${id}::uuid for update`;
      await accessSubmission(q, id, session, true);
      await q`update ekapon.census_submissions set status = 'withdrawn' where id = ${id}::uuid`;
    });
    return ok({ withdrawn: true });
  },
}, { maxBody: 600_000 });
