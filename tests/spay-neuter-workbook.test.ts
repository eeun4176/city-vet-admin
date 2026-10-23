import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createSpayNeuterExport, createSpayNeuterTemplate, parseSpayNeuterWorkbook } from '../server/spayNeuterWorkbook';

async function filledWorkbook(changes: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const template = await createSpayNeuterTemplate();
  const workbook = new ExcelJS.Workbook();
  const templateBytes = new Uint8Array(template.byteLength);
  templateBytes.set(template);
  await workbook.xlsx.load(templateBytes.buffer);
  changes(workbook.worksheets[0]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('Spay and Neuter Monthly Report workbook', () => {
  it('rejects future actual service dates even when their month section is correct', async () => {
    const nextYear = new Date().getUTCFullYear() + 1;
    const workbook = await filledWorkbook(sheet => {
      sheet.getCell('A9').value = `${nextYear}-01-12`;
      sheet.getCell('B9').value = 'Synthetic future client';
      sheet.getCell('C9').value = 'Muzon Proper';
      sheet.getCell('D9').value = 1;
    });
    const result = await parseSpayNeuterWorkbook(workbook, ['Muzon Proper']);
    expect(result.records).toHaveLength(0);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('cannot be in the future')]));
  });
  it('creates the standard branded workbook structure with month sections and formula totals', async () => {
    const workbook = new ExcelJS.Workbook();
    const template = await createSpayNeuterTemplate();
    const templateBytes = new Uint8Array(template.byteLength);
    templateBytes.set(template);
    await workbook.xlsx.load(templateBytes.buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell('A7').value).toBe('Date');
    expect(sheet.getCell('B7').value).toBe('Name of Client');
    expect(sheet.getCell('H7').value).toBe('Remarks');
    expect(sheet.getCell('A8').value).toBe('January');
    expect(sheet.getCell('A19').value).toBe('February');
    expect(sheet.getCell('D141').value).toMatchObject({ formula: 'SUM(D8:D139)' });
  });

  it('exports live rows in their month sections with recalculated formula totals', async () => {
    const exported = await createSpayNeuterExport([
      {
        date: '2026-01-12', clientName: 'Jordan Client', barangay: 'Muzon Proper',
        canineCastrated: 2, canineSpayed: 1, felineCastrated: 0, felineSpayed: 3,
        totalProcedures: 6, remarks: 'January notes',
      },
      {
        date: '2026-02-03', clientName: 'Casey Client', barangay: 'Graceville',
        canineCastrated: 0, canineSpayed: 0, felineCastrated: 1, felineSpayed: 0,
        totalProcedures: 1, remarks: 'February notes',
      },
    ], undefined, 'January-December 2026');
    const workbook = new ExcelJS.Workbook();
    const bytes = new Uint8Array(exported.byteLength);
    bytes.set(exported);
    await workbook.xlsx.load(bytes.buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell('C1').value).toBe('Republic of the Philippines');
    expect(sheet.getCell('C6').value).toBe('January-December 2026');
    expect(sheet.getCell('A8').value).toBe('January');
    expect(sheet.getCell('B9').value).toBe('Jordan Client');
    expect(sheet.getCell('D9').value).toBe(2);
    expect(sheet.getCell('H9').value).toBe('January notes');
    expect(sheet.getCell('A10').value).toBe('February');
    expect(sheet.getCell('B11').value).toBe('Casey Client');
    expect(sheet.getCell('G11').value).toBe(0);
    expect(sheet.getCell('D23').value).toMatchObject({ formula: 'SUM(D8:D21)' });
  });

  it('parses live dated rows, preserves quantity fields, and ignores formula totals', async () => {
    const workbook = await filledWorkbook((sheet) => {
      sheet.getCell('A9').value = new Date('2026-01-12T00:00:00.000Z');
      sheet.getCell('B9').value = 'Jordan Client';
      sheet.getCell('C9').value = 'Muzon Proper';
      sheet.getCell('D9').value = 2;
      sheet.getCell('E9').value = 1;
      sheet.getCell('F9').value = 0;
      sheet.getCell('G9').value = 3;
      sheet.getCell('H9').value = 'Follow-up';
    });
    const result = await parseSpayNeuterWorkbook(workbook, ['Muzon Proper']);
    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      date: '2026-01-12', clientName: 'Jordan Client', barangay: 'Muzon Proper',
      canineCastrated: 2, canineSpayed: 1, felineCastrated: 0, felineSpayed: 3, totalProcedures: 6,
    });
    expect(result.procedures).toBe(6);
    expect(result.months).toEqual([1]);
  });

  it('reports section-month, barangay, and whole-number validation errors', async () => {
    const workbook = await filledWorkbook((sheet) => {
      sheet.getCell('A9').value = '2026-02-12';
      sheet.getCell('B9').value = 'Jordan Client';
      sheet.getCell('C9').value = 'Unknown Barangay';
      sheet.getCell('D9').value = 1.5;
    });
    const result = await parseSpayNeuterWorkbook(workbook, ['Muzon Proper']);
    expect(result.records).toHaveLength(0);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('does not match the January section'),
      expect.stringContaining('must exactly match an active system barangay'),
      expect.stringContaining('whole numbers'),
    ]));
  });

  it('rejects altered headers instead of guessing column positions', async () => {
    const workbook = await filledWorkbook((sheet) => { sheet.getCell('B7').value = 'Client'; });
    const result = await parseSpayNeuterWorkbook(workbook, ['Muzon Proper']);
    expect(result.records).toHaveLength(0);
    expect(result.errors[0]).toContain('row 7 must contain the exact eight standard column headers');
  });
});
