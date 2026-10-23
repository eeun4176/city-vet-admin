import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { sql } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { rolesWith } from '../../../shared/permissions';
import { censusRemarks, type SummaryPet } from '../../../shared/censusSummary';

const query = z.object({ barangayId: z.coerce.number().int().positive() });

/** Census summary: one row per owner with dog/cat counts, built from the approved registry. */
export default route({
  GET: async (c) => {
    await requireAuth(c.req, { roles: rolesWith('census.reports') });
    const { barangayId } = parse(query, c.query);
    const [barangay] = await sql()`select id, name::text as name from ekapon.barangays where id = ${barangayId}`;
    const data = await sql()`select * from ekapon.census_summary_v where barangay_id = ${barangayId} order by lower(owner_name)`;
    // Others/Remarks words (booster, other vaccines, mix breed, laps, registration), worded like the Salin workbook.
    const pets = await sql()`select p.owner_id, p.vaccine_other as "vaccineOther", p.booster, p.laps, p.breed_type as "breedType", p.registered_year as "registeredYear"
      from ekapon.registry_pets p join ekapon.registry_owners o on o.id = p.owner_id
     where o.barangay_id = ${barangayId} and o.archived_at is null and p.archived_at is null order by p.created_at, p.id`;
    const byOwner = new Map<string, SummaryPet[]>();
    for (const pet of pets) byOwner.set(pet.owner_id, [...(byOwner.get(pet.owner_id) ?? []), pet as unknown as SummaryPet]);
    return ok({ barangay: barangay ?? null, data: data.map((row) => ({ ...row, remarks: censusRemarks(byOwner.get(row.owner_id) ?? []) })) });
  },
});
