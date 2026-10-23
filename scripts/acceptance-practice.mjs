import { copyFile, mkdir, writeFile } from 'node:fs/promises';

// Called only by the in-memory preview, after its database URL has been isolated.
export async function prepareAcceptancePractice({ database, host, admin, paravet, program, campaign, batchId, stub, today, censusReviewSubmissionId, uiPort, rehearsal }) {
  const staff = (await database.query("insert into ekapon.accounts(username,account_type,first_name,last_name,password_hash) values('practiceadmin','Admin','Practice','Admin',extensions.crypt('StubDemo!2026',extensions.gen_salt('bf',4))) returning id")).rows[0];
  const otherHost = (await database.query('select id,name from ekapon.barangays where id<>$1 order by id limit 1', [host.id])).rows[0];
  const otherParavet = (await database.query("insert into ekapon.accounts(account_type,first_name,last_name,barangay_id,password_hash) values('Paravet','Practice','Other Barangay',$1,extensions.crypt('StubDemo!2026',extensions.gen_salt('bf',4))) returning id,account_key", [otherHost.id])).rows[0];
  const pendingBatch = (await database.query("select id,reference from ekapon.stub_batches where campaign_id=$1 and status='Requested' order by id limit 1", [campaign.id])).rows[0];
  const outputDir = `output/acceptance${rehearsal ? '-rehearsal' : ''}`;
  await mkdir(outputDir, { recursive: true });
  // Copy the approved paper-layout workbook byte-for-byte; do not alter the template.
  await copyFile('public/templates/door-to-door-census.xlsx', `${outputDir}/door-to-door-census.xlsx`);
  const csv = [
    'owner_group_id,owner_name,address,contact,pet_name,species,sex,age,age_unit,breed_type,color,sterilized,confinement,vaccine_1st,vaccine_2nd,vaccine_3rd,vaccine_other,remarks',
    'practice-a,Practice Import Owner,Synthetic practice street,,Practice Import Milo,Dog,Male,2,years,Mongrel,Brown,,Confined,yes,no,,,Synthetic example only',
    'practice-a,Practice Import Owner,Synthetic practice street,,Practice Import Luna,Cat,Female,6,months,Pure,White,no,Semi-confined,,,,,Blank vaccination boxes mean unknown',
    'practice-b,Practice Import New Owner,Synthetic practice lane,,Practice Import Baby,Dog,Female,0,months,Mongrel,Black,,Confined,,no,,,Zero months is a recorded age',
  ].join('\r\n') + '\r\n';
  await writeFile(`${outputDir}/practice-census.csv`, csv);
  const QRCode = await import('qrcode');
  await QRCode.toFile(`${outputDir}/practice-stub-qr.png`, stub.code, { width: 600, margin: 4 });
  const manifest = {
    baseUrl: `http://127.0.0.1:${uiPort}`, createdAt: new Date().toISOString(), today, host,
    rehearsal, outputDir, password: 'StubDemo!2026',
    accounts: { superAdmin: { id: admin.id, identifier: 'localstubadmin' }, admin: { id: staff.id, identifier: 'practiceadmin' }, paravet: { id: paravet.id, identifier: paravet.account_key }, otherParavet: { id: otherParavet.id, identifier: otherParavet.account_key, barangay: otherHost.name } },
    programId: program.id, campaignId: campaign.id, handedBatchId: batchId, pendingBatch,
    availableStub: { id: stub.id, code: stub.code }, censusReviewSubmissionId,
    baseline: { ownerVisits: 0, participatingPets: 0, completedProcedures: 0, capacity: 2, handedOverStubs: 12, pendingStubs: 6 },
  };
  await mkdir('tmp', { recursive: true });
  await writeFile(`tmp/acceptance-${rehearsal ? 'rehearsal' : 'preview'}.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${outputDir}/START-HERE.md`, `# Local acceptance practice\n\nOpen ${manifest.baseUrl}. This is synthetic, in-memory practice data, discarded when the preview stops. Use fictional details only. Sign out before changing roles; separate ports share browser cookies. Restarting creates new QR codes and a new Paravet key, so use this freshly generated folder.\n\n## Accounts\n\nPassword for every practice account: \`${manifest.password}\`\n\n| Role | Username / account key |\n|---|---|\n| Super Admin | ${manifest.accounts.superAdmin.identifier} |\n| Admin | ${manifest.accounts.admin.identifier} |\n| Paravet (${host.name}) | ${manifest.accounts.paravet.identifier} |\n\n## Starting records\n\n- Today: ${today}, Philippine time. Test the same day; restart the practice session on a later date.\n- Program: **[PRACTICE] Pet Care Program**, program ID ${program.id}, campaign ${campaign.id}.\n- Attendance starts at **0 visits / 0 pets / 0 completed procedures**. Pet capacity is deliberately **2** to exercise the warning.\n- Batch ${batchId}: 12 already handed-over, unused stubs. The QR image in this folder belongs to its first available stub.\n- Batch ${pendingBatch.id} (${pendingBatch.reference}): 6 stubs awaiting Admin approval; use it to practice printing/handover.\n- Census review ${censusReviewSubmissionId}: one possible owner match and one new owner; no match is automatically selected.\n\n## Files\n\n- \`practice-stub-qr.png\`: camera-free QR reading for the handed-over batch. Scanning alone must not use it up.\n- \`practice-census.csv\`: 2 owners / 3 pets, with unknown values and a recorded zero-month age.\n- \`door-to-door-census.xlsx\`: unchanged blank paper-layout template. Fill it with fictional details if testing Excel too.\n\nFollow the checklist in \`docs/ACCEPTANCE-TESTING.md\` in the project folder. Record the step, role, expected result, actual result, and screenshot for any issue.\n`);
  return manifest;
}
