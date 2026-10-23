import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Session } from './auth';
import type { Sql, Tx } from './db';
import { conflict, notFound } from './errors';

const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const text = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const flag = z.boolean().nullable().default(false);

export const todayManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export const petSchema = z.object({
  petName: z.string().trim().min(1, 'Pet name is required').max(80),
  species: z.enum(['Dog', 'Cat']),
  sex: z.enum(['Male', 'Female']),
  ageMonths: z.preprocess(blankToUndefined, z.number().int().min(0).max(600).optional()),
  breedType: z.preprocess(blankToUndefined, z.enum(['Mongrel', 'Mix', 'Pure']).optional()),
  color: text(60),
  sterilized: flag,
  confinement: z.preprocess(blankToUndefined, z.enum(['Confined', 'Semi-confined', 'Free-roaming']).optional()),
  vaccine1st: flag,
  vaccine2nd: flag,
  vaccine3rd: flag,
  vaccineOther: text(120),
  booster: flag,
  laps: flag,
  registeredYear: z.preprocess(blankToUndefined, z.number().int().min(2000).max(2100).optional()),
  remarks: text(300),
});

export const ownerSchema = z.object({
  ownerName: z.string().trim().min(1, 'Owner name is required').max(120),
  address: z.string().trim().min(1, 'Address is required').max(240),
  contact: z.preprocess(blankToUndefined, z.string().trim().regex(/^09\d{2}[-\s]?\d{3}[-\s]?\d{4}$/, 'Use a PH mobile number like 0917-123-4567').optional()),
  pets: z.array(petSchema).min(1, 'Each owner needs at least one pet').max(30),
});

const ownersField = z.array(ownerSchema).max(200).superRefine((owners, ctx) => {
  if (owners.reduce((sum, owner) => sum + owner.pets.length, 0) > 1000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A census submission can hold at most 1,000 pets.' });
  }
});

const censusDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value <= todayManila();
}, 'The census date must be a real date that is not in the future.');

export const createBody = z.object({
  label: z.string().trim().min(1).max(160),
  censusDate,
  source: z.enum(['form', 'csv', 'image']),
  householdsVisited: z.number().int().min(0).max(100000).default(0),
  owners: ownersField.default([]),
}).refine((body) => body.source === 'image' || body.owners.length > 0, { message: 'Add at least one owner.', path: ['owners'] });

export const updateBody = z.object({
  label: z.string().trim().min(1).max(160).optional(),
  censusDate: censusDate.optional(),
  householdsVisited: z.number().int().min(0).max(100000).optional(),
  owners: ownersField.optional(),
}).refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change.' });

export type OwnerInput = z.infer<typeof ownerSchema>;
export type PetInput = z.infer<typeof petSchema>;

const PET_COLUMNS = ['id', 'owner_id', 'line_no', 'pet_name', 'species', 'sex', 'age_months', 'breed_type', 'color', 'sterilized',
  'confinement', 'vaccine_1st', 'vaccine_2nd', 'vaccine_3rd', 'vaccine_other', 'booster', 'laps', 'registered_year', 'remarks'];

/** Multi-row insert helper: one round trip per table keeps big censuses inside Vercel's time limit. */
const rows = (q: Sql | Tx, data: Record<string, unknown>[], ...columns: string[]) =>
  (q as unknown as (r: unknown, ...c: string[]) => ReturnType<Sql>)(data, ...columns);

/** Replaces all owners and pets of a submission. Owner decisions start again as "pending". */
export async function writeContent(conn: Sql | Tx, submissionId: string, owners: OwnerInput[]): Promise<void> {
  const q = conn as unknown as Sql;
  await q`delete from ekapon.census_owners where submission_id = ${submissionId}::uuid`;
  if (!owners.length) return;
  const ownerRows = owners.map((owner, index) => ({
    id: randomUUID(), submission_id: submissionId, line_no: index + 1,
    owner_name: owner.ownerName, address: owner.address, contact: owner.contact ?? null,
  }));
  await q`insert into ekapon.census_owners ${rows(q, ownerRows, 'id', 'submission_id', 'line_no', 'owner_name', 'address', 'contact')}`;
  const petRows = owners.flatMap((owner, index) => owner.pets.map((pet, line) => ({
    id: randomUUID(), owner_id: ownerRows[index].id, line_no: line + 1, pet_name: pet.petName, species: pet.species, sex: pet.sex,
    age_months: pet.ageMonths ?? null, breed_type: pet.breedType ?? null, color: pet.color ?? null, sterilized: pet.sterilized,
    confinement: pet.confinement ?? null, vaccine_1st: pet.vaccine1st, vaccine_2nd: pet.vaccine2nd, vaccine_3rd: pet.vaccine3rd,
    vaccine_other: pet.vaccineOther ?? null, booster: pet.booster, laps: pet.laps, registered_year: pet.registeredYear ?? null,
    remarks: pet.remarks ?? null,
  })));
  await q`insert into ekapon.census_pets ${rows(q, petRows, ...PET_COLUMNS)}`;
}

export const idParam = z.string().uuid();

/** Loads a submission the person may see (Paravets only their own); `mutate` also requires it to be pending. */
export async function accessSubmission(conn: Sql | Tx, id: string, session: Session, mutate = false) {
  const q = conn as unknown as Sql;
  const [row] = await q`
    select id, barangay_id, submitted_by, status, source, label
      from ekapon.census_submissions where id = ${id}::uuid`;
  if (!row || (session.type === 'Paravet' && row.submitted_by !== session.id)) throw notFound('Census submission not found.');
  if (mutate && row.status !== 'pending') throw conflict('SUBMISSION_LOCKED', 'Only a pending submission can be changed.');
  return row;
}

export const petOut = (row: Record<string, any>) => ({
  id: row.id, lineNo: row.line_no, petName: row.pet_name, species: row.species, sex: row.sex, ageMonths: row.age_months,
  breedType: row.breed_type, color: row.color, sterilized: row.sterilized, confinement: row.confinement,
  vaccine1st: row.vaccine_1st, vaccine2nd: row.vaccine_2nd, vaccine3rd: row.vaccine_3rd, vaccineOther: row.vaccine_other,
  booster: row.booster, laps: row.laps, registeredYear: row.registered_year, remarks: row.remarks,
});

export const submissionOut = (row: Record<string, any>) => ({
  id: row.id, label: row.label, status: row.status, source: row.source, censusDate: row.census_date,
  householdsVisited: row.households_visited, barangayId: row.barangay_id, barangay: row.barangay, submitter: row.submitter_name,
  createdAt: row.created_at, reviewerName: row.reviewer_name, reviewedAt: row.reviewed_at, reviewNote: row.review_note,
  resubmitsId: row.resubmits_id,
  ownerCount: row.owner_count, petCount: row.pet_count, attachmentCount: row.attachment_count,
});

/** One submission with its counts, or undefined. */
export async function fetchSubmission(conn: Sql | Tx, id: string) {
  const q = conn as unknown as Sql;
  const [row] = await q`
    select s.id, s.label, s.status, s.source, s.census_date, s.households_visited, s.barangay_id, b.name as barangay,
           s.submitter_name, s.created_at, s.reviewer_name, s.reviewed_at, s.review_note, s.resubmits_id,
           (select count(*)::int from ekapon.census_owners o where o.submission_id = s.id) as owner_count,
           (select count(*)::int from ekapon.census_pets p join ekapon.census_owners o on o.id = p.owner_id where o.submission_id = s.id) as pet_count,
           (select count(*)::int from ekapon.census_attachments a where a.submission_id = s.id) as attachment_count
      from ekapon.census_submissions s join ekapon.barangays b on b.id = s.barangay_id
     where s.id = ${id}::uuid`;
  return row;
}
