import { SignJWT, jwtVerify } from 'jose';
import { config } from './config';
import { conflict, notFound, unprocessable } from './errors';
import { registryHash, publicRegistryData } from './registry';
import { petOut } from './census';
import { censusActionEffect, matchAction, type CensusAction, type CensusApprovalPlan } from '../shared/censusReview';

const secret = () => new TextEncoder().encode(config().jwtSecret);
const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
const hash = (v: unknown) => registryHash(canonical(v));
const sign = (actor: number, claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: 'HS256' })
  .setSubject(String(actor)).setIssuedAt().setExpirationTime('10m').sign(secret());
async function verify(token: string | undefined, actor: number, purpose: string, state: string) {
  try {
    const { payload } = await jwtVerify(token ?? '', secret(), { algorithms: ['HS256'] });
    if (payload.sub === String(actor) && payload.purpose === purpose && payload.state === state) return;
  } catch { /* A fresh comparison or approval summary is required. */ }
  throw conflict('CENSUS_REVIEW_CHANGED', 'The census or registry details changed, or the review expired. Open the latest comparison or approval summary again.');
}

async function registryContext(q: any, ids: string[]) {
  if (!ids.length) return { owners: [] as any[], pets: [] as any[], workspace: [] as any[] };
  const owners = await q`select * from ekapon.registry_owners where id=any(${ids}::uuid[]) order by id`;
  const pets = await q`select * from ekapon.registry_pets where owner_id=any(${ids}::uuid[]) order by id`;
  const workspace = await q`select coalesce(p.owner_id,l.source_id) as owner_id,
    jsonb_build_object('id',d.dataset||':'||d.record_id,'record_data',d.record_data,'archived',d.archived) as snapshot
    from ekapon.registry_source_links l join ekapon.dashboard_records d on d.dataset=l.dataset and d.record_id=l.record_id
    left join ekapon.registry_pets p on l.dataset='pets' and p.id=l.source_id
    where (l.dataset='owners' and l.source_id=any(${ids}::uuid[])) or (l.dataset='pets' and p.owner_id=any(${ids}::uuid[]))
    order by d.dataset,d.record_id`;
  return { owners, pets, workspace };
}
const incomingState = (owner: any, submission: any) => ({ id: owner.id, owner_name: owner.owner_name, address: owner.address,
  contact: owner.contact, line_no: owner.line_no, submission_id: submission.id, barangay_id: submission.barangay_id, census_date: submission.census_date, label: submission.label });
function matchedState(incoming: any, incomingPets: any[], context: Awaited<ReturnType<typeof registryContext>>, matchId: string, action: string) {
  const existing = context.owners.find((o: any) => o.id === matchId && o.barangay_id === incoming.barangay_id && !o.archived_at);
  if (!existing) throw unprocessable('MATCH_NOT_FOUND', 'Choose an active registry owner in this census barangay.');
  const existingPets = context.pets.filter((p: any) => p.owner_id === matchId);
  const workspace = context.workspace.filter((r: any) => r.owner_id === matchId).map((r: any) => r.snapshot);
  const fingerprint = hash({ incoming, incomingPets, existing, existingPets, workspace, action });
  const petView = (p: any) => {
    const { id, lineNo: _line, petName, ...fields } = petOut(p);
    return { id, name: petName, archived: !!p.archived_at, fields };
  };
  const view = (o: any, pets: any[]) => ({ id: o.id, name: o.owner_name, address: o.address, contact: o.contact, pets: pets.map(petView) });
  // Include visible workspace extensions (e.g. breed) in the comparison as well as its fingerprint.
  const extra = new Map(workspace.map((r: any) => [String(r.record_data?._censusSourceId ?? ''), publicRegistryData(r.record_data ?? {})]));
  const existingView = view(existing, existingPets);
  existingView.pets = existingView.pets.map((p: any) => {
    const extension = extra.get(p.id) as Record<string, unknown> | undefined;
    return { ...p, fields: { ...(extension?.breed ? { breed: extension.breed } : {}),
      ...(extension?.age !== undefined && extension.age !== null ? { 'legacy age (unit unconfirmed)': extension.age } : {}), ...p.fields } };
  });
  return { fingerprint, incoming: view(incoming, incomingPets), existing: existingView };
}
export async function matchState(q: any, submissionId: string, ownerId: string, matchId: string, action: string) {
  const [row] = await q`select o.id,o.owner_name,o.address,o.contact,o.line_no,s.id as submission_id,s.barangay_id,s.census_date,s.label
    from ekapon.census_owners o join ekapon.census_submissions s on s.id=o.submission_id
    where o.id=${ownerId}::uuid and s.id=${submissionId}::uuid`;
  if (!row) throw notFound('Owner entry not found in this census.');
  const incomingPets = await q`select * from ekapon.census_pets where owner_id=${ownerId}::uuid order by id`;
  const incoming = incomingState(row, { ...row, id: row.submission_id });
  return matchedState(incoming, incomingPets, await registryContext(q, [matchId]), matchId, action);
}
export async function comparison(q: any, actor: number, submissionId: string, ownerId: string, matchId: string, action: CensusAction) {
  const state = await matchState(q, submissionId, ownerId, matchId, action);
  return { incoming: state.incoming, existing: state.existing, effect: censusActionEffect[action],
    token: await sign(actor, { purpose: 'census-match', state: state.fingerprint }) };
}
export async function verifyComparison(q: any, actor: number, submissionId: string, item: { ownerId: string; matchedOwnerId?: string | null; decision: string; comparisonToken?: string }) {
  const state = await matchState(q, submissionId, item.ownerId, item.matchedOwnerId!, item.decision);
  await verify(item.comparisonToken, actor, 'census-match', state.fingerprint);
  return state.fingerprint;
}

export async function approvalPlan(q: any, actor: number, id: string): Promise<CensusApprovalPlan & { fingerprint: string }> {
  const [submission] = await q`select id,status,label,census_date,barangay_id,households_visited from ekapon.census_submissions where id=${id}::uuid`;
  if (!submission) throw notFound('Census submission not found.');
  const owners = await q`select o.*, (select count(*)::int from ekapon.census_pets p where p.owner_id=o.id) as pet_count,
    r.owner_name as match_name from ekapon.census_owners o left join ekapon.registry_owners r on r.id=o.matched_owner_id
    where o.submission_id=${id}::uuid order by o.line_no`;
  const pets = await q`select p.* from ekapon.census_pets p join ekapon.census_owners o on o.id=p.owner_id where o.submission_id=${id}::uuid order by p.id`;
  // Load matched records in three queries for the entire sheet, not once per owner.
  const context = await registryContext(q, [...new Set<string>(owners.filter((o: any) => matchAction(o.decision) && o.matched_owner_id).map((o: any) => o.matched_owner_id))]);
  const counts = { pending: 0, new: 0, merge: 0, replace: 0, keep: 0, reject: 0 };
  const issues: string[] = [];
  if (submission.status !== 'pending') issues.push('Only a pending census can receive a new approval.');
  if (!owners.length) issues.push('Encode at least one owner and pet before approval.');
  const targets = new Set<string>();
  const currentMatches: string[] = [];
  for (const owner of owners) {
    counts[owner.decision as CensusAction]++;
    if (matchAction(owner.decision)) {
      if (!owner.matched_owner_id || !owner.decision_reason || owner.decision_reason.trim().length < 3 || !owner.match_fingerprint) {
        issues.push(`${owner.owner_name}: compare a selected owner and enter a reason.`); continue;
      }
      try {
        const current = matchedState(incomingState(owner, submission), pets.filter((p: any) => p.owner_id === owner.id), context, owner.matched_owner_id, owner.decision);
        currentMatches.push(current.fingerprint);
        if (current.fingerprint !== owner.match_fingerprint) issues.push(`${owner.owner_name}: the compared records changed. Compare them again.`);
      } catch { issues.push(`${owner.owner_name}: the selected registry owner is no longer available.`); }
      if (targets.has(owner.matched_owner_id)) issues.push(`${owner.owner_name}: more than one entry targets the same owner. Resolve the repeated entries before approval.`);
      targets.add(owner.matched_owner_id);
    }
  }
  if (counts.pending) issues.push('Save a decision for every owner before approval.');
  if (!counts.new && !counts.merge && !counts.replace) issues.push('No owner or pet data would be applied. Reject this submission instead.');
  const fingerprint = hash({ submission, owners, pets, currentMatches });
  return { fingerprint, token: issues.length ? null : await sign(actor, { purpose: 'census-approval', state: fingerprint }), ready: !issues.length, issues, counts,
    petCount: pets.length, owners: owners.map((o: any) => ({ id: o.id, name: o.owner_name, decision: o.decision, petCount: o.pet_count,
      matchName: o.match_name, reason: o.decision_reason, effect: censusActionEffect[o.decision as CensusAction] })) };
}
export async function verifyApproval(q: any, actor: number, id: string, token?: string) {
  const plan = await approvalPlan(q, actor, id);
  if (!plan.ready) throw unprocessable('CENSUS_DECISIONS_REQUIRED', plan.issues.join(' '));
  await verify(token, actor, 'census-approval', plan.fingerprint);
}
