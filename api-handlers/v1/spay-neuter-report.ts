import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { route, ok, parse } from '../../server/http';
import { sql, tx } from '../../server/db';
import { requireAuth } from '../../server/auth';
import { jsonValue } from '../../server/dashboard';
import { conflict, notFound, unprocessable } from '../../server/errors';

const exportQuery = z.object({
  year: z.coerce.number().int().min(1).max(9999).default(new Date().getFullYear()),
  month: z.coerce.number().int().min(1).max(12).optional(),
  barangay: z.string().trim().max(120).default(''),
});

const body = z.object({
  mode: z.enum(['preview', 'import']),
  filename: z.string().trim().min(1).max(180),
  data: z.string().min(1).max(4_200_000),
});

export default route({
  GET: async (c) => {
    await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    if (c.query.mode === 'template') {
      const { createSpayNeuterTemplate } = await import('../../server/spayNeuterWorkbook');
      const logo = await readFile(join(process.cwd(), 'public', 'images.jpg'));
      const template = await createSpayNeuterTemplate(logo);
      return ok({ filename: 'Spay and Neuter Monthly Report Template.xlsx', data: template.toString('base64') });
    }
    if (c.query.mode !== 'export') throw unprocessable('REPORT_MODE_REQUIRED', 'Request mode=template or mode=export.');
    const logo = await readFile(join(process.cwd(), 'public', 'images.jpg'));
    const filter = parse(exportQuery, c.query);
    const year = String(filter.year).padStart(4, '0');
    let barangay = '';
    if (filter.barangay) {
      const [matched] = await sql()`
        select name from ekapon.barangays where lower(name) = lower(${filter.barangay})
      ` as unknown as [{ name: string }?];
      if (!matched) throw notFound('The selected barangay is not in the system.');
      barangay = matched.name;
    }
    const rows = await sql()`
      select record_data
        from ekapon.dashboard_records
       where dataset = 'services' and archived = false
         and record_data->>'source' = 'spay-neuter-monthly-report'
         and record_data->>'status' = 'Completed'
         and record_data->>'date' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
         and substring(record_data->>'date' from 1 for 4) = ${year}
         and (${filter.month ?? 0} = 0 or substring(record_data->>'date' from 6 for 2)::int = ${filter.month ?? 0})
         and (${barangay === ''} or lower(record_data->>'barangay') = lower(${barangay}))
       order by record_data->>'date', record_data->>'barangay', record_data->>'clientName'
       limit 2001
    ` as unknown as Array<{ record_data: Record<string, unknown> }>;
    if (!rows.length) throw notFound('No matching imported Spay and Neuter records were found for that period.');
    if (rows.length > 2_000) throw unprocessable('REPORT_EXPORT_TOO_LARGE', 'More than 2,000 rows match. Choose a month or barangay to export a smaller workbook.');
    const records = rows.map(({ record_data: data }) => ({
      date: String(data.date),
      clientName: String(data.clientName ?? ''),
      barangay: String(data.barangay ?? ''),
      canineCastrated: Number(data.canineCastrated ?? 0),
      canineSpayed: Number(data.canineSpayed ?? 0),
      felineCastrated: Number(data.felineCastrated ?? 0),
      felineSpayed: Number(data.felineSpayed ?? 0),
      totalProcedures: Number(data.totalProcedures ?? 0),
      remarks: String(data.remarks ?? ''),
    }));
    const period = filter.month
      ? `${new Date(2000, filter.month - 1).toLocaleString('en', { month: 'long' })} ${year}`
      : `January-December ${year}`;
    const { createSpayNeuterExport } = await import('../../server/spayNeuterWorkbook');
    const exported = await createSpayNeuterExport(records, logo, period);
    const monthSuffix = filter.month ? `-${String(filter.month).padStart(2, '0')}` : '';
    return ok({
      filename: `Spay and Neuter Monthly Report ${year}${monthSuffix}.xlsx`,
      data: exported.toString('base64'),
      recordCount: records.length,
      procedures: records.reduce((sum, row) => sum + row.totalProcedures, 0),
    });
  },
  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const input = parse(body, c.body);
    if (!/\.xlsx$/i.test(input.filename)) throw unprocessable('XLSX_REQUIRED', 'Upload an .xlsx Excel workbook.');
    const encoded = input.data.replace(/\s/g, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      throw unprocessable('INVALID_WORKBOOK_ENCODING', 'The uploaded workbook could not be decoded.');
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > 3_145_728 || bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) {
      throw unprocessable('INVALID_WORKBOOK_FILE', 'Upload a valid .xlsx workbook no larger than 3 MB.');
    }
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const barangayRows = await sql()`
      select name from ekapon.barangays order by name
    ` as unknown as Array<{ name: string }>;
    const { parseSpayNeuterWorkbook } = await import('../../server/spayNeuterWorkbook');
    const parsed = await parseSpayNeuterWorkbook(bytes, barangayRows.map((row) => row.name));
    if (!parsed.records.length && parsed.errors.length === 0) {
      parsed.errors.push('No dated service rows were found in the workbook.');
    }
    const [priorImport] = await sql()`
      select batch_id from ekapon.spay_neuter_report_imports where sha256 = ${checksum}
    ` as unknown as [{ batch_id: string }?];
    if (input.mode === 'preview') {
      return ok({
        valid: parsed.errors.length === 0 && parsed.records.length > 0,
        alreadyImported: Boolean(priorImport),
        errors: parsed.errors,
        recordCount: parsed.records.length,
        months: parsed.months,
        procedures: parsed.procedures,
        records: parsed.records.slice(0, 100).map(({ date, clientName, barangay, totalProcedures, worksheet, rowNumber }) =>
          ({ date, clientName, barangay, totalProcedures, worksheet, rowNumber })),
      });
    }
    if (parsed.errors.length) throw unprocessable('INVALID_SPAY_NEUTER_REPORT', 'Correct the workbook errors before importing.', { errors: parsed.errors });
    if (!parsed.records.length) throw unprocessable('EMPTY_SPAY_NEUTER_REPORT', 'The workbook contains no service records to import.');
    if (priorImport) throw conflict('REPORT_ALREADY_IMPORTED', 'This exact workbook was already imported. Undo its import before uploading it again.', { batchId: priorImport.batch_id });

    const batchId = randomUUID();
    try {
      await tx(session.id, async (q) => {
        await q`
          insert into ekapon.dashboard_import_batches (batch_id, dataset, actor_id, label)
          values (${batchId}::uuid, 'services', ${session.id}, ${`Spay and Neuter Report: ${input.filename}`.slice(0, 160)})`;
        const [claim] = await q`
          insert into ekapon.spay_neuter_report_imports (sha256, batch_id, actor_id, filename, row_count, procedure_count)
          values (${checksum}, ${batchId}::uuid, ${session.id}, ${input.filename}, ${parsed.records.length}, ${parsed.procedures})
          on conflict (sha256) do nothing
          returning batch_id          `;
          if (!claim) throw conflict('REPORT_ALREADY_IMPORTED', 'This exact workbook was already imported. Undo its import before uploading it again.');
        for (const row of parsed.records) {
          const record = {
            id: randomUUID(),
            service: 'Kapon (Spay and Neuter)',
            status: 'Completed',
            date: row.date,
            barangay: row.barangay,
            clientName: row.clientName,
            canineCastrated: row.canineCastrated,
            canineSpayed: row.canineSpayed,
            felineCastrated: row.felineCastrated,
            felineSpayed: row.felineSpayed,
            totalProcedures: row.totalProcedures,
            remarks: row.remarks,
            source: 'spay-neuter-monthly-report',
            importBatchId: batchId,
          };
          await q`
            insert into ekapon.dashboard_import_items
              (batch_id, record_id, existed_before, before_data, before_archived, after_data)
            values (${batchId}::uuid, ${record.id}, false, null, null, ${q.json(jsonValue(record))})`;
          await q`
            insert into ekapon.dashboard_records (dataset, record_id, record_data, archived)
            values ('services', ${record.id}, ${q.json(jsonValue(record))}, false)`;
        }
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        throw conflict('REPORT_ALREADY_IMPORTED', 'This exact workbook was already imported. Undo its import before uploading it again.');
      }
      throw error;
    }
    return ok({
      imported: parsed.records.length,
      procedures: parsed.procedures,
      months: parsed.months,
      batchId,
    });
  },
}, { maxBody: 4_400_000 });
