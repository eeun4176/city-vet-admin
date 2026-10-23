import type { client } from './harness';
type Call = ReturnType<typeof client>;
export async function approvalToken(call: Call, id: string, cookie: string) {
  const result = await call('GET', `/api/v1/census/submissions/${id}/decisions`, { cookie });
  if (result.status !== 200) throw new Error(JSON.stringify(result.json));
  return result.json.token;
}
export async function reviewedMatch(call: Call, id: string, cookie: string, ownerId: string, matchedOwnerId: string, decision = 'merge') {
  const result = await call('GET', `/api/v1/census/submissions/${id}/decisions?ownerId=${ownerId}&matchedOwnerId=${matchedOwnerId}&decision=${decision}`, { cookie });
  if (result.status !== 200) throw new Error(JSON.stringify(result.json));
  return { ownerId, matchedOwnerId, decision, comparisonToken: result.json.token, reason: 'Verified the synthetic owner and pet identities against the sheet' };
}
