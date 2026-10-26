import { z } from 'zod';
import { route, ok, parse } from '../../server/http';
import { sql } from '../../server/db';
import { requireAuth } from '../../server/auth';
import { outputProgram, readPrograms } from '../../server/stubWorkflow';
import { programKpis, type KpiPet } from '../../server/programKpis';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const filtersSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(Number(today().slice(0, 4))),
  barangayId: z.coerce.number().int().positive().optional(),
  programId: z.coerce.number().int().positive().optional(),
});
const yes = (value: unknown) => value === true || ['yes', 'true'].includes(String(value ?? '').toLowerCase());

/** Reports > Analytics: KPI cards, charts, barangay and program tables, reconciliation checks and insights for one year. */
export default route({ GET: async (c) => {
  const session = await requireAuth(c.req, { roles: ['Admin', 'SuperAdmin'] });
  const f = parse(filtersSchema, c.query);
  const b = f.barangayId ?? null;
  return ok(await sql().begin(async (q) => {
    await q`set transaction isolation level repeatable read, read only`;
    const programs = (await readPrograms(q, session))
      .filter((row) => !row.archived && row.record_data._sampleData !== true)
      .map(outputProgram)
      .filter((p) => p.date.startsWith(String(f.year)) && (!f.programId || p.id === f.programId) && (!b || p.hostBarangayId === b || p.allowedBarangays.some((a) => a.id === b)));
    const ids = programs.map((p) => p.id);
    const [stubs, attendance, interest, registry, barangays] = await Promise.all([
      q`select b.campaign_id, t.status, t.owner_barangay_id, jsonb_array_length(coalesce(t.pets_snapshot,'[]'::jsonb))::int as pets
        from ekapon.stub_tickets t join ekapon.stub_batches b on b.id=t.batch_id
        where b.campaign_id=any(${ids}::bigint[]) and t.status in ('Issued','Redeemed') and (${b}::int is null or t.owner_barangay_id=${b})`,
      q`select campaign_id, source, owner_barangay_id, attended_on::text, pets_snapshot from ekapon.program_attendance
        where status='Submitted' and campaign_id=any(${ids}::bigint[]) and (${b}::int is null or owner_barangay_id=${b})`,
      q`select residence_barangay_id, jsonb_array_length(pets)::int as pets from ekapon.program_interest_people
        where status='interested' and extract(year from created_at)=${f.year} and (${b}::int is null or residence_barangay_id=${b})`,
      q`select record_data from ekapon.dashboard_records where dataset='pets' and not archived and coalesce(record_data->>'_sampleData','false')<>'true'
        and (${b}::int is null or record_data->>'barangayId'=${String(b ?? '')})`,
      q`select id, name from ekapon.barangays order by name`,
    ]);
    const kpis = programKpis({
      today: today(),
      barangays: barangays.map((r) => ({ id: r.id, name: r.name })),
      programs: programs.map((p) => ({ id: p.id, title: p.title, date: p.date, status: p.status, hostBarangayId: p.hostBarangayId, hostBarangay: p.hostBarangay, capacity: p.slots })),
      stubs: stubs.map((r) => ({ campaignId: Number(r.campaign_id), status: r.status, barangayId: r.owner_barangay_id, pets: r.pets })),
      attendance: attendance.map((r) => ({ campaignId: Number(r.campaign_id), source: r.source, barangayId: r.owner_barangay_id, attendedOn: r.attended_on, pets: r.pets_snapshot as KpiPet[] })),
      interest: interest.map((r) => ({ barangayId: r.residence_barangay_id, pets: r.pets })),
      registry: registry.map(({ record_data: d }) => ({ barangayId: Number(d.barangayId) || null, species: String(d.species ?? ''), vaccinated: yes(d.vaccinationStatus ?? d.vaccinated ?? d.vaccine_1st), sterilized: yes(d.sterilizationStatus ?? d.sterilized) })),
    });
    return { filters: { year: f.year, barangayId: b, programId: f.programId ?? null }, generatedAt: new Date().toISOString(), generatedBy: session.name, programOptions: programs.map((p) => ({ id: p.id, title: p.title, date: p.date })), ...kpis };
  }));
} });
