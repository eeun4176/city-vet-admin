import type { Tx } from './db';
import { conflict } from './errors';

export const QR_WORKFLOW = 'qr-stubs-v1';
export function assertFieldRecordWrite(dataset:string) {
  if(['respondents','participants','services'].includes(dataset))throw conflict('FIELD_WORKFLOW_REQUIRED','Respondents come from approved census submissions. Record program participants and services through Program day; use Services for a reviewed visit outside a program.');
}

/** Attendance snapshots are corrected through the program workflow, with history. */
export function assertUnmanagedInput(records: Record<string, unknown>[]) {
  if (records.some((record) => [QR_WORKFLOW,'standalone-services-v1'].includes(String(record.workflow)) || /^(QRATT-|STANDALONE-|CENSUSRESP-)/.test(String(record.id ?? '')))) {
    throw conflict('WORKFLOW_RECORD_MANAGED', 'Use Program day to record or correct QR and walk-in attendance.');
  }
}

export async function assertUnmanagedStored(q: Tx, dataset: string, ids: string[]) {
  if (!ids.length) return;
  if (dataset === 'programs') {
    // Lock first, then re-read runtime so a concurrent workspace save cannot be overwritten.
    await q`select id from ekapon.dashboard_records where dataset='programs' and record_id=any(${ids}::text[]) for update`;
    const managed = await q`select d.id from ekapon.dashboard_records d join ekapon.program_runtime r on r.program_record_id=d.id
      where d.dataset='programs' and d.record_id=any(${ids}::text[])`;
    if (managed.length) throw conflict('PROGRAM_WORKSPACE_MANAGED', 'Use the Program workspace to change this program and preserve timing history.');
  }
  const rows = await q`
    select record_id from ekapon.dashboard_records
     where dataset = ${dataset} and record_id = any(${ids}::text[])
       and (record_data->>'workflow' in (${QR_WORKFLOW},'standalone-services-v1') or record_id like 'QRATT-%' or record_id like 'STANDALONE-%')
     for update`;
  if (rows.length) throw conflict('WORKFLOW_RECORD_MANAGED', 'Open the source program or standalone visit to void an incorrect entry and preserve its history.');
}
