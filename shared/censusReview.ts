export type CensusAction = 'pending' | 'new' | 'merge' | 'replace' | 'keep' | 'reject';
export type CensusReviewRecord = { id: string; name: string; address?: string | null; contact?: string | null; archived?: boolean; fields?: Record<string, unknown>; pets: CensusReviewPet[] };
export type CensusReviewPet = { id: string; name: string; archived?: boolean; fields: Record<string, unknown> };
export type CensusComparison = { incoming: CensusReviewRecord; existing: CensusReviewRecord; token: string; effect: string };
export type CensusApprovalPlan = {
  token: string | null; ready: boolean; issues: string[];
  counts: Record<CensusAction, number>; petCount: number;
  owners: { id: string; name: string; decision: CensusAction; petCount: number; matchName: string | null; reason: string | null; effect: string }[];
};
export const matchAction = (action: string) => ['merge', 'replace', 'keep'].includes(action);
export const censusActionLabel: Record<CensusAction, string> = {
  pending: 'Choose an action', new: 'Create a separate owner and pets', merge: 'Combine with a confirmed owner',
  replace: 'Update a confirmed owner from this census', keep: 'Keep existing records unchanged', reject: 'Exclude this owner entry',
};
export const censusActionEffect: Record<CensusAction, string> = {
  pending: 'No decision has been saved.',
  new: 'Create a separate owner and all submitted pets. Existing records stay unchanged.',
  merge: 'Keep existing owner details and known pet details; fill missing details and combine recorded Yes flags. Active pets with the same name and species are treated as matches. Other submitted pets are added.',
  replace: 'Update the confirmed owner’s address and supplied contact. Update active pets with the same name and species from this census, including unknown vaccination and sterilization flags; other submitted pets are added. Other linked pets remain.',
  keep: 'Do not apply this owner’s census details or pets. Keep the selected registry owner and its pets unchanged.',
  reject: 'Do not publish this owner entry or its pets. The submission entry stays in history.',
};
export function censusReviewValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
export const censusReviewLabels: Record<string, string> = {
  species: 'Species', sex: 'Sex', ageMonths: 'Age (months)', breedType: 'Breed type', color: 'Color', sterilized: 'Sterilized',
  confinement: 'Classification', vaccine1st: '1st vaccination', vaccine2nd: '2nd vaccination', vaccine3rd: '3rd vaccination',
  vaccineOther: 'Other vaccination', booster: 'Booster', laps: 'LAPS', registeredYear: 'Registered year', remarks: 'Remarks',
};
