export type Species = 'Dog' | 'Cat';
export type Sex = 'Male' | 'Female';

export interface PetDraft {
  key: string; petName: string; species: Species; sex: Sex; ageYears: string; ageMonths: string;
  breedType: '' | 'Mongrel' | 'Mix' | 'Pure'; color: string; sterilized: boolean|null;
  confinement: '' | 'Confined' | 'Semi-confined' | 'Free-roaming';
  vaccine1st: boolean|null; vaccine2nd: boolean|null; vaccine3rd: boolean|null; vaccineOther: string;
  booster: boolean|null; laps: boolean|null; registeredYear: string; remarks: string;
}
export interface OwnerDraft { key: string; ownerName: string; address: string; contact: string; pets: PetDraft[] }

/** What the API accepts and returns for a pet. */
export interface PetPayload {
  petName: string; species: Species; sex: Sex; ageMonths?: number | null; breedType?: string | null; color?: string | null;
  sterilized: boolean|null; confinement?: string | null; vaccine1st: boolean|null; vaccine2nd: boolean|null; vaccine3rd: boolean|null;
  vaccineOther?: string | null; booster: boolean|null; laps: boolean|null; registeredYear?: number | null; remarks?: string | null;
}
export interface OwnerPayload { ownerName: string; address: string; contact?: string | null; pets: PetPayload[] }

export type CensusStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export type CensusSource = 'form' | 'csv' | 'image';
export interface SubmissionSummary {
  id: string; label: string; status: CensusStatus; source: CensusSource; censusDate: string; householdsVisited: number;
  barangayId: number; barangay: string; submitter: string; createdAt: string; reviewerName: string | null;
  reviewedAt: string | null; reviewNote: string | null; resubmitsId: string | null; ownerCount: number; petCount: number; attachmentCount: number;
}
export type Decision = 'pending' | 'new' | 'merge' | 'replace' | 'keep' | 'reject';
export interface OwnerDetail extends OwnerPayload {
  id: string; lineNo: number; decision: Decision; matchedOwnerId: string | null;
  decisionReason: string | null; matchReviewed: boolean; registryOwnerId: string | null;
  pets: (PetPayload & { id: string })[];
  candidates: { registryOwnerId: string; ownerName: string; address: string; petCount: number }[];
}
export interface SubmissionDetail {
  submission: SubmissionSummary; owners: OwnerDetail[]; attachments: { id: number; mime: string; bytes: number }[];
  decisionHistory: { id: number; actor: string; before: Record<string, unknown>; after: Record<string, unknown>; createdAt: string }[];
}

let counter = 0;
const key = () => `k${Date.now().toString(36)}${counter++}`;

export const emptyPet = (): PetDraft => ({
  key: key(), petName: '', species: 'Dog', sex: 'Male', ageYears: '', ageMonths: '', breedType: '', color: '', sterilized: null,
  confinement: '', vaccine1st: null, vaccine2nd: null, vaccine3rd: null, vaccineOther: '', booster: null, laps: null, registeredYear: '', remarks: '',
});
export const emptyOwner = (): OwnerDraft => ({ key: key(), ownerName: '', address: '', contact: '', pets: [emptyPet()] });

const orUndefined = (value: string) => (value.trim() === '' ? undefined : value.trim());

export function toPayload(owners: OwnerDraft[]): OwnerPayload[] {
  return owners.map((owner) => ({
    ownerName: owner.ownerName.trim(), address: owner.address.trim(), contact: orUndefined(owner.contact),
    pets: owner.pets.map((pet) => {
      const years = pet.ageYears.trim() === '' ? null : Number(pet.ageYears);
      const months = pet.ageMonths.trim() === '' ? null : Number(pet.ageMonths);
      return {
        petName: pet.petName.trim(), species: pet.species, sex: pet.sex,
        ageMonths: years === null && months === null ? undefined : (years ?? 0) * 12 + (months ?? 0),
        breedType: pet.breedType || undefined, color: orUndefined(pet.color), sterilized: pet.sterilized,
        confinement: pet.confinement || undefined, vaccine1st: pet.vaccine1st, vaccine2nd: pet.vaccine2nd, vaccine3rd: pet.vaccine3rd,
        vaccineOther: orUndefined(pet.vaccineOther), booster: pet.booster, laps: pet.laps,
        registeredYear: pet.registeredYear ? Number(pet.registeredYear) : undefined, remarks: orUndefined(pet.remarks),
      };
    }),
  }));
}

export function fromDetail(owners: OwnerPayload[]): OwnerDraft[] {
  return owners.map((owner) => ({
    key: key(), ownerName: owner.ownerName, address: owner.address, contact: owner.contact ?? '',
    pets: owner.pets.map((pet) => ({
      key: key(), petName: pet.petName, species: pet.species, sex: pet.sex,
      ageYears: pet.ageMonths == null ? '' : String(Math.floor(pet.ageMonths / 12)), ageMonths: pet.ageMonths == null ? '' : String(pet.ageMonths % 12),
      breedType: (pet.breedType as PetDraft['breedType']) ?? '', color: pet.color ?? '', sterilized: pet.sterilized,
      confinement: (pet.confinement as PetDraft['confinement']) ?? '', vaccine1st: pet.vaccine1st, vaccine2nd: pet.vaccine2nd,
      vaccine3rd: pet.vaccine3rd, vaccineOther: pet.vaccineOther ?? '', booster: pet.booster, laps: pet.laps,
      registeredYear: pet.registeredYear == null ? '' : String(pet.registeredYear), remarks: pet.remarks ?? '',
    })),
  }));
}

export const todayManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
