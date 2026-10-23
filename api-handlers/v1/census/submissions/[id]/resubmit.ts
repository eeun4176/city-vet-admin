import { route, created, parse } from '../../../../../server/http';
import { tx } from '../../../../../server/db';
import { requireAuth } from '../../../../../server/auth';
import { conflict } from '../../../../../server/errors';
import { accessSubmission, idParam } from '../../../../../server/census';

/** Paravet: copy a rejected submission into a new pending one so it can be corrected and sent again. */
export default route({
  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['Paravet'] });
    const id = parse(idParam, c.query.id);
    const newId = await tx(session.id, async (q) => {
      const source = await accessSubmission(q, id, session);
      if (source.status !== 'rejected') throw conflict('NOT_REJECTED', 'Only a rejected submission can be sent again.');
      const [existing] = await q`
        select id from ekapon.census_submissions where resubmits_id = ${id}::uuid and status in ('pending', 'approved')`;
      if (existing) throw conflict('ALREADY_RESUBMITTED', 'This submission was already sent again.');
      const [copy] = await q`
        insert into ekapon.census_submissions (barangay_id, submitted_by, submitter_name, source, census_date, label, households_visited, resubmits_id)
        select barangay_id, ${session.id}, ${session.name}, source, census_date, label, households_visited, id
          from ekapon.census_submissions where id = ${id}::uuid
        returning id`;
      await q`
        with mapped as (
          select o.id as old_id, gen_random_uuid() as new_id, o.line_no, o.owner_name, o.address, o.contact
            from ekapon.census_owners o where o.submission_id = ${id}::uuid),
        new_owners as (
          insert into ekapon.census_owners (id, submission_id, line_no, owner_name, address, contact)
          select new_id, ${copy.id}::uuid, line_no, owner_name, address, contact from mapped returning id)
        insert into ekapon.census_pets (owner_id, line_no, pet_name, species, sex, age_months, breed_type, color, sterilized,
            confinement, vaccine_1st, vaccine_2nd, vaccine_3rd, vaccine_other, booster, laps, registered_year, remarks)
        select m.new_id, p.line_no, p.pet_name, p.species, p.sex, p.age_months, p.breed_type, p.color, p.sterilized,
               p.confinement, p.vaccine_1st, p.vaccine_2nd, p.vaccine_3rd, p.vaccine_other, p.booster, p.laps, p.registered_year, p.remarks
          from mapped m join ekapon.census_pets p on p.owner_id = m.old_id`;
      await q`
        insert into ekapon.census_attachments (submission_id, mime, image, file_id, uploaded_by)
        select ${copy.id}::uuid, mime, image, file_id, ${session.id} from ekapon.census_attachments where submission_id = ${id}::uuid`;
      await q`select ekapon.notify_census_submitted(${copy.id}::uuid)`;
      return copy.id as string;
    });
    return created({ id: newId });
  },
});
