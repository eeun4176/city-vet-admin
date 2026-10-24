import { readFile } from 'node:fs/promises';

const migrations = [
  '000_ekapon_schema.sql',
  '001_create_api_role.sql',
  '005_census_submissions.sql',
  '006_census_submitter_retention.sql',
  '008_profile_preferences_undo.sql',
];

/** Apply the same local schema used by the interactive development stack. */
export async function applyLocalSchema(database) {
  const [{ exists }] = (await database.query("select to_regclass('ekapon.accounts') is not null as exists")).rows;
  if (!exists) {
    for (const file of migrations) await database.exec(await readFile(`db/${file}`, 'utf8'));
    const operations = await readFile('db/007_operations.sql', 'utf8');
    const partTwo = operations.indexOf('-- ======================= PART 2');
    if (partTwo < 0) throw new Error('Could not find the Part 2 marker in db/007_operations.sql');
    await database.exec(operations.slice(0, partTwo));
    await database.exec(operations.slice(partTwo));
  } else {
    await database.exec(await readFile('db/008_profile_preferences_undo.sql', 'utf8'));
  }
  await database.exec(await readFile('db/009_notification_archive.sql', 'utf8'));
  await database.exec(await readFile('db/010_reporting_workflows.sql', 'utf8'));
  await database.exec(await readFile('db/011_program_interest.sql', 'utf8'));
  await database.exec(await readFile('db/012_qr_stubs.sql', 'utf8'));
  await database.exec(await readFile('db/013_program_workspace.sql', 'utf8'));
  await database.exec(await readFile('db/014_read_performance_indexes.sql', 'utf8'));
  await database.exec(await readFile('db/015_data_quality_reviews.sql', 'utf8'));
  await database.exec(await readFile('db/016_registry_workspace.sql', 'utf8'));
  await database.exec(await readFile('db/017_census_registry_bridge.sql', 'utf8'));
  await database.exec(await readFile('db/018_census_unknown_fields.sql', 'utf8'));
  await database.exec(await readFile('db/019_census_review_consistency.sql', 'utf8'));
  await database.exec(await readFile('db/020_navigation_badges.sql', 'utf8'));
  await database.exec(await readFile('db/021_field_record_consistency.sql', 'utf8'));
  await database.exec(await readFile('db/022_daily_read_indexes.sql', 'utf8'));
  await database.exec(await readFile('db/023_workflow_redesign.sql', 'utf8'));
  await database.exec(await readFile('db/024_private_file_storage.sql', 'utf8'));
  await database.exec(await readFile('db/026_salin_integration.sql', 'utf8'));
  await database.exec(await readFile('db/027_salin_stubs.sql', 'utf8'));
}
