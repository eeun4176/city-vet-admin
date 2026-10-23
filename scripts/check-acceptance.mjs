import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { readTraditionalCsv } from '../src/lib/traditionalCensus.ts';

// Mutations are allowed only in the separate rehearsal, never the user's fresh practice session.
const practice = JSON.parse(await readFile('tmp/acceptance-rehearsal.json', 'utf8'));
assert.equal(practice.rehearsal, true);
assert.equal(practice.baseUrl, 'http://127.0.0.1:5180');
const startedAt = new Date().toISOString();
const checks = [];
const cookies = {};
async function request(role, path, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await fetch(`${practice.baseUrl}/api/v1${path}`, {
    method, headers: { Origin: practice.baseUrl, ...(cookies[role] ? { Cookie: cookies[role] } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${role} ${method} ${path}: ${response.status} ${JSON.stringify(value)}`);
  return { response, value };
}
async function get(role, path) { return (await request(role, path)).value; }
async function action(role, body, expected = 200) { return (await request(role, '/stub-workflow', body, 'POST', expected)).value; }
function passed(name) { checks.push(name); console.log(`PASS ${name}`); }

for (const [role, account] of Object.entries(practice.accounts)) {
  const { response, value } = await request(role, '/auth/login', { identifier: account.identifier, password: practice.password });
  cookies[role] = response.headers.get('set-cookie').split(';')[0];
  assert.equal(value.account.id, account.id);
}
passed('Real password sign-in: Admin, Super Admin, assigned Paravet, other-barangay Paravet');
const attendancePath = `/stub-workflow?mode=attendance&campaignId=${practice.campaignId}`;
assert.deepEqual((await get('paravet', attendancePath)).summary, { owners: 0, pets: 0, completedServices: 0 });
let workspace = await get('admin', `/program-workspace?id=${practice.programId}`);
assert.ok(workspace.assignedParavets.some(p => p.id === practice.accounts.paravet.id));
assert.ok(!workspace.assignedParavets.some(p => p.id === practice.accounts.otherParavet.id));
await request('otherParavet', `/program-workspace?id=${practice.programId}`, null, 'GET', 404);
await action('paravet', { action: 'review-batch', batchId: practice.pendingBatch.id, decision: 'approve', quantity: 6 }, 403);
await request('paravet', '/program-workspace', { action: 'start', programId: practice.programId, expectedVersion: workspace.program.version, actualAt: new Date().toISOString() }, 'POST', 403);
passed('Empty attendance, assigned roster, and role/barangay restrictions');
await request('paravet', '/program-interest', { action: 'add-interest', campaignId: practice.campaignId, ownerName: 'Practice Interested Owner', residenceBarangayId: practice.host.id, pets: [{ name: 'Practice Interest Pet', species: 'Dog', sex: 'Male', ageMonths: 24, processes: ['Microchipping'] }] }, 'POST', [200, 201]);
assert.deepEqual((await get('paravet', attendancePath)).summary, { owners: 0, pets: 0, completedServices: 0 });
assert.equal((await get('admin', `/stub-workflow?mode=batch&batchId=${practice.handedBatchId}`)).batch.issuedCount, 0);
passed('Program interest records people/pets without issuing a stub or recording attendance');
await action('admin', { action: 'review-batch', batchId: practice.pendingBatch.id, decision: 'approve', quantity: 6 });
await action('admin', { action: 'handover', batchId: practice.pendingBatch.id }, 409);
const print = await get('admin', `/stub-workflow?mode=print&batchId=${practice.pendingBatch.id}`);
assert.equal(print.stubs.length, 6);
assert.ok(print.stubs.every(s => Object.keys(s).sort().join(',') === 'code,id'));
assert.equal((await get('admin', `/stub-workflow?mode=batch&batchId=${practice.pendingBatch.id}`)).batch.status, 'Approved');
await action('admin', { action: 'confirm-print', batchId: practice.pendingBatch.id });
await action('admin', { action: 'handover', batchId: practice.pendingBatch.id });
passed('Approval, private print data, explicit print confirmation, and handover order');
const owner = { name: 'Practice Assessment Owner', mobile: '', address: 'Synthetic assessment address', barangayId: practice.host.id };
const pets = [
  { name: 'Practice Assessment Milo', species: 'Dog', sex: 'Male', ageMonths: 24, processes: ['Microchipping', 'Anti-Rabies Vaccine'] },
  { name: 'Practice Assessment Luna', species: 'Cat', sex: 'Female', ageMonths: 6, processes: ['Neuter/Spay'] },
];
await action('paravet', { action: 'issue', stubId: practice.availableStub.id, owner, pets });
const lookupPath = `/stub-workflow?mode=lookup&code=${encodeURIComponent(practice.availableStub.code)}`;
assert.equal((await get('paravet', lookupPath)).stub.status, 'Issued');
assert.equal((await get('paravet', attendancePath)).summary.pets, 0);
await request('otherParavet', lookupPath, null, 'GET', 404);
const redeem = { action: 'redeem', stubId: practice.availableStub.id, requestId: randomUUID(), attendedOn: practice.today, owner, pets: pets.map((p, i) => ({ ...p, outcome: 'Completed', ...(i === 0 ? { processOutcomes: { Microchipping: 'Completed', 'Anti-Rabies Vaccine': 'Deferred' } } : {}) })) };
await action('paravet', redeem);
await action('paravet', redeem);
await action('paravet', { ...redeem, requestId: randomUUID() }, 409);
assert.deepEqual((await get('paravet', attendancePath)).summary, { owners: 1, pets: 2, completedServices: 2 });
passed('Assessment issuance, lookup without consumption, atomic redemption, retry safety, and no QR reuse');
await action('paravet', { action: 'walk-in', campaignId: practice.campaignId, requestId: randomUUID(), attendedOn: practice.today, owner: { ...owner, name: 'Practice Walk-in Owner' }, pets: [{ name: 'Practice Walk-in Bantay', species: 'Dog', sex: 'Female', ageMonths: 12, processes: ['Anti-Rabies Vaccine'], outcome: 'Completed' }] });
const attendance = await get('paravet', attendancePath);
assert.deepEqual(attendance.summary, { owners: 2, pets: 3, completedServices: 3 });
assert.deepEqual(attendance.data.map(a => a.source).sort(), ['Stub', 'Walk-in']);
workspace = await get('superAdmin', `/program-workspace?id=${practice.programId}`);
assert.equal(workspace.program.slotsUsed, 3);
assert.equal(workspace.program.slots, 2);
await request('admin', '/program-workspace', { action: 'start', programId: practice.programId, expectedVersion: workspace.program.version, actualAt: new Date().toISOString() });
workspace = await get('admin', `/program-workspace?id=${practice.programId}`);
await request('superAdmin', '/program-workspace', { action: 'finish', programId: practice.programId, expectedVersion: workspace.program.version, actualAt: new Date().toISOString() });
passed('Walk-in source, actual attendance beyond capacity, Admin start and Super Admin finish');
const parsed = readTraditionalCsv(await readFile(`${practice.outputDir}/practice-census.csv`, 'utf8'));
assert.deepEqual(parsed.issues, []);
assert.equal(parsed.owners.length, 2);
assert.equal(parsed.owners.flatMap(o => o.pets).length, 3);
assert.equal(parsed.owners[1].pets[0].ageMonths, 0);
assert.equal(parsed.owners[0].pets[0].sterilized, null);
assert.equal(parsed.owners[0].pets[1].sterilized, false);
const made = await request('paravet', '/census/submissions', { label: 'Practice imported acceptance census', censusDate: practice.today, source: 'csv', householdsVisited: 2, owners: parsed.owners }, 'POST', [200, 201]);
const id = made.value.submission.id;
const detail = await get('admin', `/census/submissions/${id}`);
await request('admin', `/census/submissions/${id}/decisions`, { decisions: detail.owners.map(o => ({ ownerId: o.id, decision: 'new' })) }, 'PUT');
const review = await get('admin', `/census/submissions/${id}/decisions`);
assert.equal(review.ready, true);
await request('paravet', `/census/submissions/${id}/review`, { decision: 'approve', reviewToken: review.token }, 'POST', 403);
await request('admin', `/census/submissions/${id}/review`, { decision: 'approve', reviewToken: review.token });
const approved = await get('paravet', `/census/submissions/${id}`);
for (const entry of approved.owners) {
  assert.ok(entry.registryOwnerId);
  const ownerRecord = await get('paravet', `/registry-workspace?kind=owners&id=${entry.registryOwnerId}`);
  assert.equal(ownerRecord.pets.length, entry.pets.length);
  const search = await get('paravet', `/search?q=${encodeURIComponent(entry.ownerName)}`);
  assert.ok(search.data.some(r => r.id === entry.registryOwnerId));
  const options = await get('paravet', `/registry-participant-options?campaignId=${practice.campaignId}&barangayId=${practice.host.id}&q=${encodeURIComponent(entry.ownerName)}`);
  assert.ok(options.owners.some(o => o.id === entry.registryOwnerId));
  await request('otherParavet', `/registry-workspace?kind=owners&id=${entry.registryOwnerId}`, null, 'GET', 404);
}
passed('CSV grouping, unknown/No/zero, reviewed approval, scoped registry/global search/participant lookup');
const result = { startedAt, finishedAt: new Date().toISOString(), rehearsalOnly: true, checks, finalAttendance: attendance.summary, censusOwnersApproved: approved.owners.length };
await writeFile(`${practice.outputDir}/check-results.json`, JSON.stringify(result, null, 2));
console.log(`Acceptance rehearsal passed: ${checks.length} groups. Fresh practice on port 5179 was not modified.`);
